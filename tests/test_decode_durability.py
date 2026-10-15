"""CPU-only recovery tests; no torch or model imports."""
import importlib.util
import json
import pathlib
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(__file__).parents[1]


def load_supervisor():
    spec = importlib.util.spec_from_file_location('h3_supervisor_test', ROOT / 'deploy/openbayes_h3_supervisor.py')
    module = importlib.util.module_from_spec(spec)
    with patch.dict(sys.modules, {'fcntl': types.SimpleNamespace()}):
        spec.loader.exec_module(module)
    return module


def workflow():
    return {
        '8': {'class_type': 'KSampler', 'inputs': {}},
        '13': {'class_type': 'H3ReleaseForDecode', 'inputs': {'samples': ['8', 0], 'token': 'a'*12}},
        '4': {'class_type': 'VAELoader', 'inputs': {'vae_name': 'original.safetensors'}},
        '9': {'class_type': 'VAEDecode', 'inputs': {'samples': ['13', 0], 'vae': ['4', 0]}},
        '20': {'class_type': 'ImageCrop', 'inputs': {'image': ['9', 0], 'width': 320, 'height': 640, 'x': 4, 'y': 0}},
        '11': {'class_type': 'CreateVideo', 'inputs': {'images': ['20', 0], 'fps': 24}},
        '12': {'class_type': 'H3SaveVideo', 'inputs': {'video': ['11', 0], 'filename_prefix': 'video/h3_studio_'+'a'*12}},
    }


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.mod = load_supervisor()
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = pathlib.Path(self.tmp.name)
        self.latent = self.root/'output/latent'/('h3_studio_'+'a'*12+'.safetensors')
        self.latent.parent.mkdir(parents=True)
        self.latent.write_bytes(b'checkpoint')
        self.jobs = self.root/'output/lab_storage/jobs_manifest.json'
        self.jobs.parent.mkdir(parents=True)
        self.job = {'job_id': 'original-job', 'request_id': 'a'*12, 'state': 'failed', 'render_spec': {'workflow': workflow()}}
        self.jobs.write_text(json.dumps({'original-job': self.job}))
        self.posts = []

    def request(self, base, path, payload=None):
        if path == '/queue': return {'queue_running': [], 'queue_pending': []}
        if path == '/h3_studio/updates/maintenance': return {'admission_closed': False}
        self.assertEqual(path, '/h3_studio/lab/jobs/original-job/recover')
        self.posts.append((path, payload))
        return {'job': {'job_id': 'child-job', 'state': 'queued', 'prompt_id': 'recovered-prompt'}}

    def recover(self):
        with patch.object(self.mod, 'api', self.request):
            self.mod.recover(self.root, 'http://test')

    def test_supervisor_requests_only_parent_id_through_tracked_endpoint(self):
        self.recover()
        self.assertEqual(self.posts, [('/h3_studio/lab/jobs/original-job/recover', {})])

    def test_cancelled_and_cancel_requested_jobs_are_not_replayed(self):
        for state in ('cancelled', 'cancel_requested', 'completed'):
            self.job['state'] = state
            self.jobs.write_text(json.dumps({'original-job': self.job}))
            self.recover()
        self.assertEqual(self.posts, [])
        self.assertTrue(self.latent.exists())

    def test_partial_mp4_does_not_delete_checkpoint(self):
        video = self.root/'output/video'/('h3_studio_'+'a'*12+'_00001_.mp4')
        video.parent.mkdir()
        video.write_bytes(b'')
        self.recover()
        self.assertTrue(self.latent.exists())
        self.assertEqual(len(self.posts), 1)

    def test_definite_rejection_can_be_retried_but_accepted_is_not_duplicated(self):
        original = self.request
        def reject(base, path, payload=None):
            if path.endswith('/recover'): return {'error': 'invalid workflow'}
            return original(base, path, payload)
        with patch.object(self.mod, 'api', reject): self.mod.recover(self.root, 'http://test')
        self.recover()
        self.recover()
        self.assertEqual(len(self.posts), 1)

    def test_uncertain_reply_retries_only_the_idempotent_child_endpoint(self):
        original = self.request
        def lose_reply(base, path, payload=None):
            if path.endswith('/recover'):
                self.posts.append((path, payload))
                raise TimeoutError('reply lost')
            return original(base, path, payload)
        with patch.object(self.mod, 'api', lose_reply): self.mod.recover(self.root, 'http://test')
        self.recover()
        self.assertEqual(len(self.posts), 2)

    def test_busy_queue_or_missing_manifest_prevents_recovery(self):
        with patch.object(self.mod, 'api', return_value={'queue_running': [['busy']], 'queue_pending': []}):
            self.mod.recover(self.root, 'http://test')
        self.assertEqual(self.posts, [])
        self.jobs.unlink()
        self.recover()
        self.assertEqual(self.posts, [])

    def test_maintenance_or_stop_prevents_recovery(self):
        original = self.request
        def closed(base, path, payload=None):
            if path.endswith('/maintenance'): return {'admission_closed': True}
            return original(base, path, payload)
        with patch.object(self.mod, 'api', closed): self.mod.recover(self.root, 'http://test')
        with patch.object(self.mod, 'STOP', True): self.recover()
        self.assertEqual(self.posts, [])

    def test_explicit_worker_interpreter_is_preserved(self):
        interpreter = self.root/'custom-env/python'
        interpreter.parent.mkdir()
        interpreter.write_bytes(b'python')
        self.assertEqual(self.mod.worker_python(self.root, str(interpreter)), interpreter)
        with self.assertRaises(ValueError): self.mod.worker_python(self.root, str(interpreter)+'-missing')

    def test_worker_command_preserves_bind_port_and_reserve(self):
        args = types.SimpleNamespace(bind='0.0.0.0', port=8190, reserve_vram=3.0)
        command = self.mod.worker_command(pathlib.Path('/python'), args)
        self.assertEqual(command[command.index('--listen')+1], '0.0.0.0')
        self.assertEqual(command[command.index('--port')+1], '8190')
        self.assertEqual(command[command.index('--reserve-vram')+1], '3.0')
        self.assertIn('--cache-ram', command)


    def test_selected_venv_symlink_is_not_resolved_to_system_python(self):
        target = self.root / 'system-python'
        target.touch()
        selected = self.root / 'venv/bin/python'
        selected.parent.mkdir(parents=True)
        try:
            selected.symlink_to(target)
        except OSError:
            self.skipTest('Symlink privilege unavailable')
        self.assertEqual(self.mod.worker_python(self.root, str(selected)), selected.absolute())


