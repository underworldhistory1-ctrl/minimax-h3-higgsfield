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
Anime → Realism (LiseTY, pinned 310 MB), Realism People, Combat V2, Motion Repair V2, Character Swap, Refine, ControlNet with CPU pose/depth
preprocessors, and Qwen Image INT8. Original remains the default rendering method.
The launcher's short validation render also uses Original.

Turbo is retired. Existing files are retained but are not selected or downloaded.
Character Swap requires reference conditioning with a source video and replacement image. Installed Singularity and Hybrid profiles are available for experimentation; graph wiring is checked, while visual quality remains unverified.
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

The API verifier also compares every expected LoRA in the pinned installation manifest with the live server's discovered LoRA list. Missing names make verification fail with recovery guidance, even when base H3 models are ready. An installed LoRA is intentionally off until selected for a shot.

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
CUDA visibility alone is insufficient: NVIDIA installs require CUDA 13.0+ PyTorch
and an available comfy-kitchen CUDA backend for the optimized INT8 path. Existing
CUDA 12.x environments must be repaired before the launcher declares readiness.
Linux launch paths use ComfyUI RAM-pressure caching rather than disabling all
node-result reuse. This cache evicts under RAM pressure and is separate from the
user-selected Spectrum/MotionCache approximation methods.
Maintenance writes a fixed-root .h3-launcher/maintenance.json barrier even
when reports use --state-dir. Admission closes before runtime mutation; the
launcher then waits for already admitted HTTP handlers, background operations and
the render queue to drain. Older running workers without the drain endpoint must
be stopped when idle before this first upgrade. Queue reads and cancellation
remain available. Manager restart is allowed only after all admitted work drains.
A failed update remains paused; a verified restart and API check reopen admission.

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


## Source updates

Official clean Git checkouts on main use --update-policy latest by default. The launcher fetches and fast-forwards, records refs/h3-launcher/previous-source, and preserves local edits and divergent commits by refusing automatic replacement. Notify reports without applying; verified accepts only manifest-approved commits. --no-update is explicit offline/custom-checkout use. Preflight/status are read-only. ComfyUI and acceleration dependencies retain their compatible pins.

## Updates in Studio

The Updates control checks official main and reports a newer source commit. Installation uses the existing launcher with GPU smoke disabled and automatic restart disabled. A verified local installation receipt associates the source checkout, deployed runtime and ComfyUI root. Unknown archives or customized checkouts can show update information but require the administrator's launcher for installation.

Before applying, Studio closes admission to new mutations and verifies both the ComfyUI queue and shared preparation/export operations. Existing work blocks the update. The launcher still validates runtime edits, installation locks, backups and source revision. User models, input/output media, project manifests and settings are retained.

Successful code installation requires an explicit ComfyUI restart and browser reload. The old worker remains paused until then. Interrupted or failed updates retain a recovery state and installation log; rerun the launcher after resolving its reported error. Installing code is not GPU or quality validation. [Current audit](PRODUCTION_READINESS_2026_10_15.md).

## Performance and recovery limits

INT8 diffusion weights coexist with floating-point residuals, normalization,
softmax, text encoding and VAEs. BF16/FP16 activity does not by itself indicate
that INT8 linear kernels are disabled. The selected Combat LoRA can retain INT8
through the pinned ComfyUI requantization path. The environment audit checks the
native CUDA backend separately from basic GPU visibility.

The explicit PyTorch attention baseline selects an eligible fused SDPA kernel;
its label is not evidence of a slow math fallback. Comfy Kitchen INT8 attention,
Spectrum and MotionCache change arithmetic and require matched-seed video/audio
quality checks and measured end-to-end timings before choosing them for a workload.
Do not infer their speed from installation, GPU occupancy or marketing factors.
Keep model, LoRAs, dimensions, frame count, sampler, scheduler, steps and references
matched. Confirm KSampler actually executes: RAM caching can reuse its complete
result when identical inputs are submitted, even with a new output token.

RAM-pressure caching cannot guarantee that a large allocation inside one node
will fit. Avoid blind high-RAM/high-VRAM flags on constrained hosts. Record peak
cgroup RAM and OOM counters across model loading, sampling, unload, decode and
save; decoded video still needs CPU memory. More host RAM may be necessary.
A completed-sampler latent supports decode recovery; a worker lost during sampling
has no resumable solver checkpoint. Never report completion before the output
video and audio are saved and validated. Cancelled jobs must remain cancelled.

## Attention selection and supervised workers

The default remains the explicit PyTorch fused SDPA baseline. Select native
Comfy Kitchen quantized attention with `--attention-backend ck-int8`; use
`--attention-backend pytorch` for the baseline. This is an additional arithmetic
approximation, separate from INT8 diffusion weights. The choice enters the
launcher configuration fingerprint, reaches worker restarts, and must match the
actual loaded implementation in readiness. An argument alone is not verification.
Changing the choice on an existing supervisor requires an idle relaunch with the
new arguments; Manager reboot preserves the old supervisor arguments.

On Linux, the launcher starts a detached worker supervisor with the selected
Python interpreter, port, bind address and VRAM reserve. Interpreter symlinks must
remain intact so a virtual environment never resolves to the system Python.
The supervisor restarts a failed worker and periodically checks for supported
decode-only recovery. See [decode recovery and cancellation](DECODE_RECOVERY.md).
Sampling in progress has no resumable solver checkpoint.

For an idle GPU, `deploy/benchmark_attention.py` compares the pinned PyTorch SDPA
wrapper and native Kitchen attention. It submits no model inference and changes
no server settings. It reports CUDA-event timings, loaded kernels and numerical
error, with safety checks against a large quadratic math fallback. On an RTX 5090
with Torch 2.9.1+cu130, BF16 B1/H56/D128, sequence32768, three timed repetitions:
Flash SDPA median146.64ms; Kitchen INT8 median51.73ms (2.84x attention-only);
relative RMSE0.01693 versus SDPA. This is not a whole-video speed or quality claim.


A matched full-render check on the same RTX 5090 used Ref2VA INT8 + Combat V2,
1024x576, 362 frames at24fps, 20 steps, seed42 and identical image/audio references.
CUDA13 PyTorch Flash took1201.28s end-to-end (steady56.3s/step); native Kitchen
INT8 attention took582.94s (steady25.04s/step), about2.06x end-to-end. A fresh
worker executed all20 steps, avoiding sampler-result cache reuse. Both MP4s
contain362 video frames and native audio and passed full-file decoding. Spot
checks at1/7/13s found coherent frames but arithmetic changes alter the output;
this is not perceptual equivalence or a guarantee for other workloads. Small
attention shapes can be slower with quantization. Singularity INT8 + Anime
Realism also completed and passed full video/audio decode on this runtime.
