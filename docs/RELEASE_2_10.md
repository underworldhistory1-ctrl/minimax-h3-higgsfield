# H3 Interface 2.10.0 - managed upstream workflow update

Date: 2026-11-04. Source/CPU and local browser verification; no new GPU deployment or model render.

- Add Pika two-step Draft (References), four-step Lite (both families), canonical publisher URLs and exact per-file sampling. Mode changes retain Lite; Draft has no Text/Frames counterpart.
- Add Character Swap 1.5, retain V1 and explicitly selected legacy scenes, and prevent both versions being applied together.
- Add opt-in Singularity v2 pruned INT8 with a Windows/Linux launcher option and registered discovery. Pika References can retain this exact selected checkpoint; other unsupported profiles remain blocked.
- Update the independent optional MAINodes pack to 1.2.2 and the Dials source pin. Studio's existing Dials integration remains separate from MAINodes' MAI tools. Independent RelayVSR CPU contracts passed; its GPU workers/models and full pack import remain unverified here.
- Audit all 28 managed base/refine/control/Qwen-profile artifacts against current publisher metadata; retain unchanged immutable weights. Added LoRAs require 4,687,800,976 uncached bytes. Singularity v2 is a separate explicit 20,967,647,456-byte download. Source archives do not contain model weights.
- Document researched motion/segmentation/depth tools and a concrete local-agent architecture with implemented/proposed boundaries. No cloud API key is required for current deterministic coordination; an autonomous semantic reviewer needs a configured local model.

Verification covers all managed Pika graph variants, backend graph mutations, actual Studio checkpoint reconciliation and Character Swap version switching. Local browser checks exercise Swap 1.5 and Draft/Lite/HD on Singularity v2 through real project/asset/job routes with simulated capability/inference fixtures, plus save/reload. Unit/source checks and fixtures do not establish GPU memory, speed, identity retention, perceptual quality or physical correctness. GitHub Actions records Windows/Linux Python 3.12/3.13 results for the exact published commit.

See [upstream decisions and orchestration assessment](UPSTREAM_AND_ORCHESTRATION.md), [Pika](PIKA_FLEX.md), [Character Swap](CHARACTER_SWAP.md), [selection rules](MATLOW_AND_SELECTIONS.md) and [historical GPU evidence](PRODUCTION_READINESS_2026_10_15.md).
