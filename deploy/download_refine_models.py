#!/usr/bin/env python3
"""Opt-in installation of verified MiniMax H3 latent-refine upscaler weights."""
import argparse
import pathlib
import shutil
import urllib.request
try:
    from .download_optional_loras import valid
except ImportError:
    from download_optional_loras import valid

MODEL_NAME = 'minimax_h3_latent_upscaler_3d_conv_v1_fp16.safetensors'
MODEL_REVISION = '3f941d5d182014dd5c0a5e16330420ee2d4aa0c6'
MODEL_SHA256 = '043e5a48e161610ef6c3ea974645220354d06fa618abca15f76d084812eb55c2'
MODEL_SIZE = 690592672
MODEL_URL = f'https://huggingface.co/LBH-123-AI/Minimax_h3_latent_Upscaler/resolve/{MODEL_REVISION}/minimax_h3_latent_upscaler_3d_conv_v1/{MODEL_NAME}'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('comfy_root', type=pathlib.Path)
    parser.add_argument('--offline-check', action='store_true')
    args = parser.parse_args()
    root = args.comfy_root.resolve()
    if not (root / 'main.py').is_file():
        parser.error('ComfyUI main.py not found')
    target = root / 'models' / 'latent_upscale_models' / MODEL_NAME
    if valid(target, MODEL_SHA256, MODEL_SIZE):
        print('Verified existing:', target)
        return 0
    if args.offline_check:
        return 1
    if target.exists():
        raise SystemExit(f'Existing Refine file failed verification; move aside: {target}')
    target.parent.mkdir(parents=True, exist_ok=True)
    part = target.with_name(target.name + '.part')
    with urllib.request.urlopen(urllib.request.Request(MODEL_URL, headers={'User-Agent': 'H3-Studio/2.0'}), timeout=60) as response, part.open('wb') as output:
        shutil.copyfileobj(response, output, 4 * 1024 * 1024)
    if not valid(part, MODEL_SHA256, MODEL_SIZE):
        raise SystemExit(f'Refine download failed size/SHA-256 verification: {part}')
    part.replace(target)
    print('Installed:', target)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
