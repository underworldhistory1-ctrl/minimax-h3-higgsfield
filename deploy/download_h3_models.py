#!/usr/bin/env python3
"""Download the pinned H3 model set on Windows, reusing complete local files."""

import argparse
import hashlib
import json
import pathlib
import struct


MODEL_REPO = "Comfy-Org/MiniMax-H3"
MODEL_REVISION = "bf92c4091e333e69b8ca1998e0a669f15cb0832b"
MODELS = (
    ("diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors", 20970379616),
    ("text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors", 15687142551),
    ("vae/minimax_h3_video_vae_fp16.safetensors", 5207808496),
    ("vae/minimax_h3_audio_vae_fp32.safetensors", 605254808),
    ("diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors", 20970379616),
)
TURBO_REPO = "silveroxides/MiniMax-H3_tests"
TURBO_REVISION = "e71f383b8b520c13388edb6d7c405803db3c357d"
TURBO_FILE = "experimental/minimax_h3_fl2v_lightx2v_turbo_4to8step_v0.1-v1.0_768p_v4_step600_dareties.safetensors"
TURBO_SIZE = 2116726792
TURBO_SHA256 = "e14c9e78834f5fac9195cb022baf2bc83372140da5142a8c999a1f568cb4915d"


def valid_safetensors(path: pathlib.Path, expected_size: int) -> bool:
    try:
        if path.stat().st_size != expected_size:
            return False
        with path.open("rb") as stream:
            header_size = struct.unpack("<Q", stream.read(8))[0]
            if not 0 < header_size < 100_000_000:
                return False
            header = json.loads(stream.read(header_size))
        offsets = [value["data_offsets"][1] for key, value in header.items()
                   if key != "__metadata__"]
        return bool(offsets) and 8 + header_size + max(offsets) == expected_size
    except (OSError, ValueError, KeyError, IndexError, TypeError, struct.error):
        return False


def valid_turbo(path: pathlib.Path) -> bool:
    try:
        if path.stat().st_size != TURBO_SIZE:
            return False
        digest = hashlib.sha256()
        with path.open("rb") as stream:
            for block in iter(lambda: stream.read(4 * 1024 * 1024), b""):
                digest.update(block)
        return digest.hexdigest() == TURBO_SHA256
    except OSError:
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("comfy_root", type=pathlib.Path)
    parser.add_argument("--without-speed-lora", action="store_true")
    parser.add_argument("--offline-check", action="store_true")
    args = parser.parse_args()
    root = args.comfy_root.resolve()
    if not (root / "main.py").is_file():
        parser.error("ComfyUI main.py not found")
    if not args.offline_check:
        from huggingface_hub import hf_hub_download
    models_dir = root / "models"
    for name, size in MODELS:
        target = models_dir / pathlib.Path(name)
        target.parent.mkdir(parents=True, exist_ok=True)
        if valid_safetensors(target, size):
            print("Verified cached model:", name, flush=True)
            continue
        if args.offline_check:
            raise RuntimeError("Missing or invalid cached model: " + name)
        print("Downloading/reusing:", name, flush=True)
        hf_hub_download(repo_id=MODEL_REPO, filename=name, revision=MODEL_REVISION,
                        local_dir=models_dir, force_download=target.exists())
        if not valid_safetensors(target, size):
            raise RuntimeError("Incomplete or malformed model: " + str(target))
    print("All requested H3 weights are ready.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError) as exc:
        raise SystemExit("H3_MODEL_ERROR: " + str(exc)) from exc
