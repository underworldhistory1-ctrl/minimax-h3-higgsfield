"""Reject edited optional-node sources without deleting user changes."""
from pathlib import Path
import subprocess
import sys


def assert_node_integrity(path, git="git", allow_runtime_patch=True):
    path = Path(path)
    def read(*args):
        return subprocess.check_output([str(git), "-C", str(path), *args])
    changed = read("diff", "HEAD", "--name-only", "-z").decode("utf-8").split("\0")
    for name in filter(None, changed):
        if allow_runtime_patch and path.name == "ComfyUI-MiniMax-H3-MotionCache" and name == "motion_cache.py":
            try:
                from .runtime_patches import patch_cache
            except ImportError:
                from runtime_patches import patch_cache
            original = read("show", "HEAD:motion_cache.py").decode("utf-8").replace("\r\n", "\n")
            target = path / name
            if not target.is_symlink() and target.is_file() and target.read_text(encoding="utf-8") == patch_cache(original):
                continue
        raise RuntimeError("Optional node has local edits; preserving them: " + str(path / name))
    # New executable files can change package imports without changing HEAD.
    for name in filter(None, read("ls-files", "--others", "-z").decode("utf-8").split("\0")):
        if Path(name).suffix.lower() in {".py", ".pyw", ".pyd", ".so", ".dll"}:
            raise RuntimeError("Optional node has untracked executable code; preserving it: " + str(path / name))


if __name__ == "__main__":
    assert_node_integrity(sys.argv[1], allow_runtime_patch="--no-runtime-patch" not in sys.argv[2:])
