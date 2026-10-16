import json
import tempfile
import unittest
from unittest.mock import AsyncMock, patch
from aiohttp import web
from h3_lab.routes import register_lab_routes

class Request:
    async def json(self):
        return {"output_file": "video/take.mp4", "target_project_id": "project", "expected_revision": 7}

class ReuseTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.directory = tempfile.TemporaryDirectory()
        app = web.Application()
        register_lab_routes(app, self.directory.name, comfy_client=object())
        self.handler = next(r.handler for r in app.router.routes()
                            if r.method == "POST" and r.resource.canonical.endswith("/videos/reuse"))

    async def asyncTearDown(self):
        self.directory.cleanup()

    async def test_stale_job_is_reconciled_before_reuse(self):
        for terminal in ("completed", "failed", "cancelled"):
            with self.subTest(state=terminal), \
                 patch("h3_lab.routes.JobService.project_jobs", return_value=[{"job_id":"old", "state":"sampling"}]), \
                 patch("h3_lab.routes.JobService.reconcile_submission_gap", new_callable=AsyncMock, return_value={"job_id":"old","state":terminal}) as reconcile, \
                 patch("h3_lab.routes.ProjectService.apply_reuse", return_value={"project":{"project_id":"project"}}) as apply:
                response = await self.handler(Request())
                self.assertEqual(response.status, 200)
                reconcile.assert_awaited_once()
                apply.assert_called_once()

    async def test_actual_active_work_still_protects_draft(self):
        with patch("h3_lab.routes.JobService.project_jobs", return_value=[{"job_id":"active", "state":"queued"}]), \
             patch("h3_lab.routes.JobService.reconcile_submission_gap", new_callable=AsyncMock, return_value={"job_id":"active","state":"sampling"}), \
             patch("h3_lab.routes.ProjectService.apply_reuse") as apply:
            response = await self.handler(Request())
            self.assertEqual(response.status, 409)
            apply.assert_not_called()

if __name__ == "__main__":
    unittest.main()
