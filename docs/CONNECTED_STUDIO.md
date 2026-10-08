# Connected H3 Studio

This upgrade connects reference-aware prompt preparation, native H3 graphs and saved result settings. CPU and browser validation do not establish generated-video quality.

## Prompt preparation

AI preparation is the default. Configure an OpenAI-compatible vision chat server using `H3_LLM_BASE` (default localhost port 8080), `H3_LLM_MODEL`, and optionally `H3_LLM_API_KEY`. Configuration belongs on the server, never in browser requests. The provider must support supplied image content.

Images and six sampled frames from each usable video span are sent with exact asset names and roles. Audio is attached to H3 but is **not transcribed/listened to** by this preparation service; provide exact dialogue in the brief. Sparse frames cannot prove full action or timing comprehension. Output is checked for native headings, attached reference bindings and supplied dialogue tags. Invalid preparation blocks submission; no silent text-only fallback occurs.

Preparation waits for an empty render queue. For shared-GPU providers, `/unload` must release prompt-model memory before rendering. Set `H3_LLM_ISOLATED=1` only when the provider uses separate hardware or CPU. `Use my prompt directly` is an explicit alternative; its deterministic compiler resolves mentions and warns when structured prose bypasses role guidance.

## Optional models

Refinement dependencies are installed by default (the weight is about690MB); activation remains optional. Windows: `./install.ps1 -ControlNet` also installs optional ControlNet; use `-SkipRefine` to omit refinement dependencies. Linux: set `H3_INSTALL_CONTROLNET=1` for ControlNet, or `H3_INSTALL_REFINE=0` to explicitly skip refinement. Download scripts pin revisions and verify SHA-256. Optional features remain disabled until their nodes and model files pass readiness checks.

Fun-ControlNet Union 2.0 is a structural model patch, not a LoRA. In Text or Frames mode, the default input is an **ordinary video**: choose body motion (DWPose), scene structure (Depth Anything V2 Small), outlines (OpenCV Canny), or grayscale lighting. The server extracts the selected representation on CPU, aligns it to the selected canvas at 24 fps, and validates exact dimensions/frame count. Pose/depth require the optional pinned auxiliary source and verified weights; unavailable extractors are disabled explicitly. HED, MLSD, scribble and layout remain advanced prepared-map inputs. No substitute extractor is silently selected.

The selected source span automatically clamps generation down to the native 5+17k frame lattice when shorter than the requested duration; it does not loop or pad. Inpaint accepts an ordinary source video and a static binary mask (white regenerates). A source-sized mask is fitted with nearest-neighbor sampling using the source's canvas transformation; incompatible aspect ratios fail before uploads. References mode, continuation and refinement cannot be combined with ControlNet in this integration.

CPU preparation reports frame progress and supports cancellation with derived-file cleanup. A content-verified map cache retains at most eight entries/256 MiB, checks dependencies before reuse, and issues fresh per-generation files. AI preparation receives six sampled RGB source frames as supplementary evidence without inventing native reference tags. Preview aligns this RGB source without extracting a full control map. Prepared maps alone are not presented as RGB source evidence. Prompt caching ignores transient preparation IDs/artifact names while retaining semantic settings and media hashes.

Optional ControlNet installation also installs the pinned preprocessing dependencies and hash-verified DWPose/Depth weights. Existing working ONNX Runtime installations with CPU support are preserved, including GPU-enabled runtimes used by other projects; a pinned CPU runtime is installed only when absent. Broken existing runtimes stop installation with an explicit error.

General Motion Continuity Repair V2 is an optional LoRA (`Motion_Repair_V2.safetensors`), initially 0.9 when selected. With refinement its second-pass strength is 0.25. These defaults follow publisher guidance, not project-specific visual proof. Refine is a separate 10-step pass, scale 1.25, denoise 0.4; it is not a certified flicker cure.

## Shared-server queue and visual identity

The existing charcoal/lime identity is preserved; reference mentions remain blue. Queue cards show running/pending counts, ownership and your actual waiting position. Other projects are labeled generically; their prompts, assets and internal IDs are not displayed. Cancel uses the owned-job path, never a foreign-job action.

When AI preparation encounters a busy queue, the browser retains uploads and waits automatically. This stage is explicitly described as preparation waiting, not an already-queued generation. Native generation can join the ComfyUI queue immediately. Uncertain queue/history state retains the job identity and inputs instead of inferring failure after30seconds. Foreign failures cannot stop the tracked job; foreign starts and owned terminal events clear preview ownership.

Preparation checks queue idleness and serializes Studio preparation/submission routes. This is not a global reservation across unrelated clients directly submitting to ComfyUI. For simultaneous clients on the same GPU, an isolated prompt provider is the safest deployment boundary.

## Quality and reference correctness

Custom video roles no longer force source motion/sound preservation. Reference frames and paired audio are cropped to the same native usable span. Guided shot numbering and sound coverage are consistent. Control runs after sigma shift so percent-based schedules use the shifted sampling range.

Keep the pruned INT8 checkpoints and verified VAE seam repair. The open brightness issue concerns Full FL2VA checkpoints in its reporter's tests; the proposed time-embedding modification is not applied. Generic `--fast` was removed from the legacy service template. ComfyUI remains pinned until GPU comparison establishes an improvement.

Result details include an optional bounded brightness diagnostic (first 15.2 seconds, up to 362 frames). It flags suspected 17-frame periodic changes and excludes large scene-cut differences. It cannot certify fine-detail temporal stability, VAE seams, or absence of all flicker. Compare identical input/seed under Original quality before evaluating accelerators or optional adapters.

Neither Fun-ControlNet nor promptwriter is a verified replacement for the proprietary H3-Context-IR service. No live model inference was available for this upgrade.

## Local simulation

Run `python scripts/studio_preview.py --port 18772` and open the printed localhost URL. The visible simulation banner identifies the deterministic provider and synthetic clips. Real project persistence, CPU Canny/grayscale extraction, media preparation and graph validation are exercised without downloading weights or contacting a GPU. Local pose/depth inference and production provider/GPU renders were not executed.

## Primary sources checked

- [MiniMax H3 source and documentation](https://github.com/MiniMax-AI/MiniMax-H3)
- [Full-checkpoint periodic flashing report, issue 85](https://github.com/MiniMax-AI/MiniMax-H3/issues/85)
- [Native ComfyUI H3 integration](https://github.com/Comfy-Org/ComfyUI/blob/master/comfy_extras/nodes_minimax_h3.py)
- [Comfy-Org H3 weights](https://huggingface.co/Comfy-Org/MiniMax-H3)
- [General Motion Continuity Repair publisher](https://huggingface.co/JOKER141/MiniMax-H3-General-Motion-Continuity-Repair)
- [Latent upscaler extension](https://github.com/LBH-123-AI/Comfyui_Minimax_h3_latent_Upscaler)
- [Upscaler flicker report, issue 26](https://github.com/LBH-123-AI/Comfyui_Minimax_h3_latent_Upscaler/issues/26)

- [Fun-ControlNet Union 2.0 publisher](https://huggingface.co/alibaba-pai/MiniMax-H3-Fun-Controlnet-Union-2.0)
- [Pinned auxiliary preprocessors](https://github.com/Fannovel16/comfyui_controlnet_aux/tree/0cd290477128d42cdc3e76a826a402d866e8c684)
