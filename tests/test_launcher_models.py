import hashlib
import http.server
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch

from deploy import launcher_models as models


class ModelTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.comfy = self.root / 'comfy'
        self.comfy.mkdir()
        self.state = self.root / 'state'
        self.data = b'test-weight' * 1000
        self.requests = []
        owner = self
        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                owner.requests.append(self.headers.get('Range'))
                if self.path == '/auth':
                    self.send_error(401)
                    return
                data = owner.data
                start = int(self.headers.get('Range', 'bytes=0-')[6:-1])
                if self.path == '/ignore':
                    start = 0
                if self.path == '/bad':
                    data = b'x' * len(data)
                self.send_response(206 if start else 200)
                if start:
                    self.send_header('Content-Range', f'bytes {start}-{len(data)-1}/{len(data)}')
                self.send_header('Content-Length', str(len(data)-start))
                self.end_headers()
                if self.path == '/truncate' and len(owner.requests) == 1:
                    self.wfile.write(data[start:start+100])
                    self.close_connection = True
                else:
                    self.wfile.write(data[start:])
            def log_message(self, *args):
                pass
        self.server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.tmp.cleanup()

    def artifact(self, endpoint='/ok'):
        return models.Artifact('models/vae/test.bin', f'http://127.0.0.1:{self.server.server_port}{endpoint}', len(self.data), hashlib.sha256(self.data).hexdigest())

    def test_resume_and_ignored_range(self):
        for endpoint in ('/ok', '/ignore'):
            target = self.comfy / 'models/vae/test.bin'
            target.parent.mkdir(parents=True, exist_ok=True)
            target.with_name(target.name+'.part').write_bytes(self.data[:50])
            report = models.prepare_models(self.comfy, [], [self.artifact(endpoint)], self.state, emit=lambda _: None)
            self.assertEqual(target.read_bytes(), self.data)
            self.assertEqual(len(report['downloaded']), 1)
            target.unlink()
        self.assertIn('bytes=50-', self.requests)

    def test_truncated_transport_resumes(self):
        models.prepare_models(self.comfy, [], [self.artifact('/truncate')], self.state, emit=lambda _: None)
        self.assertEqual(len(self.requests), 2)
        self.assertEqual(self.requests[1], 'bytes=100-')

    def test_bad_digest_quarantines_without_retry(self):
        with self.assertRaises(ValueError):
            models.prepare_models(self.comfy, [], [self.artifact('/bad')], self.state, emit=lambda _: None)
        self.assertEqual(len(self.requests), 1)
        self.assertTrue(list((self.comfy/'models/vae').glob('*.quarantine-*')))

    def test_invalid_target_preserved_and_cache_reused(self):
        target = self.comfy / 'models/vae/test.bin'
        target.parent.mkdir(parents=True)
        target.write_bytes(b'invalid')
        source = self.root / 'attached/test.bin'
        source.parent.mkdir()
        source.write_bytes(self.data)
        result = models.prepare_models(self.comfy, [source.parent], [self.artifact()], self.state, emit=lambda _: None)
        self.assertEqual(len(result['linked']), 1)
        self.assertEqual(source.read_bytes(), self.data)
        self.assertTrue(list(target.parent.glob('*.quarantine-*')))
        self.assertFalse(self.requests)
        json.dumps(result)

    def test_space_preflight_before_mutation(self):
        with patch.object(models.shutil, 'disk_usage', return_value=type('Usage', (), {'free': 0})()):
            with self.assertRaises(RuntimeError):
                models.prepare_models(self.comfy, [], [self.artifact()], self.state)
        self.assertFalse(self.state.exists())
        self.assertFalse((self.comfy/'models').exists())

    def test_partial_does_not_reduce_ignored_range_space_requirement(self):
        target = self.comfy/'models/vae/test.bin'
        target.parent.mkdir(parents=True)
        target.with_name(target.name+'.part').write_bytes(self.data[:500])
        plan = models.plan_models(self.comfy, [], [self.artifact()], self.state)
        self.assertEqual(plan['missing_bytes'], len(self.data))

    def test_manifest_pinned_and_cpu_paths(self):
        catalog = models.manifest()
        self.assertTrue(all(a.sha256 and len(a.sha256) == 64 for a in catalog))
        self.assertTrue(any('ckpts/yzd-v/DWPose/yolox_l.onnx' in a.relative_path for a in catalog))
        self.assertFalse(any('turbo' in a.relative_path for a in catalog))

    def test_auth_errors_are_not_retried(self):
        with self.assertRaisesRegex(RuntimeError, 'HTTP 401'):
            models.prepare_models(self.comfy, [], [self.artifact('/auth')], self.state, emit=lambda _: None)
        self.assertEqual(len(self.requests), 1)

    def test_discovery_bounded_and_prunes_outputs(self):
        attached = self.root/'attached'
        for directory in ('output', 'a/b/c/d/e'):
            source = attached/directory/'test.bin'
            source.parent.mkdir(parents=True)
            source.write_bytes(self.data)
        plan = models.plan_models(self.comfy, [attached], [self.artifact()], self.state)
        self.assertEqual(plan['items'][0]['action'], 'download')
        self.assertFalse(self.state.exists())

    def test_external_partial_symlink_never_written(self):
        target = self.comfy/'models/vae/test.bin'
        target.parent.mkdir(parents=True)
        external = self.root/'external'
        external.write_bytes(b'untouched')
        try:
            target.with_name(target.name+'.part').symlink_to(external)
        except OSError:
            self.skipTest('Symlinks unavailable')
        models.prepare_models(self.comfy, [], [self.artifact()], self.state, emit=lambda _: None)
        self.assertEqual(external.read_bytes(), b'untouched')

    def test_sha_receipt_rechecks_file_change(self):
        target = self.comfy/'models/vae/test.bin'
        models.prepare_models(self.comfy, [], [self.artifact()], self.state, emit=lambda _: None)
        target.write_bytes(b'x'*len(self.data))
        plan = models.plan_models(self.comfy, [], [self.artifact()], self.state)
        self.assertEqual(plan['items'][0]['action'], 'download')

    def test_prepare_hashes_reused_file_once(self):
        artifact = self.artifact()
        target = self.comfy/artifact.relative_path
        target.parent.mkdir(parents=True)
        target.write_bytes(self.data)
        with patch.object(models.hashlib, 'sha256', wraps=hashlib.sha256) as hasher:
            models.prepare_models(self.comfy, [], [artifact], self.state, emit=lambda _: None)
        self.assertEqual(hasher.call_count, 1)

    def test_prepare_hashes_linked_source_once(self):
        artifact = self.artifact()
        source = self.root/'attached/test.bin'
        source.parent.mkdir()
        source.write_bytes(self.data)
        with patch.object(models.hashlib, 'sha256', wraps=hashlib.sha256) as hasher:
            models.prepare_models(self.comfy, [source.parent], [artifact], self.state, emit=lambda _: None)
        self.assertEqual(hasher.call_count, 1)

    def test_prepare_hashes_completed_download_once(self):
        artifact = self.artifact()
        with patch.object(models.hashlib, 'sha256', wraps=hashlib.sha256) as hasher:
            models.prepare_models(self.comfy, [], [artifact], self.state, emit=lambda _: None)
        self.assertEqual(hasher.call_count, 1)

    def test_download_progress_reports_bytes_without_url(self):
        artifact = self.artifact()
        messages = []
        with patch.object(models.time, 'monotonic', side_effect=[0, 11, 12]):
            models.prepare_models(self.comfy, [], [artifact], self.state, emit=messages.append)
        self.assertTrue(any(f'{artifact.size}/{artifact.size} bytes' in msg for msg in messages))
        self.assertFalse(any('http://' in msg for msg in messages))

    def test_hardlink_fallback_hashes_source_once(self):
        artifact = self.artifact()
        source = self.root/'attached/test.bin'
        source.parent.mkdir()
        source.write_bytes(self.data)
        with patch.object(Path, 'symlink_to', side_effect=OSError('unavailable')), patch.object(models.hashlib, 'sha256', wraps=hashlib.sha256) as hasher:
            models.prepare_models(self.comfy, [source.parent], [artifact], self.state, emit=lambda _: None)
        self.assertEqual(hasher.call_count, 1)
        self.assertEqual(source.read_bytes(), self.data)

    def test_copy_fallback_verifies_copied_content(self):
        artifact = self.artifact()
        source = self.root/'attached/test.bin'
        source.parent.mkdir()
        source.write_bytes(self.data)
        with patch.object(Path, 'symlink_to', side_effect=OSError('unavailable')), patch.object(models.os, 'link', side_effect=OSError('different volume')), patch.object(models.hashlib, 'sha256', wraps=hashlib.sha256) as hasher:
            models.prepare_models(self.comfy, [source.parent], [artifact], self.state, emit=lambda _: None)
        self.assertEqual(hasher.call_count, 2)
        self.assertEqual(source.read_bytes(), self.data)

if __name__ == '__main__':
    unittest.main()
