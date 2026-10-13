import asyncio
import pathlib
import tempfile
import threading
import unittest
from unittest.mock import Mock, patch
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer
from h3_lab.routes import register_lab_routes
from deploy.launcher_smoke import ComfyAPI, APIError

class OperationReadinessTests(unittest.TestCase):
    def test_every_off_queue_operation_blocks_installation(self):
        api=ComfyAPI('http://localhost:8190');api.queue=Mock(return_value={'queue_running':[],'queue_pending':[]})
        for operation in ('media_export','prompt_preparation','source_preparation','quality_analysis','control_preparation'):
            api.request=Mock(return_value={'jobs':[],'active_operations':[operation]})
            self.assertFalse(api.wait_idle(0),operation)
        api.request=Mock(return_value={'jobs':[],'active_operations':[]});self.assertTrue(api.wait_idle(0))
    def test_malformed_operation_status_does_not_assume_idle(self):
        api=ComfyAPI('http://localhost:8190');api.request=Mock(return_value={'jobs':[],'active_operations':'unknown'})
        with self.assertRaises(APIError):api.has_active_exports()

class SharedOperationRoutes(unittest.IsolatedAsyncioTestCase):
    async def test_muted_export_is_visible_before_it_finishes(self):
        with tempfile.TemporaryDirectory() as folder:
            root=pathlib.Path(folder);source=root/'source.mp4';source.write_bytes(b'owned fixture')
            app=web.Application();register_lab_routes(app,folder,output_root=root)
            client=TestClient(TestServer(app));await client.start_server()
            started=threading.Event();release=threading.Event()
            def worker(command,**kwargs):
                started.set();release.wait(5);pathlib.Path(command[-1]).write_bytes(b'muted fixture')
            try:
                with patch('h3_lab.routes.owned_video',return_value=source),patch('h3_lab.assembly.get_ffmpeg_path',return_value='ffmpeg'),patch('h3_lab.routes.subprocess.run',side_effect=worker):
                    request=asyncio.create_task(client.post('/h3_studio/lab/media/export',json={'filename':'source.mp4','format':'muted_mp4'}))
                    self.assertTrue(await asyncio.to_thread(started.wait,3))
                    status=await (await client.get('/h3_studio/lab/media/exports')).json()
                    self.assertEqual(status['jobs'],[]);self.assertIn('media_export',status['active_operations'])
                    release.set();response=await request;self.assertEqual(response.status,201)
                    status=await (await client.get('/h3_studio/lab/media/exports')).json();self.assertNotIn('media_export',status['active_operations'])
            finally:release.set();await client.close()
