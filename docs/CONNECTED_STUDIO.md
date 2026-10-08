# Connected H3 Studio

This upgrade connects reference-aware prompt preparation, native H3 graphs and saved result settings. CPU and browser validation do not establish generated-video quality.

## Prompt preparation

AI preparation is the default. Configure an OpenAI-compatible vision chat server using `H3_LLM_BASE` (default localhost port 8080), `H3_LLM_MODEL`, and optionally `H3_LLM_API_KEY`. Configuration belongs on the server, never in browser requests. The provider must support supplied image content.

Images and six sampled frames from each usable video span are sent with exact asset names and roles. Audio is attached to H3 but is **not transcribed/listened to** by this preparation service; provide exact dialogue in the brief. Sparse frames cannot prove full action or timing comprehension. Output is checked for native headings, attached reference bindings and supplied dialogue tags. Invalid preparation blocks submission; no silent text-only fallback occurs.

Preparation waits for an empty render queue. For shared-GPU providers, `/unload` must release prompt-model memory before rendering. Set `H3_LLM_ISOLATED=1` only when the provider uses separate hardware or CPU. `Use my prompt directly` is an explicit alternative; its deterministic compiler resolves mentions and warns when structured prose bypasses role guidance.

## Optional models

Windows: `./install.ps1 -ControlNet -Refine` forwards optional installation flags. Linux bootstrap: set `H3_INSTALL_CONTROLNET=1` and/or `H3_INSTALL_REFINE=1`. Download scripts pin revisions and verify SHA-256. Optional features remain disabled until their nodes and model files pass readiness checks.

Fun-ControlNet Union 2.0 is a structural model patch, not a LoRA. Use Text or Frames mode with a **prepared** pose/depth/canny/hed/mlsd/scribble/layout/gray representation. The UI does not automatically extract these from arbitrary video. Inpaint accepts a source video and a canvas-sized black/white PNG mask (white regenerates), with optional control representation. Files are aligned to 24 fps and the selected canvas/frame count; short clips are rejected rather than padded. References mode, continuation and refinement cannot be combined with ControlNet in this integration.

General Motion Continuity Repair V2 is an optional LoRA (`Motion_Repair_V2.safetensors`), initially 0.9 when selected. With refinement its second-pass strength is 0.25. These defaults follow publisher guidance, not project-specific visual proof. Refine is a separate 10-step pass, scale 1.25, denoise 0.4; it is not a certified flicker cure.

## Quality and reference correctness

Custom video roles no longer force source motion/sound preservation. Reference frames and paired audio are cropped to the same native usable span. Guided shot numbering and sound coverage are consistent. Control runs after sigma shift so percent-based schedules use the shifted sampling range.

Keep the pruned INT8 checkpoints and verified VAE seam repair. The open brightness issue concerns Full FL2VA checkpoints in its reporter's tests; the proposed time-embedding modification is not applied. Generic `--fast` was removed from the legacy service template. ComfyUI remains pinned until GPU comparison establishes an improvement.

Result details include an optional bounded brightness diagnostic (first 15.2 seconds, up to 362 frames). It flags suspected 17-frame periodic changes and excludes large scene-cut differences. It cannot certify fine-detail temporal stability, VAE seams, or absence of all flicker. Compare identical input/seed under Original quality before evaluating accelerators or optional adapters.

Neither Fun-ControlNet nor promptwriter is a verified replacement for the proprietary H3-Context-IR service. No live model inference was available for this upgrade.

## Local simulation

Run `python scripts/studio_preview.py --port 18772` and open the printed localhost URL. The visible simulation banner identifies the deterministic provider and synthetic clips. Real project persistence, media preparation and graph validation are exercised without downloading weights or contacting a GPU.

## Primary sources checked

- [MiniMax H3 source and documentation](https://github.com/MiniMax-AI/MiniMax-H3)
- [Full-checkpoint periodic flashing report, issue 85](https://github.com/MiniMax-AI/MiniMax-H3/issues/85)
- [Native ComfyUI H3 integration](https://github.com/Comfy-Org/ComfyUI/blob/master/comfy_extras/nodes_minimax_h3.py)
- [Comfy-Org H3 weights](https://huggingface.co/Comfy-Org/MiniMax-H3)
- [General Motion Continuity Repair publisher](https://huggingface.co/JOKER141/MiniMax-H3-General-Motion-Continuity-Repair)
- [Latent upscaler extension](https://github.com/LBH-123-AI/Comfyui_Minimax_h3_latent_Upscaler)
- [Upscaler flicker report, issue 26](https://github.com/LBH-123-AI/Comfyui_Minimax_h3_latent_Upscaler/issues/26)
