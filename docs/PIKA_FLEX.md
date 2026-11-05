# Pika Flex Turbo - experimental native H3 adapters

Source: https://huggingface.co/Pika-Labs/Pika-H3-Flex-Turbo-LoRA
Pinned revision: dcacd93a50f714ba1cd61c7ca2cc5f65e9a1ec60.

Seven adapters (four full 4-step/8-step HD files, two 4-step Lite rank-32 files and one Ref2VA-only 2-step Draft) are prepared by the standard launcher. Exact sizes and SHA256 values are in deploy/download_optional_loras.py. Total extra download: 20,181,935,784 bytes. The shared launcher resumes downloads and reuses verified cached files. Weights are not bundled in source archives. The default generation remains Original without any adapter selected.

In Studio, select Original H3 and Original quality (or explicitly select the installed Singularity v2 pruned INT8 checkpoint in References), then choose a variant from Model configuration > Pika Flex Turbo. Creative LoRAs remain in their own section. Use FL2VA for Text/Frames, Ref2VA for References. Selection sets its step count, Euler/simple, CFG1, denoise1, strength1, audio shift3 and video shift6 (FL2VA) or12 (Ref2VA). Steps and sampling are validated at submission. Use alone, disable refinement, audio enhancement, ControlNet and continuation. Other checkpoint profiles remain outside this integration. Lite is approximately 310 MB per file and uses lossy rank compression. Draft is for iteration, not a default quality upgrade; use 4/8 steps for final review. Switching modes retains the Lite family; the Ref2VA-only Draft turns off for Text/Frames.

2-step Draft targets fast framing/motion iteration; 4-step targets speed; 8-step HD targets detail and can better preserve audio. Fewer steps may reduce motion, fine detail or audio quality; this does not guarantee the same result as Original. No trigger word is required. The publisher combines Pika Flex style/motion with LightX2V distillation; do not stack another Turbo adapter.

RTX 5090 operation depends on resolution, duration, offloading and remaining VRAM. The publisher benchmarked H200/A100 at 848x480 and 121 frames; those timings are not a 5090 or 1080p/15s guarantee. The dated [5 November audit](PIKA_AUDIT_2026_11_05.md) records existing 8-step Ref2VA outputs on the inspected rental. Other variants and combinations still need their own GPU validation.

The model derivative uses the MiniMax H3 Community License Agreement, separately from this project's source license. Credits: MiniMax, Pika/Mellis, LightX2V and the adapter publisher.

Studio2.8 applies required Pika settings automatically and preserves supported Dial steering separately. Reference video soundtracks and standalone audio use independent budgets; see [selection policy](MATLOW_AND_SELECTIONS.md).

## Local Turbo versus official Flex

The installed 2/4/8-step files are fused Turbo LoRAs. Their publisher explicitly uses ordinary H3 nodes and `LoraLoaderModelOnly`; no Pika-specific node pack is required for this route. The separate [official Flex package](https://github.com/Pika-Labs/Pika-H3-Flex) publishes two adapters and a six-evaluation inference schedule. Those weights, numeric policies and schedule are not interchangeable with this integration. Studio does not claim to run the separate official package.

References retain card order within each media type. Images map to `<Picture N>`; subject definitions link identities to those pictures. Videos map to `<Video N>`, their enabled soundtracks consume `<Audio N>` before standalone audio. Storyboards and spatial plans remain reference images unless an explicit temporal guide is separately selected. Role labels are semantic instructions, not isolated model channels or hard preservation masks.

The UI identifies the active Turbo tier and family in the render summary and saved-video settings, reports automatically disabled conflicting selections, and hides the generic full-sampling recommendation while Pika is active. Long compiled prompts get a visible advisory above the official package's 8,000-character limit. The local Turbo route has separate tokenizer limits; Studio does not truncate or reject an otherwise valid local prompt solely for exceeding that published package limit. Review the compiled prompt to resolve conflicting retention and appearance instructions.

## Singularity v2 selection

The installed v2 pruned INT8 checkpoint is preferred when switching into Singularity. An explicitly restored checkpoint is retained. Resolving the installed checkpoint before applying compatibility policy prevents a valid Pika selection from being removed during a profile transition. Other Singularity checkpoints remain gated by the existing compatibility policy.

The dedicated Turbo selector lists installed variants for the current input mode, ordered HD, full 4-step, Lite, then References-only Draft. Turning it off restores ordinary sampling through the same managed adapter handler. Conflicts remain visible in the selection notice; this is deterministic local workflow coordination.

The [Singularity publisher](https://huggingface.co/WarmBloodAban/Minimax-h3_Singularity) recommends focused prompts around 5,000 characters or less and the full 4-step Ref2VA Turbo adapter. The UI displays an advisory above that length without truncating the prompt. This is guidance, not a minimum or a certified quality limit. Native structured prompts also surface a warning when they bypass reference card roles, panel ordering and instructions.

No additional node package or second LightX2V adapter is needed for this native Turbo route. The installed 4-step fused adapter already includes that acceleration. New Singularity v2 GPU validation is still pending; the latest browser check preserved ongoing user renders rather than replacing them with a benchmark.
