"""Exercise the generated EXEs, their bundled runtime and optionally real HKCU setup."""
import argparse
import base64
import json
import os
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'installer'))
from install_core import (EXTENSION_ID, HOST_KEY, UNINSTALL_KEY, Registry,
                          default_base, install, uninstall)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--install-here', action='store_true')
    args = parser.parse_args()
    output = ROOT / 'artifacts' / 'release'
    setup = output / 'SpeakTubeVoiceSetup.exe'
    folder = Path(tempfile.mkdtemp(prefix='smoke-', dir=ROOT / '.build-installer'))
    extracted = folder / 'extracted'
    # No Python executable is available to the packaged applications through PATH.
    env = dict(os.environ)
    env['PATH'] = str(Path(os.environ['SystemRoot']) / 'System32')
    env.pop('PYTHONPATH', None)
    env.pop('PYTHONHOME', None)
    env['SPEAKTUBE_VOICE_PORT'] = '18766'
    flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
    subprocess.run([str(setup), '--extract-to', str(extracted)], env=env, timeout=120,
                   check=True, creationflags=flags)
    exe = extracted / 'SpeakTubeVoice.exe'
    assert exe.is_file()

    def native(command, origin=f'chrome-extension://{EXTENSION_ID}/'):
        payload = json.dumps({'command': command}).encode()
        result = subprocess.run([str(exe), origin], input=struct.pack('<I', len(payload)) + payload,
                                capture_output=True, env=env, timeout=25, creationflags=flags)
        if result.returncode:
            raise RuntimeError('Native host failed: ' + result.stderr.decode(errors='replace'))
        size = struct.unpack('<I', result.stdout[:4])[0]
        return json.loads(result.stdout[4:4 + size])

    report = {'installer_extraction': True, 'system_python_required': False}
    try:
        status = native('start')
        assert status['ok'] and status['running'], status
        assert status['health']['service_version'] == '1.0.0'
        report['native_start_and_bundled_server'] = True
        with urllib.request.urlopen('http://127.0.0.1:18766/voices', timeout=30) as response:
            voices = json.load(response)['voices']
        assert any(v['voiceURI'] == 'pt-BR-FranciscaNeural' for v in voices)
        report['real_voice_catalog_count'] = len(voices)
        request = urllib.request.Request('http://127.0.0.1:18766/synthesize',
            data=json.dumps({'text': 'O SpeakTube esta pronto para narrar seus videos.',
                             'voice': 'pt-BR-FranciscaNeural', 'pitch': 0}).encode(),
            headers={'Content-Type': 'application/json', 'Origin': f'chrome-extension://{EXTENSION_ID}'})
        with urllib.request.urlopen(request, timeout=45) as response:
            result = json.load(response)
        audio = base64.b64decode(result['audio'], validate=True)
        assert len(audio) > 1000
        (folder / 'voice-test.mp3').write_bytes(audio)
        report['real_speech_audio_bytes'] = len(audio)
        try:
            urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:18766/health',
                headers={'Origin': 'chrome-extension://fjoiihoancoimepbgfcmopaciegpigpa'}))
            raise AssertionError('Old extension origin accepted')
        except urllib.error.HTTPError as error:
            assert error.code == 403
        report['foreign_origin_rejected'] = True
    finally:
        subprocess.run([str(exe), '--stop'], env=env, timeout=10, creationflags=flags, check=True)
        time.sleep(0.8)
    assert not native('status')['running']
    report['service_stop'] = True
    if args.install_here:
        registry = Registry()
        target = default_base() / 'Service'
        if target.exists() or registry.read(HOST_KEY) is not None:
            report['real_registry_lifecycle'] = 'skipped: preexisting installation preserved'
        else:
            payload = ROOT / '.build-installer' / 'voice-payload.zip'
            installed = install(payload, setup)
            assert registry.read(HOST_KEY)[''].endswith('com.speaktube.voice.json')
            assert registry.read(UNINSTALL_KEY)['DisplayVersion'] == '1.0.0'
            uninstall()
            assert registry.read(HOST_KEY) is None
            assert registry.read(UNINSTALL_KEY) is None
            install(payload, setup)
            report['real_registry_lifecycle'] = 'install, uninstall and reinstall passed'
            report['installed_path'] = str(installed)
    (output / 'TEST-REPORT.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
