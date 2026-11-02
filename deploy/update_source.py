"""Fetch official main before installing; preserve local edits and local commits."""
import subprocess
import json
import os
import threading
from pathlib import Path


_LOCKS = {}


class SourceLock:
    """Serialize source readers/updaters across Comfy roots and linked worktrees."""
    def __init__(self, project):
        marker = Path(project) / ".git"
        if marker.is_file():
            text = marker.read_text(encoding="utf-8").strip()
            if not text.startswith("gitdir: "):
                raise RuntimeError("Unrecognized Git worktree metadata")
            marker = (Path(project) / text[8:]).resolve()
        common = marker / "commondir"
        if common.is_file():
            marker = (marker / common.read_text().strip()).resolve()
        self.path = marker / "h3-source.lock" if marker.is_dir() else None
        self.owner = (os.getpid(), threading.get_ident())

    def __enter__(self):
        if self.path is None:
            return self
        key = str(self.path.resolve())
        held = _LOCKS.get(key)
        if held and held[0] == self.owner:
            held[2] += 1
            return self
        try:
            from .launcher import InstallLock
        except ImportError:
            from launcher import InstallLock
        lock = InstallLock(self.path)
        lock.__enter__()
        _LOCKS[key] = [self.owner, lock, 1]
        return self

    def __exit__(self, *error):
        if self.path is None:
            return
        key = str(self.path.resolve())
        held = _LOCKS[key]
        held[2] -= 1
        if held[2] == 0:
            del _LOCKS[key]
            held[1].__exit__(*error)


def update_source(project, policy="latest", before_update=None):
    with SourceLock(project):
        return _update_source(project, policy, before_update)


def _update_source(project, policy='latest', before_update=None):
    if not (project / '.git').exists():
        print('Source archive: download the latest archive for updates, or use a Git clone.')
        return False

    def git(*args):
        return subprocess.check_output(['git', '-C', str(project), *args], text=True).strip()

    accepted = {'https://github.com/underworldhistory1-ctrl/minimax-h3-higgsfield',
                'https://github.com/underworldhistory1-ctrl/minimax-h3-higgsfield.git',
                'git@github.com:underworldhistory1-ctrl/minimax-h3-higgsfield.git'}
    if git('remote', 'get-url', 'origin') not in accepted or git('branch', '--show-current') != 'main':
        raise RuntimeError('Automatic updates require official origin and main; use --no-update for a custom checkout.')
    if git('status', '--porcelain', '--untracked-files=no'):
        raise RuntimeError('Source has local edits. Preserve/commit them, or use --no-update; nothing was overwritten.')
    subprocess.run(['git', '-C', str(project), 'fetch', 'origin', 'main'], check=True)
    before, target = git('rev-parse', 'HEAD'), git('rev-parse', 'origin/main')
    if before == target:
        return False
    if policy not in ('latest', 'notify', 'verified'):
        raise RuntimeError('Unknown source update policy')
    try:
        manifest = json.loads((project / 'deploy/compatibility.json').read_text(encoding='utf-8'))
    except (OSError, ValueError):
        manifest = {}
    if policy == 'notify' or policy == 'verified' and target not in manifest.get('approved_source_commits', []):
        print('New source candidate ' + target[:12] + '; current checkout retained. Only manifest-approved commits may update automatically.')
        return False
    if subprocess.run(['git', '-C', str(project), 'merge-base', '--is-ancestor', before, target]).returncode:
        raise RuntimeError('Local commits diverge from official main; reconcile them or use --no-update.')
    if before_update is not None:
        before_update()
    if git('rev-parse', 'HEAD') != before or git('status', '--porcelain', '--untracked-files=no'):
        raise RuntimeError('Source changed during update preparation; no merge was attempted')
    # A named backup ref provides a reversible code-only rollback point.
    subprocess.run(['git', '-C', str(project), 'update-ref', 'refs/h3-launcher/previous-source', before], check=True)
    subprocess.run(['git', '-C', str(project), 'merge', '--ff-only', target], check=True)
    print('Updated H3 source to ' + target[:12])
    return True
