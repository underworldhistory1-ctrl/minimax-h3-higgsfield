#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${COMFY_PYTHON:-python3}" "$ROOT/deploy/launcher.py" "$@"
