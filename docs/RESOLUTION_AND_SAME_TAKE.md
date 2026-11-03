# Resolution and preserving a take

Changing generation size changes the latent grid and may change composition, motion and identity with the same seed. Native detail 1344×768 is Studio's upper recommended starting canvas. Larger direct choices are experimental: 1664×928 runs directly; Full HD runs 1920×1088 then crops to 1920×1080. These regenerate rather than enlarge an approved file.

**Upscale same take** uses CPU Lanczos and copies audio. Targets are 2× or 1080/1440 short edge, preserving display ratio with even pixels. 864×480 becomes 1944×1080. No diffusion detail/interpolation is added. Generative refinement instead enlarges latents and samples again, potentially changing the shot.

`POST /h3_studio/lab/media/export` accepts managed existing video, not arbitrary paths. Unsupported rotation metadata is rejected. One export runs at a time; dimensions, frames, fps, timing, audio and full decode are checked before publishing. Failure/cancellation removes temporary output and retains the original. Activity tracks exports across devices.

Synthetic tests cover audio/timing preservation, non-square pixels and cleanup. A historical 864×480 →1728×960, 311-frame export preserved original/audio packet timing and took 26.55 CPU seconds for that file only. This does not predict other machines or separate diffusion renders.

Attention is independent from canvas. Current default is native CK INT8; explicit PyTorch is the baseline. Old PyTorch-default notes are superseded. [Runtime policy](RELEASE_2_7.md) · [Compatibility](COMPATIBILITY_MATRIX.md).
