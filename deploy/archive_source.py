"""Promote archive launches to a separate persistent official source checkout."""
import json
import hashlib
from pathlib import Path
import re
import subprocess
import tempfile

OFFICIAL_SOURCE = 'https://github.com/underworldhistory1-ctrl/minimax-h3-interface.git'


def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args], text=True,
                                   encoding='utf-8', stderr=subprocess.PIPE, timeout=120).strip()


def validate_checkout(target):
    if (not (target / '.git').is_dir()
            or git(target, 'remote', 'get-url', 'origin') not in {OFFICIAL_SOURCE, 'https://github.com/underworldhistory1-ctrl/minimax-h3-higgsfield.git'}
            or git(target, 'branch', '--show-current') != 'main'
            or git(target, 'status', '--porcelain', '--untracked-files=no')):
        raise RuntimeError('The persistent H3 source is unrecognized or customized; it was preserved. Review it or use --no-update for the original archive.')
    if not (target / 'deploy/launcher.py').is_file():
        raise RuntimeError('The persistent source has no launcher; existing files were preserved')


def prepare_checkout(root, runner):
    """Caller holds the root installation lock; never overwrite an existing path."""
    directory = Path(root) / '.h3-launcher'
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / 'source'
    if target.exists() or target.is_symlink():
        validate_checkout(target)
        return target
    # Only this newly created staging directory may be cleaned on failure.
    with tempfile.TemporaryDirectory(prefix='source-clone-', dir=directory) as scratch:
        stage = Path(scratch) / 'checkout'
        runner.run(['git', 'init', '-q', stage])
        runner.run(['git', '-C', stage, 'remote', 'add', 'origin', OFFICIAL_SOURCE])
        runner.run(['git', '-C', stage, 'fetch', '--filter=blob:none', 'origin', 'main'])
        runner.run(['git', '-C', stage, 'checkout', '-b', 'main', '--track', 'origin/main'])
        validate_checkout(stage)
        if target.exists() or target.is_symlink():
            raise RuntimeError('Persistent source appeared during preparation; it was not replaced')
        stage.rename(target)
    return target


def archive_files(project):
    return {path.relative_to(project).as_posix(): path for path in Path(project).rglob('*')
            if path.is_file() and path.name != '.h3-archive.json'
            and '__pycache__' not in path.parts and path.suffix != '.pyc'}


def validate_plain_archive(project, target):
    # Compute archive blobs once, then recognize an official ancestor. Comparing
    # only latest HEAD would reject a genuine ZIP as soon as main advances.
    actual = archive_files(Path(project))
    blobs = {}
    for name, path in actual.items():
        if path.is_symlink():
            raise RuntimeError('Unproven source archive contains a symlink; use a Git checkout')
        data = path.read_bytes()
        variants = [data]
        # Git for Windows may export CRLF for text with uncommon suffixes,
        # including nginx.conf.template. Keep raw blobs valid too.
        if b'\0' not in data:
            variants.append(data.replace(b'\r\n', b'\n'))
        blobs[name] = {hashlib.sha1(b'blob ' + str(len(value)).encode() + b'\0' + value).hexdigest()
                       for value in variants}
    # Bound work for untrusted/custom archives. Published packages use their
    # exact ancestry receipt and do not need this historical-tree search.
    candidates = git(target, 'rev-list', '--max-count=512', 'HEAD').splitlines()
    for commit in candidates:
        entries = git(target, 'ls-tree', '-r', '-z', '--full-tree', commit).split('\0')
        expected = {}
        for entry in filter(None, entries):
            header, name = entry.split('\t', 1)
            mode, kind, digest = header.split()
            if kind != 'blob' or mode not in ('100644', '100755'):
                break
            expected[name] = digest
        else:
            if set(expected) == set(blobs) and all(expected[name] in blobs[name] for name in expected):
                return commit
    raise RuntimeError('Archive does not match a recognized official ancestor. Use a fresh Git checkout or --no-update; the archive was preserved.')


def validate_archive_version(project, target):
    def version(path):
        value = (path / 'VERSION').read_text(encoding='utf-8').strip()
        if not re.fullmatch(r'\d+\.\d+\.\d+', value):
            raise RuntimeError('Cannot compare archive/source release versions safely')
        return tuple(map(int, value.split('.')))
    if version(Path(target)) < version(Path(project)):
        raise RuntimeError('This archive is newer than official main. Publish it first or use --no-update; no older launcher was executed.')
    # Packaged provenance prevents equal-version unpublished code being discarded.
    receipt = Path(project) / '.h3-archive.json'
    if receipt.is_file():
        record = json.loads(receipt.read_text(encoding='utf-8'))
        if not isinstance(record, dict):
            raise RuntimeError('Invalid archive provenance; no source was executed')
        commit = record.get('source_commit')
        files = record.get('files', {})
        if not isinstance(files, dict) or not files or len(files) > 10000:
            raise RuntimeError('Invalid archive file manifest; no source was executed')
        base = Path(project).resolve()
        if files and set(archive_files(base)) != set(files):
            raise RuntimeError('Archive has added or removed files; use --no-update for customized source')
        for name, expected in files.items():
            path = (base / name).resolve()
            if (not path.is_relative_to(base) or not path.is_file()
                    or hashlib.sha256(path.read_bytes()).hexdigest() != expected):
                raise RuntimeError('Archive has local changes: ' + name + '. Preserve them or use --no-update; no official source was executed.')
        if not isinstance(commit, str) or not re.fullmatch(r'[0-9a-f]{40}', commit):
            raise RuntimeError('Invalid archive provenance; no source was executed')
        proof = subprocess.run(['git', '-C', str(target), 'merge-base', '--is-ancestor',
                                commit, 'HEAD'], capture_output=True, timeout=120)
        if proof.returncode:
            raise RuntimeError('Official main does not contain this archive revision. Use --no-update for the preserved archive; no older code was executed.')

    else:
        validate_plain_archive(project, target)
