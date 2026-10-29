"""Official-source updates with an admission barrier and durable recovery state.

No filesystem paths, executable names or repository URLs are accepted from HTTP.
The launcher writes the local installation receipt after validating an install.
"""
import asyncio
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from aiohttp import web
from .runtime_fingerprint import runtime_fingerprint

OFFICIAL = 'https://github.com/underworldhistory1-ctrl/minimax-h3-higgsfield'
ORIGINS = {OFFICIAL, OFFICIAL + '.git', 'git@github.com:underworldhistory1-ctrl/minimax-h3-higgsfield.git'}
SHA = re.compile(r'^[0-9a-f]{40}$')


class UpdateService:
    def __init__(self, runtime, comfy_root, queue_count, active_operations=lambda: []):
        self.runtime = Path(runtime).resolve()
        self.root = Path(comfy_root).resolve()
        self.queue_count = queue_count
        self.active_operations = active_operations
        self.directory = self.root / '.h3-launcher'
        self.record = self.directory / 'ui-update.json'
        self.inflight = 0
        self.blocked = False
        self.task = None
        self.candidate = None
        self.loaded_fingerprint = runtime_fingerprint(self.runtime)
        self.current = self.load()
        if self.current.get('state') in ('running', 'recovery_required'):
            self.current['state'] = 'recovery_required'
            self.blocked = True
        elif self.current.get('state') == 'restart_required':
            # A new import is the requested restart. The launcher's runtime receipt
            # must identify the staged commit before mutations are admitted again.
            try:
                receipt = json.loads((self.directory / 'source.json').read_text(encoding='utf-8'))
                if receipt.get('installed_commit') == self.current.get('target'):
                    self.save({**self.current, 'state': 'completed'})
                else:
                    self.blocked = True
            except (OSError, ValueError):
                self.blocked = True

    def load(self):
        try:
            value = json.loads(self.record.read_text(encoding='utf-8'))
            if not isinstance(value, dict):
                raise ValueError()
            return value
        except FileNotFoundError:
            return {'state': 'idle'}
        except (OSError, ValueError):
            return {'state': 'recovery_required', 'message': 'Update state needs administrator recovery.'}

    def save(self, value):
        self.directory.mkdir(parents=True, exist_ok=True)
        temporary = self.record.with_suffix('.tmp')
        temporary.write_text(json.dumps({**value, 'updated_at': time.time()}), encoding='utf-8')
        os.replace(temporary, self.record)
        self.current = value

    def launcher_restart_pending(self):
        """CLI installs must close admission too, even without a UI receipt."""
        try:
            barrier = self.directory / 'maintenance.json'
            if barrier.exists():
                value = json.loads(barrier.read_text(encoding='utf-8'))
                return not isinstance(value, dict) or value.get('closed') is not False
            state = json.loads((self.directory / 'state.json').read_text(encoding='utf-8'))
            if not isinstance(state, dict):
                return True
            return bool(state.get('restart_pending', False))
        except FileNotFoundError:
            return False
        except (OSError, ValueError, TypeError):
            return True


    def reboot_ready(self):
        """Only restart after the installer has finished every runtime write."""
        try:
            marker = self.directory / 'maintenance.json'
            if marker.exists():
                value = json.loads(marker.read_text(encoding='utf-8'))
                if not isinstance(value, dict) or value.get('closed') not in (True, False):
                    return False
                if value.get('closed') is True:
                    return value.get('reboot_ready') is True
            return self.load().get('state') == 'restart_required'
        except (OSError, ValueError, TypeError):
            return False

    def status(self):
        if self.launcher_restart_pending():
            return {'state': 'restart_required',
                    'message': 'Launcher changes require a verified restart. Existing renders continue; new work is paused.'}
        if self.blocked:
            recovered = self.load()
            if recovered.get('state') == 'completed':
                # Only the full launcher records successful recovery after its
                # API/restart checks; refresh observes that administrator action.
                self.current = recovered
                self.blocked = False
        return {key: self.current[key] for key in ('state', 'target', 'message', 'updated_at') if key in self.current}

    def git(self, source, *args):
        return subprocess.check_output(['git', '-C', str(source), *args], text=True,
                                       stderr=subprocess.PIPE, timeout=45).strip()

    def source(self):
        try:
            receipt = json.loads((self.directory / 'source.json').read_text(encoding='utf-8'))
            source = Path(receipt['source_root']).resolve()
            if (Path(receipt['comfy_root']).resolve() != self.root or
                    Path(receipt['runtime_root']).resolve() != self.runtime or
                    not SHA.fullmatch(receipt['installed_commit']) or
                    not (source / 'deploy' / 'launcher.py').is_file()):
                raise ValueError()
        except (OSError, KeyError, TypeError, ValueError):
            raise RuntimeError('This installation has no verified update receipt. Run the official launcher from a clean main checkout first.') from None
        if (self.git(source, 'remote', 'get-url', 'origin') not in ORIGINS or
                self.git(source, 'branch', '--show-current') != 'main'):
            raise RuntimeError('Updates require the official repository on main. Custom installations are preserved.')
        if self.git(source, 'status', '--porcelain'):
            raise RuntimeError('Source has local changes. Preserve them before updating.')
        return source, receipt

    def check(self):
        self.candidate = None
        try:
            source, receipt = self.source()
        except RuntimeError:
            request = Request('https://api.github.com/repos/underworldhistory1-ctrl/minimax-h3-higgsfield/commits/main',
                              headers={'Accept': 'application/vnd.github+json', 'User-Agent': 'H3-Studio-Updater'})
            with urlopen(request, timeout=30) as response:
                target = json.load(response)['sha']
            if not SHA.fullmatch(target):
                raise RuntimeError('Invalid official revision')
            return {'state': 'manual', 'target': target, 'can_install': False,
                    'message': 'Latest official revision: ' + target[:12] + '. Automatic installation is unavailable for this custom or unverified installation. Use the official launcher from clean main.'}
        # Use a fixed URL, never an origin-provided fetch URL or Git configuration.
        target = self.git(source, 'ls-remote', OFFICIAL + '.git', 'refs/heads/main').split()[0]
        if not SHA.fullmatch(target):
            raise RuntimeError('The repository did not return a valid main revision.')
        head = self.git(source, 'rev-parse', 'HEAD')
        if head != receipt['installed_commit']:
            raise RuntimeError('Source and installed runtime differ. Rerun the launcher to reconcile them before updating.')
        disk_fingerprint = runtime_fingerprint(self.runtime)
        if (disk_fingerprint != self.loaded_fingerprint
                or disk_fingerprint != runtime_fingerprint(source)):
            return {'state': 'repair_required', 'current': head, 'target': target,
                    'can_install': False, 'scope': 'studio_code',
                    'message': 'The installed files or running worker do not match the official source. Preserve local edits, repair using the launcher, then restart when idle.'}
        self.candidate = target
        return {'state': 'available' if target != head else 'current', 'current': head, 'target': target,
                'scope': 'studio_code'}

    def reserve(self):
        if self.blocked or self.launcher_restart_pending():
            raise RuntimeError('An update is already active or requires recovery/restart.')
        # Called on the event loop without awaiting: no request can enter between
        # counting mutations and closing admission.
        if self.inflight or self.active_operations():
            raise RuntimeError('Wait for every Studio operation to finish before updating.')
        if self.queue_count():
            raise RuntimeError('Wait for the render queue to finish before updating.')
        self.blocked = True

    async def apply(self, target):
        if not isinstance(target, str) or not SHA.fullmatch(target) or target != self.candidate:
            raise RuntimeError('Check for updates again before applying this revision.')
        previous = dict(self.current)
        self.reserve()
        try:
            # Persist the reservation before yielding. A concurrent status request
            # must never mistake the previous completed receipt for recovery.
            self.save({'state': 'running', 'target': target})
            source, receipt = await asyncio.to_thread(self.source)
            if target == receipt['installed_commit']:
                raise RuntimeError('This revision is already installed.')
            self.task = asyncio.create_task(self.run(source, target))
        except Exception:
            self.save(previous)
            self.blocked = False
            raise
        return self.status()

    async def run(self, source, target):
        try:
            log = self.directory / 'ui-update.log'
            with log.open('ab') as stream:
                child = await asyncio.create_subprocess_exec(
                    sys.executable, str(source / 'deploy' / 'launcher.py'),
                    '--comfy-root', str(self.root), '--comfy-python', sys.executable,
                    '--ui-update', target, '--skip-smoke', '--no-start',
                    cwd=str(source), stdout=stream, stderr=stream)
                result = await child.wait()
            if result:
                raise RuntimeError('Update did not finish. The server remains paused; inspect .h3-launcher/ui-update.log and rerun the launcher for recovery.')
            self.save({'state': 'restart_required', 'target': target,
                       'message': 'Code installed. Restart ComfyUI, then reload Studio. No GPU validation was run.'})
        except Exception:
            self.save({'state': 'recovery_required', 'target': target,
                       'message': 'Update could not finish. Keep generation paused and ask the administrator to inspect the update log and rerun the launcher.'})