class CheckpointTests(unittest.TestCase):
    def test_unload_failure_retains_already_written_checkpoint(self):
        with tempfile.TemporaryDirectory() as directory:
            target = pathlib.Path(directory)/'latent'/('h3_studio_'+'a'*12+'.safetensors')
            tensor = types.SimpleNamespace(detach=lambda: tensor, to=lambda *a: tensor, contiguous=lambda: tensor)
            def unload():
                self.assertTrue(target.is_file(), 'checkpoint must precede model unload')
                raise RuntimeError('unload failed')
            def save(tensors, path): pathlib.Path(path).write_bytes(b'checkpoint')
            model = types.SimpleNamespace(unload_all_models=unload, soft_empty_cache=lambda: None)
            modules = {'folder_paths': types.SimpleNamespace(get_output_directory=lambda: directory),
                       'av': types.SimpleNamespace(), 'numpy': types.SimpleNamespace(), 'torch': types.SimpleNamespace(),
                       'safetensors': types.ModuleType('safetensors'),
                       'safetensors.torch': types.SimpleNamespace(load_file=lambda *a, **k: {}, save_file=save),
                       'comfy': types.ModuleType('comfy'), 'comfy.model_management': model,
                       'durability_pkg': types.ModuleType('durability_pkg'),
                       'durability_pkg.h3_continuation': types.SimpleNamespace(preserve_context=lambda *a: None)}
            spec = importlib.util.spec_from_file_location('durability_pkg.h3_video_save', ROOT/'h3_video_save.py')
            module = importlib.util.module_from_spec(spec)
            with patch.dict(sys.modules, modules):
                spec.loader.exec_module(module)
                with self.assertRaisesRegex(RuntimeError, 'unload failed'):
                    module.H3ReleaseForDecode().release({'samples': tensor}, 'a'*12, {})
            self.assertEqual(target.read_bytes(), b'checkpoint')


if __name__ == '__main__': unittest.main()
