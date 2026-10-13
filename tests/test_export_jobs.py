import asyncio
import pathlib
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer
from h3_lab.export_jobs import ExportJobs
from h3_lab.routes import register_lab_routes

class ExportRegistryTests(unittest.TestCase):
    def test_duplicate_active_source_has_one_job_and_lease(self):
        with tempfile.TemporaryDirectory() as tmp:
            jobs=ExportJobs(tmp);record,duplicate=jobs.submit('video/owned.mp4','2x')
            self.assertFalse(duplicate);again,duplicate=jobs.submit('video/owned.mp4','2x')
            self.assertTrue(duplicate);self.assertEqual(record['job_id'],again['job_id']);self.assertTrue(jobs.is_source_active('owned.mp4'))
            jobs.update(record['job_id'],status='failed',error='Failed verification')
            self.assertFalse(jobs.is_source_active('owned.mp4'))
    def test_restart_records_interruption_and_missing_completed_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            jobs=ExportJobs(tmp);active,_=jobs.submit('video/owned.mp4','2x');done,_=jobs.submit('video/other.mp4','2x')
            jobs.update(done['job_id'],status='completed',result={'filename':'gone.mp4'})
            recovered=ExportJobs(tmp);self.assertEqual(recovered.get(active['job_id'])['status'],'interrupted')
            self.assertEqual(recovered.get(done['job_id'])['status'],'missing')
    def test_queue_limit_and_copy_isolation(self):
        with tempfile.TemporaryDirectory() as tmp:
            jobs=ExportJobs(tmp)
            for n in range(4):jobs.submit(f'video/{n}.mp4','2x')
            with self.assertRaises(ValueError):jobs.submit('video/overflow.mp4','2x')
            rows=jobs.list();rows[0]['status']='completed';self.assertEqual(jobs.list()[0]['status'],'queued')

class SharedExportRoutes(unittest.IsolatedAsyncioTestCase):
    async def test_background_export_survives_submitter_and_is_visible_to_other_client(self):
        import asyncio
        with tempfile.TemporaryDirectory() as tmp:
            root=pathlib.Path(tmp);source=root/'video'/'source.mp4';source.parent.mkdir();source.write_bytes(b'owned fixture')
            app=web.Application();services=register_lab_routes(app,str(root),output_root=root)
            server=TestServer(app);first=TestClient(server);await first.start_server()
            started=threading.Event();release=threading.Event()
            def worker(source,destination,target,progress):
                progress(status='encoding',frames_done=5,frames_total=10,progress_percent=47.5);started.set();release.wait(5)
                progress(status='verifying',progress_percent=97);destination.write_bytes(b'verified fixture')
                return {'verified':True,'width':192,'height':128,'frames':10,'audio_preserved':True}
            try:
                with patch('h3_lab.routes.owned_video',return_value=source),patch('h3_lab.media_export.upscale_take',side_effect=worker):
                    response=await first.post('/h3_studio/lab/media/export',json={'output_file':'video/source.mp4','format':'upscaled_mp4','target':'2x','background':True})
                    self.assertEqual(response.status,202);job=(await response.json())['job'];self.assertTrue(await asyncio.to_thread(started.wait,5));await first.session.close()
                    # Independent HTTP session reads shared state; no initiating-tab state.
                    import aiohttp
                    async with aiohttp.ClientSession() as other:
                        async with other.get(str(server.make_url('/h3_studio/lab/media/exports'))) as response:
                            rows=(await response.json())['jobs'];self.assertEqual(rows[0]['frames_done'],5);self.assertEqual(rows[0]['progress_percent'],47.5)
                        self.assertTrue(services['exports'].is_source_active(source.name));release.set()
                        for _ in range(100):
                            async with other.get(str(server.make_url('/h3_studio/lab/media/exports/'+job['job_id']))) as response:record=(await response.json())['job']
                            if record['status']=='completed':break
                            await asyncio.sleep(.02)
                        self.assertEqual(record['status'],'completed');self.assertTrue(record['result']['verified']);self.assertFalse(services['exports'].is_source_active(source.name))
                    recovered=ExportJobs(services['storage_root']);self.assertEqual(recovered.get(job['job_id'])['status'],'completed')
            finally:release.set();await first.close()

