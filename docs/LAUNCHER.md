# Automatic setup and recovery

Use a separate source checkout. The normal `install.sh` and `install.ps1` now
enter the same resumable launcher. No extra launcher dependencies are needed.

```bash
bash launcher.sh
# Existing attached model disk:
bash launcher.sh --comfy-root /app/ComfyUI --models-root /input0/h3-models
# Read-only plan or saved progress:
bash launcher.sh --plan
bash launcher.sh --status
```

```powershell
.\launcher.ps1 -ComfyRoot C:\ComfyUI_windows_portable -ModelsRoot D:\AI\models
.\launcher.ps1 -ComfyRoot C:\ComfyUI_windows_portable -Preflight
.\launcher.ps1 -ComfyRoot C:\ComfyUI_windows_portable -Status
```

PowerShell selects Portable's embedded Python or an installed Python 3.13/3.12.
An existing interpreter can be supplied once using `-ComfyPython` / `--comfy-python`.
Linux discovers known virtual environments and actual running Python processes.
Multiple installations require `--comfy-root`; ambiguous environments are preserved.

## Defaults and optional profiles

Default preparation includes H3 Text/Frames/References, MotionCache and Spectrum,
Realism People, Combat V2, Motion Repair V2, Refine, ControlNet with CPU pose/depth
preprocessors, and Qwen Image INT8. Original remains the default rendering method.
The launcher's short validation render also uses Original.

Turbo is opt-in: `--turbo` / `-Turbo`. Existing Turbo files are retained.
Use `--video-only` / `-VideoOnly` to omit Qwen weights, `--no-controlnet` /
`-SkipControlNet`, or `--no-refine` / `-SkipRefine` to omit optional features.
Omitting a feature never deletes previously installed files.

## Storage and interrupted downloads

The launcher searches bounded common attached-storage roots, known model folders,
and `extra_model_paths.yaml`. Repeat `--models-root` for unusual mount locations.
All shipped model artifacts have pinned sizes and SHA-256 hashes. Reused hash
receipts depend on file identity, timestamps and pinned digest; changed files are
verified again. First validation may take time on slow storage.

Valid attached files are linked into ComfyUI; Windows falls back to hard links or
a verified copy when necessary. Linked external model directories remain intact;
missing files use a local overlay registered in `extra_model_paths.yaml`. That
configuration is backed up before extending it. External weights are not modified.

Downloads are sequential, resume partial transfers when the server supports Range,
and restart the partial transfer when Range is ignored. Transient network errors
have bounded retries. Invalid targets/partial files are quarantined with unique
names; credentials, denied licenses and unavailable sources require user action.
Available storage is checked for the actual missing artifacts on each volume.

## Resume, logs and readiness

Rerun the same command. A process lock prevents overlapping installations; verified
files are reused, and runtime steps are idempotent. Progress is stored under
`ComfyUI/.h3-launcher` as `state.json`, `report.json` and `install.log`.
Cached stage completion never replaces current file/server verification.

Readiness has three independent flags:

| Flag | Evidence |
|---|---|
| `files_prepared` | Required source, dependencies and model files prepared |
| `api_ready` | Current H3 endpoints and required UI/model/node checks pass |
| `gpu_validated` | The launcher's saved MP4 passed video and audio validation |

`--no-start` / `-NoStart` prepares files only. `--skip-smoke` / `-SkipSmoke` avoids
the GPU job and leaves `gpu_validated=false`. Neither is a full validation result.

A smoke prompt ID is persisted immediately. If interrupted or timed out, the next
run follows that exact job; it never cancels another user's job or submits a
duplicate. An uncertain submission or failed job remains reported for diagnosis,
rather than silently spending GPU time again. API timestamps, report timestamps,
and the saved clip identify when validation happened. This is a technical smoke
check, not an artistic guarantee for every prompt, LoRA or reference combination.

## Running servers and authentication

The launcher waits for running and pending work before changing runtime files or
requesting a restart. It uses ComfyUI Manager's restart endpoint for an existing
worker. It never kills an unknown process. Without that endpoint, restart using
your provider and rerun; downloaded files and projects remain preserved.

Use `--url` / `-Url` for authenticated provider URLs and proxy path prefixes.
Credentials come from `H3_ACCESS_TOKEN`, `H3_INSTANCE_PASSWORD`, and `HF_TOKEN`
environment variables, never committed configuration. Logs redact these values.
Only connection refusal is treated as an offline server; timeout, invalid JSON,
and failed login never mean an empty queue. Default network binding is localhost.

An empty server still needs a working NVIDIA driver, supported Python, network,
model access, writable space and administrator privileges for missing system tools.
The launcher installs missing tools where the OS package manager is supported;
it cannot repair provider hardware, grant permissions or accept model licenses.
Versions are compatible pins, not untested automatic upgrades to the newest release.

## Remote one-command handoff

The packaged `provision_h3.py` now calls this launcher, including startup and smoke
validation. Pass current SSH details and optionally `--models-root`. `--detach`
keeps installation running after SSH disconnect and returns a remote log path;
that dispatch message does not claim readiness. Read the log and final report later.
Library restoration requires an explicit `--comfy-root`.

## Render timing and progress

The video workspace learns from completed renders. Saved measurements include
hardware, model, render method, dimensions, frames, steps, ordered LoRAs and
strengths, reference media, guides, continuation, ControlNet and refinement passes.
Exact settings show observed times and their range. Compatible nearby settings
show similar observations with lower confidence, without invented speed factors.
New or unsupported combinations show that no calibrated estimate is available.
Image, video and audio references are distinguished; unknown uploaded metadata
cannot claim an exact match. Execution timestamps take precedence over browser
timers, and browser-only observations always retain low confidence.

Progress follows each sampler's actual steps, including refinement, then decoding
and saving. Reconnecting preserves the active sampler. Completion requires a
saved output rather than the last sampler step. Legacy timing samples that lack
the full settings are excluded; new renders build the calibrated history.


## Update 2026-10-12

Launch from an official Git clone on `main`: the launcher fetches and fast-forwards to the latest repository version before installing. It preserves local edits and rejects divergent commits. `--no-update` is an explicit offline/custom-checkout option; `--preflight` and `--status` remain read-only. ZIP copies must be downloaded again for source updates. Verified ComfyUI and acceleration-node revisions remain pinned.

The installer now includes the shared queue/cancellation/stage observer, bounded H3 MLP scratch allocations, CPU MotionCache residual storage, a 3 GB VRAM reserve for newly started workers, and the narrowly scoped public Studio document navigation fix. H3 Studio rejects oversized unsupported graphs before submission. Model weights, projects, inputs, and generated outputs are preserved.

Qwen image references persist as original files in this browser's IndexedDB, including names, order, and dimensions. Wait for “saved in this browser” before refresh. Persistence belongs to the same browser and URL origin; changing tunnel hostname creates a separate browser draft. Removing a reference also updates its saved draft.

Validation: 115 JavaScript tests, CPU stage/core patch tests, and real-browser refresh checks. No AI render was submitted for this update. These checks do not prove zero OOMs for every GPU workload.
