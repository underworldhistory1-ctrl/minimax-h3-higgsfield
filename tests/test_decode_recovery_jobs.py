"""Decode recovery uses ordinary durable, cancellable jobs; no model imports."""
import asyncio
import json
import pathlib
import tempfile
import unittest

from aiohttp import web
from aiohttp.test_utils import AioHTTPTestCase
from h3_lab.jobs import JobService
from h3_lab.routes import register_lab_routes
from tests.test_decode_durability import workflow


class RecoveryJobsTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = pathlib.Path(self.tmp.name)
        self.jobs = JobService(str(self.root/'lab_storage'), output_root=self.root)
        self.parent, _ = self.jobs.submit_job('a'*12, {'workflow': workflow()}, project_id='project')
        self.jobs.update_job(self.parent['job_id'], state='failed', error={'code': 'SERVER_RESTARTED'})
        self.latent = self.root/'latent'/('h3_studio_'+'a'*12+'.safetensors')
        self.latent.parent.mkdir()
        self.latent.write_bytes(b'checkpoint')

    async def test_child_is_atomic_idempotent_project_visible_and_uses_new_output(self):
        child, duplicate = self.jobs.submit_decode_recovery(self.parent['job_id'])
        again, duplicate2 = self.jobs.submit_decode_recovery(self.parent['job_id'])
        self.assertFalse(duplicate)
        self.assertTrue(duplicate2)
        self.assertEqual(child['job_id'], again['job_id'])
        self.assertEqual(child['recovery_of'], self.parent['job_id'])
        self.assertRegex(child['request_id'], r'^[a-f0-9]{12}$')
        self.assertNotEqual(child['request_id'], 'a'*12)
        graph = child['render_spec']['workflow']
        self.assertEqual(graph['13']['inputs']['token'], 'a'*12)
        self.assertEqual(graph['12']['inputs']['filename_prefix'], 'video/h3_studio_'+child['request_id'])
        self.assertNotIn('8', graph)
        self.assertEqual(graph['20']['inputs']['x'], 4)
        self.assertEqual(len(self.jobs.project_jobs('project')), 2)
        disk = json.loads(self.jobs.jobs_manifest_path.read_text())
        self.assertEqual(disk[self.parent['job_id']]['recovery_job_id'], child['job_id'])
        self.assertEqual(disk[self.parent['job_id']]['state'], 'failed')

    async def test_cancelled_completed_missing_latent_and_unsupported_graph_fail_closed(self):
        for state in ('cancelled', 'completed', 'cancel_requested', 'sampling'):
            with self.subTest(state=state):
                self.jobs._jobs[self.parent['job_id']]['state'] = state
                with self.assertRaises(ValueError): self.jobs.submit_decode_recovery(self.parent['job_id'])
        self.jobs._jobs[self.parent['job_id']]['state'] = 'failed'
        self.latent.unlink()
        with self.assertRaises(ValueError): self.jobs.submit_decode_recovery(self.parent['job_id'])
        self.latent.write_bytes(b'checkpoint')
        self.jobs._jobs[self.parent['job_id']]['render_spec']['workflow']['9']['inputs']['samples'] = ['8', 0]
        with self.assertRaises(ValueError): self.jobs.submit_decode_recovery(self.parent['job_id'])
        self.assertEqual(len(self.jobs.project_jobs('project')), 1)

    async def test_cancel_parent_before_recovery_reserves_cancellation(self):
        await self.jobs.request_cancel(self.parent['job_id'], Queue())
        with self.assertRaises(ValueError): self.jobs.submit_decode_recovery(self.parent['job_id'])
        self.assertEqual(self.jobs.get_job(self.parent['job_id'])['state'], 'failed')

    async def test_failed_parent_cancel_forwards_to_linked_pending_child(self):
        child, _ = self.jobs.submit_decode_recovery(self.parent['job_id'])
        self.jobs.update_job(child['job_id'], prompt_id='decode', state='queued')
        queue = Queue()
        queue.pending = [[0, 'decode', {}, {}, []]]
        await self.jobs.request_cancel(self.parent['job_id'], queue)
        self.assertEqual(self.jobs.get_job(child['job_id'])['state'], 'cancelled')
        self.assertEqual(self.jobs.get_job(self.parent['job_id'])['state'], 'failed')
        self.assertEqual(queue.pending, [])


