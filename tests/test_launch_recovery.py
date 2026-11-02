import contextlib
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

from deploy import launcher, worker_lifecycle, environment_audit


class LaunchRecoveryTests(unittest.TestCase):
    def test_pending_smoke_survives_new_source_and_defaults_before_update(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            state = {'version': 1, 'fingerprint': 'previous-release',
                     'config': {'url': 'http://127.0.0.1:8188', 'attention_backend': 'pytorch'},
                     'smoke': {'status': 'timeout', 'prompt_id': 'original-prompt'}}
            launcher.atomic_json(root / '.h3-launcher/state.json', state)
            def follow(api, project, folder, saved, save, timeout):
                self.assertEqual(saved['smoke']['prompt_id'], 'original-prompt')
                saved['smoke']['status'] = 'validated'
                save()
                return saved['smoke']
            with patch('sys.argv', ['launcher', '--comfy-root', str(root)]), \
                 patch('deploy.launcher_smoke.run_smoke', side_effect=follow) as smoke, \
                 patch('deploy.update_source.update_source') as update, \
                 patch.object(launcher.os, 'execv') as execute:
                self.assertEqual(launcher.main(), 0)
            smoke.assert_called_once()
            update.assert_not_called()
            execute.assert_called_once()
            saved = json.loads((root / '.h3-launcher/state.json').read_text())
            self.assertEqual(saved['smoke'], {'status': 'validated', 'prompt_id': 'original-prompt'})

    def test_uncertain_smoke_never_updates_or_resubmits(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            launcher.atomic_json(root / '.h3-launcher/state.json', {
                'config': {'url': 'http://127.0.0.1:8188'},
                'smoke': {'status': 'submission_uncertain'}})
            with patch('sys.argv', ['launcher', '--comfy-root', str(root)]), \
                 patch('deploy.launcher_smoke.run_smoke', return_value={'status': 'submission_uncertain'}), \
                 patch('deploy.update_source.update_source') as update, patch.object(launcher.os, 'execv') as execute:
                with self.assertRaisesRegex(RuntimeError, 'original prompt preserved'):
                    launcher.main()
            update.assert_not_called()
            execute.assert_not_called()

    def test_required_package_pin_drift_is_detected_even_when_importable(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'requirements.txt').write_text('comfy-kitchen==0.2.40\ntorch\n')
            with patch.object(environment_audit.importlib.metadata, 'version', return_value='0.2.35'):
                issues = environment_audit.requirement_issues(root)
            self.assertEqual(issues, ['comfy-kitchen: core requires 0.2.40, installed 0.2.35'])

    def stop_fixture(self, root, drain=None):
        launcher.atomic_json(root / '.h3-launcher-process.json', {'command': ['python', 'supervisor.py', '--port', '8188']})
        launcher.atomic_json(root / '.h3-launcher/maintenance.json', {'closed': True, 'reboot_ready': True})
        self.current_root = root
        api = Mock()
        api.request.side_effect = lambda path: ({'runtime_root_id': worker_lifecycle.root_identity(root), 'runtime_instance': 'worker-a'} if path.endswith('/readiness') else drain or {'admission_closed': True, 'inflight': 0,
                                            'active_operations': 0, 'queue_count': 0})
        api.wait_idle.return_value = True
        api.queue.return_value = {'status': 'offline'}
        return api

    def handles(self, stack):
        stack.enter_context(patch.object(worker_lifecycle.os, 'pidfd_open', return_value=98, create=True))
        local = Mock()
        local.queue.return_value = {'status': 'offline'}
        local.request.return_value = {'runtime_root_id': worker_lifecycle.root_identity(self.current_root), 'runtime_instance': 'worker-a'}
        stack.enter_context(patch('deploy.launcher_smoke.ComfyAPI', return_value=local))
        signal = stack.enter_context(patch.object(worker_lifecycle.signal, 'pidfd_send_signal', create=True))
        stack.enter_context(patch.object(worker_lifecycle.os, 'close'))
        stack.enter_context(patch.object(worker_lifecycle.select, 'select', return_value=([98], [], [])))
        return signal

    def test_drained_owned_supervisor_uses_pid_reuse_safe_handle(self):
        with tempfile.TemporaryDirectory() as directory, contextlib.ExitStack() as stack:
            root = Path(directory)
            api = self.stop_fixture(root)
            stack.enter_context(patch.object(worker_lifecycle, 'verified_supervisor', return_value=(42, 'start-a')))
            signal = self.handles(stack)
            api.queue.side_effect = RuntimeError('HTTP 502 public proxy remains up')
            self.assertTrue(worker_lifecycle.stop_owned_supervisor(root, root, api, 1))
            signal.assert_called_once_with(98, worker_lifecycle.signal.SIGTERM)

    def test_active_operations_block_owned_restart(self):
        with tempfile.TemporaryDirectory() as directory, contextlib.ExitStack() as stack:
            root = Path(directory)
            api = self.stop_fixture(root, {'admission_closed': True, 'inflight': 1,
                                           'active_operations': 0, 'queue_count': 0})
            stack.enter_context(patch.object(worker_lifecycle, 'verified_supervisor', return_value=(42, 'start-a')))
            signal = self.handles(stack)
            with self.assertRaisesRegex(RuntimeError, 'still active'):
                worker_lifecycle.stop_owned_supervisor(root, root, api, 1)
            signal.assert_not_called()

    def test_pid_ownership_change_blocks_signal(self):
        with tempfile.TemporaryDirectory() as directory, contextlib.ExitStack() as stack:
            root = Path(directory)
            api = self.stop_fixture(root)
            stack.enter_context(patch.object(worker_lifecycle, 'verified_supervisor', side_effect=[(42, 'a'), (42, 'b')]))
            signal = self.handles(stack)
            with self.assertRaisesRegex(RuntimeError, 'ownership changed'):
                worker_lifecycle.stop_owned_supervisor(root, root, api, 1)
            signal.assert_not_called()

    def test_unknown_process_receipt_is_never_owned(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            launcher.atomic_json(root / '.h3-launcher-process.json', {
                'pid': os.getpid(), 'root': str(root), 'python': 'python'})
            self.assertIsNone(worker_lifecycle.verified_supervisor(root, root, root / 'fake-proc'))


    def test_wrong_api_root_never_authorizes_process_signal(self):
        with tempfile.TemporaryDirectory() as directory, contextlib.ExitStack() as stack:
            root = Path(directory)
            api = self.stop_fixture(root)
            api.request.side_effect = None
            api.request.return_value = {'runtime_root_id': worker_lifecycle.root_identity(root / 'other'), 'runtime_instance': 'other'}
            stack.enter_context(patch.object(worker_lifecycle, 'verified_supervisor', return_value=(42, 'start-a')))
            signal = self.handles(stack)
            with self.assertRaisesRegex(RuntimeError, 'belongs to this ComfyUI root'):
                worker_lifecycle.stop_owned_supervisor(root, root, api, 1)
            signal.assert_not_called()

    def test_interpreter_identity_rejects_other_environment(self):
        ready = {'acceleration': {'interpreter_id': worker_lifecycle.interpreter_identity('/comfy/old/bin/python')}}
        self.assertFalse(launcher.interpreter_ready(ready, '/comfy/new/bin/python'))
        self.assertTrue(launcher.interpreter_ready(ready, '/comfy/old/bin/python'))

    def test_same_root_different_port_instance_never_authorizes_signal(self):
        with tempfile.TemporaryDirectory() as directory, contextlib.ExitStack() as stack:
            root = Path(directory)
            api = self.stop_fixture(root)
            stack.enter_context(patch.object(worker_lifecycle, 'verified_supervisor', return_value=(42, 'start-a')))
            signal = self.handles(stack)
            with patch('deploy.launcher_smoke.ComfyAPI') as client:
                client.return_value.request.return_value = {'runtime_root_id': worker_lifecycle.root_identity(root), 'runtime_instance': 'other-worker'}
                with self.assertRaisesRegex(RuntimeError, 'does not match'):
                    worker_lifecycle.stop_owned_supervisor(root, root, api, 1)
            signal.assert_not_called()

    def test_offline_wrong_url_cannot_change_active_root(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            api = Mock()
            api.queue.return_value = {'status': 'offline'}
            with patch.object(launcher, 'process_candidates', return_value=[(root, Path('python'))]):
                with self.assertRaisesRegex(RuntimeError, 'live worker'):
                    launcher.close_admission(api, root, 1)
            self.assertFalse((root / '.h3-launcher/maintenance.json').exists())

    def test_loopback_client_ignores_provider_credentials(self):
        from deploy.launcher_smoke import ComfyAPI
        with patch.dict(os.environ, {'H3_INSTANCE_PASSWORD': 'provider-secret', 'H3_ACCESS_TOKEN': 'provider-token'}):
            client = ComfyAPI('http://127.0.0.1:8188', provider_auth=False)
            with patch.object(client, '_open') as request:
                client._authenticate()
            request.assert_not_called()
            self.assertEqual(client._token, '')
            self.assertEqual(client._password, '')

    def test_offline_windows_relative_worker_fails_closed(self):
        record = {'ProcessId': 42, 'ExecutablePath': 'python.exe', 'CommandLine': 'python.exe main.py --port 8188'}
        result = Mock(returncode=0, stdout=json.dumps(record))
        with patch.object(launcher.subprocess, 'run', return_value=result):
            with self.assertRaisesRegex(RuntimeError, 'unresolved root'):
                launcher.process_candidates(fail_on_unresolved=True, platform='nt')

    def test_windows_process_inventory_failure_blocks_offline_update(self):
        with patch.object(launcher.subprocess, 'run', return_value=Mock(returncode=1, stdout='')):
            with self.assertRaisesRegex(RuntimeError, 'Cannot verify Windows'):
                launcher.process_candidates(fail_on_unresolved=True, platform='nt')
