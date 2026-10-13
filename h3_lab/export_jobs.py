"""Server-owned durable media export status shared by every browser."""
import copy
import json
import os
import pathlib
import threading
import time
import uuid

ACTIVE_EXPORT_STATES = frozenset(('queued', 'preparing', 'encoding', 'verifying'))

class ExportJobs:
    def __init__(self, storage_root):
        self.root = pathlib.Path(storage_root)
        self.path = self.root / 'export_jobs.json'
        self.lock = threading.RLock()
        try:
            self.records = json.loads(self.path.read_text(encoding='utf-8'))
            if not isinstance(self.records, dict): raise ValueError('Invalid export manifest')
        except FileNotFoundError:
            self.records = {}
        # Keep evidence of interruptions instead of silently reporting readiness.
        for record in self.records.values():
            if record.get('status') in ACTIVE_EXPORT_STATES:
                record.update(status='interrupted', error='Server restarted before this export completed. Start it again.', finished_at=time.time())
            elif record.get('status') == 'completed' and not (self.root / 'exports' / record.get('result', {}).get('filename', '')).is_file():
                record.update(status='missing', error='Export file is no longer available.')
        self._save()

    def _save(self):
        self.root.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix('.' + uuid.uuid4().hex + '.tmp')
        try:
            with temporary.open('w', encoding='utf-8') as stream:
                json.dump(self.records, stream)
                stream.flush(); os.fsync(stream.fileno())
            os.replace(temporary, self.path)
        finally:
            temporary.unlink(missing_ok=True)

    def submit(self, source_output, target):
        with self.lock:
            for record in self.records.values():
                if record.get('status') in ACTIVE_EXPORT_STATES and record['source_output'] == source_output and record['target'] == target:
                    return copy.deepcopy(record), True
            if sum(r.get('status') in ACTIVE_EXPORT_STATES for r in self.records.values()) >= 4:
                raise ValueError('Export queue is full. Wait for the current exports to finish.')
            record = {'job_id': uuid.uuid4().hex, 'source_output': source_output, 'source_filename': pathlib.PurePosixPath(source_output).name,
                'target': target, 'status': 'queued', 'progress_percent': 0, 'created_at': time.time(), 'updated_at': time.time(),
                'frames_done': 0, 'frames_total': None, 'result': None, 'error': None}
            self.records[record['job_id']] = record
            finished = sorted((r for r in self.records.values() if r['status'] not in ACTIVE_EXPORT_STATES), key=lambda r:r['created_at'], reverse=True)
            for old in finished[100:]: self.records.pop(old['job_id'], None)
            self._save()
            return copy.deepcopy(record), False

    def update(self, job_id, **fields):
        with self.lock:
            self.records[job_id].update(fields, updated_at=time.time())
            self._save()
            return copy.deepcopy(self.records[job_id])

    def get(self, job_id):
        with self.lock:
            return copy.deepcopy(self.records.get(job_id))

    def list(self):
        with self.lock:
            return copy.deepcopy(sorted(self.records.values(), key=lambda r:r['created_at'], reverse=True))

    def is_source_active(self, filename):
        with self.lock:
            return any(r['status'] in ACTIVE_EXPORT_STATES and r['source_filename'] == filename for r in self.records.values())
