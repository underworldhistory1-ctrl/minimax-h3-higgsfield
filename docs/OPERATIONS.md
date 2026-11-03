# Optional operations

## H3 and LTX sharing one Linux GPU

With the matching LTX `studio_shared_gpu` custom node installed, set `STUDIO_SHARED_GPU_LOCK` to the same absolute lease path in both workers. Set `STUDIO_SHARED_GPU_PEER=http://127.0.0.1:8189` for H3 and `http://127.0.0.1:8188` for LTX, adjusting ports to the actual workers. Restart only when idle.

The guard reserves GPU execution before native queue admission. Waiting H3/Qwen and LTX jobs remain pending/cancellable instead of allocating together. It releases the lease after execution or process exit, checks peer readiness/CUDA memory and can unload an idle peer GPU cache while retaining RAM caches. Without these environment variables it is inactive. This coordinates native execution; it does not create one global FIFO across both Studio interfaces.

## Optional Qwen Image 2.1 V2 LoRA

Create Image has a separate selector and strength 0–2, initially 0.8, defaulting to None. TheseAlpacas V2 is available only when installed. Selection survives refresh and is saved with image settings. Its model-only adapter precedes reference caching in edit mode.

Install explicitly with `python deploy/download_qwen_loras.py /path/to/ComfyUI`. Add `--offline-check` to verify the pinned 79744352-byte file and SHA-256 without downloading. The downloader uses a pinned Hugging Face mirror revision. The adapter is not enabled automatically; installed weights do not establish universal visual improvement.

[Launcher](LAUNCHER.md) · [Image behavior](IMAGE_WORKSPACE_FIX.md) · [Compatibility](COMPATIBILITY_MATRIX.md).
