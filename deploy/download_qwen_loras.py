"""Install the explicitly selected optional Qwen Image 2.1 V2 adapter."""
import argparse
from pathlib import Path
import shutil
import urllib.request

from download_optional_loras import valid

NAME = 'NSFW-Qwen-by-TheseAlpacas-V2.safetensors'
URL = ('https://huggingface.co/mpasila/Qwen-Image-2.1-LoRAs/resolve/'
       '401c3423daed3d678eb7bb6477eb695ba0a01f4d/'
       'NSFW%20Qwen%20by%20TheseAlpacas%20V2.safetensors')
SHA256 = '83aba822ad8ee10a1e836828f5088259d93bce7b5f3419b46dbc0258c2be46a9'
SIZE = 79_744_352


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('comfy_root', type=Path)
    parser.add_argument('--offline-check', action='store_true')
    args = parser.parse_args()
    root = args.comfy_root.resolve()
    if not (root / 'main.py').is_file():
        parser.error('ComfyUI main.py not found')
    target = root / 'models' / 'loras' / 'qwen21' / NAME
    if valid(target, SHA256, SIZE):
        print('Verified:', target)
        return 0
    if args.offline_check:
        print('Missing or invalid:', target)
        return 1
    if target.exists():
        raise SystemExit('Existing adapter has an unexpected hash; preserve it before retrying.')
    target.parent.mkdir(parents=True, exist_ok=True)
    part = target.with_suffix('.part')
    with urllib.request.urlopen(URL, timeout=60) as response, part.open('wb') as output:
        shutil.copyfileobj(response, output, length=4 * 1024 * 1024)
    if not valid(part, SHA256, SIZE):
        raise SystemExit('Download failed size or SHA-256 verification; partial file preserved.')
    part.replace(target)
    print('Installed:', target)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
