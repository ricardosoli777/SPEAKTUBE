import hashlib
import io
import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'installer'))
import install_core as core
import voice_service as host


class MemoryRegistry:
    def __init__(self):
        self.values = {}
        self.fail_next_write = False

    def read(self, key):
        value = self.values.get(key)
        return None if value is None else value.copy()

    def write(self, key, values):
        if self.fail_next_write:
            self.fail_next_write = False
            raise PermissionError('simulated registry failure')
        self.values[key] = values.copy()

    def remove(self, key):
        self.values.pop(key, None)

    def restore(self, key, values):
        self.remove(key)
        if values is not None:
            self.write(key, values)


def payload(path, executable=b'packaged-service', traversal=False):
    with zipfile.ZipFile(path, 'w') as archive:
        if traversal:
            archive.writestr('../outside.txt', 'invalid')
        archive.writestr('SpeakTubeVoice.exe', executable)
        archive.writestr('_internal/python313.dll', b'embedded-runtime')
        archive.writestr('payload-info.json', json.dumps({'extension_id': core.EXTENSION_ID,
            'executable_sha256': hashlib.sha256(executable).hexdigest()}))


class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory(prefix='speaktube-install-test-')
        self.root = Path(self.folder.name)
        self.base = self.root / 'SpeakTube'
        self.package = self.root / 'payload.zip'
        payload(self.package)
        self.setup = self.root / 'Setup.exe'
        self.setup.write_bytes(b'installer')
        self.registry = MemoryRegistry()

    def tearDown(self):
        self.folder.cleanup()

    def install(self):
        return core.install(self.package, self.setup, self.base, self.registry, stop_fn=lambda p: None)

    def test_clean_install_registers_only_the_expected_extension(self):
        target = self.install()
        manifest = json.loads((target / (core.HOST_NAME + '.json')).read_text())
        self.assertEqual(manifest['allowed_origins'], [f'chrome-extension://{core.EXTENSION_ID}/'])
        self.assertEqual(manifest['path'], str(target / 'SpeakTubeVoice.exe'))
        self.assertIn(core.HOST_KEY, self.registry.values)
        self.assertTrue((target / '_internal/python313.dll').is_file())
        self.assertTrue((target / 'Uninstall.exe').is_file())

    def test_update_and_uninstall_preserve_private_keys_and_other_user_files(self):
        target = self.install()
        keys = self.base / 'keys'
        keys.mkdir()
        sentinel = keys / 'do-not-touch.pem'
        sentinel.write_text('user-owned-data')
        payload(self.package, executable=b'updated-service')
        self.install()
        self.assertEqual((target / 'SpeakTubeVoice.exe').read_bytes(), b'updated-service')
        core.uninstall(self.base, self.registry, stop_fn=lambda p: None)
        self.assertFalse(target.exists())
        self.assertEqual(sentinel.read_text(), 'user-owned-data')
        self.assertFalse(self.registry.values)

    def test_failed_registration_rolls_back_existing_installation(self):
        target = self.install()
        original = self.registry.values.copy()
        payload(self.package, executable=b'new-but-failed')
        self.registry.fail_next_write = True
        with self.assertRaises(PermissionError):
            self.install()
        self.assertEqual((target / 'SpeakTubeVoice.exe').read_bytes(), b'packaged-service')
        self.assertEqual(self.registry.values, original)

    def test_package_path_traversal_is_rejected(self):
        payload(self.package, traversal=True)
        with self.assertRaises(ValueError):
            self.install()
        self.assertFalse((self.base / 'outside.txt').exists())
        self.assertFalse(self.registry.values)

    def test_package_integrity_failure_is_rejected(self):
        with zipfile.ZipFile(self.package, 'w') as archive:
            archive.writestr('SpeakTubeVoice.exe', b'invalid')
            archive.writestr('payload-info.json', json.dumps({'extension_id': core.EXTENSION_ID,
                                                            'executable_sha256': 'bad'}))
        with self.assertRaises(ValueError):
            self.install()
        self.assertFalse(self.registry.values)

    def test_existing_unrelated_directory_is_preserved(self):
        target = self.base / 'Service'
        target.mkdir(parents=True)
        (target / 'important.txt').write_text('preserve')
        with self.assertRaises(ValueError):
            self.install()
        self.assertEqual((target / 'important.txt').read_text(), 'preserve')

    def test_target_cannot_escape_the_owned_directory(self):
        with self.assertRaises(ValueError):
            core.validate_target(self.base, self.root)


class ProtocolTests(unittest.TestCase):
    def test_protocol_roundtrip_and_no_arbitrary_commands(self):
        source = io.BytesIO()
        host.write_message(source, {'command': 'status'})
        host.write_message(source, {'command': 'run', 'path': 'anything.exe'})
        source.seek(0)
        output = io.BytesIO()
        with patch.object(host, 'health', return_value=None):
            result = host.native(f'chrome-extension://{core.EXTENSION_ID}/', source, output)
        self.assertEqual(result, 0)
        output.seek(0)
        self.assertTrue(host.read_message(output)['installed'])
        self.assertFalse(host.read_message(output)['ok'])

    def test_wrong_extension_is_rejected_before_processing(self):
        with patch.object(host, 'start') as start:
            result = host.native('chrome-extension://other/', io.BytesIO(), io.BytesIO())
        self.assertEqual(result, 3)
        start.assert_not_called()

    def test_oversized_and_truncated_messages_are_rejected(self):
        for data in [struct.pack('<I', 999999), b'\x01\x00', struct.pack('<I', 5) + b'{}']:
            with self.assertRaises(ValueError):
                host.read_message(io.BytesIO(data))

    def test_existing_compatible_service_is_reused_without_launching(self):
        data = {'engine': 'edge-tts', 'extension_id': core.EXTENSION_ID}
        with patch.object(host, 'health', return_value=data), patch.object(host.subprocess, 'Popen') as launch:
            self.assertEqual(host.start(), data)
        launch.assert_not_called()

    def test_occupied_port_does_not_launch_another_service(self):
        with patch.object(host, 'health', return_value={'engine': 'different'}), patch.object(host.subprocess, 'Popen') as launch:
            with self.assertRaises(RuntimeError):
                host.start()
        launch.assert_not_called()


if __name__ == '__main__':
    unittest.main()
