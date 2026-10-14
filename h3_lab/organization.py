"""Project organization, recoverable cross-project transfers and truthful reuse."""
import copy
import json
import os
import pathlib
import time
import uuid
from .paths import owned_path, owned_video


def asset_ids(value):
    found = set()
    if isinstance(value, dict):
        for key, item in value.items():
            if (key in ('asset_id', 'assetId') or key.endswith('_asset_id')) and isinstance(item, str) and item:
                found.add(item)
            else:
                found.update(asset_ids(item))
    elif isinstance(value, list):
        for item in value:
            found.update(asset_ids(item))
    return found


def conflict(message):
    error = ValueError(message)
    error.status_code = 409
    return error


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    try:
        with temp.open('w', encoding='utf-8') as file:
            json.dump(value, file, ensure_ascii=False, indent=2)
            file.flush()
            os.fsync(file.fileno())
        os.replace(temp, path)
    finally:
        temp.unlink(missing_ok=True)


class OrganizationMixin:
    def organization(self):
        with self._lock:
            path = self.storage_root / 'organization.json'
            return json.loads(path.read_text(encoding='utf-8')) if path.exists() else {'revision': 1, 'folders': []}

    def organize(self, operation, expected_revision):
        from .projects import workspace_name
        with self._lock:
            record = self.organization()
            if type(expected_revision) is not int or expected_revision != record['revision']:
                raise conflict('Project folders changed. Refresh before editing.')
            action = operation.get('action')
            if action == 'create_folder':
                name = workspace_name(operation.get('name'))
                if any(f['name'].casefold() == name.casefold() for f in record['folders']):
                    raise ValueError('A project folder with this name already exists')
                record['folders'].append({'id': 'folder_' + uuid.uuid4().hex[:12], 'name': name})
            elif action == 'rename_folder':
                folder = next((f for f in record['folders'] if f['id'] == operation.get('folder_id')), None)
                if not folder:
                    raise ValueError('Project folder not found')
                name = workspace_name(operation.get('name'))
                if any(f is not folder and f['name'].casefold() == name.casefold() for f in record['folders']):
                    raise ValueError('A project folder with this name already exists')
                folder['name'] = name
            else:
                raise ValueError('Unknown project folder operation')
            record['revision'] += 1
            atomic_json(self.storage_root / 'organization.json', record)
            return record

    def _check_revision(self, project, expected):
        if type(expected) is not int or expected != project['revision']:
            raise conflict('A project changed on another device. Refresh and retry.')

    def recover_transfers(self):
        with self._lock:
            for path in (self.storage_root / 'transfers').glob('*.json'):
                record = json.loads(path.read_text(encoding='utf-8'))
                if record['status'] == 'pending':
                    for project in record['after']:
                        self._write_manifest(project['project_id'], project)
                    record['status'] = 'completed'
                    atomic_json(path, record)
            self._transfer_recovery_required = False

    def transfer(self, source_id, body):
        from .projects import reference_alias
        with self._lock:
            self.recover_transfers()
            target_id = body.get('target_project_id')
            if target_id == source_id:
                raise ValueError('Choose a different destination project')
            mode = body.get('mode')
            if mode not in ('copy', 'move'):
                raise ValueError('Choose Copy or Move')
            request_id = body.get('request_id')
            try:
                request_id = str(uuid.UUID(request_id))
            except (ValueError, TypeError, AttributeError):
                raise ValueError('A valid transfer request identity is required')
            journal = self.storage_root / 'transfers' / (request_id + '.json')
            fingerprint = {k: body.get(k) for k in ('target_project_id', 'mode', 'asset_ids', 'take_ids')}
            fingerprint['source_project_id'] = source_id
            if journal.exists():
                old = json.loads(journal.read_text(encoding='utf-8'))
                if old['request'] != fingerprint:
                    raise conflict('Transfer identity was already used for a different operation')
                return {'source': self.get_project(source_id), 'target': self.get_project(target_id), 'receipt': old['receipt']}
            source, target = self.get_project(source_id), self.get_project(target_id)
            if not source or not target:
                raise ValueError('Source or destination project not found')
            self._check_revision(source, body.get('source_revision'))
            self._check_revision(target, body.get('target_revision'))
            selections = []
            for key in ('asset_ids', 'take_ids'):
                values = body.get(key, [])
                if not isinstance(values, list) or len(values) > 200 or any(not isinstance(v, str) for v in values):
                    raise ValueError('Select at most 200 items per transfer')
                selections.append(set(values))
            selected_assets, selected_takes = selections
            if not (selected_assets or selected_takes):
                raise ValueError('Select assets or takes to transfer')
            takes = {t['take_id']: t for t in source.get('takes', [])}
            if not selected_takes.issubset(takes):
                raise ValueError('A selected take is not in this project')
            # Copy the complete ancestry, so continuation history remains meaningful.
            closure = set(selected_takes)
            pending = list(closure)
            while pending:
                parent = takes[pending.pop()].get('parent_take_id')
                if parent and parent not in closure:
                    if parent not in takes:
                        raise ValueError('Take ancestry is incomplete; repair the source project first')
                    closure.add(parent); pending.append(parent)
            if mode == 'move':
                if any(t.get('parent_take_id') in closure and t['take_id'] not in closure for t in takes.values()):
                    raise ValueError('Other takes depend on this lineage. Copy it or move all descendants together.')
                if closure.intersection(source.get('accepted_take_ids', [])):
                    raise ValueError('Accepted sequence takes must be copied, or removed from the sequence before moving.')
            required = selected_assets | asset_ids([takes[t] for t in closure])
            catalog = {a['asset_id']: a for a in source['assets']}
            if not required.issubset(catalog):
                raise ValueError('A required reference is missing from the source project catalog')
            for aid in required:
                if not self.asset_service or not self.asset_service.get_asset(aid):
                    raise ValueError('Required reference media is missing; transfer stopped')
            if mode == 'move':
                retained = asset_ids(source.get('draft', {})) | asset_ids(source.get('clips', [])) | asset_ids([t for t in takes.values() if t['take_id'] not in closure])
                if selected_assets & retained:
                    raise ValueError('These assets are used by saved shots. Copy them to preserve the original references.')
            used = {a['alias'].casefold() for a in target['assets']}
            added = []
            for aid in sorted(required):
                if any(a['asset_id'] == aid for a in target['assets']):
                    continue
                item = copy.deepcopy(catalog[aid])
                category = next(c for c in source['asset_categories'] if c['id'] == item['category'])
                if not any(c['id'] == category['id'] for c in target['asset_categories']):
                    target['asset_categories'].append(copy.deepcopy(category))
                item['alias'] = reference_alias(item['alias'], used); used.add(item['alias'].casefold())
                item['folder_id'] = None
                target['assets'].append(item); added.append(aid)
            for tid in closure:
                old = next((t for t in target.get('takes', []) if t['take_id'] == tid), None)
                if old and old != takes[tid]:
                    raise conflict('Destination contains a different take with the same identity')
                if not old:
                    if self.output_root and takes[tid].get('output_file'):
                        owned_video(self.output_root, takes[tid]['output_file'])
                    target.setdefault('takes', []).append(copy.deepcopy(takes[tid]))
            if mode == 'move':
                source['assets'] = [a for a in source['assets'] if a['asset_id'] not in selected_assets]
                source['takes'] = [t for t in source.get('takes', []) if t['take_id'] not in closure]
                source['transferred_take_ids'] = list(set(source.get('transferred_take_ids', [])) | closure)
            changed = [target] + ([source] if mode == 'move' else [])
            for project in changed:
                project['revision'] += 1; project['updated_at'] = time.time()
            receipt = {'request_id': request_id, 'mode': mode, 'assets_added': len(added), 'takes': len(closure), 'references_preserved': True}
            record = {'status': 'pending', 'request': fingerprint, 'after': changed, 'receipt': receipt}
            # Attach durable ownership before journalling a roll-forward operation. Never delete media.
            for aid in required:
                self.asset_service.attach_project(aid, target_id)
            atomic_json(journal, record)
            self._transfer_recovery_required = True
            self.recover_transfers()
            return {'source': self.get_project(source_id), 'target': self.get_project(target_id), 'receipt': receipt}

    def prepare_reuse(self, output_file, jobs=None):
        from .render_values import seed_value
        if not self.output_root:
            raise ValueError('Video storage is unavailable')
        video = owned_video(self.output_root, output_file)
        candidate = None; source = None
        for item in self.list_projects():
            project = self.get_project(item['project_id'])
            for take in project.get('takes', []):
                if take.get('output_file') == video.relative_to(self.output_root).as_posix():
                    if candidate is None or (take.get('draft') and not candidate.get('draft')):
                        candidate, source = take, project
        draft = copy.deepcopy((candidate or {}).get('draft'))
        settings = copy.deepcopy((candidate or {}).get('effective_settings', {}))
        if not draft and jobs:
            for record in jobs.project_jobs(source['project_id'] if source else None):
                output = record.get('output') or {}
                if output.get('filename') == video.name:
                    snapshot = record.get('render_spec', {}).get('project_snapshot', {})
                    draft = copy.deepcopy(snapshot.get('draft')); settings = copy.deepcopy(snapshot.get('settings', settings))
                    if draft: break
        warnings = []
        if not draft:
            path = self.output_root / 'video' / '.h3-studio-metadata.json'
            metadata = json.loads(path.read_text(encoding='utf-8')) if path.is_file() else {}
            settings = settings or metadata.get(video.name, {}).get('settings', {})
            if not settings or not settings.get('prompt'):
                return {'available': False, 'warnings': ['This older video has no saved generation setup. Its inputs cannot be reconstructed safely.']}
            mode = settings.get('mode', 'text'); canvas = settings.get('output_canvas') or {}
            if not canvas:
                parts = str(settings.get('canvas', '')).replace('×', 'x').split('x')
                if len(parts) == 2 and all(p.isdigit() for p in parts): canvas = dict(zip(('width', 'height'), map(int, parts)))
            frames = settings.get('target_frames', settings.get('frames', 362))
            draft = {'mode': mode, 'prompts': {mode: settings['prompt']}, 'canvas': canvas or {'width':1280,'height':704},
                'settings': {'seed': str(seed_value(settings.get('seed', 42))), 'steps': settings.get('steps',20), 'duration': frames,
                    'durationSeconds': frames/24, 'renderMethod': settings.get('render_method','native'), 'refSize': settings.get('reference_detail') or 'match'},
                'configuration': {'modelProfile': settings.get('configuration',{}).get('profile','original'),
                    'checkpoint': settings.get('configuration',{}).get('checkpoint'), 'sampling': settings.get('configuration',{}).get('sampling',{})},
                'refs': [], 'guides': [], 'loras': [{**a,'enabled':True} for a in settings.get('loras',[])], 'preparationMode':'native'}
            for ref in settings.get('references', []):
                draft['refs'].append({'assetId':ref.get('asset_id'), 'alias':str(ref.get('name','reference')).lstrip('@'),
                    'kind':ref.get('type','image'), 'role':ref.get('use_as','custom'), 'useAudio':ref.get('video_soundtrack',False),
                    'trimEnabled':bool(ref.get('trim')), 'trimStart':(ref.get('trim') or {}).get('start',0), 'trimDuration':(ref.get('trim') or {}).get('duration',15)})
            for ref in settings.get('frame_references', []):
                name = 'last' if ref.get('name') == '@end' else 'first'
                draft[name] = {'assetId':ref.get('asset_id'), 'alias':str(ref.get('name',name)).lstrip('@')}
            warnings.append('Legacy settings recovered. Advanced inputs not recorded in this video must be checked manually.')
            timing = settings.get('timingConfiguration') or {}
            if settings.get('refine') or settings.get('control') or settings.get('continuation') or timing.get('guides') or timing.get('continuation'):
                warnings.append('Control/refinement/continuation source data was not saved completely. Reattach and verify before rendering.')
        missing = []
        if any('not saved completely' in w for w in warnings): missing.append('Unrecorded advanced inputs')
        records = []
        continuation = draft.get('continuation') or {}
        if continuation.get('type') == 'generated':
            token = continuation.get('source_token', '')
            import re
            context = self.output_root / 'h3_lab_contexts'
            if not re.fullmatch(r'[a-f0-9]{12}', token) or not all((context / (token + suffix)).is_file() for suffix in ('.json', '.safetensors')):
                missing.append('Generated continuation context')
        for aid in asset_ids(draft):
            rec = self.asset_service.get_asset(aid) if self.asset_service else None
            if rec: records.append(rec)
            else: missing.append(aid)
        for item in ([draft.get('first'),draft.get('last')] + draft.get('refs',[]) + draft.get('guides',[]) + list(draft.get('controlInputs',{}).values())):
            if item and not item.get('assetId'): missing.append(item.get('alias') or 'Unrecorded reference')
        if draft.get('mode') == 'frames' and not (draft.get('first') or draft.get('last')):
            missing.append('Original start/end frame')
        if missing: warnings.append('Missing inputs: '+', '.join(missing))
        return {'available':True, 'complete':not missing and not any('not saved completely' in w for w in warnings),
            'draft':draft, 'settings':settings, 'assets':records, 'missing':missing, 'warnings':warnings,
            'source_project_id':(source or {}).get('project_id'), 'source_take_id':(candidate or {}).get('take_id'), 'output_file':output_file}

    def apply_reuse(self, output_file, target_id, expected_revision, jobs=None):
        with self._lock:
            prepared = self.prepare_reuse(output_file, jobs)
            if not prepared['available']: raise ValueError(prepared['warnings'][0])
            target = self.get_project(target_id)
            if not target: raise ValueError('Destination project not found')
            self._check_revision(target, expected_revision)
            for rec in prepared['assets']:
                if not any(a['asset_id'] == rec['asset_id'] for a in target['assets']):
                    # Catalog naming is independent of the immutable source draft aliases.
                    from .projects import reference_alias
                    used = {a['alias'].casefold() for a in target['assets']}
                    original = None
                    if prepared['source_project_id']:
                        original = next((a for a in self.get_project(prepared['source_project_id'])['assets'] if a['asset_id'] == rec['asset_id']), None)
                    item = copy.deepcopy(original) if original else {'asset_id':rec['asset_id'],'kind':rec['kind'],'server_path':rec['server_path'],
                        'name':rec['original_name'],'alias':pathlib.Path(rec['original_name']).stem,'category':'custom','role':'custom','notes':''}
                    if not any(c['id']==item['category'] for c in target['asset_categories']): item['category']='custom'
                    item['alias']=reference_alias(item['alias'],used);item['folder_id']=None;target['assets'].append(item)
            target['draft'] = prepared['draft']
            target['draft']['reuse_missing'] = prepared['missing']
            target['draft']['reuse_source'] = {'output_file':output_file,'take_id':prepared['source_take_id'],'project_id':prepared['source_project_id']}
            saved = self.save_project(target_id,target,expected_revision)
            return {'project':saved,'warnings':prepared['warnings'],'missing':prepared['missing'],'complete':prepared['complete']}
