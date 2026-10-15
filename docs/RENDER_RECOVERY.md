# Render progress and worker restart recovery

The studio follows the existing job after browser refresh or a lost socket.
Loading, sampling, decoding and saving remain separate stages. Reconnecting does
not submit another render. Cancellation stays scoped to the owning job.

## Worker restart

If an acknowledged job disappears from the queue and history after a restart,
Studio checks its saved output. A verified output completes the durable job;
otherwise it reports the restart/failure instead of leaving it queued forever.
On Linux, the launcher starts a detached supervisor that restarts its owned worker
with the selected Python, port, VRAM reserve and attention backend. This cannot
keep a provider container alive after eviction or power loss.

## Completed sampler, interrupted decode

H3ReleaseForDecode atomically saves the completed audio/video latent before
unloading generation models. Supported recovery builds a decode-only graph from
the saved workflow and checkpoint, using H3LoadSavedLatent and the original VAEs,
frame rate, resize/crop and supported constant trim. It does not run KSampler.

Recovery is a durable child job linked to its parent and visible in the same
project. Its submission and cancellation use the normal job protocol. Unknown
submission acknowledgements are not blindly retried, and unsupported graphs
retain their checkpoint for inspection. Cancelled jobs stay cancelled.
See [the exact supported paths and limits](DECODE_RECOVERY.md).

## Sampling interruptions and memory

There is no mid-sampling solver checkpoint. Losing the worker during denoising
requires a deliberate new render from the beginning. A completed latent does not
guarantee that decode will fit in RAM. RAM-pressure node caching is separate from
Spectrum and MotionCache, which change the sampling computation.

The current RTX 5090 checks completed Original and Singularity video/audio output,
and an owned idle-worker restart recovered the configured backend. Older restart
checks and rendered clips describe their own workloads; no finite test guarantees
all prompts, resolutions or provider interruptions. [Current evidence](PRODUCTION_READINESS_2026_10_15.md).
