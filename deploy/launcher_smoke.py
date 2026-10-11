"""Authenticated, resumable one-job H3 validation using only the standard library."""

import errno
import http.cookiejar
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid


class APIError(RuntimeError):
    """A bounded, credential-free API diagnostic."""


class _ScopedRedirect(urllib.request.HTTPRedirectHandler):
    def __init__(self, base):
        self.base = urllib.parse.urlsplit(base)

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        target = urllib.parse.urlsplit(newurl)
        prefix = self.base.path.rstrip('/')
        if (target.scheme, target.netloc) != (self.base.scheme, self.base.netloc) or not (
            target.path == prefix or target.path.startswith(prefix + '/')
        ):
            raise APIError('Server redirected outside the configured proxy scope')
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class ComfyAPI:
    def __init__(self, url):
        parsed = urllib.parse.urlsplit(url)
        if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password:
            raise APIError('Use an HTTP(S) server URL without embedded credentials')
        if any(part in ('.', '..') for part in parsed.path.split('/')) or '\\' in parsed.path:
            raise APIError('Invalid proxy path')
        self.url = urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path.rstrip('/'), '', ''))
        self._token = os.environ.get('H3_ACCESS_TOKEN') or urllib.parse.parse_qs(parsed.query).get('arg', [''])[0]
        self._password = os.environ.get('H3_INSTANCE_PASSWORD', '')
        self._authenticated = False
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()), _ScopedRedirect(self.url))

    def _open(self, path, data=None, headers=None):
        route = urllib.parse.urlsplit(path)
        if not path.startswith('/') or path.startswith('//') or route.scheme or route.netloc or '\\' in route.path or any(
            part in ('.', '..') for part in urllib.parse.unquote(route.path).split('/')
        ):
            raise APIError('Invalid API route')
        try:
            return self.opener.open(urllib.request.Request(self.url + path, data=data, headers=headers or {}), timeout=30)
        except urllib.error.HTTPError as exc:
            raise APIError('Server returned HTTP ' + str(exc.code)) from None
        except urllib.error.URLError as exc:
            if isinstance(exc.reason, ConnectionRefusedError) or getattr(exc.reason, 'errno', None) == errno.ECONNREFUSED:
                raise ConnectionRefusedError('ComfyUI connection refused') from None
            raise APIError('Cannot contact ComfyUI; check URL and provider authentication') from None
        except (OSError, ValueError):
            raise APIError('ComfyUI connection failed') from None

    def _authenticate(self):
        if self._authenticated:
            return
        if self._token:
            with self._open('/?' + urllib.parse.urlencode({'arg': self._token})):
                pass
        if self._password:
            body = urllib.parse.urlencode({'instanceId': self._password}).encode()
            with self._open('/simplepod-login', body, {'Content-Type': 'application/x-www-form-urlencoded'}):
                pass
        self._authenticated = True

    def request(self, path, payload=None):
        self._authenticate()
        data = None if payload is None else json.dumps(payload).encode()
        with self._open(path, data, {'Content-Type': 'application/json'}) as response:
            raw = response.read(8 * 1024 * 1024 + 1)
        if len(raw) > 8 * 1024 * 1024:
            raise APIError('API response exceeded its size limit')
        try:
            return json.loads(raw)
        except (ValueError, UnicodeError):
            raise APIError('Server returned invalid JSON; check provider login') from None

    def queue(self):
        try:
            result = self.request('/queue')
        except ConnectionRefusedError:
            return {'status': 'offline'}
        if not isinstance(result, dict) or any(not isinstance(result.get(k), list) for k in ('queue_running', 'queue_pending')):
            raise APIError('Invalid queue response; refusing to assume the server is idle')
        return result

    def wait_idle(self, timeout):
        deadline = time.monotonic() + max(0, timeout)
        while True:
            queue = self.queue()
            if queue.get('status') == 'offline':
                raise APIError('ComfyUI is offline; start it before rendering')
            if not queue['queue_running'] and not queue['queue_pending']:
                return True
            if time.monotonic() >= deadline:
                return False
            time.sleep(min(2, max(0, deadline - time.monotonic())))

    def download(self, output, destination):
        filename, subfolder = output.get('filename'), output.get('subfolder', '')
        if not isinstance(filename, str) or not isinstance(subfolder, str) or output.get('type') != 'output':
            raise APIError('Invalid saved video descriptor')
        if not re.fullmatch(r'[A-Za-z0-9_.-]+\.mp4', filename) or filename in ('.', '..'):
            raise APIError('Unsafe saved video filename')
        folder = PurePosixPath(subfolder)
        if folder.is_absolute() or '\\' in subfolder or ':' in subfolder or '..' in folder.parts:
            raise APIError('Unsafe saved video subfolder')
        self._authenticate()
        temporary = destination.with_suffix('.mp4.part')
        try:
            with self._open('/view?' + urllib.parse.urlencode({'filename': filename, 'subfolder': subfolder, 'type': 'output'})) as response:
                limit = 512 * 1024 * 1024
                size = 0
                with temporary.open('wb') as stream:
                    while True:
                        chunk = response.read(1024 * 1024)
                        if not chunk:
                            break
                        size += len(chunk)
                        if size > limit:
                            raise APIError('Smoke clip exceeded 512 MiB download limit')
                        stream.write(chunk)
                if size == 0:
                    raise APIError('Smoke clip download was empty')
            temporary.replace(destination)
        finally:
            temporary.unlink(missing_ok=True)


