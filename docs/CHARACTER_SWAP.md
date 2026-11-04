# Character Swap

The optional [akatz-ai adapter](https://huggingface.co/akatz-ai/MiniMax-H3-Character-Swap-LoRA) requires a source video and replacement-character image in References. It is model-only, with no trigger word. Open **Model & workflow → Character replacement**, identify the source person and choose **Apply replacement prompt preset**. Compatible selected settings and reference identities/order remain intact. Strength 1 is the initial value. The publisher suggests a continuous 4–5 second single-person shot as a starting experiment, not an enforced duration limit.

Original Ref2VA is the published training family. Singularity/Hybrid combinations remain experimental; the publisher's hybrid block recipe differs from this project's overlay. Acceleration, stacking and extra passes do not imply tested visual compatibility. Text/Frames without reference conditioning is rejected. Source soundtrack reuse is separate and does not guarantee lip sync.

The shortcut uses publisher-recommended V1.5 when no swap adapter is selected, and preserves an explicitly selected V1 for existing scenes. Selecting one version disables the other; mixed-version saved graphs are rejected. V1.5 is pinned at `96ea3407b230b6f7df71c58c70e31df96bd7e533`, file `h3_character_swap_v1.5.safetensors`, 155110792 bytes, SHA-256 `8f2c3c3eba161df8d0c6099598b4730f641f5ce01e04cd16d2427cff8a35218f`. Publisher examples suggest better identity retention in selected shots, not universal improvement.

Legacy pinned file: `h3_character_swap_pro4500_1000.safetensors`; revision `a665bb7e3bb9804e487d2925f67744f554c8ad49`; 155110320 bytes; SHA-256 `4b2a3f420ae804c0aa3422761ff84dbd1bf52eef6900ffab6d2e66df63cb4e79`. Metadata describes rank-16 ai-toolkit keys and Ref2VA training. Training tools are not inference dependencies. Weights use the MiniMax H3 Community License Agreement.

Tests cover required inputs, model/strength wiring and shortcut mappings. Browser fixtures do not establish GPU quality. Multiple-person replacement, expressions, timing and cuts remain scene-dependent. Disable the adapter to return to the usual graph; [launcher updates](LAUNCHER.md) preserve media.
