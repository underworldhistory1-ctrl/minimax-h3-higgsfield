import asyncio
import errno
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer
from h3_lab.storage import GIB, StorageUnavailable, capacity, check_storage, register_storage_guard
from h3_queue_bridge import ComfyQueueBridge, StorageAdmissionRejected


class StorageTests(unittest.TestCase):
    def test_write_probe_catches_hidden_quota_despite_cluster_free_space(self):
        with tempfile.TemporaryDirectory() as root, \
                patch('h3_lab.storage.capacity', return_value={'available_bytes': 100 * GIB}), \
                patch('h3_lab.storage.tempfile.TemporaryFile', side_effect=OSError(errno.EDQUOT, 'quota')):
            with self.assertRaisesRegex(StorageUnavailable, 'unrelated to your prompt'):
                check_storage([root], GIB)

    def test_actual_write_failure_not_only_file_creation(self):
        with tempfile.TemporaryDirectory() as root, \
                patch('h3_lab.storage.capacity', return_value={'available_bytes': 100 * GIB}), \
                patch('h3_lab.storage.os.fsync', side_effect=OSError(errno.ENOSPC, 'full')):
            with self.assertRaises(StorageUnavailable):
                check_storage([root], GIB)
            self.assertEqual(list(Path(root).iterdir()), [])

    def test_parent_budget_bounds_global_free(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root)
            (path / '.h3-storage-budget.json').write_text(json.dumps({'max_bytes': 45 * GIB}))
            child = path / 'results'
            child.mkdir()
            def xattr(parent, key):
                if Path(parent) == path and key == 'ceph.dir.rbytes':
                    return str(44 * GIB).encode()
                raise OSError(errno.ENODATA, 'absent')
            with patch('h3_lab.storage.os.getxattr', side_effect=xattr, create=True):
                self.assertEqual(capacity(child), {'available_bytes': GIB, 'quota_known': True})
                with self.assertRaises(StorageUnavailable):
                    check_storage([child], 2 * GIB)

    def test_unknown_usage_with_budget_fails_closed(self):
        with tempfile.TemporaryDirectory() as root:
            (Path(root) / '.h3-storage-budget.json').write_text('{"max_bytes": 100}')
            with patch('h3_lab.storage.os.getxattr', side_effect=OSError(errno.ENODATA, 'absent'), create=True):
                with self.assertRaisesRegex(StorageUnavailable, 'usage is unavailable'):
                    capacity(root)

    def test_probe_leaves_existing_results_untouched(self):
        with tempfile.TemporaryDirectory() as root:
            result = Path(root) / 'today.mp4'
            result.write_bytes(b'original')
            check_storage([root, root], 1)
            self.assertEqual(list(Path(root).iterdir()), [result])
            self.assertEqual(result.read_bytes(), b'original')

    def test_lazy_temp_directory_is_created_before_probe(self):
        with tempfile.TemporaryDirectory() as root:
            temporary = Path(root) / 'temp' / 'temp'
            check_storage([temporary], 1)
            self.assertTrue(temporary.is_dir())
            self.assertEqual(list(temporary.iterdir()), [])


class AdmissionTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.count = 0
        self.cancelled = False
        self.app = web.Application()
        register_storage_guard(self.app, ['/test'], lambda: self.count)
        async def submit(request):
            await asyncio.sleep(.01)
            self.count += 1
            return web.json_response({'prompt_id': str(self.count)})
        async def cancel(request):
            self.cancelled = True
            return web.json_response({'ok': True})
        self.app.router.add_post('/prompt', submit)
        self.app.router.add_post('/h3_studio/lab/jobs/id/cancel', cancel)
        self.client = TestClient(TestServer(self.app))
        await self.client.start_server()

    async def asyncTearDown(self):
        await self.client.close()

    async def test_full_storage_never_submits_and_cancel_still_works(self):
        with patch('h3_lab.storage.check_storage', side_effect=StorageUnavailable('full')) as probe:
            result = await self.client.post('/prompt', json={'prompt': {}})
            self.assertEqual(result.status, 507)
            self.assertEqual((await result.json())['code'], 'storage_full')
            self.assertEqual(self.count, 0)
            self.assertEqual((await self.client.post('/h3_studio/lab/jobs/id/cancel')).status, 200)
            self.assertTrue(self.cancelled)
            self.assertEqual(probe.call_count, 1)

    async def test_parallel_mixed_jobs_count_previous_admission(self):
        requirements = []
        def probe(paths, required):
            requirements.append(required)
            if required > 2 * GIB:
                raise StorageUnavailable('full')
            return []
        with patch('h3_lab.storage.check_storage', side_effect=probe):
            results = await asyncio.gather(self.client.post('/prompt', json={'kind': 'video'}),
                                           self.client.post('/prompt', json={'kind': 'image'}))
            self.assertEqual(sorted(r.status for r in results), [200, 507])
            self.assertEqual(requirements, [2 * GIB, 3 * GIB])
            self.assertEqual(self.count, 1)

    async def test_status_reports_not_ready_without_gpu_work(self):
        with patch('h3_lab.storage.check_storage', side_effect=StorageUnavailable('full')):
            response = await self.client.get('/h3_studio/storage')
            self.assertEqual(response.status, 507)
            self.assertFalse((await response.json())['ready'])
            self.assertEqual(self.count, 0)

    async def test_bridge_preserves_definite_storage_rejection(self):
        bridge = ComfyQueueBridge(lambda: self.client.server.port)
        with patch('h3_lab.storage.check_storage', side_effect=StorageUnavailable('quota is full')):
            with self.assertRaises(StorageAdmissionRejected) as caught:
                await bridge.submit_prompt({'workflow': {'1': {'class_type': 'Mock'}}}, {})
            self.assertEqual(caught.exception.status_code, 507)
            self.assertIn('quota is full', str(caught.exception))
            self.assertEqual(self.count, 0)
