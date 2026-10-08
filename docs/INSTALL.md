# Install H3 Higgsfield

Both installers require an NVIDIA GPU with a working driver. H3 needs roughly **65.8 GB** including the prepared speed/LoRA files. Qwen Image is optional outside Salad: INT8 adds **17.3 GB**; BF16 adds **32.4 GB**, with a shared VAE. Use `QWEN_IMAGE_PROFILES=int8` (Linux) or `-QwenImageProfiles int8` (Windows) to install it. An empty disk cannot be ready in seconds because the models must download.

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

The repository includes a dedicated RTX 5090 image in `Dockerfile.salad`. It keeps all weights outside the container image, defaults to H3 plus Qwen INT8, verifies exact pinned sizes and SHA-256 values before reporting ready, protects both workspaces and WebSocket with one login, and can sync outputs to S3-compatible storage. See [the Salad deployment settings](../deploy/SALAD_DEPLOYMENT.md).