def register_update_routes(app, service):
    prefix = '/h3_studio/updates/'

    @web.middleware
    async def admission(request, handler):
        mutation = request.method not in ('GET', 'HEAD', 'OPTIONS')
        own = request.path.startswith(prefix)
        if mutation and own:
            origin = request.headers.get('Origin')
            if origin:
                parsed = urlsplit(origin)
                if parsed.netloc != request.host or parsed.scheme not in ('http', 'https'):
                    return web.json_response({'error': 'Updates must be requested from this server origin.'}, status=403)
            if request.headers.get('Sec-Fetch-Site') == 'cross-site':
                return web.json_response({'error': 'Cross-site update requests are forbidden.'}, status=403)
        if mutation:
            service.status()  # Observe trusted recovery without a browser polling first.
        if mutation and request.path == '/v2/manager/reboot':
            # Keep Manager's own authorization; maintenance only narrows admission.
            if service.inflight or service.active_operations() or service.queue_count():
                return web.json_response({'error': 'Wait for admitted work to drain before restart.'}, status=409)
            if (service.blocked or service.launcher_restart_pending()) and not service.reboot_ready():
                return web.json_response({'error': 'Runtime preparation has not finished.'}, status=503)
            return await handler(request)
        if mutation and not own:
            control = (request.path in ('/interrupt', '/queue') or
                       request.path.startswith('/h3_studio/lab/jobs/') and request.path.endswith('/cancel') or
                       request.path.startswith('/h3_studio/lab/control/cancel/'))
            if service.blocked or (not control and service.launcher_restart_pending()):
                return web.json_response({'error': 'Studio is paused for an update. Restart/recovery may be required.', 'code': 'update_in_progress'}, status=503)
            service.inflight += 1
            try:
                return await handler(request)
            finally:
                service.inflight -= 1
        return await handler(request)

    async def maintenance(request):
        return web.json_response({'admission_closed': service.blocked or service.launcher_restart_pending(),
                                  'inflight': service.inflight,
                                  'active_operations': len(service.active_operations()) + int(service.task is not None and not service.task.done()),
                                  'queue_count': service.queue_count()})

    async def status(request):
        return web.json_response(service.status())

    async def check(request):
        try:
            return web.json_response(await asyncio.to_thread(service.check))
        except (RuntimeError, subprocess.SubprocessError, OSError, IndexError, KeyError, ValueError):
            # Git stderr can contain local paths or transport credentials.
            return web.json_response({'state': 'unavailable', 'message': 'Update check unavailable. Use the official launcher from a clean main checkout; verify network access and the installation receipt.'}, status=409)

    async def apply(request):
        try:
            body = await request.json()
            if not isinstance(body, dict) or set(body) != {'commit'}:
                raise RuntimeError('Supply only the checked commit revision.')
            return web.json_response(await service.apply(body['commit']), status=202)
        except (RuntimeError, ValueError, subprocess.SubprocessError, OSError):
            return web.json_response({'error': 'Update cannot start. Check for updates again and wait for all rendering and Studio operations to finish. Custom or changed installations require the launcher.'}, status=409)

    app.middlewares.insert(0, admission)
    app.router.add_get(prefix + 'maintenance', maintenance)
    app.router.add_get(prefix + 'status', status)
    app.router.add_get(prefix + 'check', check)
    app.router.add_post(prefix + 'apply', apply)
