#!/usr/bin/env python3
"""Install the optional H3 LoRAs with pinned hashes; never guess at a failed download."""
import argparse
import hashlib
import pathlib
import shutil
import struct
import sys
import urllib.error
import urllib.request


LORAS = (
    (
        "Anime2Realsim__H3.safetensors",
        "https://huggingface.co/LiseTY/Minimax-H3-ref2v_Anime_2_Realism/resolve/33ee6502c125eea847aac14c49fecca43737ee40/Anime2Realsim__H3.safetensors",
        "bce58949e0983115bb9b7f2cf79f7474119ce2cedd845e4c565666fabfde2a3e",
        310168760,
    ),
    (
        "h3_character_swap_pro4500_1000.safetensors",
        "https://huggingface.co/akatz-ai/MiniMax-H3-Character-Swap-LoRA/resolve/a665bb7e3bb9804e487d2925f67744f554c8ad49/h3_character_swap_pro4500_1000.safetensors",
        "4b2a3f420ae804c0aa3422761ff84dbd1bf52eef6900ffab6d2e66df63cb4e79",
        155110320,
    ),
    (
        "Motion_Repair_V2.safetensors",
        "https://huggingface.co/JOKER141/MiniMax-H3-General-Motion-Continuity-Repair/resolve/8a5126beb17b7de5642ee056ff5a7b60ae0915c7/Motion_Repair_V2.safetensors",
        "edfa0e2858caeba7be9108883f61da8525d3c58af998c94ac7a449d9603d7574",
        155110272,
    ),
    (
        "h3-realism-people-t2v-i2v-r2v.safetensors",
        "https://huggingface.co/fal/MiniMax-H3-Realism-People-LoRA/resolve/039cc8579d7aa357a882d7f4111b25da4f72dccc/h3-realism-people-t2v-i2v-r2v.safetensors",
        "acc529601d2da117fb81179e76c56e488a3beab1171659d305f04fa3655b787e",
        131229656,
    ),
    (
        "H3_Combat_V2.safetensors",
        "https://huggingface.co/JOKER141/MiniMax-H3-Combat-Base-V2/resolve/main/H3_Combat_V2.safetensors",
        "5b3edb09e9d6029439badf9bc9db4ba4a355ae679b0810888de82c4793c0bac8",
        155110280,
    ),
)


def valid(path, digest, size):
    if not path.is_file() or path.stat().st_size != size:
        return False
    h = hashlib.sha256()
    with path.open("rb") as source:
        header = source.read(8)
        if len(header) != 8 or not 0 < struct.unpack("<Q", header)[0] < 100_000_000:
            return False
        source.seek(0)
        for block in iter(lambda: source.read(4 * 1024 * 1024), b""):
            h.update(block)
    return h.hexdigest() == digest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("comfy_root", type=pathlib.Path)
    parser.add_argument("--offline-check", action="store_true", help="Verify cached files without downloading or changing storage")
    parser.add_argument("--combat-file", type=pathlib.Path, help="Previously downloaded Combat V2 safetensors file")
    args = parser.parse_args()
    root = args.comfy_root.resolve()
    if not (root / "main.py").is_file():
        parser.error("ComfyUI main.py not found")
    target_dir = root / "models" / "loras"
    if args.offline_check:
        missing = [name for name, _, digest, size in LORAS if not valid(target_dir / name, digest, size)]
        if missing:
            print("Missing or invalid optional LoRAs: " + ", ".join(missing), file=sys.stderr)
        return int(bool(missing))
    target_dir.mkdir(parents=True, exist_ok=True)
    for name, url, digest, size in LORAS:
        target = target_dir / name
        if valid(target, digest, size):
            print("Verified existing:", target)
            continue
        if target.exists():
            raise SystemExit(f"Existing file has the wrong hash; move it aside before retrying: {target}")
        source_file = args.combat_file if name == "H3_Combat_V2.safetensors" else None
        part = target.with_name(target.name + ".part")
        try:
            if source_file:
                shutil.copyfile(source_file, part)
            else:
                request = urllib.request.Request(url, headers={"User-Agent": "H3-Studio/1.0"})
                with urllib.request.urlopen(request, timeout=60) as response, part.open("wb") as output:
                    shutil.copyfileobj(response, output, length=4 * 1024 * 1024)
            if not valid(part, digest, size):
                raise ValueError(f"Wrong size or SHA-256 for {name}")
            part.replace(target)
            print("Installed:", target)
        except (OSError, urllib.error.URLError, ValueError) as exc:
            print(f"Could not install {name}: {exc}", file=sys.stderr)
            print(f"Partial download preserved at {part}; retry after fixing access.", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
