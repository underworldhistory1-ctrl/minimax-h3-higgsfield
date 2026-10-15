"""Keep a local ComfyUI worker alive and recover H3 decode after a worker crash.

Run from a separate process on the same OpenBayes container. A completed H3
sampler checkpoint is decoded once in a clean worker if the original worker
dies before saving its MP4. The checkpoint remains if recovery also fails.
"""

import argparse
try:
    import fcntl
except ImportError:
    fcntl = None
import json
import os
import pathlib
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request


STOP = False


def stop(_signum, _frame):
    global STOP
    STOP = True


def api(base, path, payload=None):
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(base + path, data=data,
                                     headers={"Content-Type": "application/json"} if data else {})
    with urllib.request.urlopen(request, timeout=8) as response:
        return json.load(response)


def wait_ready(base, child, timeout=180):
    until = time.monotonic() + timeout
    while not STOP and time.monotonic() < until and child.poll() is None:
        try:
            api(base, "/queue")
            return True
        except (OSError, ValueError):
            time.sleep(2)
    return False


def save_recovery(path, record):
    part = path.with_suffix('.json.part')
    with part.open('w', encoding='utf-8') as stream:
        json.dump(record, stream)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(part, path)


def recover(comfy, base):
    latent_dir = comfy / "output" / "latent"
    if not latent_dir.exists():
        return
    for checkpoint in sorted(latent_dir.glob("h3_studio_*.safetensors")):
        if STOP:
            return
        token = checkpoint.stem.removeprefix("h3_studio_")
        if len(token) != 12 or any(char not in "0123456789abcdef" for char in token):
            continue
        # File existence is not completion: a dead encoder can leave a partial MP4.
        # Only H3SaveVideo removes a checkpoint after its successful save.
        marker = checkpoint.with_suffix(".recovery-attempted")
        if marker.exists():
            continue
        record_path = checkpoint.with_suffix('.recovery.json')
        try:
            if record_path.exists():
                previous = json.loads(record_path.read_text(encoding='utf-8'))
                if previous.get('state') == 'accepted':
                    continue
            maintenance = api(base, '/h3_studio/updates/maintenance')
            if maintenance.get('admission_closed') is not False:
                return
            queue = api(base, '/queue')
            if queue.get('queue_running') or queue.get('queue_pending'):
                return
            jobs = json.loads((comfy/'output/lab_storage/jobs_manifest.json').read_text(encoding='utf-8'))
            matches = [job for job in jobs.values() if job.get('request_id') == token]
            if len(matches) != 1:
                continue
            job = matches[0]
            if job.get('state') in ('completed', 'cancelled', 'cancel_requested') or job.get('recovery_cancel_requested') or job.get('recovery_of'):
                continue
            record = {'state': 'uncertain', 'token': token, 'job_id': job['job_id'],
                      'created_at': time.time()}
            if STOP:
                return
            save_recovery(record_path, record)  # Covers a crash/lost reply after acceptance.
            try:
                result = api(base, '/h3_studio/lab/jobs/'+job['job_id']+'/recover', {})
            except urllib.error.HTTPError as error:
                if error.code in (400, 401, 403, 404, 405, 422, 429):
                    record.update(state='rejected', http_status=error.code)
                    save_recovery(record_path, record)
                raise
            child = result.get('job', {})
            if child.get('job_id'):
                record.update(state='accepted', recovery_job_id=child['job_id'],
                              prompt_id=child.get('prompt_id'))
                save_recovery(record_path, record)
                print(f"Tracked recovery for {token}: {child['job_id']}", flush=True)
                return  # One recovery at a time, with a fresh queue check next time.
            if result.get('error') or result.get('node_errors'):
                record['state'] = 'rejected'
                save_recovery(record_path, record)
            raise RuntimeError('Recovery prompt was not acknowledged; checkpoint retained')
        except (OSError, ValueError, KeyError, TypeError, AttributeError, RuntimeError) as error:
            print(f"Recovery could not be queued for {token}: {error}", file=sys.stderr, flush=True)


def worker_command(python, args):
    return [str(python), 'main.py', '--listen', args.bind, '--port', str(args.port),
            '--reserve-vram', str(args.reserve_vram), '--cache-ram', '--fp16-intermediates',
            '--use-ck-attention' if getattr(args, 'attention_backend', 'pytorch') == 'ck-int8'
            else '--use-pytorch-cross-attention']


def worker_python(comfy, override=None):
    python = pathlib.Path(override).expanduser().absolute() if override else comfy/'.venv/bin/python'
    if not python.is_file():
        raise ValueError('ComfyUI Python environment was not found')
    return python


def recovery_ready(base, child, ready):
    return ready or wait_ready(base, child, timeout=1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--comfy-root", type=pathlib.Path, required=True)
    parser.add_argument("--port", type=int, default=8188)
    parser.add_argument('--bind', default='127.0.0.1')
    parser.add_argument('--reserve-vram', type=float, default=3.0)
    parser.add_argument('--comfy-python')
    parser.add_argument('--attention-backend', choices=('pytorch', 'ck-int8'), default='pytorch')
    args = parser.parse_args()
    if fcntl is None:
        parser.error('The worker supervisor requires Linux/POSIX file locking')
    comfy = args.comfy_root.resolve()
    if not (comfy / "main.py").is_file():
        parser.error("ComfyUI main.py was not found")
    try:
        python = worker_python(comfy, args.comfy_python)
    except ValueError as error:
        parser.error(str(error))
    lock_path = comfy / ".h3-supervisor.lock"
    with lock_path.open("w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            parser.error("An H3 supervisor already owns this ComfyUI checkout")
        signal.signal(signal.SIGTERM, stop)
        signal.signal(signal.SIGINT, stop)
        base = f"http://127.0.0.1:{args.port}"
        log_path = comfy / "h3-higgsfield-server.log"
        while not STOP:
            with log_path.open("a", encoding="utf-8") as log:
                child = subprocess.Popen(worker_command(python, args), cwd=comfy,
                                         stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT)
                print(f"ComfyUI started: PID {child.pid}", flush=True)
                ready = wait_ready(base, child)
                next_recovery = 0
                while not STOP and child.poll() is None:
                    if time.monotonic() >= next_recovery:
                        ready = recovery_ready(base, child, ready)
                        if ready:
                            recover(comfy, base)
                        next_recovery = time.monotonic() + 10
                    time.sleep(2)
                if STOP:
                    child.terminate()
                    try:
                        child.wait(timeout=20)
                    except subprocess.TimeoutExpired:
                        child.kill()
                    break
                print(f"ComfyUI exited with code {child.returncode}; restarting", flush=True)
            time.sleep(5)


if __name__ == "__main__":
    main()
