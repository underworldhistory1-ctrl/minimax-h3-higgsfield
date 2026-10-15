"""Code-only UI update. Never installs models, dependencies, or starts ComfyUI."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys


def compatibility_requires_launcher(before, after):
    """Ignore documented evidence metadata; unknown/schema/pin changes fail closed."""
    metadata = {'project_version', 'audit_date', 'evidence', 'gpu_evidence', 'status'}

    def requirements(value):
        if isinstance(value, dict):
            return {key: requirements(item) for key, item in value.items() if key not in metadata}
        if isinstance(value, list):
            return [requirements(item) for item in value]
        return value

    try:
        before, after = json.loads(before), json.loads(after)
        if not isinstance(before, dict) or not isinstance(after, dict):
            return True
    except (ValueError, TypeError):
        return True
    return requirements(before) != requirements(after)


def complete_recovery(root, state):
    """Reopen admission only after the full launcher's verified API restart."""
    if not state.get('files_prepared') or not state.get('api_ready'):
        return
    root = Path(root)
    record = root / '.h3-launcher/ui-update.json'
    if not record.is_file():
        return
    try:
        receipt = json.loads((root / '.h3-launcher/source.json').read_text(encoding='utf-8'))
        revision = receipt['installed_commit']
        if not re.fullmatch('[0-9a-f]{40}', revision):
            return
    except (OSError, ValueError, KeyError, TypeError):
        return
    temporary = record.with_suffix('.tmp')
    temporary.write_text(json.dumps({'state': 'completed', 'target': revision}), encoding='utf-8')
    os.replace(temporary, record)


def code_only_update(root, target, staged=False):
    if not isinstance(target, str) or not re.fullmatch('[0-9a-f]{40}', target):
        raise RuntimeError('A checked full commit revision is required')
    try:
        from . import launcher, install_windows
    except ImportError:
        import launcher
        import install_windows
    root = Path(root).resolve()
    source = launcher.PROJECT.resolve()
    try:
        receipt = json.loads((root / '.h3-launcher/source.json').read_text(encoding='utf-8'))
        if (Path(receipt['source_root']).resolve() != source or
                Path(receipt['comfy_root']).resolve() != root or
                Path(receipt['runtime_root']).resolve() != launcher.runtime_target(root).resolve()):
            raise ValueError()
        state = json.loads((root / '.h3-launcher/ui-update.json').read_text(encoding='utf-8'))
        if state.get('state') != 'running' or state.get('target') != target:
            raise ValueError()
    except (OSError, KeyError, ValueError, TypeError):
        raise RuntimeError('UI updates require a verified installation receipt and active server admission barrier') from None

    def git(*args):
        return subprocess.check_output(['git', '-C', str(source), *args], text=True, timeout=60).strip()

    accepted = {'https://github.com/underworldhistory1-ctrl/minimax-h3-higgsfield',
                'https://github.com/underworldhistory1-ctrl/minimax-h3-higgsfield.git',
                'git@github.com:underworldhistory1-ctrl/minimax-h3-higgsfield.git'}
    if git('remote', 'get-url', 'origin') not in accepted or git('branch', '--show-current') != 'main' or git('status', '--porcelain'):
        raise RuntimeError('UI update requires clean official main; customized source was preserved')
    with launcher.InstallLock(root / '.h3-launcher.lock'):
        before = git('rev-parse', 'HEAD')
        if not staged:
            if before != receipt.get('installed_commit'):
                raise RuntimeError('Source differs from the installed receipt; use the launcher for recovery')
            git('fetch', 'https://github.com/underworldhistory1-ctrl/minimax-h3-higgsfield.git', 'refs/heads/main')
            if git('rev-parse', 'FETCH_HEAD') != target:
                raise RuntimeError('Official main changed since checking; check again before installation')
            if subprocess.run(['git', '-C', str(source), 'merge-base', '--is-ancestor', before, target]).returncode:
                raise RuntimeError('Source diverges from official main; local commits were preserved')
            # Dependency/bootstrap changes require the full launcher. A UI update
            # cannot silently install packages, models or change pinned nodes.
            changed = git('diff', '--name-only', before, target).splitlines()
            guarded = ('requirements', 'deploy/bootstrap', 'deploy/runtime_patches')
            compatibility_changed = 'deploy/compatibility.json' in changed and compatibility_requires_launcher(
                git('show', before + ':deploy/compatibility.json'),
                git('show', target + ':deploy/compatibility.json'))
            if any(name.startswith(guarded) for name in changed) or compatibility_changed:
                raise RuntimeError('This update changes runtime dependencies. Run the full launcher while idle instead.')
            launcher.protect_runtime_edits(root)
            launcher.runtime_snapshot(root, root / '.h3-launcher')
            git('update-ref', 'refs/h3-launcher/previous-source', before)
            git('merge', '--ff-only', target)
        elif before != target:
            raise RuntimeError('Staged source no longer matches the checked revision')
        if staged:
            launcher.protect_runtime_edits(root)
            install_windows.copy_runtime(root)
            # Linux-only shell runtime files are also part of runtime_matches.
            if os.name != 'nt':
                import shutil
                for name in ('deploy/download_h3_models.sh', 'deploy/bootstrap_h3_server.sh'):
                    destination = launcher.runtime_target(root) / name
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(source / name, destination)
            if not launcher.runtime_matches(root):
                raise RuntimeError('Runtime copy verification failed; recover with the launcher before restarting')
            launcher.write_source_receipt(root)
            print('Code installed. Restart ComfyUI manually. No models, dependencies or GPU jobs were changed.', flush=True)
            return 0
    # Reload updated launcher modules and its runtime manifest before copying.
    os.execv(sys.executable, [sys.executable, str(source / 'deploy/launcher.py'),
             '--comfy-root', str(root), '--ui-update', target, '--ui-update-staged',
             '--no-update', '--skip-smoke', '--no-start'])
