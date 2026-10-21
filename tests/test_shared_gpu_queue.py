import importlib.util
import pathlib
import os
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import Mock, patch


class Queue:
    def __init__(self):
        self.not_empty = threading.Condition(threading.RLock())
        self.queue = ['prompt']
        self.running = {}
        self.done = []

    def get(self, timeout=None):
        with self.not_empty:
            if not self.queue:
                return None
            value = self.queue.pop(0)
            self.running[1] = value
            return value, 1

    def task_done(self, task_id, *args, **kwargs):
        self.running.pop(task_id)
        self.done.append(task_id)


class Lease:
    owner = None

    def acquire(self):
        if Lease.owner is not None:
            return False
        Lease.owner = self
        return True

    def release(self):
        if Lease.owner is self:
            Lease.owner = None


class Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        path = pathlib.Path(__file__).resolve().parents[1] / 'h3_shared_gpu.py'
        spec = importlib.util.spec_from_file_location('gpu_guard_test', path)
        cls.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.module)

    def setUp(self):
        Lease.owner = None

    def guard(self, queue, ready=lambda: True):
        gate = self.module.SharedGpuQueue(queue, Lease(), ready, sleep=lambda _: None)
        gate.install()
        return gate

    def test_peer_busy_leaves_prompt_pending(self):
        q = Queue()
        self.guard(q, ready=lambda: False)
        self.assertIsNone(q.get(timeout=0))
        self.assertEqual(q.queue, ['prompt'])
        self.assertEqual(q.running, {})
        self.assertIsNone(Lease.owner)

    def test_dynamic_cache_counts_only_own_device_and_shared_vbar_once(self):
        from types import SimpleNamespace as NS
        vbar = NS(loaded_size=lambda: 16000 * 1024 ** 2)
        model = NS(model=NS(dynamic_vbars={'cuda:0': vbar, 'cuda:1': vbar}))
        loaded = NS(device='cuda:0', model=model)
        other = NS(device='cuda:1', model=model)
        dead = NS(device='cuda:0', model=None)
        self.assertEqual(self.module.reusable_dynamic_bytes([loaded, loaded, other, dead], 'cuda:0'), 16000 * 1024 ** 2)

    def test_workers_are_serial_until_task_done(self):
        first, second = Queue(), Queue()
        self.guard(first)
        self.guard(second)
        self.assertEqual(first.get(timeout=0), ('prompt', 1))
        self.assertIsNone(second.get(timeout=0))
        first.task_done(1)
        self.assertEqual(second.get(timeout=0), ('prompt', 1))
        second.task_done(1)
        self.assertIsNone(Lease.owner)

    def test_empty_queue_does_not_reserve_gpu(self):
        q = Queue()
        q.queue.clear()
        self.guard(q)
        self.assertIsNone(q.get(timeout=0))
        self.assertIsNone(Lease.owner)

    def test_failed_readiness_releases_slot_and_does_not_pop(self):
        q = Queue()
        self.guard(q, ready=Mock(side_effect=RuntimeError('peer unavailable')))
        self.assertIsNone(q.get(timeout=0))
        self.assertEqual(q.queue, ['prompt'])
        self.assertIsNone(Lease.owner)

    def test_task_done_exception_still_releases_gpu(self):
        q = Queue()
        q.task_done = Mock(side_effect=RuntimeError('history write failed'))
        self.guard(q)
        q.get(timeout=0)
        with self.assertRaises(RuntimeError):
            q.task_done(1)
        self.assertIsNone(Lease.owner)

    def test_deleted_pending_prompt_is_never_executed_later(self):
        q = Queue()
        ready = Mock(return_value=False)
        self.guard(q, ready)
        q.get(timeout=0)
        q.queue.clear()
        ready.return_value = True
        self.assertIsNone(q.get(timeout=0))
        self.assertEqual(q.running, {})

    def test_cancellation_during_readiness_does_not_leak_lease(self):
        q = Queue()
        def ready():
            q.queue.clear()
            return True
        self.guard(q, ready)
        self.assertIsNone(q.get(timeout=0))
        self.assertIsNone(Lease.owner)
        self.assertEqual(q.running, {})

    def test_active_peer_is_never_asked_to_unload(self):
        response = Mock()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        response.read.return_value = b'{"queue_running":[[1]],"queue_pending":[]}'
        available = Mock(return_value=32000)
        with patch.object(self.module.urllib.request, 'urlopen', return_value=response) as request:
            self.assertFalse(self.module.PeerReadiness('http://127.0.0.1:8189', available)())
            self.assertEqual(request.call_count, 1)
        available.assert_not_called()

    def test_idle_peer_cache_handoff_preserves_ram_cache(self):
        response = Mock()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        response.read.return_value = b'{"queue_running":[],"queue_pending":[]}'
        with patch.object(self.module.urllib.request, 'urlopen', return_value=response) as request:
            ready = self.module.PeerReadiness('http://127.0.0.1:8189', lambda: 8000)
            self.assertFalse(ready())
            payload = request.call_args.args[0].data
            self.assertIn(b'"unload_models": true', payload)
            self.assertIn(b'"free_memory": false', payload)

    def test_unknown_peer_queue_never_admits_work(self):
        response = Mock()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        response.read.return_value = b'{}'
        with patch.object(self.module.urllib.request, 'urlopen', return_value=response):
            self.assertFalse(self.module.PeerReadiness('http://127.0.0.1:8189', lambda: 32000)())

    @unittest.skipUnless(os.name == 'posix', 'Linux file lease')
    def test_file_lease_excludes_another_process_and_recovers_after_release(self):
        with tempfile.TemporaryDirectory() as folder:
            path = str(pathlib.Path(folder) / 'gpu.lock')
            lease = self.module.FileLease(path)
            self.assertTrue(lease.acquire())
            code = 'import importlib.util,sys;s=importlib.util.spec_from_file_location("guard",sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);print(m.FileLease(sys.argv[2]).acquire())'
            args = [sys.executable, '-c', code, self.module.__file__, path]
            self.assertEqual(subprocess.check_output(args, text=True).strip(), 'False')
            lease.release()
            self.assertEqual(subprocess.check_output(args, text=True).strip(), 'True')


if __name__ == '__main__':
    unittest.main()
