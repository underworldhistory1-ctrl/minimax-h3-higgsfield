#!/usr/bin/env python3
"""Check an existing ComfyUI queue, restart it safely, or wait for H3 Studio."""

import argparse
import getpass
import http.client
import http.cookiejar
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("check", "restart", "wait"))
    parser.add_argument("--url", default="http://127.0.0.1:8188")
    parser.add_argument("--timeout", type=int, default=180)
    args = parser.parse_args()
    base = args.url.rstrip("/")
    if args.action == "check" and os.environ.get("H3_LAUNCHER_INTERNAL") == "1":
        from launcher_smoke import ComfyAPI
        current = ComfyAPI(os.environ.get("H3_LAUNCHER_URL", base)).queue()
        if current.get("status") == "offline":
            print("COMFYUI_OFFLINE")
            return 0
        if current["queue_running"] or current["queue_pending"]:
            raise RuntimeError("ComfyUI became busy before runtime setup; retry when the queue is empty.")
        print("COMFYUI_QUEUE_EMPTY")
        return 0
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def get_json(path):
        with opener.open(base + path, timeout=8) as response:
            return json.load(response)

    def queue():
        return get_json("/queue")

    def authenticate():
        token = os.environ.get("H3_ACCESS_TOKEN")
        if token:
            opener.open(base + "/?" + urllib.parse.urlencode({"arg": token}), timeout=8).close()
        try:
            return queue()
        except (ValueError, urllib.error.HTTPError):
            password = os.environ.get("H3_INSTANCE_PASSWORD")
            if password is None and sys.stdin.isatty():
                password = getpass.getpass("ComfyUI instance password, if required: ")
            if not password:
                raise RuntimeError("ComfyUI requires login; set H3_INSTANCE_PASSWORD to check its queue.")
            body = urllib.parse.urlencode({"instanceId": password}).encode()
            opener.open(base + "/simplepod-login", body, timeout=8).close()
            return queue()

    if args.action == "wait":
        deadline = time.monotonic() + args.timeout
        last_error = "server is starting"
        while time.monotonic() < deadline:
            try:
                ready = get_json("/h3_studio/readiness")
                missing_models = [name for name, present in ready.get("models", {}).items() if not present]
                missing_nodes = [name for name, present in ready.get("nodes", {}).items() if not present]
                if not ready.get("models") or not ready.get("nodes"):
                    raise RuntimeError("H3 Studio readiness route has no model or node data")
                if missing_models or missing_nodes:
                    raise RuntimeError("Missing models: " + ", ".join(missing_models)
                                       + "; missing nodes: " + ", ".join(missing_nodes))
                print("H3_STUDIO_READY", base + "/extensions/h3_studio/index.html")
                return 0
            except (OSError, ValueError, RuntimeError) as exc:
                last_error = str(exc)
                time.sleep(2)
        raise RuntimeError("H3 Studio did not become ready: " + last_error)

    try:
        current = authenticate()
    except urllib.error.URLError as exc:
        if isinstance(exc.reason, ConnectionRefusedError):
            if args.action == "check":
                print("COMFYUI_OFFLINE")
                return 0
            raise RuntimeError("ComfyUI is not running; start it before requesting a restart.") from exc
        raise
    if not isinstance(current, dict) or any(
        not isinstance(current.get(key), list) for key in ("queue_running", "queue_pending")
    ):
        raise RuntimeError("ComfyUI returned an invalid queue response; refusing changes.")
    running = len(current["queue_running"])
    pending = len(current["queue_pending"])
    if running or pending:
        raise RuntimeError(f"ComfyUI has {running} running and {pending} pending job(s); retry after they finish.")
    if args.action == "check":
        print("COMFYUI_QUEUE_EMPTY")
        return 0

    request = urllib.request.Request(
        base + "/v2/manager/reboot", data=b"{}",
        headers={"Content-Type": "application/json"}, method="POST")
    try:
        opener.open(request, timeout=12).close()
    except (http.client.RemoteDisconnected, ConnectionResetError, BrokenPipeError):
        pass  # ComfyUI Manager replaces its own process before replying.
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"Automatic restart was refused (HTTP {exc.code}). Restart ComfyUI using your provider, then rerun install.sh.") from exc
    time.sleep(3)
    args.action = "wait"
    deadline = time.monotonic() + args.timeout
    while time.monotonic() < deadline:
        try:
            ready = get_json("/h3_studio/readiness")
            if ready.get("models") and ready.get("nodes") \
                    and all(ready["models"].values()) and all(ready["nodes"].values()):
                print("H3_STUDIO_READY", base + "/extensions/h3_studio/index.html")
                return 0
        except (OSError, ValueError):
            pass
        time.sleep(2)
    raise RuntimeError("ComfyUI restart did not return with all H3 components ready. Check its startup log.")


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, RuntimeError) as exc:
        print("H3_SETUP_ERROR:", exc, file=sys.stderr)
        raise SystemExit(1)
