"""Threaded control preparation progress, cancellation and bounded records."""
import asyncio
import json
import pathlib
import tempfile
import threading
import unittest
import uuid
from unittest.mock import patch

from aiohttp import web
from h3_lab.routes import register_lab_routes


class Request:
    def __init__(self, body=None, request_id=None):
        self.body = body
        self.match_info = {"id": request_id}

    async def json(self):
        return self.body


class Queue:
    def __init__(self):
        self.pending = []
        self.submissions = []

    async def get_queue(self):
        return {"queue_running": [], "queue_pending": self.pending}

    async def submit_prompt(self, spec, extra):
        self.submissions.append(spec)
        return {"prompt_id": "test"}


class ControlPrepareRouteTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.directory.name)
        self.source = self.root / "h3_studio_kf_source.mp4"
        self.source.write_bytes(b"source fixture")
        app = web.Application()
        self.queue = Queue()
        register_lab_routes(app, self.directory.name, input_root=self.root, comfy_client=self.queue)
        self.handlers = {(route.method, route.resource.canonical): route.handler
                         for route in app.router.routes()}

    async def asyncTearDown(self):
        self.directory.cleanup()

    def handler(self, method, path):
        return self.handlers[(method, "/h3_studio/lab/control/" + path)]

    def body(self, **changes):
        return {"filename": self.source.name, "width": 256, "height": 256,
                "target_frames": 124, "kind": "canny", "input_type": "video",
                "request_id": str(uuid.uuid4()), **changes}

    async def snapshot(self, request_id):
        response = await self.handler("GET", "progress/{id}")(Request(request_id=request_id))
        return response.status, json.loads(response.text)

    async def completed(self):
        body = self.body()
        result = {"filename": "map.mp4", "source_file": "normalized.mp4"}
        for name in result.values():
            (self.root / name).touch()
        with patch("h3_lab.control_preprocess.process_control", return_value=result):
            response = await self.handler("POST", "prepare")(Request(body))
        self.assertEqual(response.status, 200)
        return body, result

    async def test_completed_late_cancel_removes_only_derived_files_and_hides_private_paths(self):
        body, result = await self.completed()
        snapshot = (await self.snapshot(body["request_id"]))[1]
        self.assertNotIn("result_files", snapshot)
        response = await self.handler("POST", "cancel/{id}")(Request(request_id=body["request_id"]))
        self.assertEqual(response.status, 200)
        self.assertEqual(json.loads(response.text)["state"], "cancelled")
        self.assertNotIn("result_files", json.loads(response.text))
        self.assertTrue(self.source.exists())
        for name in result.values():
            self.assertFalse((self.root / name).exists())
        # Repeating a cancel remains safe after the result files are already gone.
        self.assertEqual((await self.handler("POST", "cancel/{id}")(Request(request_id=body["request_id"]))).status, 200)

    async def test_late_cancel_preserves_files_referenced_by_queue(self):
        body, result = await self.completed()
        self.queue.pending = [[1, "foreign-job", {"1": {"inputs": {"file": result["filename"]}}}, {}, []]]
        response = await self.handler("POST", "cancel/{id}")(Request(request_id=body["request_id"]))
        self.assertEqual(response.status, 409)
        self.assertEqual((await self.snapshot(body["request_id"]))[1]["state"], "completed")
        self.assertTrue(all((self.root / name).exists() for name in result.values()))
        self.queue.pending = []
        self.assertEqual((await self.handler("POST", "cancel/{id}")(Request(request_id=body["request_id"]))).status, 200)

    async def test_completed_cancel_serializes_queue_snapshot_with_job_submission(self):
        body, result = await self.completed()
        queried, release = asyncio.Event(), asyncio.Event()

        async def get_queue():
            snapshot = {"queue_running": [], "queue_pending": []}
            queried.set()
            await release.wait()
            return snapshot

        with patch.object(self.queue, "get_queue", get_queue):
            cancellation = asyncio.create_task(self.handler("POST", "cancel/{id}")(Request(request_id=body["request_id"])))
            try:
                await asyncio.wait_for(queried.wait(), 2)
                submit = self.handlers[("POST", "/h3_studio/lab/jobs")]
                response = await submit(Request({"request_id": "during-control-cancel", "render_spec": {
                    "workflow": {"1": {"class_type": "LoadVideo", "inputs": {"file": result["filename"]}}}}}))
                self.assertEqual(response.status, 409)
                self.assertEqual(self.queue.submissions, [])
            finally:
                release.set()
                self.assertEqual((await cancellation).status, 200)

    async def test_progress_and_explicit_cancel_cleanup_even_if_worker_returns_output(self):
        entered, release = threading.Event(), threading.Event()
        output, normalized = self.root / "map.mp4", self.root / "normalized.mp4"
        body = self.body()

        def process(*args, **kwargs):
            output.touch()
            normalized.touch()
            kwargs["progress"](3, 124, "process")
            entered.set()
            release.wait(5)
            return {"filename": output.name, "source_file": normalized.name}

        with patch("h3_lab.control_preprocess.process_control", process):
            task = asyncio.create_task(self.handler("POST", "prepare")(Request(body)))
            try:
                self.assertTrue(await asyncio.to_thread(entered.wait, 2))
                status, snapshot = await self.snapshot(body["request_id"])
                self.assertEqual(status, 200)
                self.assertEqual((snapshot["state"], snapshot["phase"], snapshot["processed_frames"]),
                                 ("processing", "process", 3))
                self.assertNotIn("cancel_event", snapshot)
                response = await self.handler("POST", "cancel/{id}")(Request(request_id=body["request_id"]))
                self.assertEqual(json.loads(response.text)["state"], "cancel_requested")
                self.assertFalse(task.done())
            finally:
                release.set()
                self.assertEqual((await task).status, 400)
        self.assertEqual((await self.snapshot(body["request_id"]))[1]["state"], "cancelled")
        self.assertFalse(output.exists())
        self.assertFalse(normalized.exists())
        self.assertTrue(self.source.exists())

    async def test_request_cancellation_keeps_worker_and_source_lock_until_stopped(self):
        entered, release = threading.Event(), threading.Event()
        calls, outputs, cancellations = [], [], []
        first_body, second_body = self.body(), self.body()

        def process(*args, **kwargs):
            calls.append(args)
            path = self.root / (str(uuid.uuid4()) + ".mp4")
            path.touch()
            outputs.append(path)
            if len(calls) == 1:
                cancellations.append(kwargs["cancel_event"])
                entered.set()
                release.wait(5)
            return {"filename": path.name, "source_file": path.name}

        with patch("h3_lab.control_preprocess.process_control", process):
            first = asyncio.create_task(self.handler("POST", "prepare")(Request(first_body)))
            second = None
            try:
                self.assertTrue(await asyncio.to_thread(entered.wait, 2))
                first.cancel()
                second = asyncio.create_task(self.handler("POST", "prepare")(Request(second_body)))
                await asyncio.sleep(.02)
                self.assertTrue(cancellations[0].is_set())
                self.assertFalse(first.done())
                self.assertEqual(len(calls), 1)
                self.assertEqual((await self.snapshot(second_body["request_id"]))[1]["state"], "waiting")
            finally:
                release.set()
                with self.assertRaises(asyncio.CancelledError):
                    await first
                if second is not None:
                    self.assertEqual((await second).status, 200)
        self.assertEqual((await self.snapshot(first_body["request_id"]))[1]["state"], "cancelled")
        self.assertFalse(outputs[0].exists())
        self.assertEqual(len(calls), 2)

    async def test_waiting_cancel_skips_worker_and_active_capacity_is_bounded(self):
        entered, release = threading.Event(), threading.Event()
        calls = []

        def process(*args, **kwargs):
            calls.append(args)
            entered.set()
            release.wait(5)
            return {"filename": "completed.mp4"}

        bodies = [self.body() for _ in range(16)]
        with patch("h3_lab.control_preprocess.process_control", process):
            tasks = [asyncio.create_task(self.handler("POST", "prepare")(Request(bodies[0])))]
            try:
                self.assertTrue(await asyncio.to_thread(entered.wait, 2))
                tasks.extend(asyncio.create_task(self.handler("POST", "prepare")(Request(body))) for body in bodies[1:])
                await asyncio.sleep(.02)
                response = await self.handler("POST", "prepare")(Request(self.body()))
                self.assertEqual(response.status, 409)
                for body in bodies[1:]:
                    response = await self.handler("POST", "cancel/{id}")(Request(request_id=body["request_id"]))
                    self.assertEqual(json.loads(response.text)["state"], "cancel_requested")
            finally:
                release.set()
                responses = await asyncio.gather(*tasks)
        self.assertEqual([response.status for response in responses], [200] + [400] * 15)
        self.assertEqual(len(calls), 1)
        self.assertEqual((await self.snapshot(bodies[-1]["request_id"]))[1]["state"], "cancelled")

    async def test_malformed_requests_and_failed_unknown_kind(self):
        for body in (None, [], self.body(filename="../secret.mp4"), self.body(request_id=[])):
            response = await self.handler("POST", "prepare")(Request(body))
            self.assertEqual(response.status, 400)
        body = self.body(kind="unknown")
        response = await self.handler("POST", "prepare")(Request(body))
        self.assertEqual(response.status, 400)
        self.assertEqual((await self.snapshot(body["request_id"]))[1]["state"], "failed")
        missing = await self.handler("POST", "cancel/{id}")(Request(request_id=str(uuid.uuid4())))
        self.assertEqual(missing.status, 404)

    async def test_unexpected_worker_failure_becomes_terminal_without_leaking_details(self):
        body = self.body()
        with patch("h3_lab.control_preprocess.process_control", side_effect=RuntimeError("secret model internals")), \
             self.assertLogs("h3_lab.routes", level="ERROR"):
            response = await self.handler("POST", "prepare")(Request(body))
        self.assertGreaterEqual(response.status, 500)
        self.assertNotIn("secret model internals", response.text)
        self.assertEqual((await self.snapshot(body["request_id"]))[1]["state"], "failed")


if __name__ == "__main__":
    unittest.main()
