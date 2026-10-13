#!/usr/bin/env bash
# Download only the files referenced by the local H3 baseline T2V workflows.
# Hugging Face downloads resume and the final model files live in ComfyUI/models.
set -Eeuo pipefail

usage() { echo "Usage: download_h3_models.sh /path/to/ComfyUI [--t2v-only] [--with-speed-lora] [--offline-check]"; }
COMFY_ROOT=""
WITH_REF2VA=1
WITH_SPEED_LORA=0
OFFLINE_CHECK=0
while (($#)); do
    case "$1" in
        -h|--help) usage; exit 0 ;;
        --with-ref2va) WITH_REF2VA=1; shift ;;
        --t2v-only) WITH_REF2VA=0; shift ;;
        --with-speed-lora) WITH_SPEED_LORA=1; shift ;;
        --offline-check) OFFLINE_CHECK=1; shift ;;
        -*) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
        *)
            if [[ -n "$COMFY_ROOT" ]]; then echo "Only one ComfyUI path is allowed." >&2; usage >&2; exit 2; fi
            COMFY_ROOT="$1"; shift ;;
    esac
done

[[ -n "$COMFY_ROOT" ]] || { usage >&2; exit 2; }
COMFY_ROOT="$(cd "$COMFY_ROOT" && pwd)"
[[ -f "$COMFY_ROOT/main.py" ]] || { echo "Not a ComfyUI directory: $COMFY_ROOT" >&2; exit 1; }

PYTHON="${COMFY_PYTHON:-}"
if [[ -z "$PYTHON" || ! -x "$PYTHON" ]]; then
    if [[ -x "$COMFY_ROOT/.venv/bin/python" ]]; then
        PYTHON="$COMFY_ROOT/.venv/bin/python"
    elif [[ -x "$COMFY_ROOT/venv/bin/python" ]]; then
        PYTHON="$COMFY_ROOT/venv/bin/python"
    else
        PYTHON="$(command -v python3 || true)"
    fi
fi
[[ -n "$PYTHON" ]] || { echo "Python 3 is required to validate H3 models." >&2; exit 1; }

# A cached model is reused without contacting Hugging Face if its file size
# and safetensors offsets match the pinned artifact. This makes attached
# persistent model disks quick to provision again.
valid_model() {
    "$PYTHON" - "$1" "$2" <<'PY'
import json, os, struct, sys
path, expected = sys.argv[1], int(sys.argv[2])
try:
    if os.path.getsize(path) != expected:
        raise ValueError("wrong length")
    with open(path, "rb") as stream:
        head = stream.read(8)
        header_size = struct.unpack("<Q", head)[0]
        if not 0 < header_size < 100_000_000:
            raise ValueError("bad header length")
        header = json.loads(stream.read(header_size))
    offsets = [value["data_offsets"][1] for key, value in header.items() if key != "__metadata__"]
    if not offsets or 8 + header_size + max(offsets) != expected:
        raise ValueError("incomplete tensor data")
except (OSError, ValueError, KeyError, IndexError, TypeError, struct.error):
    sys.exit(1)
PY
}

ensure_hf() {
    if [[ "${#HF[@]}" -gt 0 ]]; then return; fi
    if command -v hf >/dev/null 2>&1; then
        HF=(hf)
    elif command -v huggingface-cli >/dev/null 2>&1; then
        HF=(huggingface-cli)
    else
        HF_ENV="$COMFY_ROOT/.h3-hf-env"
        if [[ ! -x "$HF_ENV/bin/hf" ]]; then
            echo "Preparing the Hugging Face download environment..."
            "$PYTHON" -m venv "$HF_ENV"
            "$HF_ENV/bin/python" -m pip install --disable-pip-version-check -q 'huggingface_hub==1.32.0'
        fi
        HF=("$HF_ENV/bin/hf")
    fi
}
HF=()

REPO="Comfy-Org/MiniMax-H3"
REPO_REVISION="bf92c4091e333e69b8ca1998e0a669f15cb0832b"
FILES=(
    diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors
    text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors
    vae/minimax_h3_video_vae_fp16.safetensors
    vae/minimax_h3_audio_vae_fp32.safetensors
)
declare -A EXPECTED_BYTES=(
    [diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors]=20970379616
    [text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors]=15687142551
    [vae/minimax_h3_video_vae_fp16.safetensors]=5207808496
    [vae/minimax_h3_audio_vae_fp32.safetensors]=605254808
    [diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors]=20970379616
)
if [[ "$WITH_REF2VA" -eq 1 ]]; then
    FILES+=(diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors)
fi

for path in "${FILES[@]}"; do
    target="$COMFY_ROOT/models/$path"
    mkdir -p "$(dirname "$target")"
    echo "Verifying/reusing or fetching $path"
    if valid_model "$target" "${EXPECTED_BYTES[$path]}"; then
        echo "Verified cached model: $path"
        continue
    fi
    if [[ "$OFFLINE_CHECK" -eq 1 ]]; then
        echo "Missing or invalid cached model: $path" >&2
        exit 1
    fi
    ensure_hf
    # Let the Hub resume absent files. Replace an invalid existing file.
    DOWNLOAD_FLAGS=()
    if [[ -e "$target" ]]; then
        DOWNLOAD_FLAGS+=(--force-download)
    fi
    "${HF[@]}" download "$REPO" "$path" --revision "$REPO_REVISION" --local-dir "$COMFY_ROOT/models" "${DOWNLOAD_FLAGS[@]}"
    valid_model "$target" "${EXPECTED_BYTES[$path]}" || {
        echo "Incomplete or malformed model: $path" >&2
        exit 1
    }
done

if [[ "$WITH_SPEED_LORA" -eq 1 ]]; then
    echo "Turbo has been retired; no speed LoRA will be downloaded." >&2
    exit 2
fi

COMFY_ROOT="$COMFY_ROOT" REQUESTED_FILES="${FILES[*]}" "$PYTHON" - <<'PY'
import json
import os
import struct

root = os.environ["COMFY_ROOT"]
requested = os.environ["REQUESTED_FILES"].split()
for relative in requested:
    path = os.path.join(root, "models", relative)
    size = os.path.getsize(path)
    with open(path, "rb") as stream:
        prefix = stream.read(8)
        if len(prefix) != 8:
            raise SystemExit(f"Invalid safetensors header: {relative}")
        header_size = struct.unpack("<Q", prefix)[0]
        if header_size <= 0 or header_size > 100_000_000:
            raise SystemExit(f"Invalid safetensors header size: {relative}")
        header = json.loads(stream.read(header_size))
    offsets = [value["data_offsets"][1] for key, value in header.items() if key != "__metadata__"]
    if not offsets or 8 + header_size + max(offsets) != size:
        raise SystemExit(f"Incomplete or malformed safetensors file: {relative}")
    print(f"Verified: {relative} ({size:,} bytes, {len(header) - ('__metadata__' in header)} tensors)")
PY

echo "All requested H3 model files are present."
