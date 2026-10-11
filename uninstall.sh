#!/usr/bin/env bash
# Use the ComfyUI environment's Python, e.g. H3_PYTHON=/path/to/venv/bin/python.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${H3_PYTHON:-python3}" "$ROOT/deploy/uninstall_h3.py" "$@"
