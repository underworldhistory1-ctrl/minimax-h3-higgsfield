"""Install the pinned optional Turbo v4 weight and upstream nodes; never restart ComfyUI."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import urllib.request


def fetch(url, destination, expected_hash):
    if destination.exists():
        with destination.open('rb') as stream:
            if hashlib.file_digest(stream, 'sha256').hexdigest() == expected_hash:
                print('Verified existing:', destination.name)
                return
        raise RuntimeError('Existing file differs; preserve or move it before installing: ' + str(destination))
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = destination.with_suffix(destination.suffix + '.part')
    digest = hashlib.sha256()
    with urllib.request.urlopen(url, timeout=60) as response, partial.open('wb') as stream:
        while data := response.read(4 * 1024 * 1024):
            stream.write(data)
            digest.update(data)
    if digest.hexdigest() != expected_hash:
        raise RuntimeError('Download checksum mismatch: ' + destination.name)
    os.replace(partial, destination)
    print('Installed:', destination.name)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--comfy-root', type=Path, required=True)
    parser.add_argument('--references', action='store_true', help='Also install the documented LightX2V References8stepv1.0 adapter')
    args = parser.parse_args()
    manifest = json.loads(Path(__file__).with_name('turbo-v4.json').read_text(encoding='utf-8'))
    weight = manifest['weight']
    fetch(f"https://huggingface.co/{weight['repo']}/resolve/{weight['revision']}/{weight['filename']}", args.comfy_root / 'models/loras' / weight['filename'], weight['sha256'])
    if args.references:
        ref = manifest['reference_weight']
        fetch(f"https://huggingface.co/{ref['repo']}/resolve/{ref['revision']}/{ref['filename']}", args.comfy_root / 'models/loras' / ref['filename'], ref['sha256'])
    node = manifest['nodes']
    for filename, digest in node['files'].items():
        fetch(f"https://raw.githubusercontent.com/{node['repo']}/{node['revision']}/{filename}", args.comfy_root / 'custom_nodes/ComfyUI-MiniMax-H3-Turbo' / filename, digest)
    print('Restart the H3 worker only when its native queue and preparation work are empty. Select Turbo v4 EMA in Text or Frames.')


if __name__ == '__main__':
    main()
