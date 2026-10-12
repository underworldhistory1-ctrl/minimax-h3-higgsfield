"""Read-only H3 stage observer. Never submits or interrupts GPU work."""
import hashlib
import json
import os
from pathlib import Path
import statistics
import time
import urllib.request

BASE = os.environ.get('H3_TIMING_URL', 'http://127.0.0.1:8190')
ROOT = Path(os.environ.get('H3_TIMING_ROOT', '/output/h3-studio-v2/run'))
PUBLIC = Path(os.environ.get('H3_TIMING_PUBLIC', '/output/h3-studio-v2/ComfyUI/custom_nodes/h3_studio_v2/web/h3/shared-timing.json'))

def get(path):
    with urllib.request.urlopen(BASE + path, timeout=3) as response:
        return json.load(response)

def atomic(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, separators=(',', ':')))
    temporary.replace(path)

def profile(graph):
    # Ignore creative text and seeds; retain computational dimensions, models,
    # sampler settings and reference topology. No prompt text enters public data.
    keep = {}
    ignored = {'text', 'prompt', 'negative_prompt', 'seed', 'noise_seed'}
    for identifier, node in graph.items():
        inputs = node.get('inputs', {})
        keep[identifier] = [node.get('class_type'), {k: v for k, v in inputs.items()
                            if k not in ignored}]
    return hashlib.sha256(json.dumps(keep, sort_keys=True).encode()).hexdigest()

class Observer:
    def __init__(self, database=None):
        self.jobs = {}
        self.database = database or {'samples': {}, 'recent': []}
        self.started = time.time() * 1000
        self.seen_pending = set()

    def observe(self, row, progress, now):
        identifier, graph = row[1], row[2]
        job = self.jobs.get(identifier)
        if job is None:
            created = (row[3] or {}).get('create_time')
            complete_start = identifier in self.seen_pending or (isinstance(created, (int, float)) and created >= self.started)
            job = self.jobs[identifier] = {'submitted_at': created, 'render_observed_at': now,
                'profile': profile(graph), 'stages': [], 'complete_start': complete_start,
                'last_step': None, 'last_step_at': None, 'step_intervals': []}
        phase = progress.get('phase') or 'loading'
        node = str(progress.get('node') or '')
        stage_key = phase + ':' + node
        stages = job['stages']
        if not stages or stages[-1]['key'] != stage_key:
            if stages:
                stages[-1]['ended_at'] = now
            stages.append({'key': stage_key, 'phase': phase, 'started_at': now,
                           'partial': not stages and not job['complete_start']})
            job['last_step'] = None
            job['step_intervals'] = []
        step, total = progress.get('step'), progress.get('total')
        if phase == 'sampling' and isinstance(step, (int, float)) and isinstance(total, (int, float)):
            if job['last_step'] is not None and step > job['last_step']:
                job['step_intervals'].append((now - job['last_step_at']) / (step - job['last_step']))
                job['step_intervals'] = job['step_intervals'][-8:]
            if step != job['last_step']:
                job['last_step'], job['last_step_at'] = step, now
        samples = self.database['samples'].get(job['profile'] + ':' + stage_key, [])
        eta, basis = None, None
        if phase == 'sampling' and len(job['step_intervals']) >= 2:
            eta = max(0, statistics.median(job['step_intervals']) * max(0, total - step)
                      - (now - job['last_step_at']))
            basis = 'Measured step speed'
        elif samples and not stages[-1]['partial']:
            eta = max(0, statistics.median(samples) - (now - stages[-1]['started_at']))
            basis = 'Comparable completed stages: ' + str(len(samples))
        return {'submitted_at': job['submitted_at'], 'render_observed_at': job['render_observed_at'],
                'stages': stages, 'eta_ms': eta, 'eta_basis': basis, 'observed_at': now}

    def finish(self, identifier, history, now):
        job = self.jobs.pop(identifier)
        success = history.get('status', {}).get('status_str') == 'success'
        if job['stages']:
            job['stages'][-1]['ended_at'] = now
        if success:
            for stage in job['stages']:
                if stage['partial']:
                    continue
                key = job['profile'] + ':' + stage['key']
                values = self.database['samples'].setdefault(key, [])
                values.append(stage['ended_at'] - stage['started_at'])
                del values[:-20]
        record = {'prompt_id': identifier, 'status': 'completed' if success else 'stopped or failed',
                  'submitted_at': job['submitted_at'], 'finished_at': now, 'stages': job['stages']}
        self.database['recent'] = ([record] + self.database['recent'])[:5]
        self.seen_pending.discard(identifier)

def main(base=BASE, root=ROOT, public=PUBLIC):
    global BASE, ROOT, PUBLIC
    BASE, ROOT, PUBLIC = base, Path(root), Path(public)
    database_path = ROOT / 'shared-timing-history.json'
    state_path = ROOT / 'shared-timing-state.json'
    try:
        database = json.loads(database_path.read_text())
    except (OSError, ValueError):
        database = None
    observer = Observer(database)
    try:
        previous = json.loads(state_path.read_text())
        observer.jobs = previous['jobs']
        observer.started = previous['started']
        observer.seen_pending = set(previous['pending'])
        # A resumed observer cannot know which transitions occurred during its
        # absence. Keep elapsed display, but never learn this stage as complete.
        for job in observer.jobs.values():
            if job.get('stages'):
                job['stages'][-1]['partial'] = True
    except (OSError, ValueError, KeyError):
        pass
    while True:
        try:
            queue = get('/queue')
            now = time.time() * 1000
            observer.seen_pending.update(row[1] for row in queue.get('queue_pending', []))
            active, identifiers = {}, set()
            for row in queue.get('queue_running', []):
                identifiers.add(row[1])
                progress = get('/h3_studio/job_progress?prompt_id=' + row[1])
                active[row[1]] = observer.observe(row, progress, time.time() * 1000)
            for identifier in list(observer.jobs):
                if identifier not in identifiers:
                    history = get('/history/' + identifier).get(identifier)
                    if history:
                        observer.finish(identifier, history, time.time() * 1000)
                        atomic(database_path, observer.database)
            atomic(PUBLIC, {'updated_at': now, 'jobs': active, 'recent': observer.database['recent'],
                            'measurement': 'Server observed stage transitions, 1 second polling'})
            atomic(state_path, {'jobs': observer.jobs, 'started': observer.started,
                                'pending': list(observer.seen_pending)})
        except Exception as error:
            print(type(error).__name__ + ': ' + str(error), flush=True)
        time.sleep(1)

if __name__ == '__main__':
    main()
