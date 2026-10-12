"""Fetch official main before installing; preserve local edits and local commits."""
import subprocess


def update_source(project):
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
    if subprocess.run(['git', '-C', str(project), 'merge-base', '--is-ancestor', before, target]).returncode:
        raise RuntimeError('Local commits diverge from official main; reconcile them or use --no-update.')
    subprocess.run(['git', '-C', str(project), 'merge', '--ff-only', 'origin/main'], check=True)
    print('Updated H3 source to ' + target[:12])
    return True
