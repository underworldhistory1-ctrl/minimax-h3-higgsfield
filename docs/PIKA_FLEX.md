# Pika Flex Turbo - experimental native H3 adapters

Source: https://huggingface.co/Pika-Labs/Pika-H3-Flex-Turbo-LoRA
Pinned revision: dcacd93a50f714ba1cd61c7ca2cc5f65e9a1ec60.

Seven adapters (four full 4-step/8-step HD files, two 4-step Lite rank-32 files and one Ref2VA-only 2-step Draft) are prepared by the standard launcher. Exact sizes and SHA256 values are in deploy/download_optional_loras.py. Total extra download: 20,181,935,784 bytes. The shared launcher resumes downloads and reuses verified cached files. Weights are not bundled in source archives. The default generation remains Original without any adapter selected.

In Studio, select Original H3 and Original quality (or explicitly select the installed Singularity v2 pruned INT8 checkpoint in References), then enable one Pika adapter under LoRAs. Use FL2VA for Text/Frames, Ref2VA for References. Selection sets its step count, Euler/simple, CFG1, denoise1, strength1, audio shift3 and video shift6 (FL2VA) or12 (Ref2VA). Steps and sampling are validated at submission. Use alone, disable refinement, audio enhancement, ControlNet and continuation. Other checkpoint profiles remain outside this integration. Lite is approximately 310 MB per file and uses lossy rank compression. Draft is for iteration, not a default quality upgrade; use 4/8 steps for final review. Switching modes retains the Lite family; the Ref2VA-only Draft turns off for Text/Frames.

2-step Draft targets fast framing/motion iteration; 4-step targets speed; 8-step HD targets detail and can better preserve audio. Fewer steps may reduce motion, fine detail or audio quality; this does not guarantee the same result as Original. No trigger word is required. The publisher combines Pika Flex style/motion with LightX2V distillation; do not stack another Turbo adapter.

RTX5090 compatibility is expected with a working H3 INT8 ComfyUI setup, subject to resolution, duration, offloading and remaining VRAM. The publisher benchmarked H200/A100 at848x480 and121frames; those timings are not a5090 or1080p/15s guarantee. This release has source/CPU tests only, no new5090 render or perceptual validation. The previous rental is stopped; these weights have not been deployed to it.

The model derivative uses the MiniMax H3 Community License Agreement, separately from this project's source license. Credits: MiniMax, Pika/Mellis, LightX2V and the adapter publisher.

Studio2.8 applies required Pika settings automatically and preserves supported Dial steering separately. Reference video soundtracks and standalone audio use independent budgets; see [selection policy](MATLOW_AND_SELECTIONS.md).
