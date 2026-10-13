"""Exercise the real library delete route without importing CUDA/ComfyUI."""
import ast
import asyncio
import os
import pathlib
import tempfile
import threading
import unittest
from unittest.mock import Mock
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

ROOT = pathlib.Path(__file__).resolve().parents[1]

def load_functions(names, namespace):
    tree = ast.parse((ROOT / '__init__.py').read_text(encoding='utf-8'))
    functions = [n for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name in names]
    for node in functions:
        node.decorator_list = []
    exec(compile(ast.Module(body=functions, type_ignores=[]), str(ROOT / '__init__.py'), 'exec'), namespace)
    return namespace

class VideoDeletionRoutes(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.name = 'h3_studio_abcdef123456_00001_.mp4'
        self.file = pathlib.Path(self.tmp.name) / self.name
        self.file.write_bytes(b'video')
        self.wipe = Mock(return_value=True)
        self.ns = load_functions({'delete_video'}, {'web': web, 'asyncio': asyncio, 'os': os,
            '_safe_path': lambda name: str(self.file) if name == self.name else None, '_discard': self.wipe})
        app = web.Application(); app.router.add_post('/delete', self.ns['delete_video'])
        self.client = TestClient(TestServer(app)); await self.client.start_server()
    async def asyncTearDown(self):
        await self.client.close(); self.tmp.cleanup()
    async def test_explicit_deletion_ignores_pin_state_and_is_output_only(self):
        response = await self.client.post('/delete', json={'filename': self.name})
        self.assertEqual(response.status, 200)
        self.assertEqual(await response.json(), {'ok': True, 'filename': self.name})
        self.wipe.assert_called_once_with(self.name, output_only=True)
    async def test_invalid_names_and_payloads_never_reach_wipe(self):
        for body in [[], {'filename': {}}, {'filename': '../secret.mp4'}, {'filename': 'external.mp4'}]:
            response = await self.client.post('/delete', json=body)
            self.assertEqual(response.status, 400)
        self.wipe.assert_not_called()
    async def test_leased_or_failed_deletion_reports_conflict(self):
        self.wipe.return_value = False
        response = await self.client.post('/delete', json={'filename': self.name})
        self.assertEqual(response.status, 409)
        self.assertIn('in use', (await response.json())['error'])
        self.assertTrue(self.file.is_file())
    async def test_missing_file_is_not_false_success(self):
        self.file.unlink()
        response = await self.client.post('/delete', json={'filename': self.name})
        self.assertEqual(response.status, 404); self.wipe.assert_not_called()

class OutputOnlyWipe(unittest.TestCase):
    def test_output_deletion_cannot_resolve_to_input_with_same_name(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = pathlib.Path(tmp) / 'input.mp4'; output = pathlib.Path(tmp) / 'output.mp4'
            source.write_bytes(b'reference'); output.write_bytes(b'render')
            def wipe(path): pathlib.Path(path).unlink(); return True
            ns = load_functions({'_discard'}, {'os': os, '_safe_path': lambda name: str(output),
                '_resolve': lambda name: str(source), 'secure_wipe': wipe, '_lock': threading.RLock(),
                '_probe_cache': {}, '_thumbnail_dir': lambda: tmp, '_tracked': {}, '_metadata': {}})
            self.assertTrue(ns['_discard']('h3_studio_video.mp4', output_only=True))
            self.assertFalse(output.exists()); self.assertEqual(source.read_bytes(), b'reference')

class RealSecureWipe(unittest.TestCase):
    def test_actual_wipe_and_windows_directory_sync_boundary(self):
        import types
        import uuid
        for simulated_windows in [False, True]:
            with tempfile.TemporaryDirectory() as tmp:
                file = pathlib.Path(tmp) / 'owned.mp4'; file.write_bytes(b'owned synthetic fixture')
                runtime_os = types.SimpleNamespace(**vars(os))
                if simulated_windows:
                    runtime_os.name = 'nt'; runtime_os.open = Mock(side_effect=PermissionError('directory open unsupported'))
                ns = load_functions({'secure_wipe'}, {'os': runtime_os, 'uuid': uuid})
                self.assertTrue(ns['secure_wipe'](str(file), passes=1))
                self.assertFalse(file.exists()); self.assertEqual(list(pathlib.Path(tmp).iterdir()), [])
                if simulated_windows: runtime_os.open.assert_not_called()
    def test_directory_sync_warning_does_not_keep_stale_library_state(self):
        import types
        import uuid
        with tempfile.TemporaryDirectory() as tmp:
            file = pathlib.Path(tmp) / 'owned.mp4'; file.write_bytes(b'owned fixture')
            runtime_os = types.SimpleNamespace(**vars(os)); runtime_os.name = 'posix'
            runtime_os.open = Mock(side_effect=OSError('directory sync unavailable'))
            ns = load_functions({'secure_wipe'}, {'os': runtime_os, 'uuid': uuid})
            self.assertTrue(ns['secure_wipe'](str(file), passes=1))
            self.assertFalse(file.exists())
