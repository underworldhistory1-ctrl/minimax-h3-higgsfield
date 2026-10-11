import copy
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch

from deploy.launcher_smoke import APIError, ComfyAPI, run_smoke


ROOT = Path(__file__).resolve().parents[1]


class Server:
    def __init__(self):
        self.paths = []
        self.posts = 0
        self.mode = 'success'
        self.busy = False
        self.auth = False
        self.token = ''
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def send(self, data, code=200, cookie=False):
                self.send_response(code)
                if cookie:
                    self.send_header('Set-Cookie', 'auth=yes; Path=/proxy/')
                self.end_headers()
                self.wfile.write(data if isinstance(data, bytes) else json.dumps(data).encode())

            def do_GET(self):
                outer.paths.append(self.path)
                if self.path == '/proxy/?arg=test-token':
                    return self.send({}, cookie=True)
                if outer.auth and 'auth=yes' not in self.headers.get('Cookie', ''):
                    return self.send(b'login', 401)
                if self.path == '/proxy/queue':
                    if outer.mode == 'malformed':
                        return self.send({'queue_running': []})
                    return self.send({'queue_running': [[0, 'foreign']] if outer.busy else [], 'queue_pending': []})
                if self.path.startswith('/proxy/history/'):
                    if outer.mode == 'pending':
                        return self.send({})
                    if outer.mode == 'failed':
                        return self.send({'job-1': {'status': {'completed': False, 'status_str': 'error', 'messages': [['execution_error', {}]]}}})
                    return self.send({'job-1': {'status': {'completed': True, 'status_str': 'success'}, 'outputs': {'12': {'videos': [
                        {'filename': 'h3_launcher_smoke_' + outer.token + '_00001_.mp4', 'subfolder': 'video', 'type': 'output'}]}}}})
                if self.path.startswith('/proxy/view?'):
                    return self.send(b'fake video and audio')
                self.send({}, 404)

            def do_POST(self):
                outer.paths.append(self.path)
                body = self.rfile.read(int(self.headers.get('Content-Length', '0')))
                if self.path == '/proxy/simplepod-login':
                    return self.send({}, cookie=True)
                if self.path == '/proxy/prompt':
                    outer.posts += 1
                    graph = json.loads(body)['prompt']
                    outer.token = graph['12']['inputs']['filename_prefix'].split('_')[-1]
                    if outer.mode == 'uncertain':
                        return self.send({})
                    return self.send({'prompt_id': 'job-1'})
                self.send({}, 404)

        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.url = 'http://127.0.0.1:' + str(self.server.server_port) + '/proxy'

    def close(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()


class SmokeTests(unittest.TestCase):
    def setUp(self):
        self.server = Server()
        self.tmp = tempfile.TemporaryDirectory()
        self.state = {}
        self.saved = []
        self.env = patch.dict(os.environ, {'H3_ACCESS_TOKEN': '', 'H3_INSTANCE_PASSWORD': ''})
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.tmp.cleanup()
        self.server.close()

    def run_job(self, timeout=0):
        return run_smoke(ComfyAPI(self.server.url), ROOT, Path(self.tmp.name), self.state,
                         lambda state: self.saved.append(copy.deepcopy(state)), timeout)

    def test_strict_queue_and_busy(self):
        self.server.mode = 'malformed'
        with self.assertRaises(APIError):
            ComfyAPI(self.server.url).queue()
        self.server.mode = 'success'
        self.server.busy = True
        self.assertEqual(self.run_job()['status'], 'queue_timeout')
        self.assertEqual(self.server.posts, 0)

    def test_cookie_password_and_token_prefix(self):
        self.server.auth = True
        for variable in ('H3_ACCESS_TOKEN', 'H3_INSTANCE_PASSWORD'):
            with patch.dict(os.environ, {variable: 'test-token'}):
                api = ComfyAPI(self.server.url)
                self.assertEqual(api.queue()['queue_running'], [])
                self.assertEqual(api.url, self.server.url)
        self.assertIn('/proxy/?arg=test-token', self.server.paths)
        self.assertIn('/proxy/simplepod-login', self.server.paths)

    def test_refused_is_offline_other_errors_are_not(self):
        api = ComfyAPI(self.server.url)
        with patch.object(api, 'request', side_effect=ConnectionRefusedError):
            self.assertEqual(api.queue(), {'status': 'offline'})
            with self.assertRaises(APIError):
                api.wait_idle(0)
        with patch.object(api, 'request', side_effect=APIError('network')):
            with self.assertRaises(APIError):
                api.queue()

    def test_timeout_resume_never_duplicates(self):
        self.server.mode = 'pending'
        self.assertEqual(self.run_job()['status'], 'timeout')
        self.assertEqual(self.run_job()['status'], 'timeout')
        self.assertEqual(self.server.posts, 1)
        self.assertTrue(any(x['smoke'].get('prompt_id') == 'job-1' for x in self.saved))
        self.assertNotIn('/proxy/history', self.server.paths)

    def test_uncertain_submission_fails_closed(self):
        self.server.mode = 'uncertain'
        with self.assertRaises(APIError):
            self.run_job()
        self.assertEqual(self.run_job()['status'], 'submission_uncertain')
        self.assertEqual(self.server.posts, 1)

    def test_failed_job_not_repeated(self):
        self.server.mode = 'failed'
        self.assertEqual(self.run_job()['status'], 'failed')
        self.assertEqual(self.run_job()['status'], 'failed')
        self.assertEqual(self.server.posts, 1)

    def test_success_requires_validator_pass_and_exact_dimensions(self):
        with patch('deploy.launcher_smoke.subprocess.run') as validator:
            validator.return_value.returncode = 0
            result = self.run_job()
            self.assertEqual(result['status'], 'validated')
            self.assertTrue(Path(result['video']).is_file())
            args = validator.call_args.args[0]
            self.assertEqual(args[args.index('--width') + 1], '864')
            self.assertEqual(args[args.index('--height') + 1], '480')
            self.assertAlmostEqual(float(args[args.index('--duration') + 1]), 124 / 24)
            self.run_job()
            self.assertEqual(self.server.posts, 1)
        self.assertNotIn('integrated_multimodal_description', json.dumps(self.saved))

    def test_validation_failure_retains_id(self):
        with patch('deploy.launcher_smoke.subprocess.run') as validator:
            validator.return_value.returncode = 1
            with self.assertRaises(APIError):
                self.run_job()
            with self.assertRaises(APIError):
                self.run_job()
        self.assertEqual(self.server.posts, 1)
        self.assertEqual(self.state['smoke']['prompt_id'], 'job-1')

    def test_retained_clip_validates_without_history_after_server_restart(self):
        with patch('deploy.launcher_smoke.subprocess.run') as validator:
            validator.return_value.returncode = 0
            self.assertEqual(self.run_job()['status'], 'validated')
            api = ComfyAPI(self.server.url)
            with patch.object(api, 'request', side_effect=AssertionError('history must not be needed')):
                result = run_smoke(api, ROOT, Path(self.tmp.name), self.state, lambda state: None, 0)
            self.assertEqual(result['status'], 'validated')
            self.assertIs(result['validated'], True)

    def test_missing_retained_clip_falls_back_to_exact_history(self):
        with patch('deploy.launcher_smoke.subprocess.run') as validator:
            validator.return_value.returncode = 0
            result = self.run_job()
            Path(result['video']).unlink()
            self.server.paths.clear()
            self.assertEqual(self.run_job()['status'], 'validated')
        self.assertIn('/proxy/history/job-1', self.server.paths)
        self.assertEqual(self.server.posts, 1)

    def test_retained_validation_failure_preserves_downloaded_status(self):
        with patch('deploy.launcher_smoke.subprocess.run') as validator:
            validator.return_value.returncode = 1
            with self.assertRaises(APIError):
                self.run_job()
            self.server.paths.clear()
            with self.assertRaises(APIError):
                self.run_job()
        self.assertEqual(self.state['smoke']['status'], 'downloaded')
        self.assertEqual(self.server.paths, [])
        self.assertEqual(self.server.posts, 1)

    def test_retained_clip_outside_state_directory_is_rejected(self):
        with patch('deploy.launcher_smoke.subprocess.run') as validator:
            validator.return_value.returncode = 0
            self.run_job()
            self.state['smoke']['video'] = str(ROOT / ('smoke-' + self.state['smoke']['token'] + '.mp4'))
            with self.assertRaises(APIError):
                self.run_job()

    def test_history_error_preserves_job_for_later_resume(self):
        api = ComfyAPI(self.server.url)
        original = api.request

        def broken(path, payload=None):
            if path.startswith('/history/'):
                raise APIError('temporary history failure')
            return original(path, payload)

        with patch.object(api, 'request', side_effect=broken):
            with self.assertRaises(APIError):
                run_smoke(api, ROOT, Path(self.tmp.name), self.state, lambda state: None, 0)
        with patch('deploy.launcher_smoke.subprocess.run') as validator:
            validator.return_value.returncode = 0
            self.assertEqual(self.run_job()['status'], 'validated')
        self.assertEqual(self.server.posts, 1)

    def test_query_token_never_saved_and_original_graph_used(self):
        self.server.auth = True
        api = ComfyAPI(self.server.url + '/?arg=test-token')
        self.server.mode = 'pending'
        run_smoke(api, ROOT, Path(self.tmp.name), self.state, lambda state: None, 0)
        self.assertNotIn('test-token', json.dumps(self.state))
        self.assertEqual(self.state['smoke']['api_url'], self.server.url)

    def test_submitting_state_and_bad_persisted_token_fail_closed(self):
        self.state['smoke'] = {'status': 'submitting'}
        self.assertEqual(self.run_job()['status'], 'submission_uncertain')
        self.assertEqual(self.server.posts, 0)
        self.state['smoke'] = {'prompt_id': 'job-1', 'token': '../bad'}
        with self.assertRaises(APIError):
            self.run_job()
        self.assertEqual(self.server.posts, 0)

    def test_unsafe_outputs_and_redirects_rejected(self):
        api = ComfyAPI(self.server.url)
        for filename, folder in (('../a.mp4', ''), ('a.mp4', '../'), ('a.mp4', 'C:\\bad')):
            with self.assertRaises(APIError):
                api.download({'filename': filename, 'subfolder': folder, 'type': 'output'}, Path(self.tmp.name) / 'out.mp4')
        from deploy.launcher_smoke import _ScopedRedirect
        handler = _ScopedRedirect(self.server.url)
        for target in ('https://evil.example/file', self.server.url.rsplit('/proxy', 1)[0] + '/outside'):
            with self.assertRaises(APIError):
                handler.redirect_request(None, None, 302, '', {}, target)


if __name__ == '__main__':
    unittest.main()