def _validate(project_root, video, expected):
    try:
        result = subprocess.run(
            [sys.executable, str(project_root / 'scripts' / 'verify_h3_video.py'), str(video),
             '--width', str(expected['width']), '--height', str(expected['height']),
             '--duration', str(expected['duration'])], capture_output=True, text=True,
            check=False, timeout=180)
    except (OSError, subprocess.TimeoutExpired):
        raise APIError('Video/audio validator could not finish; install ffmpeg and retry this job') from None
    if result.returncode:
        raise APIError('Smoke video/audio validation failed; inspect the downloaded clip and ffmpeg installation')


def run_smoke(api, project_root: Path, state_dir: Path, state: dict, save_state, timeout=3600):
    """Persist one prompt ID and follow only its history, including across retries.

    Mutates state['smoke']; save_state(state) must durably save before returning.
    The coordinator owns config/revision isolation and resets smoke on config changes.
    """
    smoke = state.setdefault('smoke', {})
    if not isinstance(smoke, dict):
        raise APIError('Invalid persisted smoke state')
    deadline = time.monotonic() + max(0, timeout)

    def persist(status):
        smoke['status'] = status
        save_state(state)
        result = {key: smoke.get(key) for key in ('status', 'video', 'prompt_id')}
        result['validated'] = status == 'validated'
        return result

    if smoke.get('api_url') and smoke['api_url'] != api.url:
        raise APIError('Smoke job belongs to a different server; select its original configuration')
    if not smoke.get('prompt_id'):
        if smoke.get('status') in ('submitting', 'submission_uncertain'):
            return persist('submission_uncertain')
        if not api.wait_idle(max(0, deadline - time.monotonic())):
            return persist('queue_timeout')
        graph = json.loads((project_root / 'workflows' / 'h3_t2v_smoke_api.json').read_text(encoding='utf-8'))
        token = uuid.uuid4().hex
        graph['12']['inputs']['filename_prefix'] = 'video/h3_launcher_smoke_' + token
        inputs = graph['6']['inputs']
        smoke.update(api_url=api.url, token=token, expected={'width': inputs['width'], 'height': inputs['height'],
                     'duration': inputs['length'] / graph['11']['inputs']['fps']})
        persist('submitting')  # A crash after this point must never automatically resubmit.
        try:
            submitted = api.request('/prompt', {'prompt': graph, 'client_id': 'h3-launcher-' + token})
            prompt_id = submitted.get('prompt_id') if isinstance(submitted, dict) else None
            if not isinstance(prompt_id, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', prompt_id):
                raise APIError('Submission did not return a usable prompt ID')
        except Exception:
            persist('submission_uncertain')
            raise APIError('Smoke submission outcome is uncertain; inspect the server queue before manual recovery') from None
        smoke['prompt_id'] = prompt_id
        persist('running')
    prompt_id = smoke['prompt_id']
    if not isinstance(prompt_id, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', prompt_id):
        raise APIError('Invalid persisted smoke prompt ID')
    if not isinstance(smoke.get('token'), str) or not re.fullmatch(r'[a-f0-9]{32}', smoke['token']):
        raise APIError('Invalid persisted smoke output token')
    expected = smoke.get('expected')
    if not isinstance(expected, dict) or any(
        not isinstance(expected.get(key), (int, float)) or not 0 < expected[key] <= limit
        for key, limit in (('width', 4096), ('height', 4096), ('duration', 60))
    ):
        raise APIError('Invalid persisted smoke dimensions')
    # History can be evicted on a server restart. A downloaded clip remains
    # sufficient evidence when it passes the full video/audio validator again.
    if smoke.get('video') is not None:
        saved_path = smoke['video']
        if not isinstance(saved_path, str):
            raise APIError('Invalid persisted smoke video path')
        video = Path(saved_path)
        destination = state_dir.resolve() / ('smoke-' + smoke['token'] + '.mp4')
        if not video.is_absolute() or video.name != destination.name or video.resolve() != destination or video.is_symlink():
            raise APIError('Persisted smoke video is outside its expected state-directory path')
        if video.is_file():
            persist('downloaded')
            _validate(project_root, video, expected)
            return persist('validated')
    if smoke.get('status') == 'failed':
        return persist('failed')
    persist('running')
    while True:
        history = api.request('/history/' + prompt_id)
        if not isinstance(history, dict):
            raise APIError('Invalid smoke history response')
        job = history.get(prompt_id)
        if job is not None:
            if not isinstance(job, dict) or not isinstance(job.get('status'), dict):
                raise APIError('Invalid smoke job status')
            status = job['status']
            messages = status.get('messages', [])
            if not isinstance(messages, list):
                raise APIError('Invalid smoke execution messages')
            if status.get('status_str') == 'error' or any(
                isinstance(message, (list, tuple)) and message and message[0] in ('execution_error', 'execution_interrupted')
                for message in messages
            ):
                return persist('failed')
            if status.get('completed') is True and status.get('status_str') == 'success':
                all_outputs = job.get('outputs')
                if not isinstance(all_outputs, dict) or not isinstance(all_outputs.get('12'), dict):
                    raise APIError('Invalid smoke saved outputs')
                outputs = all_outputs['12']
                if any(not isinstance(outputs.get(key, []), list) for key in ('videos', 'gifs', 'images')):
                    raise APIError('Invalid smoke saved video list')
                candidates = [item for key in ('videos', 'gifs', 'images') for item in outputs.get(key, [])
                              if isinstance(item, dict) and isinstance(item.get('filename'), str)
                              and item['filename'].startswith('h3_launcher_smoke_' + smoke['token'] + '_')
                              and item['filename'].endswith('.mp4') and item.get('type') == 'output']
                if len(candidates) != 1:
                    raise APIError('Completed smoke job did not return exactly one matching saved MP4')
                state_dir.mkdir(parents=True, exist_ok=True)
                video = state_dir / ('smoke-' + smoke['token'] + '.mp4')
                api.download(candidates[0], video)
                smoke['video'] = str(video.resolve())
                persist('downloaded')
                _validate(project_root, video, smoke['expected'])
                return persist('validated')
        if time.monotonic() >= deadline:
            return persist('timeout')
        time.sleep(min(2, max(0, deadline - time.monotonic())))