class ExportCancellationRoutes(unittest.IsolatedAsyncioTestCase):
    @staticmethod
    def request(background):
        class Request:
            async def json(self):
                return {'output_file': 'video/source.mp4', 'format': 'upscaled_mp4',
                        'target': '2x', 'background': background}
        return Request()

    @staticmethod
    def setup_routes(root):
        source = root / 'video' / 'source.mp4'
        source.parent.mkdir()
        source.write_bytes(b'owned fixture')
        app = web.Application()
        services = register_lab_routes(app, str(root), output_root=root)
        handler = next(route.handler for route in app.router.routes()
                       if route.method == 'POST' and route.resource.canonical == '/h3_studio/lab/media/export')
        return source, services, handler

    async def wait_completed(self, services):
        async def poll():
            while True:
                rows = services['exports'].list()
                if rows and rows[0]['status'] not in ('queued', 'preparing', 'encoding', 'verifying'):
                    return rows[0]
                await asyncio.sleep(.01)
        record = await asyncio.wait_for(poll(), 5)
        self.assertEqual(record['status'], 'completed')
        self.assertTrue((services['storage_root'] / 'exports' / record['result']['filename']).is_file())
        self.assertFalse(services['exports'].is_source_active('source.mp4'))
        self.assertEqual(len(services['exports'].list()), 1)
        return record

    async def test_cancelled_request_after_persisted_admission_still_registers_worker(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, services, handler = self.setup_routes(pathlib.Path(tmp))
            persisted = threading.Event()
            release_submit = threading.Event()
            started = threading.Event()
            release_worker = threading.Event()
            original_submit = services['exports'].submit

            def delayed_submit(*args):
                result = original_submit(*args)
                persisted.set()
                release_submit.wait(5)
                return result

            def worker(source, destination, target, progress):
                progress(status='encoding')
                started.set()
                release_worker.wait(5)
                destination.write_bytes(b'verified fixture')
                return {'verified': True}

            with patch('h3_lab.routes.owned_video', return_value=source), \
                 patch.object(services['exports'], 'submit', side_effect=delayed_submit), \
                 patch('h3_lab.media_export.upscale_take', side_effect=worker) as upscale:
                request = asyncio.create_task(handler(self.request(True)))
                try:
                    self.assertTrue(await asyncio.to_thread(persisted.wait, 5))
                    self.assertEqual(services['exports'].list()[0]['status'], 'queued')
                    request.cancel()
                    with self.assertRaises(asyncio.CancelledError):
                        await request
                    release_submit.set()
                    self.assertTrue(await asyncio.to_thread(started.wait, 5))
                    self.assertTrue(services['exports'].is_source_active(source.name))
                    release_worker.set()
                    await self.wait_completed(services)
                    self.assertEqual(upscale.call_count, 1)
                finally:
                    release_submit.set()
                    release_worker.set()
                    if not request.done():
                        request.cancel()
                        await asyncio.gather(request, return_exceptions=True)
                    if started.is_set():
                        await self.wait_completed(services)

    async def test_cancelled_duplicate_sync_waiter_does_not_cancel_shared_worker(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, services, handler = self.setup_routes(pathlib.Path(tmp))
            started = threading.Event()
            release_worker = threading.Event()
            duplicate_seen = threading.Event()
            original_submit = services['exports'].submit

            def observe_submit(*args):
                result = original_submit(*args)
                if result[1]:
                    duplicate_seen.set()
                return result

            def worker(source, destination, target, progress):
                progress(status='encoding')
                started.set()
                release_worker.wait(5)
                destination.write_bytes(b'verified fixture')
                return {'verified': True}

            with patch('h3_lab.routes.owned_video', return_value=source), \
                 patch.object(services['exports'], 'submit', side_effect=observe_submit), \
                 patch('h3_lab.media_export.upscale_take', side_effect=worker) as upscale:
                response = await handler(self.request(True))
                self.assertEqual(response.status, 202)
                self.assertTrue(await asyncio.to_thread(started.wait, 5))
                request = asyncio.create_task(handler(self.request(False)))
                try:
                    self.assertTrue(await asyncio.to_thread(duplicate_seen.wait, 5))
                    # Drain admission's completion callbacks so the legacy request is awaiting the worker.
                    for _ in range(5):
                        await asyncio.sleep(0)
                    self.assertFalse(request.done())
                    request.cancel()
                    with self.assertRaises(asyncio.CancelledError):
                        await request
                    self.assertEqual(services['exports'].list()[0]['status'], 'encoding')
                    self.assertTrue(services['exports'].is_source_active(source.name))
                    release_worker.set()
                    await self.wait_completed(services)
                    self.assertEqual(upscale.call_count, 1)
                finally:
                    release_worker.set()
                    if not request.done():
                        request.cancel()
                        await asyncio.gather(request, return_exceptions=True)
                    await self.wait_completed(services)

class ExportInstallerGuard(unittest.TestCase):
    def test_active_cpu_export_blocks_install_idle(self):
        from deploy.launcher_smoke import ComfyAPI
        from unittest.mock import Mock
        api=ComfyAPI('http://localhost:8190');api.queue=Mock(return_value={'queue_running':[],'queue_pending':[]})
        api.request=Mock(return_value={'jobs':[{'status':'encoding'}]})
        self.assertFalse(api.wait_idle(0));api.request.return_value={'jobs':[{'status':'completed'}]};self.assertTrue(api.wait_idle(0))
