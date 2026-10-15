import pathlib
import json
import copy
import tempfile
import unittest
from unittest.mock import patch

from deploy.ui_update import code_only_update, complete_recovery, compatibility_requires_launcher


class WorkerTests(unittest.TestCase):
    def test_compatibility_release_and_evidence_metadata_allow_code_only_update(self):
        before = {'schema_version': 1, 'project_version': '2.5.4', 'audit_date': 'old',
                  'comfyui_commit': 'a' * 40, 'gpu_evidence': 'untested',
                  'optional_nodes': {'hybrid': {'directory': 'node', 'repository': 'repo', 'commit': 'b' * 40, 'status': 'old'}}}
        after = copy.deepcopy(before)
        after.update(project_version='2.5.5', audit_date='new', gpu_evidence='new evidence')
        after['optional_nodes']['hybrid']['status'] = 'updated evidence'
        self.assertFalse(compatibility_requires_launcher(json.dumps(before), json.dumps(after)))

    def test_compatibility_dependency_and_schema_changes_require_full_launcher(self):
        before = {'schema_version': 1, 'comfyui_commit': 'a' * 40,
                  'optional_nodes': {'hybrid': {'directory': 'node', 'repository': 'repo', 'commit': 'b' * 40}}}
        for key in ('directory', 'repository', 'commit'):
            after = copy.deepcopy(before)
            after['optional_nodes']['hybrid'][key] = 'changed'
            self.assertTrue(compatibility_requires_launcher(json.dumps(before), json.dumps(after)), key)
        for key, value in [('schema_version', 2), ('comfyui_commit', 'c' * 40), ('new_dependency', {'package': 'x'})]:
            after = {**before, key: value}
            self.assertTrue(compatibility_requires_launcher(json.dumps(before), json.dumps(after)), key)

    def test_malformed_compatibility_manifest_requires_full_launcher(self):
        for content in ('invalid JSON', '[]', 'null'):
            self.assertTrue(compatibility_requires_launcher('{}', content))

    def test_file_preparation_alone_does_not_clear_recovery(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            state = root / '.h3-launcher'
            state.mkdir()
            record = state / 'ui-update.json'
            record.write_text('{"state":"recovery_required"}')
            (state / 'source.json').write_text(json.dumps({'installed_commit': 'a' * 40}))
            complete_recovery(root, {'files_prepared': True, 'api_ready': False})
            self.assertEqual(json.loads(record.read_text())['state'], 'recovery_required')
            complete_recovery(root, {'files_prepared': True, 'api_ready': True})
            self.assertEqual(json.loads(record.read_text())['state'], 'completed')

    def test_rejects_unchecked_revision(self):
        with self.assertRaisesRegex(RuntimeError, 'revision'):
            code_only_update(None, 'main')

    def test_rejects_missing_install_receipt_before_changing_source(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(RuntimeError, 'receipt'):
                code_only_update(pathlib.Path(directory), 'a' * 40)

    def test_main_advancing_since_check_never_copies_runtime(self):
        from deploy import launcher
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            source = root / 'source'
            source.mkdir()
            runtime = root / 'custom_nodes/h3_studio'
            runtime.mkdir(parents=True)
            marker = runtime / 'keep.txt'
            marker.write_text('existing user content')
            state = root / '.h3-launcher'
            state.mkdir()
            (state / 'source.json').write_text(json.dumps({'source_root': str(source), 'comfy_root': str(root),
                'runtime_root': str(runtime), 'installed_commit': '0' * 40}))
            (state / 'ui-update.json').write_text(json.dumps({'state': 'running', 'target': 'a' * 40}))

            def git(command, **kwargs):
                args = command[3:]
                if args[:2] == ['remote', 'get-url']:
                    return 'https://github.com/underworldhistory1-ctrl/minimax-h3-higgsfield.git'
                if args[:2] == ['branch', '--show-current']:
                    return 'main'
                if args == ['rev-parse', 'HEAD']:
                    return '0' * 40
                if args == ['rev-parse', 'FETCH_HEAD']:
                    return 'b' * 40
                return ''

            with patch.object(launcher, 'PROJECT', source), patch('deploy.ui_update.subprocess.check_output', side_effect=git), patch('deploy.install_windows.copy_runtime') as copy:
                with self.assertRaisesRegex(RuntimeError, 'changed since checking'):
                    code_only_update(root, 'a' * 40)
            copy.assert_not_called()
            self.assertEqual(marker.read_text(), 'existing user content')


if __name__ == '__main__':
    unittest.main()
