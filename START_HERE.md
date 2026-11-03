# Start here — H3 Interface

One browser workspace for MiniMax H3 video with native audio and Qwen Image 2.1 creation/editing. H3 Studio is the workspace name; V2 is an older migration, not another installation to run alongside it.

## Install

Clone outside ComfyUI/custom_nodes:

```bash
git clone https://github.com/underworldhistory1-ctrl/minimax-h3-interface.git
cd minimax-h3-interface
bash launcher.sh --comfy-root /path/to/ComfyUI --models-root /path/to/models
```

Windows: use `./launcher.ps1 -ComfyRoot C:/path/to/ComfyUI`. See [installation](docs/INSTALL.md) and [launcher options](docs/LAUNCHER.md). Repeat launches resume downloads and reuse verified files. Weights are not bundled; an empty disk needs a substantial download. Run preflight to inspect missing bytes first.

Pinned core: ComfyUI 0.43.0. Native Comfy Kitchen INT8 attention is the default; PyTorch requires an explicit selection. The launcher checks the actual worker, interpreter and loaded backend. Initial NVIDIA setup requires a compatible CUDA 13 driver and native CUDA acceleration.

## Create

Open `/extensions/h3_studio/index.html`. The server root redirects to Studio; `/?view=nodes` opens the technical editor. Start in Production, attach inputs and generate. Save scene or Generate creates a workspace when needed. Refresh keeps the current tab; a new plain Studio page starts independently.

Original uses FL2VA for Text/Frames and Ref2VA for References. Supported Pika/Turbo choices apply required sampling and model settings automatically. Unsupported saved setups remain visible and block generation. See [selection rules](docs/MATLOW_AND_SELECTIONS.md) and [compatibility](docs/COMPATIBILITY_MATRIX.md).

Optional Matlow packs use Linux `--matlow` or Windows `-Matlow` once. Dials are connected to Studio; MAINodes MotionLab and Contact Sheet remain separate backend tools.

## Update and verify

The launcher follows official main by default, preserves local edits and waits for accepted work, preparation and exports before changing runtime. Never restart an active render. The Updates panel installs supported code changes; environment changes require the full launcher and installed code requires a restart.

Run `python deploy/verify_h3_server.py --url COMFY_URL` for read-only checks. Source tests, API readiness and GPU outputs are separate evidence. Current 2.9 changes have no new GPU render; dated GPU reports describe earlier tested workloads only.

Back up projects, input/output and continuation contexts before important updates. Completed sampler latents support tracked decode recovery, not mid-sampling resume. [Upgrade](docs/V2_UPGRADE.md) · [Documentation](docs/README.md) · [Changelog](CHANGELOG.md).
