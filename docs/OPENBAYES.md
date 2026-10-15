# OpenBayes workspace setup and recovery

Use the current [automatic launcher](LAUNCHER.md) for an NVIDIA Linux workspace.
Keep the source checkout and ComfyUI on persistent workspace storage and attach
verified model storage separately. Provider mount paths vary; the examples below
use /output for the workspace and /input0/h3-models for weights.

~~~bash
git clone https://github.com/underworldhistory1-ctrl/minimax-h3-higgsfield.git
cd minimax-h3-higgsfield
bash launcher.sh --comfy-root /output/ComfyUI --models-root /input0/h3-models
~~~

The launcher uses official main updates by default, preserves local edits by
refusing replacement, reuses verified weights and resumes interrupted downloads.
It waits for admitted requests, background operations and queued renders before
runtime changes. Credentials belong in the documented environment variables or
interactive prompts, never in saved scripts or the repository.

## Native CUDA and attention

A visible GPU is insufficient. The current NVIDIA contract requires CUDA 13+
PyTorch, a compatible driver (R580+) and an enabled comfy-kitchen CUDA backend.
The verified RTX 5090 environment used Torch 2.9.1+cu130. A provider image with
Torch 2.8/CUDA 12.8 may expose the GPU while disabling the native INT8 backend.
Use the selected persistent virtual environment; resolving its Python symlink to
the system interpreter can silently select the wrong packages.

PyTorch fused SDPA remains the default. To opt into native Kitchen quantized
attention for a measured workload, add --attention-backend ck-int8 to the Linux
launcher command. Changing an existing supervisor's choice requires an idle
managed relaunch; a Manager reboot retains its supervisor's original arguments.
Check the actual loaded attention and native_cuda_ready in /h3_studio/readiness.

## Memory, caching and recovery

The Linux worker uses cgroup-aware RAM-pressure node caching and FP16
intermediates. It does not disable all result reuse with --cache-none. This cache
is separate from the optional Spectrum/MotionCache sampling approximations.
Generation models are released after the completed latent is atomically saved,
before audio/video VAE decode. The detached supervisor restarts a failed owned
worker and checks supported tracked decode recovery when admission is open and
the queue is idle. [Recovery contract and cancellation](DECODE_RECOVERY.md).

A40 GB workspace completed the tested1024×576 Original362-frame and Singularity
209-frame outputs with full video/audio decoding. Sampling still approached the
RAM limit. Older1280×704 long-reference jobs exhausted RAM; do not treat the
smaller successful workloads as proof that larger ones fit. At least64 GB
advertised system RAM gives more headroom for long reference-heavy work, but is
not a guarantee. Multiple GPUs do not automatically pool their VRAM.

The matched Original test took1201.28 s with PyTorch Flash and 582.94 s with CK INT8
attention. Compare only identical model, references, dimensions, seed and sampler
settings. See [full measurement and limits](LAUNCHER.md#attention-selection-and-supervised-workers).

## Storage and provider boundaries

Keep user input/output media, projects and context files on persistent workspace
storage. A separately mounted weight dataset does not transfer those user files
to a new workspace. The launcher's plan reports exact missing weights and free
space; optional BF16 Qwen and community checkpoints need additional storage.
Export project ZIPs or use the documented library backup for migration.

Older openbayes_h3.sh and fresh-workspace helpers describe a legacy h3-stack
layout. Use them only for that layout after checking their paths; they are not the
recommended universal entry point. No supervisor prevents provider eviction,
container deletion or loss of unsynced storage. Sampling has no resumable solver
checkpoint. [Current verified scope](PRODUCTION_READINESS_2026_10_15.md).
