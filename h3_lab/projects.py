"""Project and Take Manifest Service for H3 Studio Lab.

Provides:
- Versioned project manifests with atomic revision checks (HTTP 409 on stale revision).
- Immutable take records and historical lineage preservation.
- Secure export/import of project bundles with zip traversal protection.
- Qwen Image to H3 asset handoff with detached ownership.
"""

import hashlib
import copy
import json
import logging
import os
import pathlib
import shutil
import threading
import time
import uuid
import zipfile
import re
from .paths import owned_path, owned_video
from .organization import OrganizationMixin

_LOG = logging.getLogger("h3_lab.projects")

MAX_BUNDLE_UNCOMPRESSED_BYTES = 500 * 1024 * 1024  # 500 MB safety limit

ASSET_CATEGORIES = [
    {"id": "characters", "name": "Characters", "role": "character identity"},
    {"id": "locations", "name": "Locations", "role": "location"},
    {"id": "props", "name": "Props", "role": "object"},
    {"id": "styles", "name": "Style", "role": "visual style"},
    {"id": "audio", "name": "Audio", "role": "voice"},
    {"id": "storyboards", "name": "Storyboards", "role": "storyboard"},
    {"id": "custom", "name": "Custom", "role": "custom"},
]

def workspace_name(value):
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > 160:
        raise ValueError("Name must contain between 1 and 160 characters")
    return value.strip()

def reference_alias(name, used):
    base = re.sub(r"[^\w-]+", "_", name, flags=re.UNICODE).strip("_")[:32] or "reference"
    candidate, suffix = base, 1
    while candidate.casefold() in used:
        suffix += 1
        candidate = base[:32-len(str(suffix))-1] + "_" + str(suffix)
    return candidate

def image_category_role(category):
    return category['role'] if category['role'] in ('character identity', 'location', 'object', 'visual style', 'storyboard', 'custom') else 'custom'


