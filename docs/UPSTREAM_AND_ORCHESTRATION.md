# Upstream audit, motion tools and local orchestration

Audit date: 2026-11-04. This separates shipped software, independently installed backend tools and research candidates. No new GPU render or perceptual comparison was performed.

## Shipped in 2.10

| Component | Decision and integration |
| --- | --- |
| [Pika Flex Turbo](https://huggingface.co/Pika-Labs/Pika-H3-Flex-Turbo-LoRA) | Canonical publisher URL, seven managed adapters: four full variants, two rank-32 Lite variants and Ref2VA-only two-step Draft. Exact file-specific sampling is automatic. Lite remains Lite when changing input families; Draft turns off when leaving References. |
| [Character Swap](https://huggingface.co/akatz-ai/MiniMax-H3-Character-Swap-LoRA) | Add publisher-recommended 1.5 and retain V1. Shortcut preserves an explicitly selected V1; otherwise prefers 1.5. Selection replaces the other swap version. Saved/submitted mixed versions are rejected. |
| [Singularity](https://huggingface.co/WarmBloodAban/Minimax-h3_Singularity) | Add explicitly requested v2 pruned INT8, alongside v1.3. Pika can retain this exact v2 checkpoint in References. Other Pika checkpoint combinations remain rejected. |
| [MAINodes](https://github.com/matlowai/ComfyUI-MAINodes) | Update optional pack to v1.2.2, pinned commit `1880dfcc231c15179507d2b4d78b9a59bea229b1`. Includes independent Motion Lab, Contact Sheet, MAI Dials and RelayVSR tools. These do not become automatic Studio passes. |
| [Dials](https://github.com/matlowai/ComfyUI-Dials) | Pin current source `7dd0b7e3513eb60915833eecfc6e547f3976762f`. The upstream difference is documentation; Studio retains its existing Dials nodes and stored selections. |

All 28 artifacts in the audited base/refine/control/Qwen INT8+BF16 launcher manifest matched current publisher file sizes and SHA-256 metadata. Existing base weights therefore retain their immutable pins. Newly cataloged weights have pinned revisions, sizes and hashes. Metadata verification does not mean those weights were downloaded or rendered locally.

The added default LoRA downloads total **4,687,800,976 bytes** beyond the previous set. The seven Pika files together total **20,181,935,784 bytes**. Singularity v2 is a separate explicit **20,967,647,456-byte** download; it does not replace v1.3. The source release contains no model weights. Preflight reports uncached bytes, and the launcher verifies/resumes actual downloads.

Linux: append `--checkpoint singularity-v2-int8` to the normal launcher command. Windows: append `-Checkpoint singularity-v2-int8`. For Matlow packs use `--matlow` / `-Matlow`; recognized existing installations remain managed. See [launcher](LAUNCHER.md).

ComfyUI remains on stable release 0.43.0. At audit time the latest-release API still selected 0.43.0 while the development branch already contained a 0.44.0 version commit. A moving development branch is not substituted for the tested runtime. Hybrid and AudioRefine source pins had no newer commits. Additional Qwen Turbo and H3 precision variants require distinct runtime/graph validation and were not silently substituted for the current base.

## Which additions can improve motion?

These are engineering recommendations, not measured quality rankings. Select by the failure being corrected.

| Tool | Useful operation | Boundary and adoption decision |
| --- | --- | --- |
| [MAINodes Motion Lab](https://github.com/matlowai/ComfyUI-MAINodes#motion-lab-de-rope) | Detect bursty motion in latents, retime it, regenerate with more temporal room, recover the original timing | Strong H3-specific candidate for motion smear. Adds a render and can change the shot; does not enforce physical laws. Available through the updated optional backend pack, not yet a Studio repair button. |
| [ControlNet auxiliary preprocessors](https://github.com/Fannovel16/comfyui_controlnet_aux) | Extract pose/depth from a source performance | Already scoped/pinned in this project. Source choreography and geometry are more controllable than asking an unconstrained prompt to repair motion. They do not infer correct contacts or forces. |
| [Meta SAM 3](https://github.com/facebookresearch/sam3) | Segment and track a selected subject for masked editing | Strong official research implementation. Requires model/license/runtime review and a tested mask-to-H3 contract. Not installed by this release; segmentation alone cannot guarantee successful replacement. |
| [Video Depth Anything](https://github.com/DepthAnything/Video-Depth-Anything) | Temporally consistent depth estimation across video | Worth evaluating for stable depth guidance instead of unrelated per-frame estimates. Requires an adapter, resource measurements and H3 ControlNet comparison; not installed. Its upstream Small/Large licenses differ. |
| [H3 Relay](https://github.com/akatz-ai/h3-relay) | Steerable, resumable H3 timelines and character replacement workflows | Relevant reference implementation. A second queue/history/continuation owner must not be installed as a replacement for Studio's services without an explicit integration contract. Not installed. |
| [RIFE](https://github.com/hzwer/ECCV2022-RIFE) | Interpolate frames for playback smoothness | Useful optional finishing operation. Can interpolate an incorrect movement and introduce artifacts around occlusions; does not repair choreography. Not installed. |
| MAINodes RelayVSR | Learned 2x/4x video enlargement | Pack source is updated; 42 upstream CPU contract tests passed. Its separate workers/models are not prepared by Studio, and GPU output is unverified. Studio's existing Lanczos export remains unchanged. |

For contacts, balance, object permanence and believable action, the practical order is: controlled source performance or spatial planning, appropriate conditioning, native-resolution draft review, then targeted regeneration. A sharper or smoother export cannot establish correct physics. No generic node pack can certify arbitrary generated scenes as physically correct.

## Orchestrator: what already runs locally

No API key is needed for the deterministic path below. These are existing services plus the 2.10 selection improvements, not new autonomous visual agents.

| Stage | Actual implementation | What is automatic |
| --- | --- | --- |
| Prepare | `prompt-compiler.js`, reference policy, asset resolve routes | Map named inputs to native tags, preserve roles/groups/instructions, separate audio/video budgets, fit and resolve inputs. Automatic local formatting does not understand a scene like a vision-language model. |
| Select | `configuration.js`, `studio.js` | Apply managed adapter steps/shifts/strength, match family, retain supported checkpoint, disable incompatible extra passes and mutually exclusive swap versions. Saved incompatible intent remains visible. |
| Validate | `configuration.py`, capabilities and job admission | Compare declared settings with connected graph, inspect available nodes/files, reject missing or conflicting paths before inference. |
| Execute | `jobs.py`, GPU admission, preparation/export jobs | Persist request identity and state, serialize shared GPU work, track acceptance/progress/cancellation, reconcile missing replies. |
| Recover | `decode_recovery.py`, continuation/context services | Use supported saved-latent decode recovery and explicit continuation. Do not restart sampling and label it a resumed solver. |
| Verify | Output saving, media inspection and library/history | Technical output identity, dimensions, frames and audio. No automatic semantic physics or identity score is claimed. |

## Recommended full local-agent architecture

This is a design recommendation; a full autonomous visual-review loop is **not implemented by 2.10**. The appropriate next step needs a locally hosted instruction/vision model and actual GPU acceptance tests. The existing Qwen image generator and H3 text encoder are not automatically chat/vision reviewers.

1. **Structured request:** preserve explicit user locks (identity, references, dialogue, duration, quality ceiling). A planner proposes a typed render intent, never executable shell or arbitrary node code.
2. **Capability resolver:** translate that intent through the existing deterministic selection and graph validators. A model cannot bypass a rejection or substitute missing references.
3. **Budget scheduler:** reserve the shared GPU, load the local reasoning model for preparation, unload it before H3/Qwen render, and bound VRAM, time and render attempts. The existing local-provider path already requires safe unload or isolated hardware.
4. **Draft and review:** when the user selects an iterative quality goal, render a bounded draft, inspect sampled frames and audio with a local reviewer, and attach evidence to identity/contact/motion findings. A low model score must not silently change locked inputs or trigger unlimited expensive retries.
5. **Targeted correction:** choose a registered operation (pose/depth conditioning, masked replacement, de-rope, alternate seed, final render, export) only when its input/output contract and runtime are available. Unavailable repair paths produce a concrete explanation.
6. **Durable result:** retain the accepted draft, final, settings, lineage, retry reason and cancellation ownership. Server jobs remain the execution authority; the planner must not duplicate the queue.

[LangGraph](https://github.com/langchain-ai/langgraph) is a credible candidate for resumable multi-step decision state; [PydanticAI](https://github.com/pydantic/pydantic-ai) is a candidate for typed model/tool boundaries. Neither supplies a local model or improves H3 output by installation alone. Do not add both frameworks merely to rename the existing coordinator. Start with a typed planner adapter on the existing job system; adopt a graph runtime only when durable branching cannot be kept clear there.

Acceptance gates for that future mode: no duplicate submission after restart, cancellation stops owned work, failed review never overwrites accepted outputs, attempts respect a declared budget, local-model unload is proven, invalid plans fail before GPU submission, and perceptual/physics claims are checked against actual renders. Until then the shipped behavior is automatic configuration and execution coordination, with optional configured AI preparation.
