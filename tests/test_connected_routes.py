"""Connected routes keep workers serialized through request cancellation."""
import asyncio
import json
import pathlib
import tempfile
import threading
import unittest
from unittest.mock import AsyncMock, patch

from aiohttp import web
from h3_lab.routes import register_lab_routes


class Request:
    def __init__(self, body=None, query=None):
        self.body = body
        self.query = query or {}

    async def json(self):
        return self.body


class Queue:
    def __init__(self):
        self.submissions = []

    async def get_queue(self):
        return {"queue_running": [], "queue_pending": []}

    async def submit_prompt(self, spec, extra):
        self.submissions.append(spec)
        return {"prompt_id": "test"}


class ConnectedRouteTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.directory.name)
        self.queue = Queue()
        app = web.Application()
        register_lab_routes(app, self.directory.name, input_root=self.root,
                            output_root=self.root, comfy_client=self.queue)
        self.handlers = {(route.method, route.resource.canonical): route.handler
                         for route in app.router.routes()}

    async def asyncTearDown(self):
        self.directory.cleanup()

    def handler(self, method, path):
        return self.handlers[(method, "/h3_studio/lab/" + path)]

    async def test_foreign_queue_blocks_writer_with_counts_then_prepares_when_empty(self):
        running = [[1, "foreign-running", {"private_prompt": "not exposed"}, {}, []]]
        pending = [[2, "foreign-pending", {"private_prompt": "not exposed"}, {}, []],
                   [3, "another-pending", {}, {}, []]]
        with patch("h3_lab.prompt_context.promptwriter.studio_provider_status", return_value={"configured": True}), \
             patch("h3_lab.prompt_context.PromptContextService.prepare", return_value={"compiled_prompt": "ready"}) as writer, \
             patch.object(self.queue, "get_queue", new_callable=AsyncMock) as queue:
            for active, waiting in ((running, []), ([], pending), (running, pending)):
                with self.subTest(running=len(active), pending=len(waiting)):
                    queue.return_value = {"queue_running": active, "queue_pending": waiting}
                    response = await self.handler("POST", "prompt/prepare")(Request({"source_prompt": "brief"}))
                    self.assertEqual(response.status, 409)
                    body = json.loads(response.text)
                    self.assertEqual(body["code"], "PREPARATION_QUEUE_BUSY")
                    self.assertEqual(body["running"], len(active))
                    self.assertEqual(body["pending"], len(waiting))
                    self.assertNotIn("foreign-running", response.text)
                    self.assertNotIn("foreign-pending", response.text)
                    self.assertNotIn("private_prompt", response.text)
                    writer.assert_not_called()
            queue.return_value = {"queue_running": [], "queue_pending": []}
            response = await self.handler("POST", "prompt/prepare")(Request({"source_prompt": "brief"}))
            self.assertEqual(response.status, 200)
            self.assertEqual(json.loads(response.text)["compiled_prompt"], "ready")
            writer.assert_called_once()
        self.assertEqual(self.queue.submissions, [])

    async def test_cancelled_preparation_keeps_submission_locked_until_worker_finishes(self):
        entered, release = threading.Event(), threading.Event()

        def prepare(service, body):
            entered.set()
            release.wait(5)
            return {"compiled_prompt": "ready"}

        with patch("h3_lab.prompt_context.promptwriter.studio_provider_status", return_value={"configured": True}), \
             patch("h3_lab.prompt_context.PromptContextService.prepare", prepare):
            task = asyncio.create_task(self.handler("POST", "prompt/prepare")(Request({})))
            try:
                self.assertTrue(await asyncio.to_thread(entered.wait, 2))
                task.cancel()
                await asyncio.sleep(0)
                self.assertFalse(task.done())
                busy = await self.handler("POST", "prompt/prepare")(Request({}))
                self.assertEqual(busy.status, 409)
                self.assertEqual(json.loads(busy.text)["code"], "PREPARATION_BUSY")
                response = await self.handler("POST", "jobs")(Request({"request_id": "blocked", "render_spec": {}}))
                self.assertEqual(response.status, 409)
                self.assertEqual(self.queue.submissions, [])
            finally:
                release.set()
                with self.assertRaises(asyncio.CancelledError):
                    await task
        response = await self.handler("POST", "jobs")(Request({"request_id": "released", "render_spec": {}}))
        self.assertEqual(response.status, 201)

    async def test_cancelled_control_keeps_source_lock_until_worker_finishes(self):
        (self.root / "h3_studio_kf_test.mp4").touch()
        entered, release = threading.Event(), threading.Event()
        calls = []

        def prepare(*args, **kwargs):
            calls.append(args)
            entered.set()
            release.wait(5)
            return {"filename": "prepared.mp4"}

        body = {"filename": "h3_studio_kf_test.mp4", "width": 864, "height": 480, "target_frames": 124}
        with patch("h3_lab.control.prepare_control", prepare):
            first = asyncio.create_task(self.handler("POST", "control/prepare")(Request(body)))
            second = None
            try:
                self.assertTrue(await asyncio.to_thread(entered.wait, 2))
                first.cancel()
                second = asyncio.create_task(self.handler("POST", "control/prepare")(Request(body)))
                await asyncio.sleep(.02)
                self.assertFalse(first.done())
                self.assertEqual(len(calls), 1)
            finally:
                release.set()
                with self.assertRaises(asyncio.CancelledError):
                    await first
                if second is not None:
                    self.assertEqual((await second).status, 200)
        self.assertEqual(len(calls), 2)

    async def test_quality_single_flight_cache_and_file_change(self):
        video = self.root / "video" / "h3_studio_abcdef123456.mp4"
        video.parent.mkdir()
        video.write_bytes(b"initial")
        entered, release = threading.Event(), threading.Event()
        calls = []

        def analyze(path):
            calls.append(path)
            entered.set()
            release.wait(5)
            return {"status": "test"}

        request = Request(query={"filename": "video/" + video.name})
        with patch("h3_lab.quality.analyze_quality", analyze):
            task = asyncio.create_task(self.handler("GET", "quality")(request))
            try:
                self.assertTrue(await asyncio.to_thread(entered.wait, 2))
                self.assertEqual((await self.handler("GET", "quality")(request)).status, 409)
            finally:
                release.set()
                self.assertEqual((await task).status, 200)
            self.assertEqual((await self.handler("GET", "quality")(request)).status, 200)
            self.assertEqual(len(calls), 1)
            video.write_bytes(b"changed contents")
            self.assertEqual((await self.handler("GET", "quality")(request)).status, 200)
            self.assertEqual(len(calls), 2)

    async def test_malformed_submission_and_undeclared_control_fail_before_queue(self):
        for body in (None, [], {"render_spec": []}, {"render_spec": {"workflow": []}},
                     {"render_spec": {"workflow": {"1": None}}},
                     {"render_spec": {"control": []}},
                     {"render_spec": {"workflow": {"1": {"class_type": "MinimaxH3LatentUpscaler3D"}}}},
                     {"render_spec": {"workflow": {"1": {"class_type": "MiniMaxH3FunControlNetApply"}}}}):
            with self.subTest(body=body):
                response = await self.handler("POST", "jobs")(Request(body))
                self.assertEqual(response.status, 400, json.loads(response.text))
        self.assertEqual(self.queue.submissions, [])


if __name__ == "__main__":
    unittest.main()