class ProjectService(OrganizationMixin):
    def __init__(self, storage_root: str, asset_service=None, output_root=None):
        self.storage_root = pathlib.Path(storage_root).resolve()
        self.projects_dir = self.storage_root / "projects"
        self.bundles_dir = self.storage_root / "bundles"
        self.projects_dir.mkdir(parents=True, exist_ok=True)
        self.bundles_dir.mkdir(parents=True, exist_ok=True)
        self.asset_service = asset_service
        self.output_root = pathlib.Path(output_root).resolve() if output_root else None
        self._lock = threading.RLock()
        self._transfer_recovery_required = True
        self.recover_transfers()

    def _project_dir(self, project_id: str) -> pathlib.Path:
        if not project_id or not re_id(project_id):
            raise ValueError(f"Invalid project_id: {project_id}")
        return self.projects_dir / project_id

    def create_project(self, name: str = "Untitled Project", canvas: dict = None) -> dict:
        name = workspace_name(name)
        project_id = str(uuid.uuid4())
        pdir = self._project_dir(project_id)
        pdir.mkdir(parents=True, exist_ok=True)

        now = time.time()
        record = {
            "schema_version": 1,
            "project_id": project_id,
            "name": name,
            "revision": 1,
            "fps": 24,
            "canvas": canvas or {"width": 1280, "height": 704, "aspect_ratio": "16:9"},
            "assets": [],
            "asset_categories": copy.deepcopy(ASSET_CATEGORIES),
            "clips": [],
            "accepted_take_ids": [],
            "exports": [],
            "created_at": now,
            "updated_at": now,
        }

        self._write_manifest(project_id, record)
        return record

    def get_project(self, project_id: str) -> dict:
        if self._transfer_recovery_required:
            self.recover_transfers()
        pdir = self._project_dir(project_id)
        manifest_path = pdir / "project.json"
        if not manifest_path.is_file():
            return None
        with self._lock:
            with open(manifest_path, "r", encoding="utf-8") as f:
                return self._workspace_manifest(json.load(f))

    def _workspace_manifest(self, project):
        """Add catalog fields in memory without rewriting historical takes or IDs."""
        project.setdefault("asset_categories", copy.deepcopy(ASSET_CATEGORIES))
        project.setdefault("folder_id", None)
        project.setdefault("asset_folders", [])
        refs = {item.get("assetId"): item for item in project.get("draft", {}).get("refs", [])}
        used = {item.get("alias", "").casefold() for item in project.get("assets", []) if item.get("alias")}
        for item in project.get("assets", []):
            ref = refs.get(item.get("asset_id"), {})
            asset = self.asset_service.get_asset(item.get("asset_id")) if self.asset_service else None
            item.setdefault("kind", (asset or {}).get("kind", ref.get("kind", "image")))
            item.setdefault("name", ref.get("alias") or (asset or {}).get("original_name") or item.get("alias") or "Reference")
            item.setdefault("alias", ref.get("alias") or reference_alias(item["name"], used))
            used.add(item["alias"].casefold())
            item.setdefault("role", ref.get("role", "voice" if item["kind"] == "audio" else "custom"))
            item.setdefault("category", next((c["id"] for c in ASSET_CATEGORIES if c["role"] == item["role"]), "custom"))
            item.setdefault("notes", "")
        return project

    def attach_asset(self, project_id, asset, category=None, name=None):
        """Serialize simultaneous uploads against the latest manifest revision."""
        with self._lock:
            project = self.get_project(project_id)
            if not project:
                raise ValueError("Project not found")
            categories = project["asset_categories"]
            category = category or ("audio" if asset["kind"] == "audio" else "custom")
            selected = next((c for c in categories if c["id"] == category), None)
            if not selected:
                raise ValueError("Unknown asset category")
            existing = next((a for a in project["assets"] if a["asset_id"] == asset["asset_id"]), None)
            if not existing:
                label = workspace_name(name or asset.get("original_name") or "Reference")
                alias = reference_alias(pathlib.Path(label).stem, {a["alias"].casefold() for a in project["assets"]})
                role = "voice" if asset["kind"] == "audio" else "motion" if asset["kind"] == "video" else image_category_role(selected)
                project["assets"].append({"asset_id": asset["asset_id"], "kind": asset["kind"], "server_path": asset["server_path"],
                    "name": label, "alias": alias, "category": category, "role": role, "notes": ""})
            return self.save_project(project_id, project, project["revision"])

    def update_workspace(self, project_id, operation, expected_revision):
        with self._lock:
            project = self.get_project(project_id)
            if not project:
                raise KeyError("Project not found")
            if not isinstance(operation, dict):
                raise ValueError("Workspace operation must be an object")
            action = operation.get("action")
            if action == "rename_project":
                project["name"] = workspace_name(operation.get("name"))
            elif action == "file_project":
                folder = operation.get('folder_id')
                if folder is not None and not any(f['id'] == folder for f in self.organization()['folders']):
                    raise ValueError('Project folder not found')
                project['folder_id'] = folder
            elif action in ('add_asset_folder', 'rename_asset_folder'):
                name = workspace_name(operation.get('name'))
                folder = next((f for f in project['asset_folders'] if f['id'] == operation.get('folder_id')), None)
                if any(f is not folder and f['name'].casefold() == name.casefold() for f in project['asset_folders']):
                    raise ValueError('An asset folder with this name already exists')
                if action == 'add_asset_folder':
                    project['asset_folders'].append({'id':'assets_'+uuid.uuid4().hex[:12], 'name':name})
                elif folder:
                    folder['name'] = name
                else:
                    raise ValueError('Asset folder not found')
            elif action == 'file_assets':
                ids = operation.get('asset_ids')
                folder = operation.get('folder_id')
                if not isinstance(ids, list) or not ids or len(ids)>200 or any(not isinstance(a,str) for a in ids):
                    raise ValueError('Select up to 200 assets')
                if not set(ids).issubset({a['asset_id'] for a in project['assets']}):
                    raise ValueError('An asset is not in this project')
                if folder is not None and not any(f['id']==folder for f in project['asset_folders']):
                    raise ValueError('Asset folder not found')
                for asset in project['assets']:
                    if asset['asset_id'] in ids: asset['folder_id']=folder
            elif action == "add_category":
                name = workspace_name(operation.get("name"))
                if any(c["name"].casefold() == name.casefold() for c in project["asset_categories"]):
                    raise ValueError("A category with this name already exists")
                project["asset_categories"].append({"id": "custom_" + uuid.uuid4().hex[:12], "name": name, "role": "custom"})
            elif action == "rename_category":
                category = next((c for c in project['asset_categories'] if c['id'] == operation.get('category')), None)
                name = workspace_name(operation.get('name'))
                if not category:
                    raise ValueError('Unknown asset category')
                if any(c['id'] != category['id'] and c['name'].casefold() == name.casefold() for c in project['asset_categories']):
                    raise ValueError('A category with this name already exists')
                category['name'] = name
            elif action == "edit_asset":
                item = next((a for a in project["assets"] if a["asset_id"] == operation.get("asset_id")), None)
                if not item:
                    raise ValueError("Asset is not in this project")
                if "name" in operation:
                    name = workspace_name(operation["name"])
                    if name != item.get("name") and item.get("name"):
                        item["mention_names"] = list(dict.fromkeys([*item.get("mention_names", []), item["name"]]))
                    item["name"] = name
                    # The display name is also a mention; the canonical alias and
                    # saved take/draft bindings remain backward compatible.
                if "notes" in operation:
                    if not isinstance(operation["notes"], str) or len(operation["notes"]) > 4000:
                        raise ValueError("Notes must contain at most 4000 characters")
                    item["notes"] = operation["notes"]
                if "category" in operation:
                    category = next((c for c in project["asset_categories"] if c["id"] == operation["category"]), None)
                    if not category:
                        raise ValueError("Unknown asset category")
                    item["category"] = category["id"]
                    if item["kind"] == "image":
                        item["role"] = image_category_role(category)
                if 'folder_id' in operation:
                    folder = operation['folder_id']
                    if folder is not None and not any(f['id']==folder for f in project['asset_folders']):
                        raise ValueError('Asset folder not found')
                    item['folder_id'] = folder
            else:
                raise ValueError("Unknown workspace operation")
            return self.save_project(project_id, project, expected_revision)

    def list_projects(self) -> list:
        results = []
        with self._lock:
            for item in self.projects_dir.iterdir():
                if item.is_dir():
                    mf = item / "project.json"
                    if mf.is_file():
                        try:
                            with open(mf, "r", encoding="utf-8") as f:
                                data = json.load(f)
                            results.append({
                                "project_id": data.get("project_id"),
                                "name": data.get("name"),
                                "revision": data.get("revision"),
                                "canvas": data.get("canvas"),
                                "updated_at": data.get("updated_at"),
                                "asset_count": len(data.get("assets", [])),
                                "preview_asset_id": next((asset.get("asset_id") for asset in data.get("assets", []) if asset.get("kind") == "image"), None),
                                "take_count": len(data.get("takes", [])),
                                "folder_id": data.get('folder_id'),
                            })
                        except Exception:
                            pass
        results.sort(key=lambda x: x.get("updated_at", 0), reverse=True)
        return results

    def _write_manifest(self, project_id: str, record: dict):
        pdir = self._project_dir(project_id)
        pdir.mkdir(parents=True, exist_ok=True)
        target = pdir / "project.json"
        tmp = target.with_suffix(f".tmp.{uuid.uuid4().hex}")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(record, f, indent=2, ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, target)

    def save_project(self, project_id: str, data: dict, expected_revision: int) -> dict:
        """
        Atomic update with optimistic concurrency check.
        Raises ValueError with status_code=409 on stale revision.
        """
        with self._lock:
            current = self.get_project(project_id)
            if not current:
                raise KeyError(f"Project not found: {project_id}")

            current_rev = current.get("revision", 1)
            if expected_revision is not None and expected_revision != current_rev:
                err = ValueError(f"Stale revision: expected {expected_revision}, but server has {current_rev}")
                err.status_code = 409
                raise err

            updated = dict(data)
            updated["project_id"] = project_id
            updated["revision"] = current_rev + 1
            updated["updated_at"] = time.time()
            if self.asset_service:
                for asset in updated.get("assets", []):
                    if asset.get("asset_id"):
                        self.asset_service.attach_project(asset["asset_id"], project_id)

            self._write_manifest(project_id, updated)
            return updated

    def append_source_take(self, project_id, asset, take, metadata):
        """Append an imported source without overwriting a concurrent project save."""
        with self._lock:
            project = self.get_project(project_id)
            if not project:
                raise ValueError("Project not found")
            if not any(item.get("asset_id") == asset["asset_id"] for item in project.get("assets", [])):
                project.setdefault("assets", []).append({"asset_id": asset["asset_id"], "kind": "video",
                    "server_path": asset["server_path"], "alias": "continuation_" + take["take_id"], "metadata": metadata})
            project.setdefault("takes", []).append(take)
            return self.save_project(project_id, project, project["revision"])

    def attach_completed_job(self, job):
        """Recover project ownership after the initiating browser closes."""
        if job.get('state') != 'completed' or not job.get('project_id') or not job.get('output'):
            return
        token = job.get('take_id') or job.get('request_id')
        if not isinstance(token, str) or not token:
            raise ValueError('Completed job has no valid take identity')
        with self._lock:
            project = self.get_project(job['project_id'])
            if not project or any(take.get('take_id') == token for take in project.get('takes', [])):
                return
            if token in project.get('transferred_take_ids', []):
                return
        output = job['output']
        if not isinstance(output, dict) or not isinstance(output.get('filename'), str) or not isinstance(output.get('subfolder', 'video'), str):
            raise ValueError('Completed job output is malformed')
        relative = str(pathlib.PurePosixPath(output.get('subfolder') or 'video') / output.get('filename', ''))
        owned_video(self.output_root, relative)
        with self._lock:
            project = self.get_project(job['project_id'])
            if not project:
                return
            if any(take.get('take_id') == token for take in project.get('takes', [])):
                return
            if token in project.get('transferred_take_ids', []):
                return
            spec = job.get('render_spec')
            spec = spec if isinstance(spec, dict) else {}
            snapshot = spec.get('project_snapshot')
            snapshot = snapshot if isinstance(snapshot, dict) else {}
            settings = snapshot.get('settings')
            settings = settings if isinstance(settings, dict) else {}
            take = {'take_id': token, 'clip_id': snapshot.get('clip_id') or 'clip_' + token[:8],
                'output_file': relative, 'effective_settings': settings,
                'parent_take_id': snapshot.get('parent_take_id'), 'overlap_frames': 0,
                'unique_frames': settings.get('frames') if isinstance(settings.get('frames'), int) else spec.get('target_frames') if isinstance(spec.get('target_frames'), int) else None, 'context_token': token,
                'created_at': job.get('created_at', time.time()), 'status': 'completed'}
            if isinstance(snapshot.get('draft'), dict):
                take['draft'] = snapshot['draft']
            project.setdefault('takes', []).append(take)
            return self.save_project(project['project_id'], project, project['revision'])

    def duplicate_project(self, project_id: str, new_name: str = None) -> dict:
        current = self.get_project(project_id)
        if not current:
            raise KeyError(f"Project not found: {project_id}")

        new_name = new_name or f"{current.get('name', 'Project')} (Copy)"
        new_proj = self.create_project(name=new_name, canvas=current.get("canvas"))

        for key, value in current.items():
            if key not in ("project_id", "name", "revision", "created_at", "updated_at"):
                new_proj[key] = copy.deepcopy(value)
        if self.asset_service:
            for asset in new_proj.get("assets", []):
                rec = self.asset_service.get_asset(asset.get("asset_id"))
                if rec:
                    self.asset_service.register_asset(str(owned_path(self.storage_root, rec["server_path"])),
                        rec["kind"], rec["original_name"], new_proj["project_id"])
        return self.save_project(new_proj["project_id"], new_proj, expected_revision=1)

    def export_bundle(self, project_id: str, include_takes: bool = True) -> pathlib.Path:
        project = self.get_project(project_id)
        if not project:
            raise KeyError(f"Project not found: {project_id}")

        pdir = self._project_dir(project_id)
        bundle_path = self.bundles_dir / f"project_{project_id}_{uuid.uuid4().hex}.zip"

        with zipfile.ZipFile(bundle_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            snapshot = copy.deepcopy(project)
            referenced_assets = set()
            def collect_references(value):
                if isinstance(value, dict):
                    for key, item in value.items():
                        if (key in ("asset_id", "assetId") or key.endswith("_asset_id")) and isinstance(item, str) and item:
                            referenced_assets.add(item)
                        else:
                            collect_references(item)
                elif isinstance(value, list):
                    for item in value:
                        collect_references(item)
            collect_references(snapshot.get("draft", {}))
            collect_references(snapshot.get("takes", []))
            collect_references(snapshot.get("clips", []))
            if referenced_assets:
                declared = {item.get("asset_id") for item in snapshot.get("assets", [])}
                if not referenced_assets.issubset(declared):
                    raise ValueError("Project references an asset missing from its manifest")
                # The project catalog is reusable beyond the current draft: bundle all its assets.
            if include_takes:
                bundled_contexts = set()
                for take in snapshot.get("takes", []):
                    if not take.get("output_file"):
                        continue
                    source = owned_video(self.output_root or self.storage_root, take["output_file"])
                    archive_path = "takes/" + source.name
                    zf.write(source, arcname=archive_path)
                    take["output_file"] = archive_path
                    token_match = re.search(r"h3_studio_([a-f0-9]{12})", source.name)
                    if self.output_root and token_match:
                        token = token_match.group(1)
                        if token not in bundled_contexts:
                            context_root = self.output_root / "h3_lab_contexts"
                            for suffix in (".json", ".safetensors"):
                                context_file = context_root / (token + suffix)
                                if context_file.is_file():
                                    zf.write(context_file, arcname="contexts/" + context_file.name)
                            bundled_contexts.add(token)
            zf.writestr("project.json", json.dumps(snapshot, ensure_ascii=False))

            # Write assets
            for asset_item in snapshot.get("assets", []):
                aid = asset_item.get("asset_id")
                rec = self.asset_service.get_asset(aid) if self.asset_service and aid else None
                if not rec:
                    raise ValueError("Project asset media is missing; portable export is incomplete")
                src_path = owned_path(self.asset_service.storage_root, rec["server_path"])
                zf.write(src_path, arcname=f"assets/{src_path.name}")

        return bundle_path

    def import_bundle(self, zip_path: str) -> dict:
        """
        Safely import a project bundle with zip path traversal protection.
        """
        zp = pathlib.Path(zip_path).resolve()
        if not zp.is_file():
            raise FileNotFoundError(f"Bundle file not found: {zip_path}")

        new_project_id = str(uuid.uuid4())
        dest_dir = self._project_dir(new_project_id)
        dest_dir.mkdir(parents=True, exist_ok=True)

        uncompressed_total = 0

        with zipfile.ZipFile(zp, "r") as zf:
            for info in zf.infolist():
                # Path traversal check
                norm_name = os.path.normpath(info.filename)
                if norm_name.startswith("..") or os.path.isabs(norm_name):
                    raise ValueError(f"Malicious archive entry rejected: {info.filename}")

                uncompressed_total += info.file_size
                if uncompressed_total > MAX_BUNDLE_UNCOMPRESSED_BYTES:
                    raise ValueError(f"Archive exceeds maximum uncompressed limit ({MAX_BUNDLE_UNCOMPRESSED_BYTES} bytes)")

            # Extract manifest first
            try:
                manifest_bytes = zf.read("project.json")
                manifest_data = json.loads(manifest_bytes.decode("utf-8"))
            except Exception as e:
                raise ValueError(f"Invalid project bundle: missing or corrupt project.json: {e}")

            # Re-key project
            manifest_data["project_id"] = new_project_id
            manifest_data['folder_id'] = None
            manifest_data['transferred_take_ids'] = []
            manifest_data["revision"] = 1
            manifest_data["name"] = f"{manifest_data.get('name', 'Imported')} (Imported)"
            manifest_data["updated_at"] = time.time()

            asset_remap = {}
            reference_remap = {}
            if self.output_root:
                for info in zf.infolist():
                    match = re.fullmatch(r"contexts/([a-f0-9]{12})\.json", info.filename)
                    if not match:
                        continue
                    token = match.group(1)
                    new_token = uuid.uuid4().hex[:12]
                    payload_name = "contexts/" + token + ".safetensors"
                    try:
                        context = json.loads(zf.read(info).decode("utf-8"))
                        folder = self.output_root / "h3_lab_contexts"
                        folder.mkdir(parents=True, exist_ok=True)
                        target = folder / (new_token + ".safetensors")
                        with zf.open(payload_name) as source, target.open("wb") as destination:
                            shutil.copyfileobj(source, destination)
                        with target.open("rb") as stream:
                            hasher = hashlib.sha256()
                            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                                hasher.update(chunk)
                            digest = hasher.hexdigest()
                        if context.get("sha256") != digest:
                            target.unlink(missing_ok=True)
                            raise ValueError("Bundle context checksum mismatch")
                        context["token"] = new_token
                        (folder / (new_token + ".json")).write_text(json.dumps(context), encoding="utf-8")
                        reference_remap[token] = new_token
                    except (KeyError, json.JSONDecodeError) as err:
                        raise ValueError("Bundle context is incomplete") from err
            # Extract assets and register them
            for info in zf.infolist():
                if info.filename.startswith("assets/") and not info.is_dir():
                    raw_filename = os.path.basename(info.filename)
                    out_path = dest_dir / raw_filename
                    with zf.open(info) as src, open(out_path, "wb") as dst:
                        shutil.copyfileobj(src, dst)

                    if self.asset_service:
                        # Register asset
                        rec = self.asset_service.register_asset(
                            str(out_path),
                            kind=("image" if raw_filename.lower().endswith((".png", ".jpg", ".jpeg", ".webp")) else
                                  "audio" if raw_filename.lower().endswith((".wav", ".mp3", ".flac", ".m4a")) else "video"),
                            original_name=raw_filename,
                            project_id=new_project_id
                        )
                        asset_remap[raw_filename] = rec
                        # Clean temp extracted file
                        out_path.unlink(missing_ok=True)

            for asset in manifest_data.get("assets", []):
                filename = pathlib.PurePosixPath(asset.get("server_path", "")).name
                if not filename and asset.get("asset_id"):
                    filename = next((name for name in asset_remap if name.startswith(asset["asset_id"] + ".")), "")
                rec = asset_remap.get(filename)
                if not rec:
                    raise ValueError("Bundle asset is missing its media payload")
                if asset.get("asset_id"):
                    reference_remap[asset["asset_id"]] = rec["asset_id"]
                if asset.get("server_path"):
                    reference_remap[asset["server_path"]] = rec["server_path"]
                asset.update(asset_id=rec["asset_id"], server_path=rec["server_path"], content_hash=rec["content_hash"])
            for take in manifest_data.get("takes", []):
                name = take.get("output_file")
                if not name:
                    continue
                if not name.startswith("takes/"):
                    raise ValueError("Bundle take lacks a portable payload")
                portable_name = name
                for old_token, new_token in reference_remap.items():
                    if re.fullmatch(r"[a-f0-9]{12}", old_token):
                        portable_name = portable_name.replace(old_token, new_token)
                media_name = pathlib.PurePosixPath(portable_name).name
                if not re.fullmatch(r"h3_studio_[a-f0-9]{12}[^/\\]*\.mp4", media_name):
                    raise ValueError("Bundle take is not managed H3 video")
                relative = f"lab_storage/imported_takes/{new_project_id}/{media_name}"
                target_root = self.output_root or self.storage_root.parent
                target = owned_path(target_root, relative, require_file=False)
                target.parent.mkdir(parents=True, exist_ok=True)
                try:
                    with zf.open(name) as source, target.open("wb") as dest:
                        shutil.copyfileobj(source, dest)
                except KeyError as err:
                    raise ValueError("Bundle take media is missing") from err
                take["output_file"] = relative
                owned_video(target_root, relative)
            def remap(value):
                if isinstance(value, dict):
                    return {key: remap(item) for key, item in value.items()}
                if isinstance(value, list):
                    return [remap(item) for item in value]
                return reference_remap.get(value, value) if isinstance(value, str) else value
            manifest_data = remap(manifest_data)
            self._write_manifest(new_project_id, manifest_data)
            return manifest_data

    def import_qwen_image(self, qwen_image_path: str, project_id: str,
                          as_role: str = "reference", alias: str = None) -> dict:
        """
        Copy and register a saved Qwen image as a project asset.
        Decoupled from original Qwen output file.
        """
        src = pathlib.Path(qwen_image_path).resolve()
        if not src.is_file():
            raise FileNotFoundError(f"Qwen image not found: {qwen_image_path}")

        if not self.asset_service:
            raise RuntimeError("AssetService required for Qwen image import")

        asset_record = self.asset_service.register_asset(
            str(src),
            kind="image",
            original_name=src.name,
            project_id=project_id,
            metadata={"source": "qwen_studio", "role": as_role}
        )

        project = self.get_project(project_id) if project_id else None
        if project:
            alias_name = alias or f"qwen_{src.stem[-4:]}"
            asset_entry = {
                "asset_id": asset_record["asset_id"],
                "alias": alias_name,
                "kind": "image",
                "role": as_role,
                "server_path": asset_record["server_path"],
                "content_hash": asset_record["content_hash"],
            }
            project.setdefault("assets", []).append(asset_entry)
            self.save_project(project_id, project, expected_revision=project.get("revision", 1))

        return asset_record


def re_id(val: str) -> bool:
    import re
    return bool(re.fullmatch(r"[0-9a-fA-F-]{8,64}", val))
