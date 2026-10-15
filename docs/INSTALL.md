# Install H3 Higgsfield

## One-command launcher

The normal Windows and Linux commands now use the [automatic launcher](LAUNCHER.md).
It prepares H3, Realism People, Combat V2, Motion Repair V2 and Character Swap LoRAs,
MotionCache/Spectrum, Qwen INT8, Refine and ControlNet. Turbo is retired. It discovers attached model storage,
verifies/reuses files, resumes sequential downloads, saves progress and validates
a short video with audio before reporting full readiness. Existing data is retained.

```bash
bash launcher.sh
# With an attached disk:
bash launcher.sh --models-root /input0/h3-models
```

```powershell
.\launcher.ps1 -ComfyRoot "C:\path\to\ComfyUI_windows_portable"
```

Rerun the same command to resume. Use `--plan` / `-Preflight` for a read-only plan,
and `--status` / `-Status` to read the saved report. See the launcher guide for
profiles, remote handoff, authentication and recovery boundaries. The legacy
platform details below remain useful for interpreter and provider requirements.

Both installers require an NVIDIA GPU, a CUDA 13-compatible driver (R580+) and a supported Python environment. The launcher verifies the actual native CUDA backend, not GPU visibility alone. Compatible pins currently use Torch 2.9.1+cu130; an older CUDA 12.x environment must be repaired before readiness. The launcher plan reports exact download sizes after checking available storage. Qwen Image INT8 is included by default; use `--video-only` (Linux) or `-VideoOnly` (Windows) to omit it. BF16 is available through `--qwen-image-profiles bf16` or `-QwenImageProfiles bf16`. An empty disk cannot be ready in seconds because the models must download.

### Attention and system memory

INT8 H3 weights still use BF16/FP16/FP32 for appropriate operations; those dtypes
are not evidence that native INT8 kernels are disabled. PyTorch fused SDPA is the
server default. On Linux, add --attention-backend ck-int8 to the launcher command
to choose Kitchen INT8 attention explicitly. It changes arithmetic and requires
a matched workload/quality check. [Measured evidence](LAUNCHER.md#attention-selection-and-supervised-workers).

Long reference-heavy renders need system RAM as well as VRAM. A40 GB host completed
the documented1024×576 workloads but approached its limit;64 GB or more gives
additional headroom for larger settings. RAM-pressure caching and completed-latent
recovery reduce specific risks, not all possible interruptions.

### Windows (native PowerShell; no WSL)

Use the [official ComfyUI Portable NVIDIA build](https://github.com/Comfy-Org/ComfyUI/releases/latest) or an existing ComfyUI source checkout. The installer detects Portable's `python_embeded`, installs the H3 interface and optional methods, checks the queue, and opens the H3 page when ready. Git for Windows and an NVIDIA driver are required; the installer attempts to get missing FFmpeg tools through Windows Package Manager.

```powershell
git clone https://github.com/underworldhistory1-ctrl/minimax-h3-higgsfield.git
cd minimax-h3-higgsfield
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -ComfyRoot "C:\path\to\ComfyUI_windows_portable"
```

Point `-ComfyRoot` to the Portable parent folder **or** its `ComfyUI` subfolder. For an existing source install, pass its ComfyUI path and, if needed, `-ComfyPython "C:\path\to\python.exe"`. If ComfyUI is absent, omit `-ComfyRoot`: with Git and Python 3.12/3.13 installed, the script installs the pinned ComfyUI source into a sibling folder. A Portable build that lacks H3 nodes must first be updated with its official `update\update_comfyui.bat`; the installer preserves that build rather than replacing its files.

To inspect this Windows PC before setup, add `-Preflight` to the PowerShell command. It only reports local prerequisites and cached model sizes; it makes no changes or downloads.

If an already-running ComfyUI has no Manager restart endpoint, rerun with `-NoStart`, then restart ComfyUI normally. The H3 page is `http://127.0.0.1:8188/extensions/h3_studio/index.html`. The installer never restarts while jobs are running or queued.

### Linux (Bash)

```bash
git clone https://github.com/underworldhistory1-ctrl/minimax-h3-higgsfield.git
cd minimax-h3-higgsfield
bash install.sh
```

The Linux installer finds an existing ComfyUI or installs pinned revision `3b4c0b0e457cf0a51cf3038e0a6750d8f96ce251`. That revision contains the corrected H3 VAE tile decode and native Qwen Image 2.1 nodes. The installer checks those source markers before continuing, reuses or downloads verified model files, prepares the optional nodes and LoRAs, and opens **H3 Higgsfield** as the ComfyUI landing page.

For a different Linux ComfyUI location, use `bash install.sh --comfy-root /path/to/ComfyUI`. Both new installs bind to `127.0.0.1:8188` by default. Reach a remote server through an SSH tunnel or an authenticated cloud proxy; only use `--bind 0.0.0.0` (Linux) or `-Bind 0.0.0.0` (Windows) behind access control. Once ready, open `/extensions/h3_studio/index.html` at your server address. The server root also redirects to this page; the Comfy node editor is reserved for maintenance at `/?view=nodes`.

Model downloads can require accepting the [MiniMax H3 license](https://huggingface.co/MiniMaxAI/MiniMax-H3) or Hugging Face access. The model weights, private reference files, personal video library, and server passwords are **not** in this Git repository; only the explicitly published demo media are included. Re-running the installer checks and reuses valid cached weights. For a portable handoff or optional video-library restore, see [the server guide](../deploy/CLOUD_BOOTSTRAP_AR.md).

### SaladCloud

The published Salad image and Dockerfile still use an older CUDA 12.8 environment; they have not been rebuilt or validated for the current native CUDA 13 acceleration contract. See [legacy image status and deployment requirements](../deploy/SALAD_DEPLOYMENT.md) before using it. A main-branch source update is not proof that a published container image changed.

