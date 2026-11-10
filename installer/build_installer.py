"""Build the standalone Windows installer and a clean extension distribution."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / '.build-installer'
OUTPUT = ROOT / 'artifacts' / 'release'
EXTENSION_ID = 'dlnpomclnceomfiplgjkfendkdncfdkf'


def run(args):
    subprocess.run([sys.executable, '-m', 'PyInstaller', '--noconfirm', '--clean',
                    '--distpath', str(WORK / 'dist'), '--workpath', str(WORK / 'work'),
                    '--specpath', str(WORK / 'spec'), *args], cwd=ROOT, check=True)


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    run(['--onedir', '--name', 'SpeakTubeVoice', '--console', '--paths', str(ROOT),
         '--icon', str(ROOT / 'assets/icon/robot.ico'), '--collect-all', 'edge_tts',
         '--collect-data', 'certifi', '--copy-metadata', 'edge-tts',
         str(ROOT / 'installer/voice_service.py')])
    service = WORK / 'dist' / 'SpeakTubeVoice'
    metadata = {'version': '1.0.0', 'extension_id': EXTENSION_ID,
                'executable_sha256': hashlib.sha256((service / 'SpeakTubeVoice.exe').read_bytes()).hexdigest()}
    (service / 'payload-info.json').write_text(json.dumps(metadata, indent=2), encoding='utf-8')
    licenses = service / 'licenses'
    licenses.mkdir(exist_ok=True)
    # Include installed dependency license files and the Python runtime license.
    environment = Path(sys.prefix)
    for path in (environment / 'Lib' / 'site-packages').glob('*.dist-info'):
        for file in path.rglob('*'):
            if file.is_file() and (file.name.lower().startswith(('license', 'copying', 'notice'))):
                target = licenses / path.name / file.relative_to(path)
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(file, target)
    for file in [Path(sys.base_prefix) / 'LICENSE.txt', Path(sys.base_prefix) / 'LICENSE']:
        if file.is_file():
            shutil.copy2(file, licenses / 'PYTHON-LICENSE.txt')
    payload = WORK / 'voice-payload.zip'
    with zipfile.ZipFile(payload, 'w', zipfile.ZIP_DEFLATED) as archive:
        for path in service.rglob('*'):
            if path.is_file():
                archive.write(path, path.relative_to(service).as_posix())
    run(['--onefile', '--name', 'SpeakTubeVoiceSetup', '--windowed',
         '--icon', str(ROOT / 'assets/icon/robot.ico'), '--add-data', f'{payload}:.',
         str(ROOT / 'installer/setup_app.py')])
    installer = OUTPUT / 'SpeakTubeVoiceSetup.exe'
    shutil.copy2(WORK / 'dist' / installer.name, installer)
    shutil.copy2(installer, ROOT / 'installer' / installer.name)
    package(installer)


def package(installer):
    if not installer.is_file():
        raise FileNotFoundError('Compile o instalador antes de empacotar a extensao.')
    shutil.copy2(installer, ROOT / 'installer' / installer.name)
    # Explicit allowlist: never distribute keys, backups, build environments or sources.
    files = ['manifest.json', 'popup.html', 'popup.css', 'popup.js', 'setup.html', 'setup.css', 'setup.js',
             'left-panel.js', 'speech-improvements.js', 'edge-voice-engine.js', 'diagnostics.js',
             'content.bundle.hdh2cnbfpdin.js', 'webpage.bundle.hdh2cnbfpdin.js', 'ga.bundle.hdh2cnbfpdin.js',
             'sw.bundle.hdh2cnbfpdin.js', 'don.html', 'don.hdh2cnbfpdin.js', 'README.md',
             'assets/icon/speaktube-robot-v2-16.png', 'assets/icon/speaktube-robot-v2-32.png',
             'assets/icon/speaktube-robot-v2-48.png', 'assets/icon/speaktube-robot-v2-128.png',
             'assets/icon/speaktube-robot-v2-512.png', 'installer/SpeakTubeVoiceSetup.exe']
    files.extend(str(p.relative_to(ROOT)) for p in (ROOT / '_locales').rglob('messages.json'))
    extension = OUTPUT / 'SpeakTube-1.3.0-Chrome.zip'
    with zipfile.ZipFile(extension, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name in files:
            archive.write(ROOT / name, name.replace('\\', '/'))
    (OUTPUT / 'requirements-build-lock.txt').write_bytes(subprocess.check_output([sys.executable, '-m', 'pip', 'freeze']))
    hashes = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in (installer, extension)}
    (OUTPUT / 'SHA256SUMS.txt').write_text(''.join(f'{digest}  {name}\n' for name, digest in hashes.items()), encoding='utf-8')
    (OUTPUT / 'build-info.json').write_text(json.dumps({'extension_id': EXTENSION_ID, 'files': hashes,
        'python': sys.version, 'service_version': '1.0.0', 'extension_version': '1.3.0',
        'signed': False}, indent=2), encoding='utf-8')
    print(json.dumps({'installer': str(installer), 'extension': str(extension), 'hashes': hashes}, indent=2))


if __name__ == '__main__':
    if '--package-only' in sys.argv:
        package(OUTPUT / 'SpeakTubeVoiceSetup.exe')
    else:
        main()
