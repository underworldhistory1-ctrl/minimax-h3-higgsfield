# H3 Studio compatibility

Pinned core: ComfyUI 0.43.0. Native CK INT8 attention is the default; `--attention-backend pytorch` selects the baseline. Weight precision, attention and render-method acceleration are separate choices. Historical GPU evidence predates the current pinned-core update.

| Selection | Route and limits |
| --- | --- |
| Original Text/Frames | FL2VA + ImageToVideo; optional first/last images and supported passes |
| Original References | Ref2VA + ReferenceToVideo; named images, videos and audio |
| Singularity v1.3 / v2 INT8 | Independent community checkpoints. v1.3 has historical 209-frame Anime → Realism output/full-decode evidence; v2 has source/graph checks only, no new GPU render |
| Hybrid conditioning | FL2VA with reference conditioning; experimental, GPU quality unverified here |
| Hybrid loader | Optional pinned tensor-overlay loader; experimental, GPU quality unverified here |
| Native | Default 20 steps, res_multistep/simple, CFG 1, denoise 1, shifts 12/3 |
| Spectrum / MotionCache | Separate approximation methods, mutually exclusive and capability-gated |
| Turbo v4 EMA | Original Text/Frames, 4–8 steps and dedicated sampler, no extra adapters/passes |
| LightX2V 8-step | Original References Turbo route; historical 124-frame 864×480 video/audio output verified |
| Pika Flex Turbo | Original or exact Singularity v2 pruned INT8 in References, matching 2-step Draft / 4-step / 4-step Lite / 8-step HD FL2VA/Ref2VA adapter; [required settings](PIKA_FLEX.md) |
| Dials | Installed motion/mood vectors after LoRAs before Sigma Shift, saved with the project |
| MotionLab / Contact Sheet | Optional MAINodes backend tools; not integrated Studio controls |

## Inputs and passes

| Input/pass | Behavior |
| --- | --- |
| References | Up to 12 files, 9 images, 3 videos totaling 15 seconds and 3 standalone audio files totaling 15 seconds; paired video audio is separate |
| Storyboard | Image role guiding composition/order; no automatic panel splitting or exact timing |
| First/last frames | Optional images with fit settings, not guaranteed pixel-identical frames |
| Temporal guides | Separate images at selected times; requires native AddGuide |
| Control image/video | Prepared maps or installed Pose/Depth/Canny/Gray extraction; a still provides constant guidance |
| References + ControlNet | Requires native capability; historical Original Ref2VA + static Canny output decoded |
| Masked region | Video plus matching static mask; no moving-object tracking |
| ControlNet + continuation/Refine/audio enhancement | Rejected before generation |
| Source soundtrack reuse | Explicit trimmed source audio, requires sufficient duration, bypasses audio enhancement |
| Refine | Latent upscale and another sampler pass; can change appearance/motion |
| Audio enhancement | Extra H3 pass protecting original video latents; [details](AUDIO_ENHANCEMENT.md) |
| Continuation | Requires saved context/latents and target longer than retained 39-frame context |
| Upscale same take | CPU Lanczos enlargement with copied audio; no diffusion detail |

## Adapters

| Adapter | Requirements/evidence |
| --- | --- |
| Realism People | Explicit selection, all modes, `r34l1sm` trigger |
| Combat V2 | Publisher tested FL2VA; historical Ref2VA INT8 strength-1 362-frame 1024×576 video/audio output completed |
| Motion Repair V2 | Optional, not a mandatory repair pass |
| Character Swap | References + source video + replacement image; [guide](CHARACTER_SWAP.md) |
| Anime → Realism | References + source video + `LumiReal`; historical Singularity execution verified; [guide](ANIME_TO_REALISM.md) |
| Unknown LoRA | Installed filename does not establish training-family compatibility or optimal quality |

Seed 42 is a reproducible default, not a quality score. Exact uint64 values are preserved. Duration snaps to 5+17k frames, from 5 to 362 at 24 fps. Below 124 frames is outside the usual trained range. Larger direct canvases are experimental and can change the shot. [Seeds/duration](SEED_AND_DURATION.md) · [Resolution](RESOLUTION_AND_SAME_TAKE.md).

A historical matched RTX 5090 workload took 9m43s with CK INT8 versus 20m01s with PyTorch Flash at 1024×576, 362 frames and 20 steps. This is one workload, not a general speed/quality guarantee. [Measurements](LAUNCHER.md#attention-selection-and-supervised-workers) · [GPU history](PRODUCTION_READINESS_2026_10_15.md) · [Automatic selections](MATLOW_AND_SELECTIONS.md).
