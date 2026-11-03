# Cloud setup

Use a source checkout outside ComfyUI/custom_nodes. The legacy bootstrap entrypoint routes to the shared launcher rather than maintaining another installer.

```bash
bash launcher.sh --comfy-root /workspace/ComfyUI --models-root /path/to/persistent/models
```

Inspect missing bytes with `--preflight`. Default preparation includes H3, Qwen INT8 and configured optional prerequisites; `--video-only` restricts the image setup. Optional Matlow uses `--matlow`. Weights are not bundled. Reuse the persistent disk on later rentals to resume downloads and reuse verified files. Pins/hashes come from `compatibility.json`, not historical examples.

Native CK INT8 is the prepared runtime default; the launcher verifies loaded code and CUDA execution. Keep normal memory management and enough host RAM/output space. A 32 GB GPU alone does not establish capacity for every video.

Open `/extensions/h3_studio/index.html`; use `/?view=nodes` for technical graphs. Never restart a busy worker. Run `python deploy/verify_h3_server.py --url COMFY_URL` for read-only readiness, then decode, watch and listen to a smoke output before expensive work. Source checks do not establish GPU output quality.

[Installation](../docs/INSTALL.md) · [Launcher](../docs/LAUNCHER.md) · [Compatibility](../docs/COMPATIBILITY_MATRIX.md).
