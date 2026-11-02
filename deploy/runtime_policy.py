"""Shared, reproducible runtime policy for every supported installer."""
import argparse
import ast
import datetime
import json
from pathlib import Path
import re
import subprocess

PROJECT = Path(__file__).resolve().parents[1]
POLICY = json.loads((PROJECT / 'deploy/compatibility.json').read_text(encoding='utf-8'))
COMFY_REVISION = POLICY['comfyui_commit']
COMFY_VERSION = POLICY['comfyui_version']
COMFY_ORIGINS = {
    'https://github.com/Comfy-Org/ComfyUI.git',
    'https://github.com/Comfy-Org/ComfyUI',
    'git@github.com:Comfy-Org/ComfyUI.git',
}
DEFAULT_ATTENTION = 'ck-int8'
if not re.fullmatch(r'[0-9a-f]{40}', COMFY_REVISION):
    raise RuntimeError('The ComfyUI compatibility pin must be a full commit SHA')


def attention_flag(backend=DEFAULT_ATTENTION):
    try:
        return {'ck-int8': '--use-ck-attention', 'pytorch': '--use-pytorch-cross-attention'}[backend]
    except KeyError:
        raise ValueError('Unknown attention backend: ' + str(backend)) from None


def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args], text=True,
                                   encoding='utf-8', stderr=subprocess.PIPE, timeout=120).strip()


def core_current(root):
    root = Path(root)
    try:
        if (root / '.git').exists():
            return git(root, 'rev-parse', 'HEAD') == COMFY_REVISION
        tree = ast.parse((root / 'comfyui_version.py').read_text(encoding='utf-8'))
        return any(isinstance(node, ast.Assign) and any(
            isinstance(name, ast.Name) and name.id == '__version__' for name in node.targets)
            and isinstance(node.value, ast.Constant) and node.value.value == COMFY_VERSION
            for node in tree.body)
    except (OSError, SyntaxError, subprocess.SubprocessError):
        return False


def ensure_core(root):
    """Upgrade only a clean official core or exactly recognized H3 patch output.

    A marker is never sufficient to establish ownership of a local modification.
    Back up the prior revision and managed edits before changing any tracked file.
    Git's ordinary checkout retains its protection of conflicting untracked files.
    """
    root = Path(root)
    if core_current(root):
        return False
    if not (root / '.git').exists():
        raise RuntimeError('ComfyUI Portable needs the official update to ' + COMFY_VERSION +
                           '; no Git checkout was found. Existing files were preserved.')
    if git(root, 'remote', 'get-url', 'origin') not in COMFY_ORIGINS:
        raise RuntimeError('Unexpected ComfyUI origin; existing files were preserved')
    before = git(root, 'rev-parse', 'HEAD')
    if git(root, 'diff', '--cached', '--name-only'):
        raise RuntimeError('ComfyUI has staged local edits; preserve/reconcile them before updating')
    try:
        from .runtime_patches import patch_model, patch_navigation
    except ImportError:
        from runtime_patches import patch_model, patch_navigation
    transforms = {'comfy/ldm/minimax/model.py': patch_model, 'server.py': patch_navigation}
    changes = git(root, 'diff', '--name-only', '-z', 'HEAD').split('\0')
    originals = {}
    for name in filter(None, changes):
        try:
            current = (root / name).read_bytes()
            base = git(root, 'show', 'HEAD:' + name) + '\n'
            transform = transforms[name]
            expected = transform(base).replace('\r\n', '\n').rstrip('\n')
            if current.decode('utf-8').replace('\r\n', '\n').rstrip('\n') != expected:
                raise ValueError()
            originals[name] = current
        except (KeyError, ValueError, OSError, StopIteration, RuntimeError):
            raise RuntimeError('ComfyUI has unrecognized local/custom edits: ' + name +
                               '. No tracked files were changed.') from None
    git(root, 'fetch', '--depth', '1', 'origin', COMFY_REVISION)
    if git(root, 'rev-parse', 'FETCH_HEAD') != COMFY_REVISION:
        raise RuntimeError('Fetched ComfyUI revision does not match the compatibility pin')
    # Recheck after the network operation; never overwrite an edit made meanwhile.
    if git(root, 'rev-parse', 'HEAD') != before or git(root, 'diff', '--cached', '--name-only'):
        raise RuntimeError('ComfyUI changed during update preparation; rerun after preserving local work')
    if set(filter(None, git(root, 'diff', '--name-only', '-z', 'HEAD').split('\0'))) != set(originals):
        raise RuntimeError('ComfyUI local changes changed during update preparation')
    if any((root / name).read_bytes() != data for name, data in originals.items()):
        raise RuntimeError('ComfyUI local edits changed during update preparation')
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    backup = root / '.h3-launcher/backups' / ('core-' + stamp)
    backup.mkdir(parents=True)
    for name, data in originals.items():
        path = backup / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    record = root / '.h3-launcher/core-upgrade.json'
    def receipt(state):
        temporary = record.with_suffix('.tmp')
        temporary.write_text(json.dumps({'before': before, 'target': COMFY_REVISION,
            'backup': str(backup.absolute()), 'state': state}), encoding='utf-8')
        temporary.replace(record)
    receipt('prepared')
    git(root, 'update-ref', 'refs/h3-launcher/previous-comfy', before)
    try:
        if originals:
            git(root, 'restore', '--worktree', '--source=HEAD', '--', *originals)
        git(root, 'checkout', '--detach', COMFY_REVISION)
    except subprocess.SubprocessError:
        # Restore only our captured managed patches when HEAD demonstrably stayed put.
        if git(root, 'rev-parse', 'HEAD') == before:
            for name, data in originals.items():
                (root / name).write_bytes(data)
        receipt('needs_action')
        raise
    if not core_current(root):
        receipt('needs_action')
        raise RuntimeError('ComfyUI did not reach its exact compatibility pin; server was not started')
    receipt('completed')
    return True


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--comfy-root', type=Path)
    parser.add_argument('--revision', action='store_true')
    parser.add_argument('--attention-flag', choices=('ck-int8', 'pytorch'))
    args = parser.parse_args()
    if args.revision:
        print(COMFY_REVISION)
    elif args.attention_flag:
        print(attention_flag(args.attention_flag))
    elif args.comfy_root:
        print('ComfyUI core updated:', ensure_core(args.comfy_root))
    else:
        parser.error('Select --revision, --attention-flag, or --comfy-root')
