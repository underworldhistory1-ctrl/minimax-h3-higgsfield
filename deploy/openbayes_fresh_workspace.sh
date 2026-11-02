#!/usr/bin/env bash
# Fresh and resumed OpenBayes installs share the same guarded launcher.
set -Eeuo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STACK="${H3_STACK:-/output/h3-stack}"
MODELS="${H3_MODELS:-/input0/h3-models}"
args=(--comfy-root "${COMFY_ROOT:-$STACK/ComfyUI/ComfyUI}")
[[ ! -d "$MODELS" ]] || args+=(--models-root "$MODELS")
exec "${COMFY_PYTHON:-python3}" "$REPO/deploy/launcher.py" "${args[@]}" "$@"
