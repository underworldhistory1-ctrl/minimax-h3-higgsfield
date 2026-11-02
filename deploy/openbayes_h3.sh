#!/usr/bin/env bash
# Compatibility entrypoint for an existing persistent Hyper.ai stack.
# All mutations go through the same locked, resumable launcher.
set -Eeuo pipefail
STACK="${H3_STACK:-/output/h3-stack}"
REPO="${H3_SOURCE:-$STACK/repo/minimax-h3-higgsfield}"
COMFY="${COMFY_ROOT:-$STACK/ComfyUI/ComfyUI}"
MODELS_REAL="${MODELS_REAL:-/input0/h3-models}"
PORT="${PORT:-8188}"
BIND="${BIND:-127.0.0.1}"
PY="${COMFY_PYTHON:-$COMFY/.venv/bin/python}"
[[ -x "$PY" ]] || PY="$(command -v python3 || command -v python)"
[[ -f "$REPO/deploy/launcher.py" ]] || { echo "Launcher missing at $REPO; restore the source checkout first." >&2; exit 1; }
command="${1:-up}"
if (( $# )); then shift; fi
args=(--comfy-root "$COMFY" --port "$PORT" --bind "$BIND"
      --attention-backend "${H3_ATTENTION_BACKEND:-ck-int8}")
[[ ! -d "$MODELS_REAL" ]] || args+=(--models-root "$MODELS_REAL")
case "$command" in
    up|start) exec "$PY" "$REPO/deploy/launcher.py" "${args[@]}" "$@" ;;
    link) exec "$PY" "$REPO/deploy/launcher.py" "${args[@]}" --no-start "$@" ;;
    status) exec "$PY" "$REPO/deploy/launcher.py" "${args[@]}" --status "$@" ;;
    models) exec "$PY" "$REPO/deploy/launcher.py" "${args[@]}" --plan "$@" ;;
    doctor) exec "$PY" "$REPO/deploy/launcher.py" "${args[@]}" --preflight "$@" ;;
    verify) exec "$PY" "$REPO/deploy/verify_h3_server.py" --url "http://127.0.0.1:$PORT" "$@" ;;
    logs) exec tail -n "${1:-60}" "$COMFY/h3-higgsfield-server.log" ;;
    stop) echo "Stop the owned service through your provider after the queue is idle. This compatibility script never kills processes by name." >&2; exit 1 ;;
    *) echo "Unknown command: $command (up|start|link|status|models|doctor|verify|logs|stop)" >&2; exit 2 ;;
esac
