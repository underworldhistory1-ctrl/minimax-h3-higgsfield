# Automatic selections and Matlow tools

Studio builds the workflow from current controls; users do not choose a workflow JSON manually. A shared policy applies supported prerequisites. Server validation checks the connected path to the saved output.

## Automatic transitions

- Pika selects Original (or retains explicitly selected Singularity v2 in References), Native, matching 2/4/8 steps, Euler/simple, CFG 1, denoise 1, video shift 6 for FL2VA or 12 for Ref2VA, audio shift 3 and strength 1. Conflicting adapters and extra passes are disabled. Mode changes select the corresponding installed family and preserve Lite versus full; Draft has no FL2VA counterpart and is disabled when leaving References. Leaving Pika restores the prior setup under the new selection's restrictions.
- Turbo switches between Text/Frames Turbo v4 and References LightX2V 8-step when available. Unsupported profiles return to Native. Managed methods apply their required sampling settings.
- Saved projects restore atomically. Unsupported saved combinations remain visible and block submission; restore does not silently replace the saved model or delete inputs.
- Continuation selects a compatible Native path. ControlNet cannot currently combine with continuation, image refinement or audio enhancement. Invalid saved controls remain removable.
- Refine retains selected acceleration and Dials when rebuilding the model chain for different refinement LoRA strengths.
- Reference budgets are separate: up to 3 videos totaling 15 seconds and 3 standalone audio files totaling 15 seconds. Paired video soundtracks do not consume standalone audio slots. Each video/audio input must be 2–15 seconds. The total remains 12 files and up to 9 images. Neither budget needs to be filled.
- Qwen preserves backend Windows/Linux LoRA path spelling. Clear resets the adapter. Canvas predictions follow actual image scaling and final metadata uses actual saved image dimensions.

Required compatibility values are automated. Arbitrary third-party adapters cannot be inferred from a filename, and a valid graph does not establish the best visual strength, steps or prompt for every scene.

## Dials and MAINodes

[ComfyUI-Dials](https://github.com/matlowai/ComfyUI-Dials) steers motion or mood with small prompt-difference vectors. It does not train a model or teach a new identity. **Dials · motion & mood steering** loads installed files, applies strengths and saves them with the project. Dials follow LoRAs before Sigma Shift in base and rebuilt refinement chains. ±0.5 is a conservative experiment, not a measured optimum. Zero has no effect; combined Dials may interact.

[ComfyUI-MAINodes](https://github.com/matlowai/ComfyUI-MAINodes) includes MotionLab, Contact Sheet and additional experimental tools. MotionLab targets fast-motion smearing with another guided render, adding computation. These are not AI agents. Dials are the integrated Studio route; MotionLab and Contact Sheet remain separate backend workflows.

## Installation

Run the normal launcher with your ComfyUI path options. MAINodes, Dials and the publisher library are prepared by default; recognized installs remain managed afterward. Setup waits for accepted work to drain, fetches pinned sources without demo videos and adds ten small Dial assets with notices. No extra Python dependencies are installed. Custom edits and conflicting assets are preserved. Advanced Linux installations can explicitly opt out with `--no-matlow`.

| Component | Pinned revision |
| --- | --- |
| MAINodes v1.2.2 | `1880dfcc231c15179507d2b4d78b9a59bea229b1` |
| Dials | `7dd0b7e3513eb60915833eecfc6e547f3976762f` |

External GPL/AGPL source and model notices remain with the independent packages; their implementation was not copied into Studio's MIT code. Dependency changes require a reviewed pin. A Dial is available only with its node and file; missing saved assets block submission visibly.

## Verification

The 2.8 baseline includes 528 persisted builder-to-server combinations, connected-path mutation tests and browser checks for Pika/Turbo, reset, atomic restore, saved-state recovery, Dials and persistence. Source/repeat installation were checked locally. No new GPU inference or visual-quality measurement was performed. [Graph contract](GRAPH_MAP.md) · [Compatibility](COMPATIBILITY_MATRIX.md).
