"""Loopback-only Edge TTS bridge. Text is sent to Microsoft's online TTS service."""
import asyncio
import base64
import json
import re
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
import edge_tts

HOST, PORT = '127.0.0.1', 8766
EXTENSION_ID = 'dlnpomclnceomfiplgjkfendkdncfdkf'
VOICES = []
VOICES_AT = 0
LOCK = threading.Lock()
LIMIT = threading.BoundedSemaphore(3)

def voices():
    global VOICES, VOICES_AT
    with LOCK:
        if not VOICES or time.monotonic() - VOICES_AT > 3600:
            VOICES = asyncio.run(asyncio.wait_for(edge_tts.list_voices(), timeout=20))
            VOICES_AT = time.monotonic()
        return VOICES

async def synthesize(text, voice, pitch):
    output = bytearray()
    stream = edge_tts.Communicate(text, voice, pitch=f'{pitch:+d}Hz', connect_timeout=10, receive_timeout=20)
    async for chunk in stream.stream():
        if chunk['type'] == 'audio':
            output.extend(chunk['data'])
            if len(output) > 4_000_000:
                raise ValueError('Audio exceeded limit')
    if not output:
        raise ValueError('No audio returned')
    return bytes(output)

class Handler(BaseHTTPRequestHandler):
    server_version = 'SpeakTube/1.0'
    def log_message(self, *_):
        pass  # Never log subtitle text.
    def allowed(self):
        host = self.headers.get('Host', '')
        origin = self.headers.get('Origin')
        return host in (f'{HOST}:{PORT}', f'localhost:{PORT}') and origin in (None, f'chrome-extension://{EXTENSION_ID}', 'http://127.0.0.1:8765')
    def reply(self, status, payload):
        data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        try:
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            origin = self.headers.get('Origin')
            if origin:
                self.send_header('Access-Control-Allow-Origin', origin)
                self.send_header('Vary', 'Origin')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass
    def do_OPTIONS(self):
        if not self.allowed(): return self.reply(403, {'error': 'Origin not allowed'})
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', self.headers.get('Origin', ''))
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Max-Age', '600')
        self.end_headers()
    def do_GET(self):
        if not self.allowed(): return self.reply(403, {'error': 'Origin not allowed'})
        if self.path == '/health': return self.reply(200, {'ok': True, 'engine': 'edge-tts', 'version': edge_tts.__version__, 'extension_id': EXTENSION_ID, 'service_version': globals().get('SERVICE_VERSION')})
        if self.path != '/voices': return self.reply(404, {'error': 'Not found'})
        try:
            data = [{'voiceURI': v['ShortName'], 'name': v['FriendlyName'], 'lang': v['Locale'],
                     'gender': v['Gender'], 'localService': False, 'default': v['ShortName'] == 'pt-BR-FranciscaNeural'} for v in voices()]
            self.reply(200, {'voices': data})
        except Exception:
            self.reply(502, {'error': 'Edge voice catalog unavailable. Check internet connection.'})
    def do_POST(self):
        if not self.allowed(): return self.reply(403, {'error': 'Origin not allowed'})
        if self.path != '/synthesize': return self.reply(404, {'error': 'Not found'})
        if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
            return self.reply(415, {'error': 'JSON required'})
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 16000: raise ValueError('Invalid request size')
            data = json.loads(self.rfile.read(size))
            text, voice = data.get('text'), data.get('voice')
            if not isinstance(text, str) or not 0 < len(text.strip()) <= 1200: raise ValueError('Invalid text length')
            if not isinstance(voice, str) or not re.fullmatch(r'[A-Za-z0-9-]{5,100}', voice): raise ValueError('Invalid voice')
            pitch = max(-25, min(25, int(data.get('pitch', 0))))
        except (ValueError, TypeError, json.JSONDecodeError):
            return self.reply(400, {'error': 'Invalid synthesis request'})
        if not LIMIT.acquire(blocking=False): return self.reply(429, {'error': 'Speech queue busy'})
        try:
            if voice not in {v['ShortName'] for v in voices()}: return self.reply(400, {'error': 'Unknown voice'})
            audio = asyncio.run(asyncio.wait_for(synthesize(text, voice, pitch), timeout=35))
            self.reply(200, {'audio': base64.b64encode(audio).decode('ascii'), 'mime': 'audio/mpeg'})
        except Exception:
            self.reply(502, {'error': 'Edge speech unavailable. Check internet connection.'})
        finally:
            LIMIT.release()

if __name__ == '__main__':
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
