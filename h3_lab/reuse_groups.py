"""Stable project-owned Reuse folders and retry-safe independent workspaces."""
import pathlib
import uuid


class ReuseGroupsMixin:
    def _reuse_root(self, project):
        seen = set()
        while project:
            if project['project_id'] in seen:
                raise ValueError('Reuse project lineage contains a cycle')
            seen.add(project['project_id'])
            if 'reuse_root_project_id' in project:
                parent = project['reuse_root_project_id']
                if parent is None:
                    return None
            elif project['name'].startswith('Reused · '):
                parent = (project.get('draft', {}).get('reuse_source') or {}).get('project_id')
            else:
                return project
            if not parent:
                return project
            ancestor = self.get_project(parent)
            if not ancestor:
                return project
            project = ancestor
        return project

    def _reuse_folder(self, root):
        from .organization import atomic_json
        owner = root['project_id'] if root else None
        record = self.organization()
        existing = next((f for f in record['folders'] if f.get('kind') == 'reuse' and f.get('source_project_id') == owner), None)
        if existing:
            return existing
        name = ('Reuse · ' + (root['name'] if root else 'Unassigned videos'))[:160]
        if any(f['name'].casefold() == name.casefold() for f in record['folders']):
            name = name[:148] + ' · ' + (owner or 'unassigned')[:8]
        folder = {'id': 'folder_' + uuid.uuid5(uuid.NAMESPACE_URL, 'h3-reuse-folder/' + (owner or 'unassigned')).hex[:20],
                  'name': name, 'kind': 'reuse', 'source_project_id': owner}
        record['folders'].append(folder)
        record['revision'] += 1
        atomic_json(self.storage_root / 'organization.json', record)
        return folder

    def create_reuse_project(self, output_file, request_id, jobs=None):
        from .organization import conflict
        try:
            identity = str(uuid.UUID(request_id))
        except (ValueError, TypeError, AttributeError):
            raise ValueError('A valid Reuse request identity is required')
        destination = str(uuid.uuid5(uuid.NAMESPACE_URL, 'h3-reuse-project/' + identity))
        with self._lock:
            existing = self.get_project(destination)
            fingerprint = {'request_id': identity, 'output_file': output_file}
            if existing:
                if existing.get('reuse_request') != fingerprint:
                    raise conflict('This Reuse request belongs to a different video.')
                return {'project': existing, 'warnings': [], 'missing': existing.get('draft', {}).get('reuse_missing', []), 'reused_request': True}
            prepared = self.prepare_reuse(output_file, jobs)
            if not prepared['available']:
                raise ValueError(prepared['warnings'][0])
            source = self.get_project(prepared['source_project_id']) if prepared.get('source_project_id') else None
            root = self._reuse_root(source)
            folder = self._reuse_folder(root)
            label = prepared.get('source_take_id') or pathlib.Path(output_file).stem
            name = ('Reuse · ' + (root['name'] + ' · ' if root else '') + label)[:160]
            project = self._new_project_record(name, prepared['draft'].get('canvas'), destination)
            self._populate_reuse(project, prepared)
            project.update(folder_id=folder['id'], reuse_root_project_id=root['project_id'] if root else None,
                           reuse_request=fingerprint)
            if self.asset_service:
                for asset in project['assets']:
                    self.asset_service.attach_project(asset['asset_id'], destination)
            # Publish a complete workspace once; failed attempts leave no empty project.
            self._write_manifest(destination, project)
            return {'project': project, 'warnings': prepared['warnings'], 'missing': prepared['missing'], 'complete': prepared['complete']}

    def group_existing_reuse(self):
        """Backfill proven provenance only; retain folders explicitly chosen by users."""
        with self._lock:
            for summary in self.list_projects():
                project = self.get_project(summary['project_id'])
                provenance = project.get('draft', {}).get('reuse_source') or {}
                if not (project.get('reuse_request') or provenance and project['name'].startswith('Reused · ')):
                    continue
                if project.get('folder_id'):
                    continue
                parent = project.get('reuse_root_project_id') or provenance.get('project_id')
                source = self.get_project(parent) if parent else None
                root = self._reuse_root(source)
                root_id = root['project_id'] if root else None
                folder = self._reuse_folder(root)
                if project.get('folder_id') == folder['id'] and project.get('reuse_root_project_id') == root_id:
                    continue
                project.update(folder_id=folder['id'], reuse_root_project_id=root_id, revision=project['revision'] + 1)
                self._write_manifest(project['project_id'], project)
            return self.organization()
