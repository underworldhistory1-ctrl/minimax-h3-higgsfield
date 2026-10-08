#!/usr/bin/env python3
"""Opt-in installation of verified native MiniMax H3 ControlNet 2.0 weights."""
import argparse
import pathlib
import shutil
import urllib.request
try:
    from .download_optional_loras import valid
except ImportError:
    from download_optional_loras import valid

MODEL_NAME = 'minimax_h3_fun_controlnet_union_2.0_pruned_int8_convrot.safetensors'
MODEL_REVISION = 'e5eb578a89295337b8ff433a035929ce0279e0b6'
MODEL_SHA256 = '890af58bb350f0c2f6c409b1c67ea8f4196654297d037769b72de1e6f504c612'
MODEL_SIZE = 4531220608
MODEL_URL = f'https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/{MODEL_REVISION}/model_patches/{MODEL_NAME}'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('comfy_root', type=pathlib.Path)
    parser.add_argument('--offline-check', action='store_true')
    args = parser.parse_args()
    root = args.comfy_root.resolve()
    if not (root / 'main.py').is_file():
        parser.error('ComfyUI main.py not found')
    target = root / 'models' / 'model_patches' / MODEL_NAME
    if valid(target, MODEL_SHA256, MODEL_SIZE):
        print('Verified existing:', target)
        return 0
    if args.offline_check:
        return 1
    if target.exists():
        raise SystemExit(f'Existing ControlNet file failed verification; move aside: {target}')
    target.parent.mkdir(parents=True, exist_ok=True)
    part = target.with_name(target.name + '.part')
    with urllib.request.urlopen(urllib.request.Request(MODEL_URL, headers={'User-Agent': 'H3-Studio/2.0'}), timeout=60) as response, part.open('wb') as output:
        shutil.copyfileobj(response, output, 4 * 1024 * 1024)
    if not valid(part, MODEL_SHA256, MODEL_SIZE):
        raise SystemExit(f'ControlNet download failed size/SHA-256 verification: {part}')
    part.replace(target)
    print('Installed:', target)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
