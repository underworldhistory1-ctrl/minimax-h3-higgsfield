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

    async def test_completed_cli_marker_cannot_authorize_running_ui_reboot(self):
        async def reboot(request):
            return web.json_response({'reboot': True})
        self.app.router.add_post('/v2/manager/reboot', reboot)
        self.service.directory.mkdir(parents=True, exist_ok=True)
        (self.service.directory / 'maintenance.json').write_text(
            json.dumps({'closed': False, 'reboot_ready': True}))
        self.service.save({'state': 'running'})
        self.service.blocked = True
        self.assertEqual((await self.request('POST', '/v2/manager/reboot', {})).status, 503)
        self.service.save({'state': 'restart_required'})
        self.assertEqual((await self.request('POST', '/v2/manager/reboot', {})).status, 200)

    async def test_source_validation_cannot_reopen_reserved_admission(self):
        self.service.save({'state': 'completed'})
        self.service.candidate = 'a' * 40
        entered = asyncio.Event()
        release = asyncio.Event()
        async def delayed_source(*args):
            entered.set()
            await release.wait()
            raise RuntimeError('source rejected')
        with patch('h3_lab.updates.asyncio.to_thread', side_effect=delayed_source):
            task = asyncio.create_task(self.service.apply(self.service.candidate))
            await entered.wait()
            try:
                response = await self.request('POST', '/prompt', {})
                self.assertEqual(response.status, 503)
                self.assertTrue(self.service.blocked)
            finally:
                release.set()
                with self.assertRaisesRegex(RuntimeError, 'source rejected'):
                    await task
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


    async def test_cli_pending_restart_blocks_new_render_without_ui_update(self):
        self.service.directory.mkdir(parents=True, exist_ok=True)
        state = self.service.directory / 'state.json'
        state.write_text(json.dumps({'restart_pending': True}), encoding='utf-8')
        response = await self.request('POST', '/prompt', {})
        self.assertEqual(response.status, 503)
        state.write_text(json.dumps({'restart_pending': False}), encoding='utf-8')
        response = await self.request('POST', '/prompt', {})
        self.assertEqual(response.status, 200)

    async def test_invalid_launcher_state_fails_closed(self):
        self.service.directory.mkdir(parents=True, exist_ok=True)
        (self.service.directory / 'state.json').write_text('{incomplete', encoding='utf-8')
        response = await self.request('POST', '/prompt', {})
        self.assertEqual(response.status, 503)

    async def test_cli_restart_status_is_visible_without_receipt(self):
        self.service.directory.mkdir(parents=True, exist_ok=True)
        (self.service.directory / 'state.json').write_text(json.dumps({'restart_pending': True}), encoding='utf-8')
        response = await self.request('GET', '/h3_studio/updates/status')
        self.assertEqual(json.loads(response.text)['state'], 'restart_required')



    async def test_cli_pending_restart_keeps_owned_job_cancellation_available(self):
        async def cancel(request):
            return web.json_response({'cancel_requested': True})
        self.app.router.add_post('/h3_studio/lab/jobs/{id}/cancel', cancel)
        self.service.directory.mkdir(parents=True, exist_ok=True)
        (self.service.directory / 'state.json').write_text(json.dumps({'restart_pending': True}), encoding='utf-8')
        response = await self.request('POST', '/h3_studio/lab/jobs/owned-job/cancel', {})
        self.assertEqual(response.status, 200)


    async def test_pending_reboot_allowed_only_after_admitted_requests_drain(self):
        async def reboot(request):
            return web.json_response({'reboot': True})
        self.app.router.add_post('/v2/manager/reboot', reboot)
        self.service.directory.mkdir(parents=True, exist_ok=True)
        (self.service.directory / 'maintenance.json').write_text(json.dumps({'closed': True}))
        self.service.inflight = 1
        self.assertEqual((await self.request('POST', '/v2/manager/reboot', {})).status, 409)
        self.service.inflight = 0
        self.service.queue_count = lambda: 1
        self.assertEqual((await self.request('POST', '/v2/manager/reboot', {})).status, 409)
        self.service.queue_count = lambda: 0
        self.service.active_operations = lambda: ['export']
        self.assertEqual((await self.request('POST', '/v2/manager/reboot', {})).status, 409)
        self.service.active_operations = lambda: []
        (self.service.directory / 'maintenance.json').write_text(json.dumps({'closed': True, 'reboot_ready': True}))
        self.service.blocked = True
        self.assertEqual((await self.request('POST', '/v2/manager/reboot', {})).status, 200)

    async def test_root_maintenance_barrier_drains_previously_admitted_handler(self):
        entered, release = asyncio.Event(), asyncio.Event()
        async def delayed(request):
            entered.set()
            await release.wait()
            return web.json_response({'queued': True})
        self.app.router.add_post('/delayed', delayed)
        task = asyncio.create_task(self.request('POST', '/delayed', {}))
        await entered.wait()
        self.service.directory.mkdir(parents=True, exist_ok=True)
        (self.service.directory / 'maintenance.json').write_text(json.dumps({'closed': True}))
        self.assertEqual((await self.request('POST', '/prompt', {})).status, 503)
        status = json.loads((await self.request('GET', '/h3_studio/updates/maintenance')).text)
        self.assertTrue(status['admission_closed'])
        self.assertEqual(status['inflight'], 1)
        release.set()
        await task
        status = json.loads((await self.request('GET', '/h3_studio/updates/maintenance')).text)
        self.assertEqual(status['inflight'], 0)

    async def test_root_barrier_is_authoritative_after_custom_state_recovery(self):
        self.service.directory.mkdir(parents=True, exist_ok=True)
        (self.service.directory / 'state.json').write_text(json.dumps({'restart_pending': True}))
        (self.service.directory / 'maintenance.json').write_text(json.dumps({'closed': False}))
        self.assertEqual((await self.request('POST', '/prompt', {})).status, 200)

    async def test_cli_maintenance_refuses_prechecked_ui_update(self):
        self.service.candidate = 'a' * 40
        self.service.directory.mkdir(parents=True, exist_ok=True)
        (self.service.directory / 'maintenance.json').write_text(json.dumps({'closed': True}))
        with patch.object(self.service, 'source') as source:
            response = await self.request('POST', '/h3_studio/updates/apply', {'commit':'a'*40})
        self.assertEqual(response.status, 409)
        source.assert_not_called()
        self.assertIsNone(self.service.task)

    async def test_recovery_receipt_reopens_admission_without_browser_status_poll(self):
        self.service.blocked = True
        self.service.save({'state': 'completed'})
        response = await self.request('POST', '/prompt', {})
        self.assertEqual(response.status, 200)

    async def test_reboot_requires_files_prepared_phase_not_only_idle(self):
        async def reboot(request):
            return web.json_response({'reboot':True})
        self.app.router.add_post('/v2/manager/reboot', reboot)
        self.service.directory.mkdir(parents=True, exist_ok=True)
        marker = self.service.directory / 'maintenance.json'
        marker.write_text(json.dumps({'closed': True, 'reboot_ready':False}))
        self.assertEqual((await self.request('POST', '/v2/manager/reboot', {})).status, 503)
        marker.write_text(json.dumps({'closed': True, 'reboot_ready':True}))
        self.assertEqual((await self.request('POST', '/prompt', {})).status, 503)
        self.assertEqual((await self.request('POST', '/v2/manager/reboot', {})).status, 200)


    async def test_trusted_cli_recovery_unblocks_smoke_without_status_poll(self):
        from deploy import launcher
        self.service.directory.mkdir(parents=True, exist_ok=True)
        (self.service.directory / 'source.json').write_text(json.dumps({'installed_commit':'a'*40}))
        self.service.save({'state':'recovery_required'})
        self.service.blocked = True
        marker = self.service.directory / 'maintenance.json'
        marker.write_text(json.dumps({'closed':True, 'reboot_ready':True}))
        state = {'files_prepared':True, 'api_ready':True, 'restart_pending':False, 'maintenance_closed':True}
        def save():
            marker.write_text(json.dumps({'closed':state['maintenance_closed']}))
        launcher.reopen_after_verification(self.root, state, save)
        self.assertEqual((await self.request('POST', '/prompt', {})).status, 200)
        self.assertEqual(json.loads(self.service.record.read_text())['state'], 'completed')


if __name__ == '__main__':
    unittest.main()
