"""SpeakTube native host and on-demand loopback voice service."""
import ctypes
import getpass
import hashlib
import json
import os
from pathlib import Path
import struct
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

if not getattr(sys, 'frozen', False):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import edge_tts_server as voice

VERSION = '1.0.0'
HOST_NAME = 'com.speaktube.voice'
EXTENSION_ID = voice.EXTENSION_ID
PORT = int(os.environ.get('SPEAKTUBE_VOICE_PORT', '8766'))
MAX_MESSAGE = 16384


def health():
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{PORT}/health', timeout=1) as response:
            return json.load(response)
    except (OSError, ValueError, urllib.error.URLError):
        return None


def compatible(data):
    return bool(isinstance(data, dict) and data.get('engine') == 'edge-tts'
                and data.get('extension_id') == EXTENSION_ID)


def event_name(kind):
    user = hashlib.sha256(str(Path.home()).lower().encode()).hexdigest()[:16]
    return f'Local\\SpeakTubeVoice-{kind}-{user}-{PORT}'


def windows_api():
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.CreateMutexW.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_wchar_p]
    kernel.CreateMutexW.restype = ctypes.c_void_p
    kernel.CreateEventW.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_wchar_p]
    kernel.CreateEventW.restype = ctypes.c_void_p
    kernel.OpenEventW.argtypes = [ctypes.c_uint32, ctypes.c_int, ctypes.c_wchar_p]
    kernel.OpenEventW.restype = ctypes.c_void_p
    kernel.SetEvent.argtypes = [ctypes.c_void_p]
    kernel.CloseHandle.argtypes = [ctypes.c_void_p]
    kernel.WaitForSingleObject.argtypes = [ctypes.c_void_p, ctypes.c_uint32]
    return kernel


def serve():
    kernel = mutex = stop_event = None
    if os.name == 'nt':
        kernel = windows_api()
        mutex = kernel.CreateMutexW(None, False, event_name('mutex'))
        if not mutex:
            raise OSError(ctypes.get_last_error(), 'Cannot create service mutex')
        if ctypes.get_last_error() == 183:
            kernel.CloseHandle(mutex)
            return 0
        stop_event = kernel.CreateEventW(None, True, False, event_name('stop'))
        if not stop_event:
            kernel.CloseHandle(mutex)
            raise OSError(ctypes.get_last_error(), 'Cannot create stop event')
    voice.PORT = PORT
    voice.SERVICE_VERSION = VERSION
    server = None
    try:
        server = voice.ThreadingHTTPServer((voice.HOST, PORT), voice.Handler)
        server.daemon_threads = True
        if kernel:
            def stop_on_event():
                if kernel.WaitForSingleObject(stop_event, 0xFFFFFFFF) == 0:
                    server.shutdown()
            threading.Thread(target=stop_on_event, daemon=True).start()
        server.serve_forever(poll_interval=0.2)
        return 0
    finally:
        if server:
            server.server_close()
        if kernel:
            kernel.CloseHandle(stop_event)
            kernel.CloseHandle(mutex)


def stop():
    if os.name != 'nt':
        return 0
    kernel = windows_api()
    handle = kernel.OpenEventW(0x0002, False, event_name('stop'))
    if handle:
        kernel.SetEvent(handle)
        kernel.CloseHandle(handle)
    return 0


def start():
    data = health()
    if compatible(data):
        return data
    if data:
        raise RuntimeError('A porta de voz esta ocupada por outro aplicativo.')
    if getattr(sys, 'frozen', False):
        command = [sys.executable, '--serve']
    else:
        command = [sys.executable, str(Path(__file__).resolve()), '--serve']
    options = {'stdin': subprocess.DEVNULL, 'stdout': subprocess.DEVNULL,
               'stderr': subprocess.DEVNULL, 'cwd': str(Path(sys.executable).parent)}
    if os.name == 'nt':
        options['creationflags'] = subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP
    subprocess.Popen(command, **options)
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        time.sleep(0.25)
        data = health()
        if compatible(data):
            return data
    raise RuntimeError('O servico de voz nao iniciou. Use Reparar no instalador.')


def read_exact(stream, size):
    result = bytearray()
    while len(result) < size:
        part = stream.read(size - len(result))
        if not part:
            if not result:
                return None
            raise ValueError('Incomplete native message')
        result.extend(part)
    return bytes(result)


def read_message(stream):
    header = read_exact(stream, 4)
    if header is None:
        return None
    size = struct.unpack('<I', header)[0]
    if not 0 < size <= MAX_MESSAGE:
        raise ValueError('Invalid native message size')
    payload = read_exact(stream, size)
    if payload is None:
        raise ValueError('Missing native message')
    result = json.loads(payload.decode('utf-8'))
    if not isinstance(result, dict):
        raise ValueError('Invalid native request')
    return result


def write_message(stream, data):
    payload = json.dumps(data, ensure_ascii=False).encode('utf-8')
    stream.write(struct.pack('<I', len(payload)))
    stream.write(payload)
    stream.flush()


def native(origin, source=None, target=None):
    if origin.rstrip('/') != f'chrome-extension://{EXTENSION_ID}':
        return 3
    source = source or sys.stdin.buffer
    target = target or sys.stdout.buffer
    if os.name == 'nt' and source is sys.stdin.buffer:
        import msvcrt
        msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
        msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)
    try:
        while True:
            request = read_message(source)
            if request is None:
                return 0
            command = request.get('command')
            if command not in ('status', 'start'):
                write_message(target, {'ok': False, 'error': 'Unsupported command'})
                continue
            try:
                data = start() if command == 'start' else health()
                write_message(target, {'ok': True, 'installed': True, 'running': compatible(data),
                                      'service_version': VERSION, 'extension_id': EXTENSION_ID,
                                      'health': data if compatible(data) else None})
            except Exception as error:
                write_message(target, {'ok': False, 'installed': True, 'error': str(error)[:200]})
    except (ValueError, UnicodeError, struct.error, BrokenPipeError):
        return 2


def main():
    args = sys.argv[1:]
    if args == ['--serve']:
        return serve()
    if args == ['--stop']:
        return stop()
    if args == ['--status']:
        print(json.dumps({'running': compatible(health()), 'extension_id': EXTENSION_ID}))
        return 0
    if args and args[0].startswith('chrome-extension://'):
        return native(args[0])
    return 2


if __name__ == '__main__':
    raise SystemExit(main())
