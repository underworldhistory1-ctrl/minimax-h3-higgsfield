"""Reconcile a verified launcher-owned Linux supervisor, only after request drain."""
import hashlib
import json
import os
from pathlib import Path
import select
import signal
import time


def interpreter_identity(path):
    # Preserve the venv entry point; resolving its symlink loses environment identity.
    value = os.path.normcase(os.path.abspath(str(path)))
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


def process_start(pid, proc=Path('/proc')):
    return (proc / str(pid) / 'stat').read_text().rsplit(')', 1)[1].split()[19]


def verified_supervisor(root, project, proc=Path('/proc')):
    root, project = Path(root).resolve(), Path(project).resolve()
    try:
        receipt = json.loads((root / '.h3-launcher-process.json').read_text(encoding='utf-8'))
        pid = receipt['pid']
        if type(pid) is not int or pid < 2 or Path(receipt['root']).resolve() != root:
            return None
        argv = (proc / str(pid) / 'cmdline').read_bytes().decode('utf-8').rstrip('\0').split('\0')
        scripts = {project / 'deploy/openbayes_h3_supervisor.py',
                   root / 'custom_nodes/h3_studio/deploy/openbayes_h3_supervisor.py',
                   root / 'custom_nodes/h3_studio_v2/deploy/openbayes_h3_supervisor.py'}
        if (len(argv) < 4 or Path(argv[1]).resolve() not in scripts
                or Path(argv[argv.index('--comfy-root') + 1]).resolve() != root
                or interpreter_identity(argv[0]) != interpreter_identity(receipt['python'])
                or argv != receipt.get('command')):
            return None
        started = process_start(pid, proc)
        if receipt.get('process_start') is not None and receipt['process_start'] != started:
            return None
        return pid, started
    except (OSError, ValueError, KeyError, IndexError, TypeError):
        return None


def root_identity(root):
    value = os.path.normcase(str(Path(root).resolve()))
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


def require_api_root(root, api):
    ready = api.request('/h3_studio/readiness')
    if not isinstance(ready, dict) or ready.get('runtime_root_id') != root_identity(root):
        raise RuntimeError('The endpoint cannot prove it belongs to this ComfyUI root. Stop older workers when idle, or correct --url/--comfy-root; no process was stopped.')
    return ready


def stop_owned_supervisor(root, project, api, timeout):
    """False means unowned/unsupported; it never authorizes stopping another process."""
    root = Path(root)
    identity = verified_supervisor(root, project)
    if identity is None or not hasattr(os, 'pidfd_open') or not hasattr(signal, 'pidfd_send_signal'):
        return False
    if __package__:
        from .launcher_smoke import ComfyAPI
    else:
        from launcher_smoke import ComfyAPI
    receipt = json.loads((root / '.h3-launcher-process.json').read_text(encoding='utf-8'))
    command = receipt['command']
    port = int(command[command.index('--port') + 1])
    if not 1 <= port <= 65535:
        raise RuntimeError('Invalid owned worker port; no process was stopped')
    local_api = ComfyAPI('http://127.0.0.1:' + str(port), provider_auth=False)
    checked_instance = require_api_root(root, api).get('runtime_instance')
    if not checked_instance:
        raise RuntimeError('The checked worker has no runtime identity; no process was stopped')
    if require_api_root(root, local_api).get('runtime_instance') != checked_instance:
        raise RuntimeError('Configured API does not match the owned local worker; no process was stopped')
    barrier = json.loads((root / '.h3-launcher/maintenance.json').read_text(encoding='utf-8'))
    if barrier.get('closed') is not True or barrier.get('reboot_ready') is not True:
        raise RuntimeError('Owned restart requires the completed installation admission barrier')
    drain = api.request('/h3_studio/updates/maintenance')
    if (not isinstance(drain, dict) or drain.get('admission_closed') is not True or
            any(type(drain.get(k)) is not int or drain[k] != 0
                for k in ('inflight', 'active_operations', 'queue_count'))):
        raise RuntimeError('Requests are still active; the supervisor was not stopped')
    if not api.wait_idle(timeout):
        raise RuntimeError('Queue is busy; the supervisor was not stopped')
    pid, started = identity
    descriptor = os.pidfd_open(pid)
    try:
        # Revalidate after acquiring the PID-reuse-safe handle.
        if verified_supervisor(root, project) != (pid, started):
            raise RuntimeError('Supervisor ownership changed; no process was stopped')
        if (require_api_root(root, api).get('runtime_instance') != checked_instance
                or require_api_root(root, local_api).get('runtime_instance') != checked_instance):
            raise RuntimeError('Worker instance changed during drain; no process was stopped')
        signal.pidfd_send_signal(descriptor, signal.SIGTERM)
        if not select.select([descriptor], [], [], min(timeout, 30))[0]:
            raise RuntimeError('Owned supervisor did not exit; no replacement was started')
    finally:
        os.close(descriptor)
    deadline = time.monotonic() + min(timeout, 30)
    while time.monotonic() < deadline:
        if local_api.queue().get('status') == 'offline':
            return True
        time.sleep(0.25)
    raise RuntimeError('The old worker port remains occupied; no replacement was started')
