"""Check writable storage and directory quotas before admitting GPU work."""
import asyncio
import errno
import json
import os
from pathlib import Path
import shutil
import tempfile

from aiohttp import web

GIB = 1024 ** 3


class StorageUnavailable(ValueError):
    status_code = 507


def capacity(path):
    path = Path(path).resolve()
    free = shutil.disk_usage(path).free
    quota_known = False
    for parent in (path, *path.parents):
        limit = None
        try:
            limit = int(os.getxattr(parent, "ceph.quota.max_bytes"))
        except (AttributeError, OSError, ValueError):
            pass
        config = parent / ".h3-storage-budget.json"
        if config.is_file():
            try:
                budget = json.loads(config.read_text(encoding="utf-8"))["max_bytes"]
                if isinstance(budget, bool) or not isinstance(budget, int) or budget <= 0:
                    raise ValueError("Invalid storage budget")
                limit = min(limit, budget) if limit else budget
            except (OSError, ValueError, KeyError, TypeError) as error:
                raise StorageUnavailable("Server storage budget configuration needs repair.") from error
        if limit and limit > 0:
            try:
                used = int(os.getxattr(parent, "ceph.dir.rbytes"))
                if used < 0:
                    raise ValueError("Invalid quota usage")
            except (AttributeError, OSError, ValueError) as error:
                raise StorageUnavailable("Server storage quota usage is unavailable; generation was not started.") from error
            free = min(free, max(0, limit - used))
            quota_known = True
    return {"available_bytes": free, "quota_known": quota_known}


def check_storage(paths, required_bytes):
    seen = set()
    results = []
    for path in paths:
        path = Path(path).resolve()
        if path in seen:
            continue
        seen.add(path)
        try:
            # ComfyUI creates its temp directory lazily after custom-node import.
            path.mkdir(parents=True, exist_ok=True)
            status = capacity(path)
            if status["available_bytes"] < required_bytes:
                raise StorageUnavailable("Server storage is nearly full. Free space or expand its storage quota before generating. Existing results are preserved.")
            # df can report an entire Ceph cluster rather than this user's quota.
            # Creation alone does not exercise the byte quota: write and fsync.
            with tempfile.TemporaryFile(dir=path, prefix=".h3-storage-probe-") as stream:
                stream.write(b"\0" * (1024 * 1024))
                stream.flush()
                os.fsync(stream.fileno())
        except OSError as error:
            if error.errno in (errno.EDQUOT, errno.ENOSPC):
                raise StorageUnavailable("Server storage quota is full. Free space or expand the quota before generating; this is unrelated to your prompt.") from error
            raise StorageUnavailable("Server storage is not writable; generation was not started.") from error
        results.append(status)
    return results


def register_storage_guard(app, paths, queue_count):
    """Serialize /prompt admission; count both video and image queue entries."""
    admission_lock = asyncio.Lock()

    async def check():
        # One GiB safety floor plus one GiB for each active/queued/new job.
        return await asyncio.to_thread(check_storage, paths, GIB * (2 + queue_count()))

    @web.middleware
    async def guard(request, handler):
        try:
            if request.method == "POST" and request.path == "/prompt":
                async with admission_lock:
                    await check()
                    return await handler(request)
            if request.method == "POST" and (request.path.startswith("/upload/") or
                    request.path.startswith("/h3_studio/")):
                # Cancellation and input deletion must remain available when full.
                if not any(word in request.path for word in ("cancel", "delete", "discard", "cleanup", "session")):
                    await asyncio.to_thread(check_storage, paths, GIB)
            return await handler(request)
        except StorageUnavailable as error:
            return web.json_response({"error": str(error), "code": "storage_full"}, status=507)
        except OSError as error:
            if error.errno not in (errno.EDQUOT, errno.ENOSPC):
                raise
            return web.json_response({"error": "Server storage quota is full. Free space or expand the quota.", "code": "storage_full"}, status=507)

    async def status(request):
        try:
            results = await check()
            return web.json_response({"ready": True, "queued_jobs": queue_count(), "storage": results})
        except StorageUnavailable as error:
            return web.json_response({"ready": False, "error": str(error), "code": "storage_full"}, status=507)

    app.middlewares.append(guard)
    app.router.add_get("/h3_studio/storage", status)