class Queue:
    def __init__(self):
        self.pending = []
        self.posts = []
        self.on_submit = None
        self.lose_reply = False
    async def get_queue(self): return {'queue_running': [], 'queue_pending': list(self.pending)}
    async def get_history(self, prompt_id=None): return {}
    async def delete_from_queue(self, ids):
        self.pending = [row for row in self.pending if row[1] not in ids]
        return {'ok': True}
    async def submit_prompt(self, spec, extra):
        self.posts.append((spec, extra))
        self.pending = [[0, 'decode', spec['workflow'], {'extra_pnginfo': extra}, []]]
        if self.on_submit: await self.on_submit()
        if self.lose_reply: raise TimeoutError('accepted reply lost')
        return {'prompt_id': 'decode'}


class RecoveryRouteTests(AioHTTPTestCase):
    async def get_application(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.tmp.name)
        self.queue = Queue()
        app = web.Application()
        self.services = register_lab_routes(app, str(self.root), output_root=self.root,
                                           input_root=self.root, comfy_client=self.queue)
        self.jobs = self.services['jobs']
        self.parent, _ = self.jobs.submit_job('a'*12, {'workflow': workflow()}, project_id='project')
        self.jobs.update_job(self.parent['job_id'], state='failed', error={'code': 'SERVER_RESTARTED'})
        latent = self.root/'latent'/('h3_studio_'+'a'*12+'.safetensors')
        latent.parent.mkdir()
        latent.write_bytes(b'checkpoint')
        self.path = '/h3_studio/lab/jobs/'+self.parent['job_id']+'/recover'
        return app

    def tearDown(self):
        super().tearDown()
        self.tmp.cleanup()

    async def test_endpoint_builds_child_once_and_rejects_supplied_graph(self):
        bad = await self.client.post(self.path, json={'workflow': {}})
        self.assertEqual(bad.status, 400)
        first = await self.client.post(self.path, json={})
        self.assertEqual(first.status, 201)
        child = (await first.json())['job']
        again = await self.client.post(self.path, json={})
        self.assertEqual(again.status, 200)
        self.assertEqual((await again.json())['job']['job_id'], child['job_id'])
        self.assertEqual(len(self.queue.posts), 1)
        self.assertEqual(self.queue.posts[0][1]['h3_lab_job_id'], child['job_id'])
        self.assertEqual(child['state'], 'queued')

    async def test_cancel_during_acceptance_uses_normal_child_cancellation(self):
        async def cancel(): await self.jobs.request_cancel(self.parent['job_id'], self.queue)
        self.queue.on_submit = cancel
        response = await self.client.post(self.path, json={})
        child = (await response.json())['job']
        self.assertEqual(child['state'], 'cancelled')
        self.assertEqual(self.queue.pending, [])
        self.assertEqual(self.jobs.get_job(self.parent['job_id'])['state'], 'failed')

    async def test_lost_acceptance_reply_retry_reconciles_same_child_without_resubmit(self):
        self.queue.lose_reply = True
        first = await self.client.post(self.path, json={})
        self.assertEqual(first.status, 503)
        again = await self.client.post(self.path, json={})
        self.assertEqual(again.status, 200)
        child = (await again.json())['job']
        self.assertEqual(child['prompt_id'], 'decode')
        self.assertEqual(child['state'], 'queued')
        self.assertEqual(len(self.queue.posts), 1)

    async def test_cancel_by_parent_request_id_forwards_to_child(self):
        first = await self.client.post(self.path, json={})
        child = (await first.json())['job']
        response = await self.client.post('/h3_studio/lab/jobs/by_request/'+'a'*12+'/cancel', json={})
        self.assertEqual(response.status, 200)
        self.assertEqual(self.jobs.get_job(child['job_id'])['state'], 'cancelled')


if __name__ == '__main__': unittest.main()
