# H3 Studio 2.6.0

This release combines the direct scene workspace, project/Element/reference identity fixes, direct image/video card downloads, scoped search, ComfyUI shortcut and update notifications with stronger installation verification.

## Honest update status

A successful check compares the official main revision, the installation receipt, installed Python/interface files and the code observed when the worker loaded. Runtime fingerprints cover VERSION, all root Python modules, h3_lab and web scripts/styles/pages. Text line endings are normalized. Gzip responses must decode to the verified source file; unverified Brotli siblings require repair. Both Linux and Windows installation paths preserve previous files, regenerate existing gzip and remove obsolete managed Brotli copies.

A mismatched source/runtime/worker reports installation attention instead of current. Network failure removes a previous successful-current message and revokes its installation target; language changes cannot restore a stale target. A known available-update notification can remain visible, with installation unavailable until a new check succeeds.

Qwen image adapters are kept out of the H3 video selector and rejected by video graph validation; image adapters remain available in Create Image.

The up-to-date result explicitly covers Studio code. Model weights and optional LoRAs are separate installations; updates do not silently download weights, select adapters or change active renders. The release manifest derives its version from VERSION instead of an old static release label.

## Current-server verification, 29 October 2026

Five named H3 style adapters were installed/reused and verified against pinned SHA256 values: Anime to Realism, Character Swap Pro, Motion Repair V2, Realism People and Combat V2. The separately selected Qwen Image 2.1 V2 adapter was installed at its pinned 79,744,352-byte size and SHA256.

Qwen INT8 with the selected adapter at strength 0.8 completed a 256x256, 2-step image in 18.10 seconds. The worker reported 192 patches; the PNG fully decoded and its saved settings identify the adapter and strength.

Original H3 FL2VA INT8 with Anime to Realism at strength 1 completed a small 2-step loader test in 55.50 seconds. The native output has 56 frames at 512x288, 24fps, H.264 and 32kHz stereo AAC; the entire video/audio file decoded successfully. The worker reported 208 patches. A second test used the production graph builder with Ref2VA, a video reference and the Anime to Realism adapter; sampling and full video/audio decode also succeeded. These small 2-step tests establish technical adapter loading and output execution, not creative quality, all adapter combinations or every optional model profile.

LTX was stopped at the user's request, with model fragments and outputs retained. Optional features remain capability-gated when their weights/nodes are absent; this release does not claim every optional checkpoint or adapter combination is installed or GPU-validated.

## Automated checks

Installation integrity regression tests cover mismatched/missing frontend code, copied code with an old running worker, omitted Python modules, stale gzip/Brotli, valid gzip, line-ending differences and failed-check candidate revocation. Browser update acceptance covers discovery, exact commit application, offline/current transitions, repair, language changes and both workspace headers. The main JavaScript suite and affected update/Qwen/installer tests pass. Linux shell inventory and package installation are checked on Linux separately from Windows shell emulation.
