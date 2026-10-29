"""Identify the H3 code loaded by a worker, independent of disk stage receipts."""
import hashlib
import gzip
import zlib
from pathlib import Path


def runtime_fingerprint(root):
    root = Path(root)
    files = [root / 'VERSION', *root.glob('*.py')]
    files += list((root / "h3_lab").glob("*.py"))
    files += [path for path in (root / "web").rglob("*") if path.suffix in (".js", ".html", ".css")]
    digest = hashlib.sha256()
    for path in sorted(set(files)):
        if path.is_file():
            digest.update(path.relative_to(root).as_posix().encode())
            data = path.read_bytes()
            digest.update(data.replace(b'\r\n', b'\n'))
            if path.suffix in ('.js', '.html', '.css'):
                compressed = path.with_name(path.name + '.gz')
                if compressed.exists():
                    try:
                        with gzip.open(compressed, 'rb') as stream:
                            matches = stream.read(len(data) + 1) == data
                    except (OSError, EOFError, zlib.error):
                        matches = False
                    if not matches:
                        digest.update(b'invalid-gzip:' + path.relative_to(root).as_posix().encode())
                # Official installers remove Brotli siblings. An unverified
                # encoded response must never inherit the source-file verdict.
                if path.with_name(path.name + '.br').exists():
                    digest.update(b'unverified-brotli:' + path.relative_to(root).as_posix().encode())
    return digest.hexdigest()
