"""Optional cross-process GPU admission for co-located ComfyUI workers.

The native prompt stays pending until a device lease and peer-cache handoff
are available. No graph, model, seed, resolution or running task is changed.
"""
import json
import logging
import os
from pathlib import Path
import time
import urllib.error
import urllib.request
from urllib.parse import urlparse

logger = logging.getLogger('studio.shared_gpu')


class FileLease:
    def __init__(self, path):
        self.path = Path(path)
        self.fd = None

    def acquire(self):
        import fcntl
        if self.fd is not None:
            return False
        fd = os.open(self.path, os.O_CREAT | os.O_RDWR, 0o600)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            os.close(fd)
            return False
        except BaseException:
            os.close(fd)
            raise
        self.fd = fd
        return True

    def release(self):
        if self.fd is not None:
            # Closing also releases the lease after a process exits unexpectedly.
            os.close(self.fd)
            self.fd = None


class SharedGpuQueue:
    def __init__(self, queue, lease, ready, sleep=time.sleep):
        self.queue = queue
        self.lease = lease
        self.ready = ready
        self.sleep = sleep
        self.original_get = queue.get
        self.original_done = queue.task_done
        self.task_id = None
        self.waiting = False
        self.reason = ''

    def install(self):
        self.queue.get = self.get
        self.queue.task_done = self.task_done
        self.queue._studio_shared_gpu = self

    def get(self, timeout=None):
        # A short empty/blocked return lets ComfyUI process /free flags even
        # while another worker owns the device. Never claim an empty queue.
        with self.queue.not_empty:
            if not self.queue.queue:
                self.waiting = False
                self.queue.not_empty.wait(timeout=min(1.0, timeout) if timeout is not None else 1.0)
            if not self.queue.queue:
                return None
        keep = False
        acquired = False
        try:
            acquired = self.lease.acquire()
            if not acquired:
                self.reason = 'Waiting for the other studio to release the GPU'
                return None
            if not self.ready():
                self.reason = 'Waiting for the other studio or its cached GPU memory'
                return None
            # Native get owns its lock; timeout=0 also handles cancellation
            # between the readiness check and dequeue without blocking.
            item = self.original_get(timeout=0)
            if item is not None:
                self.task_id = item[1]
                keep = True
                self.waiting = False
                self.reason = ''
            return item
        except Exception:
            self.reason = 'Waiting for shared GPU readiness'
            logger.exception('Shared GPU admission failed; prompt remains queued')
            return None
        finally:
            if acquired and not keep:
                self.lease.release()
            if not keep:
                self.waiting = True
                self.sleep(0.25)

    def task_done(self, item_id, *args, **kwargs):
        try:
            return self.original_done(item_id, *args, **kwargs)
        finally:
            if item_id == self.task_id:
                self.task_id = None
                self.lease.release()


class PeerReadiness:
    def __init__(self, url, available_mb, minimum_mb=30000):
        self.url = url.rstrip('/')
        self.available_mb = available_mb
        self.minimum_mb = minimum_mb
        self.last_free = 0.0

    def __call__(self):
        try:
            with urllib.request.urlopen(self.url + '/queue', timeout=2) as response:
                queue = json.load(response)
            if not isinstance(queue, dict) or not isinstance(queue.get('queue_running'), list):
                return False
            if queue['queue_running']:
                return False
        except urllib.error.URLError as error:
            # A stopped peer has no active queue; memory still has to pass.
            if not isinstance(error.reason, ConnectionRefusedError):
                return False
        if self.available_mb() >= self.minimum_mb:
            return True
        if time.monotonic() - self.last_free >= 2:
            self.last_free = time.monotonic()
            request = urllib.request.Request(self.url + '/free', method='POST',
                data=json.dumps({'unload_models': True, 'free_memory': False}).encode(),
                headers={'Content-Type': 'application/json'})
            try:
                with urllib.request.urlopen(request, timeout=2):
                    pass
            except urllib.error.URLError:
                pass
        return False


def install_from_environment(queue):
    peer = os.environ.get('STUDIO_SHARED_GPU_PEER', '')
    path = os.environ.get('STUDIO_SHARED_GPU_LOCK', '')
    if not peer and not path:
        return None
    parsed = urlparse(peer)
    if os.name != 'posix' or not path or parsed.scheme != 'http' or parsed.hostname != '127.0.0.1' or not parsed.port or parsed.path not in ('', '/'):
        raise ValueError('Shared GPU admission requires Linux, a lease path, and a loopback HTTP peer')
    if getattr(queue, '_studio_shared_gpu', None) is not None:
        return queue._studio_shared_gpu
    import torch

    def available_mb():
        free, _total = torch.cuda.mem_get_info()
        return (free + torch.cuda.memory_reserved()) / 1024 ** 2

    gate = SharedGpuQueue(queue, FileLease(path), PeerReadiness(peer, available_mb))
    gate.install()
    logger.info('Shared GPU admission enabled with peer %s', peer)
    return gate
