#!/usr/bin/env python3
"""Install optional dependencies without replacing the running CUDA stack."""
import argparse
import importlib.metadata
from pathlib import Path
import subprocess
import sys
import tempfile

CUDA_PROBE = ("import torch; assert torch.cuda.is_available(), 'CUDA is unavailable'; "
              "x=torch.ones((8,8),device='cuda'); "
              "assert float((x@x).sum().cpu()) == 512.0; torch.cuda.synchronize()")
STACK = ("torch", "torchvision", "torchaudio")


def stack_versions():
    result = {}
    for name in STACK:
        try:
            result[name] = importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            pass
    if "torch" not in result:
        raise RuntimeError("Prepare CUDA PyTorch before installing optional dependencies")
    return result


def validate_cuda():
    subprocess.run([sys.executable, "-c", CUDA_PROBE], check=True)


def install(requirements):
    requirements = Path(requirements).resolve(strict=True)
    validate_cuda()
    before = stack_versions()
    with tempfile.TemporaryDirectory(prefix="h3-optional-constraints-") as directory:
        constraint = Path(directory) / "cuda-stack.txt"
        constraint.write_text("".join(f"{name}=={version}\n" for name, version in before.items()), encoding="utf-8")
        # Explicit -c supplements existing PIP_CONSTRAINT rather than replacing it.
        subprocess.run([sys.executable, "-m", "pip", "install", "-c", str(constraint),
                        "-r", str(requirements)], check=True)
    after = stack_versions()
    if any(after.get(name) != version for name, version in before.items()):
        raise RuntimeError("Optional dependency installation changed the CUDA stack; server was not started")
    validate_cuda()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("-r", "--requirements", required=True)
    args = parser.parse_args()
    install(args.requirements)


if __name__ == "__main__":
    main()
