"""Identify the H3 code loaded by a worker, independent of disk stage receipts."""
import hashlib
from pathlib import Path


def runtime_fingerprint(root):
    root = Path(root)
    files = [root / name for name in ("__init__.py", "h3_video_save.py", "h3_continuation.py", "h3_queue_bridge.py", "h3_shared_gpu.py", "h3_turbo.py", "qwen_image.py", "promptwriter.py")]
    files += list((root / "h3_lab").glob("*.py"))
    files += [path for path in (root / "web").rglob("*") if path.suffix in (".js", ".html", ".css")]
    digest = hashlib.sha256()
    for path in sorted(set(files)):
        if path.is_file():
            digest.update(path.relative_to(root).as_posix().encode())
            digest.update(path.read_bytes())
    return digest.hexdigest()
