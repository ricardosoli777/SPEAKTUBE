"""Per-user installation. No Python/pip or admin rights on the target PC."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import uuid
import zipfile

VERSION = '1.0.0'
APP_ID = 'SpeakTubeVoice'
HOST_NAME = 'com.speaktube.voice'
EXTENSION_ID = 'dlnpomclnceomfiplgjkfendkdncfdkf'
HOST_KEY = r'Software\Google\Chrome\NativeMessagingHosts\com.speaktube.voice'
UNINSTALL_KEY = r'Software\Microsoft\Windows\CurrentVersion\Uninstall\SpeakTubeVoice'
MARKER = '.speaktube-install.json'


def default_base():
    return Path(os.environ['LOCALAPPDATA']) / 'SpeakTube'


def validate_target(base, target):
    base = Path(base).resolve()
    target = Path(target).resolve()
    if target.parent != base or target.name != 'Service':
        raise ValueError('Destino de instalacao invalido.')
    if target.is_symlink():
        raise ValueError('O destino nao pode ser um link.')
    return target


class Registry:
    def __init__(self):
        import winreg
        self.api = winreg

    def read(self, key):
        api = self.api
        try:
            with api.OpenKey(api.HKEY_CURRENT_USER, key) as handle:
                result = {}
                index = 0
                while True:
                    try:
                        name, value, _ = api.EnumValue(handle, index)
                        result[name] = value
                        index += 1
                    except OSError:
                        break
                return result
        except FileNotFoundError:
            return None

    def write(self, key, values):
        api = self.api
        with api.CreateKey(api.HKEY_CURRENT_USER, key) as handle:
            for name, value in values.items():
                api.SetValueEx(handle, name, 0, api.REG_DWORD if isinstance(value, int) else api.REG_SZ, value)

    def remove(self, key):
        try:
            self.api.DeleteKey(self.api.HKEY_CURRENT_USER, key)
        except FileNotFoundError:
            pass

    def restore(self, key, values):
        self.remove(key)
        if values is not None:
            self.write(key, values)


def extract_payload(payload, destination):
    destination = Path(destination).resolve()
    with zipfile.ZipFile(payload) as archive:
        for item in archive.infolist():
            path = (destination / item.filename).resolve()
            if not path.is_relative_to(destination) or item.filename.startswith(('/', '\\')):
                raise ValueError('Pacote contem caminho invalido.')
            if (item.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValueError('Pacote contem link invalido.')
        archive.extractall(destination)
    exe = destination / 'SpeakTubeVoice.exe'
    if not exe.is_file():
        raise ValueError('Executavel do servico ausente no pacote.')
    metadata = json.loads((destination / 'payload-info.json').read_text(encoding='utf-8'))
    if metadata.get('extension_id') != EXTENSION_ID:
        raise ValueError('Identidade do pacote invalida.')
    if hashlib.sha256(exe.read_bytes()).hexdigest() != metadata.get('executable_sha256'):
        raise ValueError('Verificacao do pacote falhou.')


def stop_service(executable):
    if not Path(executable).exists():
        return
    flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
    subprocess.run([str(executable), '--stop'], timeout=10, check=True, creationflags=flags,
                   stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.6)


def install(payload, setup_exe, base=None, registry=None, stop_fn=stop_service, progress=lambda text: None):
    base = Path(base or default_base()).resolve()
    target = validate_target(base, base / 'Service')
    base.mkdir(parents=True, exist_ok=True)
    registry = registry or Registry()
    if target.exists():
        marker_path = target / MARKER
        if not marker_path.is_file() or json.loads(marker_path.read_text(encoding='utf-8')).get('app_id') != APP_ID:
            raise ValueError('A pasta de destino contem arquivos de outra instalacao.')
    stage = Path(tempfile.mkdtemp(prefix='.voice-stage-', dir=base))
    backup = base / ('.voice-backup-' + uuid.uuid4().hex)
    snapshots = {key: registry.read(key) for key in (HOST_KEY, UNINSTALL_KEY)}
    moved = False
    previous = False
    try:
        progress('Conferindo e preparando os componentes incluidos...')
        extract_payload(payload, stage)
        shutil.copy2(setup_exe, stage / 'Uninstall.exe')
        manifest = {'name': HOST_NAME, 'description': 'SpeakTube - Servico de Voz',
                    'path': str(target / 'SpeakTubeVoice.exe'), 'type': 'stdio',
                    'allowed_origins': [f'chrome-extension://{EXTENSION_ID}/']}
        (stage / (HOST_NAME + '.json')).write_text(json.dumps(manifest, indent=2), encoding='utf-8')
        (stage / MARKER).write_text(json.dumps({'app_id': APP_ID, 'version': VERSION,
                                               'extension_id': EXTENSION_ID}), encoding='utf-8')
        if target.exists():
            progress('Preparando a atualizacao da instalacao existente...')
            stop_fn(target / 'SpeakTubeVoice.exe')
            target.rename(backup)
            previous = True
        stage.rename(target)
        moved = True
        progress('Conectando o servico ao Chrome deste usuario...')
        registry.write(HOST_KEY, {'': str(target / (HOST_NAME + '.json'))})
        registry.write(UNINSTALL_KEY, {
            'DisplayName': 'SpeakTube - Servico de Voz', 'DisplayVersion': VERSION,
            'Publisher': 'Rica Soares', 'InstallLocation': str(target),
            'UninstallString': f'"{target / "Uninstall.exe"}" --uninstall',
            'DisplayIcon': str(target / 'SpeakTubeVoice.exe'), 'NoModify': 0, 'NoRepair': 0,
            'ModifyPath': f'"{target / "Uninstall.exe"}"'})
        if previous:
            shutil.rmtree(backup)
        return target
    except Exception:
        for key, values in snapshots.items():
            registry.restore(key, values)
        if moved and target.exists():
            shutil.rmtree(target)
        if previous and backup.exists():
            backup.rename(target)
        raise
    finally:
        if stage.exists():
            shutil.rmtree(stage)


def uninstall(base=None, registry=None, stop_fn=stop_service, progress=lambda text: None):
    base = Path(base or default_base()).resolve()
    target = validate_target(base, base / 'Service')
    registry = registry or Registry()
    if not target.exists():
        return
    marker = json.loads((target / MARKER).read_text(encoding='utf-8'))
    if marker.get('app_id') != APP_ID:
        raise ValueError('A pasta nao pertence ao SpeakTube.')
    progress('Encerrando o servico de voz...')
    stop_fn(target / 'SpeakTubeVoice.exe')
    manifest = str(target / (HOST_NAME + '.json'))
    if (registry.read(HOST_KEY) or {}).get('') == manifest:
        registry.remove(HOST_KEY)
    if (registry.read(UNINSTALL_KEY) or {}).get('InstallLocation') == str(target):
        registry.remove(UNINSTALL_KEY)
    progress('Removendo os arquivos do servico...')
    shutil.rmtree(target)
    # Never remove the parent SpeakTube folder: it may contain private keys/user files.
