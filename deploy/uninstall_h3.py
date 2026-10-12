#!/usr/bin/env python3
"""Preview or reversibly remove H3 Studio. Run with ComfyUI's Python."""
import argparse
import datetime
import importlib.util
import os
from pathlib import Path
import subprocess
import sys

from make_h3_landing import SCRIPT


def landing_script(source):
    for script in (SCRIPT, SCRIPT.replace("/extensions/h3_studio/", "/extensions/h3_studio_v2/")):
        if script in source:
            return script
    return ""



def linked(path):
    return path.is_symlink() or (hasattr(path, "is_junction") and path.is_junction())


def plan(root, frontend, landing_only=False):
    root = root.resolve(strict=True)
    if not (root / "main.py").is_file():
        raise ValueError("ComfyUI main.py not found")
    targets = []
    if not landing_only:
        nodes = root / "custom_nodes"
        if linked(nodes) or (nodes.exists() and nodes.resolve().parent != root):
            raise ValueError("custom_nodes must be a real directory inside ComfyUI")
        for name in ("h3_studio", "h3_studio_v2"):
            target = nodes / name
            if linked(target) or (target.exists() and target.resolve().parent != nodes.resolve()):
                raise ValueError("Refusing linked H3 directory: " + str(target))
            if target.exists():
                if not (target / "__init__.py").is_file() or not (target / "web" / "index.html").is_file():
                    raise ValueError("Unrecognized H3 installation: " + str(target))
                targets.append(target)
    source = frontend.read_text(encoding="utf-8")
    if 'id="h3-studio-landing"' in source and not landing_script(source):
        raise ValueError("Unrecognized H3 redirect; refusing to modify frontend")
    return targets, source


def apply_plan(root, frontend, targets, source):
    if frontend.read_text(encoding="utf-8") != source:
        raise ValueError("Frontend changed since preview; retry")
    archive = root / "h3-uninstall-backups"
    if linked(archive) or (archive.exists() and archive.resolve().parent != root):
        raise ValueError("Backup directory must stay inside ComfyUI")
    if not targets and not landing_script(source):
        print("H3 Studio is already removed; no changes needed.")
        return
    archive.mkdir(exist_ok=True)
    saved = archive / datetime.datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    saved.mkdir()
    moved = []
    try:
        if bool(landing_script(source)):
            (saved / "frontend-index.html").write_text(source, encoding="utf-8")
            temporary = saved / "frontend-updated.html"
            temporary.write_text(source.replace(landing_script(source), ""), encoding="utf-8")
        # Keep all extension-local project data and installation backups intact.
        for target in targets:
            target.rename(saved / target.name)
            moved.append(target)
        if bool(landing_script(source)):
            # The frontend may live on another volume, so stage beside it.
            import tempfile
            with tempfile.NamedTemporaryFile(dir=frontend.parent, prefix="h3-uninstall-", delete=False) as stream:
                staged = Path(stream.name)
                stream.write(temporary.read_bytes())
            try:
                os.replace(staged, frontend)
            finally:
                staged.unlink(missing_ok=True)
    except OSError:
        for target in reversed(moved):
            (saved / target.name).rename(target)
        raise
    print("Saved removed files at:", saved)
    print("Restart ComfyUI after the queue is empty. Models, outputs and shared nodes were retained.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--comfy-root", required=True, type=Path)
    parser.add_argument("--url", default="http://127.0.0.1:8188")
    parser.add_argument("--landing-only", action="store_true", help="Keep Studio; restore ComfyUI as the home page")
    parser.add_argument("--apply", action="store_true", help="Apply the previewed operations; default is preview only")
    args = parser.parse_args()
    spec = importlib.util.find_spec("comfyui_frontend_package")
    if not spec or not spec.origin:
        raise ValueError("Use ComfyUI's Python; frontend package not found")
    root = args.comfy_root.resolve(strict=True)
    frontend = Path(spec.origin).parent / "static" / "index.html"
    targets, source = plan(root, frontend, args.landing_only)
    for target in targets:
        print("Archive extension:", target)
    print("Remove H3 home-page redirect:", bool(landing_script(source)))
    print("Keep models, output videos, projects, shared nodes and Python dependencies.")
    if not args.apply:
        print("Preview only. Add --apply to execute.")
        return
    subprocess.run([sys.executable, str(Path(__file__).with_name("activate_h3.py")),
                    "check", "--url", args.url], check=True)
    apply_plan(root, frontend, targets, source)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, subprocess.CalledProcessError) as exc:
        print("H3_UNINSTALL_ERROR:", exc, file=sys.stderr)
        raise SystemExit(1)
