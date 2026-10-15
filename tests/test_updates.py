import asyncio
import json
import pathlib
import tempfile
import unittest
from unittest.mock import patch
from unittest.mock import AsyncMock

from aiohttp import web
from aiohttp.test_utils import make_mocked_request
from h3_lab.updates import UpdateService, register_update_routes


class UpdateTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temp.name)
        self.runtime = self.root / 'custom_nodes' / 'h3_studio'
        self.runtime.mkdir(parents=True)
        self.service = UpdateService(self.runtime, self.root, lambda: 0)
        app = web.Application()
        register_update_routes(app, self.service)
        async def prompt(request):
            return web.json_response({'queued': True})
        app.router.add_post('/prompt', prompt)
        self.app = app

    async def asyncTearDown(self):
        self.temp.cleanup()

    async def request(self, method, path, body=None, headers=None):
        request = make_mocked_request(method, path, headers=headers or {'Host': 'localhost'})
        if body is not None:
            async def load_json():
                return body
            request.json = load_json
        route = await self.app.router.resolve(request)
        return await self.app.middlewares[0](request, route.handler)

    async def test_unknown_install_cannot_apply(self):
        response = await self.request('POST', '/h3_studio/updates/apply', {'commit': 'a' * 40})
        self.assertEqual(response.status, 409)
        self.assertFalse(self.service.blocked)

    async def test_cross_origin_action_rejected(self):
        response = await self.request('POST', '/h3_studio/updates/apply', {}, {'Origin': 'https://evil.invalid'})
        self.assertEqual(response.status, 403)

    async def test_https_proxy_origin_is_not_rejected(self):
        response = await self.request('POST', '/h3_studio/updates/apply', {},
                                      {'Host': 'studio.example', 'Origin': 'https://studio.example'})
        self.assertEqual(response.status, 409)

    async def test_background_operation_refuses_update(self):
        self.service.active_operations = lambda: ['media_export']
        with self.assertRaisesRegex(RuntimeError, 'operation'):
            self.service.reserve()
        self.assertFalse(self.service.blocked)

    async def test_apply_requires_exact_checked_commit(self):
        self.service.candidate = 'a' * 40
        with self.assertRaisesRegex(RuntimeError, 'Check'):
            await self.service.apply('b' * 40)
        self.assertFalse(self.service.blocked)

    async def test_worker_is_code_only_and_remains_paused_until_restart(self):
        worker = AsyncMock()
        worker.wait.return_value = 0
        self.service.blocked = True
        self.service.directory.mkdir(parents=True)
        with patch('h3_lab.updates.asyncio.create_subprocess_exec', return_value=worker) as launch:
            await self.service.run(self.root / 'source', 'a' * 40)
        command = launch.call_args.args
        self.assertIn('--ui-update', command)
        self.assertIn('--skip-smoke', command)
        self.assertIn('--no-start', command)
        self.assertEqual(self.service.status()['state'], 'restart_required')
        self.assertTrue(self.service.blocked)

    async def test_worker_failure_keeps_generation_paused(self):
        worker = AsyncMock()
        worker.wait.return_value = 1
        self.service.blocked = True
        self.service.directory.mkdir(parents=True)
        with patch('h3_lab.updates.asyncio.create_subprocess_exec', return_value=worker):
            await self.service.run(self.root / 'source', 'a' * 40)
        self.assertEqual(self.service.status()['state'], 'recovery_required')
        self.assertTrue(self.service.blocked)

    async def test_update_barrier_prevents_new_render(self):
        self.service.blocked = True
        response = await self.request('POST', '/prompt', {})
        self.assertEqual(response.status, 503)
        self.assertEqual(json.loads(response.text)['code'], 'update_in_progress')

    async def test_running_request_refuses_update(self):
        self.service.inflight = 1
        with self.assertRaisesRegex(RuntimeError, 'operation'):
            self.service.reserve()
        self.assertFalse(self.service.blocked)

    async def test_running_queue_refuses_update(self):
        self.service.queue_count = lambda: 1
        with self.assertRaisesRegex(RuntimeError, 'queue'):
            self.service.reserve()
        self.assertFalse(self.service.blocked)

    async def test_incomplete_update_survives_reload_as_restart_required(self):
        self.service.save({'state': 'running', 'target': 'a' * 40})
        recovered = UpdateService(self.runtime, self.root, lambda: 0)
        self.assertTrue(recovered.blocked)
        self.assertEqual(recovered.status()['state'], 'recovery_required')

    async def test_status_does_not_expose_source_paths(self):
        response = await self.request('GET', '/h3_studio/updates/status')
        self.assertEqual(response.status, 200)
        self.assertNotIn(str(self.root), response.text)

    async def test_successful_administrator_recovery_reopens_admission(self):
        self.service.save({'state': 'recovery_required'})
        self.service.blocked = True
        self.service.record.write_text(json.dumps({'state': 'completed'}), encoding='utf-8')
        self.assertEqual(self.service.status()['state'], 'completed')
        self.assertFalse(self.service.blocked)


if __name__ == '__main__':
    unittest.main()
