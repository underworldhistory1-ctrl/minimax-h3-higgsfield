import gzip
import json
import pathlib
import tempfile
import unittest
from unittest.mock import patch

from h3_lab.updates import UpdateService


class UpdateIntegrityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)
        self.source = self.root / 'source'
        self.runtime = self.root / 'comfy/custom_nodes/h3_studio'
        for folder in (self.source, self.runtime):
            (folder / 'web').mkdir(parents=True)
            (folder / '__init__.py').write_text('current python')
            (folder / 'web/index.html').write_text('current interface')
        self.head = 'a' * 40
        self.service = UpdateService(self.runtime, self.root / 'comfy', lambda: 0)

    def check(self):
        def git(_source, *args):
            return self.head + '\trefs/heads/main' if args[0] == 'ls-remote' else self.head
        with patch.object(self.service, 'source', return_value=(self.source, {'installed_commit': self.head})), patch.object(self.service, 'git', side_effect=git):
            return self.service.check()

    def test_current_requires_matching_source_runtime_and_loaded_worker(self):
        result = self.check()
        self.assertEqual(result['state'], 'current')
        self.assertEqual(result['scope'], 'studio_code')

    def test_new_receipt_and_source_cannot_claim_an_old_interface_is_current(self):
        (self.runtime / 'web/index.html').write_text('old interface')
        result = self.check()
        self.assertEqual(result['state'], 'repair_required')
        self.assertFalse(result['can_install'])
        self.assertIsNone(self.service.candidate)

    def test_copied_code_does_not_claim_a_running_old_worker_is_current(self):
        for folder in (self.source, self.runtime):
            (folder / '__init__.py').write_text('new python awaiting restart')
        self.assertEqual(self.check()['state'], 'repair_required')

    def test_missing_runtime_file_is_not_current(self):
        (self.runtime / 'web/index.html').unlink()
        self.assertEqual(self.check()['state'], 'repair_required')

    def test_failed_check_revokes_previously_checked_install_target(self):
        self.service.candidate = 'b' * 40
        with patch.object(self.service, 'source', side_effect=RuntimeError('unknown')), patch('h3_lab.updates.urlopen', side_effect=OSError('offline')):
            with self.assertRaises(OSError):
                self.service.check()
        self.assertIsNone(self.service.candidate)

    def test_audio_and_prompt_format_modules_are_part_of_verification(self):
        for name in ('h3_audio_refine.py', 'prompt_formats.py'):
            with self.subTest(name=name):
                (self.source / name).write_text('official module')
                (self.runtime / name).write_text('old module')
                self.assertEqual(self.check()['state'], 'repair_required')

    def test_stale_compressed_interface_is_not_current(self):
        asset = self.runtime / 'web/index.html'
        asset.with_name(asset.name + '.gz').write_bytes(gzip.compress(b'old interface'))
        self.assertEqual(self.check()['state'], 'repair_required')

    def test_valid_gzip_and_line_ending_differences_are_accepted(self):
        asset = self.runtime / 'web/index.html'
        asset.with_name(asset.name + '.gz').write_bytes(gzip.compress(asset.read_bytes()))
        self.assertEqual(self.check()['state'], 'current')
        (self.source / '__init__.py').write_bytes(b'current python\n')
        (self.runtime / '__init__.py').write_bytes(b'current python\r\n')
        self.service = UpdateService(self.runtime, self.root / 'comfy', lambda: 0)
        self.assertEqual(self.check()['state'], 'current')

    def test_unverified_brotli_cannot_inherit_a_current_verdict(self):
        (self.runtime / 'web/index.html.br').write_bytes(b'old encoded interface')
        self.assertEqual(self.check()['state'], 'repair_required')
