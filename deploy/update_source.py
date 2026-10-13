"""Fetch official main before installing; preserve local edits and local commits."""
import subprocess
import json


def update_source(project, policy='notify', before_update=None):
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
    if policy not in ('notify', 'verified'):
        raise RuntimeError('Unknown source update policy')
    try:
        manifest = json.loads((project / 'deploy/compatibility.json').read_text(encoding='utf-8'))
    except (OSError, ValueError):
        manifest = {}
    if policy == 'notify' or target not in manifest.get('approved_source_commits', []):
        print('New source candidate ' + target[:12] + '; current checkout retained. Only manifest-approved commits may update automatically.')
        return False
    if subprocess.run(['git', '-C', str(project), 'merge-base', '--is-ancestor', before, target]).returncode:
        raise RuntimeError('Local commits diverge from official main; reconcile them or use --no-update.')
    if before_update is not None:
        before_update()
    # A named backup ref provides a reversible code-only rollback point.
    subprocess.run(['git', '-C', str(project), 'update-ref', 'refs/h3-launcher/previous-source', before], check=True)
    subprocess.run(['git', '-C', str(project), 'merge', '--ff-only', 'origin/main'], check=True)
    print('Updated H3 source to ' + target[:12])
    return True
