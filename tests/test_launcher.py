import json
import hashlib
import sys
import contextlib
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch, Mock

from deploy import launcher


class LauncherTests(unittest.TestCase):
    def test_attention_backend_defaults_and_explicit_commands(self):
        self.assertEqual(launcher.parser().parse_args([]).attention_backend, 'pytorch')
        for backend, flag in [('pytorch', '--use-pytorch-cross-attention'), ('ck-int8', '--use-ck-attention')]:
            args = launcher.parser().parse_args(['--attention-backend', backend])
            linux = launcher.server_command(Path('/comfy'), Path('/selected/python'), args, platform='posix')
            self.assertEqual(linux[linux.index('--attention-backend')+1], backend)
            direct = launcher.server_command(Path('/comfy'), Path('/selected/python'), args, platform='nt')
            self.assertIn(flag, direct)
            self.assertNotIn('--use-ck-attention' if backend == 'pytorch' else '--use-pytorch-cross-attention', direct)

    def test_attention_readiness_must_match_selected_backend(self):
        for backend, implementation in [('pytorch', 'attention_pytorch'), ('ck-int8', 'attention_comfy_kitchen_int8')]:
            args = launcher.parser().parse_args(['--attention-backend', backend])
            self.assertFalse(launcher.attention_ready({}, args))
            self.assertFalse(launcher.attention_ready({'attention': {'implementation': implementation, 'source': 'launch_argument'}}, args))
            self.assertTrue(launcher.attention_ready({'attention': {'implementation': implementation, 'source': 'loaded_runtime'}}, args))
            self.assertFalse(launcher.attention_ready({'attention': {'implementation': 'attention_sage'}}, args))

    def test_restart_rejects_correct_source_with_wrong_attention_backend(self):
        api = Mock()
        api.queue.return_value = {'queue_running': [], 'queue_pending': []}
        api.wait_idle.return_value = True
        old = {'runtime_instance': 'old', 'runtime_fingerprint': 'desired',
               'models': {'ref2va': True}, 'nodes': {'sampler': True},
               'acceleration': {'native_cuda_ready': True},
               'attention': {'implementation': 'attention_pytorch', 'source': 'loaded_runtime'}}
        wrong = dict(old, runtime_instance='new-wrong')
        healthy = dict(old, runtime_instance='new-ck',
                       attention={'implementation': 'attention_comfy_kitchen_int8', 'source': 'loaded_runtime'})
        api.request.side_effect = [old, {}, wrong, healthy]
        args = launcher.parser().parse_args(['--attention-backend', 'ck-int8'])
        state = {}
        with patch.object(launcher.time, 'sleep') as sleep, patch.object(
                launcher, 'loaded_source_fingerprint', return_value='desired'):
            launcher.start_server(api, Path('root'), Path('python'), args, Mock(), state, Mock())
        sleep.assert_called_once()
        self.assertEqual(state['loaded_runtime_instance'], 'new-ck')

    def test_source_receipt_requires_clean_official_main_and_separate_source(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            receipt = root / '.h3-launcher/source.json'
            def git(*args, **kwargs):
                command = args[0]
                if 'get-url' in command:
                    return 'https://github.com/underworldhistory1-ctrl/minimax-h3-higgsfield.git\n'
                if '--show-current' in command:
                    return 'main\n'
                if 'status' in command:
                    return ''
                return 'a' * 40 + '\n'
            with patch.object(launcher.subprocess, 'check_output', side_effect=git):
                self.assertTrue(launcher.write_source_receipt(root))
            saved = json.loads(receipt.read_text())
            self.assertEqual(saved['installed_commit'], 'a' * 40)
            self.assertEqual(saved['runtime_root'], str(launcher.runtime_target(root).resolve()))
            with patch.object(launcher.subprocess, 'check_output', return_value='custom\n'):
                self.assertFalse(launcher.write_source_receipt(root))
            self.assertFalse(receipt.exists())

    def test_snapshot_preserves_all_deployed_python_modules(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            extension = root / 'custom_nodes/h3_studio'
            for name in ('__init__.py', 'h3_audio_refine.py', 'prompt_formats.py'):
                path = extension / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('original ' + name)
            snapshot = launcher.runtime_snapshot(root, root / '.h3-launcher')
            backup = Path(snapshot['extension_backup'])
            for name in ('h3_audio_refine.py', 'prompt_formats.py'):
                self.assertEqual((backup / name).read_text(), 'original ' + name)

    def test_ambiguous_comfy_is_not_guessed(self):
        with tempfile.TemporaryDirectory() as folder:
            roots = [Path(folder) / name for name in ("a", "b")]
            for root in roots:
                root.mkdir()
                (root / "main.py").touch()
            with self.assertRaisesRegex(RuntimeError, "Multiple"):
                launcher.discover_comfy(None, roots)

    def test_portable_root_normalized(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder) / "ComfyUI"
            root.mkdir()
            (root / "main.py").touch()
            self.assertEqual(launcher.discover_comfy(folder), root.resolve())

    def test_atomic_state_and_config_isolation(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / "state.json"
            state = launcher.load_state(target, {"root": "a"})
            state["smoke"] = {"prompt_id": "existing"}
            launcher.atomic_json(target, state)
            self.assertEqual(launcher.load_state(target, {"root": "a"})["smoke"]["prompt_id"], "existing")
            changed = launcher.load_state(target, {"root": "b"})
            self.assertNotIn("prompt_id", changed["smoke"])
            self.assertEqual(json.loads(target.read_text())["smoke"]["prompt_id"], "existing")

    def test_lock_exclusive_and_released(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / "install.lock"
            with launcher.InstallLock(target):
                with self.assertRaisesRegex(RuntimeError, "already running"):
                    with launcher.InstallLock(target):
                        pass
            with launcher.InstallLock(target):
                pass

    def test_redaction_and_retry_exclusions(self):
        with patch.dict("os.environ", {"H3_INSTANCE_PASSWORD": "secret-value", "HF_TOKEN": "hf_secret"}):
            self.assertNotIn("secret-value", launcher.redact("password=secret-value"))
            self.assertNotIn("hf_secret", launcher.redact("hf_secret"))
            self.assertNotIn("abc", launcher.redact("https://host/?arg=abc"))
        self.assertFalse(launcher.transient_failure("401 Unauthorized connection reset"))
        self.assertTrue(launcher.transient_failure("Connection reset by peer"))
        self.assertFalse(launcher.transient_failure("No space left on device"))

    def test_dry_run_and_status_do_not_create_root(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder) / "absent"
            with patch("sys.argv", ["launcher", "--comfy-root", str(root), "--status"]):
                self.assertEqual(launcher.main(), 0)
            self.assertFalse(root.exists())

    def test_owned_partial_source_can_recreate_environment(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "main.py").touch()
            state = {"version": launcher.VERSION, "config": {"root": str(root)}, "fresh_install": True}
            launcher.atomic_json(root / ".h3-launcher/state.json", state)
            with patch.object(launcher, "process_candidates", return_value=[]):
                self.assertIsNone(launcher.discover_python(root))

    def test_runtime_edits_refused_before_overwrite(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            target = root / "custom_nodes/h3_studio"
            target.mkdir(parents=True)
            (target / "__init__.py").write_text("user customization")
            with self.assertRaisesRegex(RuntimeError, "customized"):
                launcher.protect_runtime_edits(root)

    def test_subdirectory_link_gets_local_overlay(self):
        from deploy.launcher_models import Artifact
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder) / "comfy"
            (root / "models").mkdir(parents=True)
            store = Path(folder) / "store"
            store.mkdir()
            try:
                (root / "models/diffusion_models").symlink_to(store, target_is_directory=True)
            except OSError:
                self.skipTest("symlink privilege unavailable")
            artifacts, overlay = launcher.model_overlay(root, [Artifact("models/diffusion_models/a.bin", "https://example/a", 1, None)])
            self.assertEqual(overlay, root / ".h3-launcher-models")
            self.assertEqual(artifacts[0].relative_path, ".h3-launcher-models/diffusion_models/a.bin")

    def test_official_windows_line_endings_are_not_confused_with_user_edits(self):
        previous = b'previous = true;\n'
        digest = hashlib.sha1(b'blob ' + str(len(previous)).encode() + b'\0' + previous).hexdigest()
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            installed = root / 'custom_nodes/h3_studio/web/studio.js'
            installed.parent.mkdir(parents=True)
            installed.write_bytes(previous.replace(b'\n', b'\r\n'))
            with patch.object(launcher, 'runtime_files', return_value=['web/studio.js']), \
                 patch.object(launcher.json, 'loads', return_value={'web/studio.js':[digest]}):
                launcher.protect_runtime_edits(root)
                installed.write_bytes(b'previous = false;\r\n')
                with self.assertRaisesRegex(RuntimeError, 'customized'):
                    launcher.protect_runtime_edits(root)

    def test_busy_queue_cannot_mutate_runtime(self):
        api = Mock()
        api.queue.return_value = {"queue_running": [[1]], "queue_pending": []}
        api.wait_idle.return_value = False
        with self.assertRaisesRegex(RuntimeError, "idle"):
            launcher.wait_for_install_idle(api, 1)

    def test_restart_rejects_old_instance_readiness(self):
        api = Mock()
        api.queue.return_value = {"queue_running": [], "queue_pending": []}
        api.wait_idle.return_value = True
        ready = {"runtime_instance": "old", "runtime_fingerprint": "desired", "models": {"fl2va": True}, "nodes": {"sampler": True}, "acceleration": {"native_cuda_ready": True}, "attention": {'implementation': 'attention_pytorch', 'source': 'loaded_runtime'}}
        api.request.side_effect = [ready, {}, ready, dict(ready, runtime_instance="new")]
        args = Mock(queue_timeout=1, start_timeout=10)
        with patch.object(launcher.time, "sleep") as sleep, patch.object(launcher, "loaded_source_fingerprint", return_value="desired"):
            launcher.start_server(api, Path("root"), Path("python"), args, Mock(), {"runtime_changed": True, "restart_pending": True, "pre_update_instance": "old"}, Mock())
        self.assertEqual(api.request.call_count, 4)
        sleep.assert_called_once()

    def test_authenticated_internal_installer_uses_configured_url(self):
        from deploy import install_windows
        api = Mock()
        api.queue.return_value = {"queue_running": [], "queue_pending": []}
        with patch.dict("os.environ", {"H3_LAUNCHER_INTERNAL": "1", "H3_LAUNCHER_URL": "https://provider/proxy"}), \
             patch("deploy.launcher_smoke.ComfyAPI", return_value=api) as factory:
            self.assertEqual(install_windows.queue_status("http://127.0.0.1:8188"), "online")
        factory.assert_called_once_with("https://provider/proxy")

    def test_coordinator_reports_validated_and_skips_unchanged_runtime(self):
        from deploy.launcher_models import Artifact
        with tempfile.TemporaryDirectory() as folder, contextlib.ExitStack() as stack:
            root = Path(folder)
            (root / "main.py").touch()
            (root / "models").mkdir()
            (root / "models/tiny.bin").write_bytes(b"valid")
            artifact = Artifact("models/tiny.bin", "https://example/unused", 5, hashlib.sha256(b"valid").hexdigest())
            api = Mock()
            api.queue.return_value = {"queue_running": [], "queue_pending": []}
            api.wait_idle.return_value = True
            stack.enter_context(patch("sys.argv", ["launcher", "--comfy-root", str(root), "--comfy-python", sys.executable]))
            stack.enter_context(patch("deploy.update_source.update_source", return_value=False))
            stack.enter_context(patch("deploy.runtime_patches.apply_patches", return_value=False))
            stack.enter_context(patch("deploy.launcher_models.manifest", return_value=[artifact]))
            stack.enter_context(patch("deploy.launcher_smoke.ComfyAPI", return_value=api))
            stack.enter_context(patch("deploy.launcher_smoke.run_smoke", return_value={"status": "validated"}))
            stack.enter_context(patch.object(launcher, "prerequisites"))
            stack.enter_context(patch.object(launcher, "close_admission"))
            stack.enter_context(patch.object(launcher, "audit_environment", return_value={"ready":True,"issues":[]}))
            stack.enter_context(patch.object(launcher.Runner, "run"))
            stack.enter_context(patch.object(launcher, "runtime_matches", return_value=True))
            stack.enter_context(patch.object(launcher, "environment_ready", return_value=True))
            stack.enter_context(patch.object(launcher, "optional_nodes_ready", return_value=True))
            setup = stack.enter_context(patch.object(launcher, "setup_runtime", return_value=Path(sys.executable)))
            stack.enter_context(patch.object(launcher, "start_server", side_effect=lambda *args: args[5].update(restart_pending=False)))
            self.assertEqual(launcher.main(), 0)
            report = json.loads((root / ".h3-launcher/report.json").read_text())
            self.assertTrue(report["files_prepared"] and report["api_ready"] and report["gpu_validated"])
            self.assertEqual(launcher.main(), 0)
            self.assertEqual(setup.call_count, 1)

    def test_coordinator_never_reports_timed_out_smoke_as_ready(self):
        with tempfile.TemporaryDirectory() as folder, contextlib.ExitStack() as stack:
            root = Path(folder)
            (root / "main.py").touch()
            api = Mock()
            api.queue.return_value = {"queue_running": [], "queue_pending": []}
            api.wait_idle.return_value = True
            stack.enter_context(patch("sys.argv", ["launcher", "--comfy-root", str(root), "--comfy-python", sys.executable]))
            stack.enter_context(patch("deploy.update_source.update_source", return_value=False))
            stack.enter_context(patch("deploy.runtime_patches.apply_patches", return_value=False))
            stack.enter_context(patch("deploy.launcher_models.manifest", return_value=[]))
            stack.enter_context(patch("deploy.launcher_smoke.ComfyAPI", return_value=api))
            stack.enter_context(patch("deploy.launcher_smoke.run_smoke", return_value={"status": "timeout"}))
            stack.enter_context(patch.object(launcher, "prerequisites"))
            stack.enter_context(patch.object(launcher, "close_admission"))
            stack.enter_context(patch.object(launcher, "audit_environment", return_value={"ready":True,"issues":[]}))
            stack.enter_context(patch.object(launcher.Runner, "run"))
            stack.enter_context(patch.object(launcher, "runtime_matches", return_value=True))
            stack.enter_context(patch.object(launcher, "setup_runtime", return_value=Path(sys.executable)))
            stack.enter_context(patch.object(launcher, "start_server", side_effect=lambda *args: args[5].update(restart_pending=False)))
            self.assertEqual(launcher.main(), 1)
            report = json.loads((root / ".h3-launcher/report.json").read_text())
            self.assertTrue(report["api_ready"])
            self.assertFalse(report["gpu_validated"])
            self.assertEqual(report["status"], "needs_action")

    def test_prepared_runtime_keeps_pending_reload(self):
        from deploy.launcher_models import Artifact
        with tempfile.TemporaryDirectory() as folder, contextlib.ExitStack() as stack:
            root = Path(folder)
            (root / "main.py").touch()
            api = Mock()
            api.queue.return_value = {"queue_running": [], "queue_pending": []}
            api.wait_idle.return_value = True
            stack.enter_context(patch("sys.argv", ["launcher", "--comfy-root", str(root), "--comfy-python", sys.executable, "--no-start"]))
            stack.enter_context(patch("deploy.update_source.update_source", return_value=False))
            stack.enter_context(patch("deploy.runtime_patches.apply_patches", return_value=False))
            stack.enter_context(patch("deploy.launcher_models.manifest", return_value=[]))
            stack.enter_context(patch("deploy.launcher_smoke.ComfyAPI", return_value=api))
            stack.enter_context(patch.object(launcher, "prerequisites"))
            stack.enter_context(patch.object(launcher, "close_admission"))
            stack.enter_context(patch.object(launcher, "audit_environment", return_value={"ready":True,"issues":[]}))
            stack.enter_context(patch.object(launcher, "runtime_matches", return_value=True))
            stack.enter_context(patch.object(launcher, "setup_runtime", return_value=Path(sys.executable)))
            self.assertEqual(launcher.main(), 0)
            report = json.loads((root / ".h3-launcher/report.json").read_text())
            self.assertTrue(report.get("restart_pending"))
            # Adding a storage overlay also requires a reload when source is unchanged.
            report["restart_pending"] = False
            launcher.atomic_json(root / ".h3-launcher/state.json", report)
            api.request.return_value = {"runtime_instance": "old-worker"}
            with patch.object(launcher, "environment_ready", return_value=True), \
                 patch.object(launcher, "optional_nodes_ready", return_value=True), \
                 patch.object(launcher, "configure_overlay", side_effect=lambda *a, **kw: (kw["before_change"](), True)[1]):
                self.assertEqual(launcher.main(), 0)
            updated = json.loads((root / ".h3-launcher/report.json").read_text())
            self.assertTrue(updated["restart_pending"])
            self.assertEqual(updated["pre_update_instance"], "old-worker")

    def test_overlay_reload_intent_precedes_configuration_replace(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            intent = []
            def replace(source, destination):
                self.assertEqual(intent, ["saved"])
                raise OSError("simulated crash before replace")
            with patch.object(launcher.subprocess, "run", return_value=Mock(returncode=0)), \
                 patch.object(launcher.os, "replace", side_effect=replace):
                with self.assertRaisesRegex(OSError, "simulated crash"):
                    launcher.configure_overlay(root, root / "overlay", Path(sys.executable),
                                               before_change=lambda: intent.append("saved"))
            self.assertFalse((root / "extra_model_paths.yaml").exists())

    def test_missing_optional_node_requires_repair(self):
        with tempfile.TemporaryDirectory() as folder:
            self.assertFalse(launcher.optional_nodes_ready(Path(folder), Mock(no_refine=False, no_controlnet=False)))

    def test_fresh_temp_handoff_uses_stable_destination(self):
        with patch.object(launcher, "PROJECT", Path("/tmp/h3-cloud-setup-random/h3-studio-src")), \
             patch.object(launcher, "process_candidates", return_value=[]), \
             patch.object(launcher, "default_fresh_root", return_value=Path("/durable/ComfyUI")):
            self.assertEqual(launcher.discover_comfy(None, []), Path("/durable/ComfyUI"))


    def test_close_admission_persists_root_barrier_before_waiting(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            api = Mock()
            api.queue.return_value = {'queue_running': [], 'queue_pending': []}
            def status(path):
                self.assertEqual(path, '/h3_studio/updates/maintenance')
                self.assertTrue(json.loads((root / '.h3-launcher/maintenance.json').read_text())['closed'])
                return {'admission_closed': True, 'inflight': 0, 'active_operations': 0, 'queue_count': 0}
            api.request.side_effect = status
            launcher.close_admission(api, root, 1)

    def test_close_admission_waits_for_handler_then_newly_enqueued_work(self):
        with tempfile.TemporaryDirectory() as folder:
            api = Mock()
            api.queue.return_value = {'queue_running': [], 'queue_pending': []}
            api.request.side_effect = [
                {'admission_closed': True, 'inflight': 1, 'active_operations': 0, 'queue_count': 0},
                {'admission_closed': True, 'inflight': 0, 'active_operations': 0, 'queue_count': 1},
                {'admission_closed': True, 'inflight': 0, 'active_operations': 0, 'queue_count': 0}]
            with patch.object(launcher.time, 'sleep') as sleep:
                launcher.close_admission(api, Path(folder), 10)
            self.assertEqual(sleep.call_count, 2)

    def test_online_legacy_runtime_cannot_be_mutated_without_drain_proof(self):
        with tempfile.TemporaryDirectory() as folder:
            api = Mock()
            api.queue.return_value = {'queue_running': [], 'queue_pending': []}
            api.request.return_value = {'state': 'idle'}
            with self.assertRaisesRegex(RuntimeError, 'drain'):
                launcher.close_admission(api, Path(folder), 1)

    def test_custom_report_directory_cannot_hide_maintenance_before_mutation(self):
        with tempfile.TemporaryDirectory() as folder, contextlib.ExitStack() as stack:
            root = Path(folder) / 'ComfyUI'
            root.mkdir()
            (root / 'main.py').touch()
            reports = Path(folder) / 'reports'
            api = Mock()
            api.queue.return_value = {'status': 'offline'}
            stack.enter_context(patch('sys.argv', ['launcher', '--comfy-root', str(root),
                '--comfy-python', sys.executable, '--state-dir', str(reports), '--no-update']))
            stack.enter_context(patch('deploy.launcher_models.manifest', return_value=[]))
            stack.enter_context(patch('deploy.launcher_smoke.ComfyAPI', return_value=api))
            stack.enter_context(patch.object(launcher, 'prerequisites'))
            stack.enter_context(patch.object(launcher, 'runtime_matches', return_value=False))
            def mutation(*args):
                self.assertTrue(json.loads((root / '.h3-launcher/maintenance.json').read_text())['closed'])
                raise RuntimeError('simulated repair failure')
            setup = stack.enter_context(patch.object(launcher, 'setup_runtime', side_effect=mutation))
            self.assertEqual(launcher.main(), 1)
            setup.assert_called_once()
            self.assertTrue((reports / 'state.json').exists())
            self.assertFalse((root / '.h3-launcher/state.json').exists())
            self.assertTrue(json.loads((root / '.h3-launcher/maintenance.json').read_text())['closed'])

    def test_restart_rejects_new_worker_with_old_cuda_environment(self):
        api = Mock()
        api.queue.return_value = {'queue_running': [], 'queue_pending': []}
        api.wait_idle.return_value = True
        old = {'runtime_instance': 'old', 'runtime_fingerprint': 'desired',
               'models': {'ref2va': True}, 'nodes': {'sampler': True},
               'acceleration': {'native_cuda_ready': False}}
        stale_env = dict(old, runtime_instance='new-old-env')
        healthy = dict(old, runtime_instance='new-cu130',
                       acceleration={'native_cuda_ready': True},
                       attention={'implementation': 'attention_pytorch', 'source': 'loaded_runtime'})
        api.request.side_effect = [old, {}, stale_env, healthy]
        state = {'restart_pending': True, 'pre_update_instance': 'old'}
        with patch.object(launcher.time, 'sleep') as sleep, patch.object(
                launcher, 'loaded_source_fingerprint', return_value='desired'):
            launcher.start_server(api, Path('root'), Path('python'),
                Mock(queue_timeout=1, start_timeout=10), Mock(), state, Mock())
        sleep.assert_called_once()
        self.assertFalse(state['restart_pending'])
        self.assertEqual(state['loaded_runtime_instance'], 'new-cu130')


    def test_linux_supervisor_uses_selected_interpreter_and_bind(self):
        args = Mock(bind='0.0.0.0', port=8188)
        command = launcher.server_command(Path('/comfy'), Path('/selected/bin/python'), args, platform='posix')
        self.assertEqual(command[0], '/selected/bin/python')
        self.assertIn('openbayes_h3_supervisor.py', command[1])
        self.assertEqual(command[command.index('--comfy-python')+1], '/selected/bin/python')
        self.assertEqual(command[command.index('--bind')+1], '0.0.0.0')
        self.assertEqual(command[command.index('--reserve-vram')+1], '3.0')
        direct = launcher.server_command(Path('/comfy'), Path('/selected/python.exe'), args, platform='nt')
        self.assertEqual(direct[1], 'main.py')
        self.assertIn('--use-pytorch-cross-attention', direct)


if __name__ == "__main__":
    unittest.main()
