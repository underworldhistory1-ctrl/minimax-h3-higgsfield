#!/usr/bin/env python3
"""Make the authenticated ComfyUI root open H3 Studio by default.

Use ?view=nodes on the same server to reach the original node editor.
"""
import argparse
import re
import importlib.util
import os
from pathlib import Path


MARKER = '<script id="h3-studio-landing">'
SCRIPT = (MARKER
          + 'if((location.pathname==="/"||location.pathname==="/index.html")'
          + '&&new URLSearchParams(location.search).get("view")!=="nodes")'
          + 'location.replace("/extensions/h3_studio/index.html");'
          + '</script>')


def redirect_source(source, studio_name):
    if studio_name not in {"h3_studio", "h3_studio_v2"}:
        raise ValueError("Unsupported H3 extension directory")
    script = SCRIPT.replace("/extensions/h3_studio/", "/extensions/" + studio_name + "/")
    if MARKER in source:
        return re.sub(r'<script id="h3-studio-landing">.*?</script>', lambda _: script, source, count=1, flags=re.DOTALL)
    if "<head>" not in source:
        raise ValueError("Unexpected ComfyUI index.html; landing redirect not installed")
    return source.replace("<head>", "<head>" + script, 1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--studio-name", choices=("h3_studio", "h3_studio_v2"), default="h3_studio")
    args = parser.parse_args()
    spec = importlib.util.find_spec("comfyui_frontend_package")
    if not spec or not spec.origin:
        raise SystemExit("ComfyUI frontend package not found; landing redirect not installed")
    index = Path(spec.origin).parent / "static" / "index.html"
    source = index.read_text(encoding="utf-8")
    updated = redirect_source(source, args.studio_name)
    if updated == source:
        print("H3 Studio landing redirect already installed:", index)
        return
    if "<head>" not in source:
        raise SystemExit("Unexpected ComfyUI index.html; landing redirect not installed")
    backup = index.with_name("index.html.before-h3-studio")
    if not backup.exists():
        backup.write_text(source, encoding="utf-8")
    temporary = index.with_name("index.html.h3-tmp")
    temporary.write_text(updated, encoding="utf-8")
    os.replace(temporary, index)
    print("H3 Studio is now the ComfyUI landing page:", index)


if __name__ == "__main__":
    main()
