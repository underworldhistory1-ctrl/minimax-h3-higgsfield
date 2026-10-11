# Remove H3 Studio or restore the ComfyUI home page

You can use other workflows immediately at `http://127.0.0.1:8188/?view=nodes`.
H3 does not replace the node editor. Its installer adds a home-page redirect.

Use a separate, updated source checkout for these commands. Run with the Python
environment that runs ComfyUI. Commands preview changes by default; add the apply
flag after reviewing the paths. Finish running and pending jobs first.

## Windows

```powershell
.\uninstall.ps1 -ComfyRoot C:\ComfyUI_windows_portable\ComfyUI -ComfyPython C:\ComfyUI_windows_portable\python_embeded\python.exe
# Apply removal:
.\uninstall.ps1 -ComfyRoot C:\ComfyUI_windows_portable\ComfyUI -ComfyPython C:\ComfyUI_windows_portable\python_embeded\python.exe -Apply
```

Add `-LandingOnly` to keep Studio installed and restore ComfyUI as the home page.
For a source installation, pass its virtual environment's Python instead.

## Linux

```bash
H3_PYTHON=/path/to/comfy-venv/bin/python bash uninstall.sh --comfy-root /path/to/ComfyUI
H3_PYTHON=/path/to/comfy-venv/bin/python bash uninstall.sh --comfy-root /path/to/ComfyUI --apply
```

Add `--landing-only` to keep Studio. Use `--url` (Windows: `-Url`) if the server
uses another address or port. Existing authentication environment variables
`H3_ACCESS_TOKEN` / `H3_INSTANCE_PASSWORD` are supported by the queue check.
An unreachable server is accepted only when the connection is refused; failed
authentication, timeouts and a busy queue stop removal.

## What changes

- Full removal moves `custom_nodes/h3_studio` and, if present,
  `custom_nodes/h3_studio_v2` into a dated `ComfyUI/h3-uninstall-backups` folder.
  Extension-local files, including any projects, remain in that backup.
- Both modes remove only the exact H3 redirect script from the installed
  `comfyui_frontend_package/static/index.html`. The current frontend is backed up;
  an old `index.html.before-h3-studio` is never restored over a newer frontend.
- Models, LoRAs, inputs, outputs, project databases outside the extension,
  Spectrum/MotionCache/Refine nodes, ComfyUI source and Python packages stay intact.
  These can be shared with other workflows and are not automatically deleted.

Restart ComfyUI manually after removal. To restore Studio, with ComfyUI stopped,
move the archived extension back to its original `custom_nodes` folder, provided
that folder does not already exist. Keep the backup until you have checked your
projects. The original home-page redirect backup may remain beside the frontend;
it is inactive.

## ComfyUI upgrades

The installer checks a specific H3-capable ComfyUI revision and required nodes.
That does not guarantee compatibility with every future version. Back up projects,
outputs and the current environment before upgrading; check H3 readiness and a
short video with audio afterward. A frontend package update may remove the home
redirect; Studio can still be opened at `/extensions/h3_studio/index.html`.
