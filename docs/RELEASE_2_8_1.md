# H3 Studio 2.8.1 — English documentation and connected-input fixes

Date: 2026-11-03. This is a source/CPU/local-browser release; no current rental was deployed or new GPU render executed.

## Changes

- Replace the accumulated README update sections with one current guide; translate/rename 21 guides in English. Dated reports are explicitly historical and stale installation advice points to current instructions. Relative documentation links were checked.
- Make product help and update messages English-only, including tabs with a legacy translation preference. Preserve Unicode prompt input and multilingual parsing tests.
- Pass auto-fit intent for saved image assets through both Generate and prompt preparation. Apply the same 2048-pixel cap to derived files while preserving original assets; support CMYK JPEG conversion and RGBA transparency.
- Compare connected guide frame/type/latent/audio/VAE fields with declared selections, including continuation offsets. Check reference detail, frame rate and required output crop/refinement scaling. Reject mutations instead of accepting a graph that ignores the selected setting.
- Retain official prior-runtime hashes for safe upgrades and update installer/archive references to the renamed guides.

## Verification boundaries

Local verification passed 585 Python tests (584 passed and one platform skip) and 277 JavaScript tests. Regression tests include the 528 builder-to-server matrix and new mutations for selected timing, detail and output transforms, saved-image fitting and color modes. JavaScript tests execute saved-asset Generate and preparation branches with auto-fit both enabled and disabled. An independent review also checked 48 imported/generated continuation combinations with four canvases, image/audio/video guides and audio enhancement.

Local browser checks cover selection policy/Dials persistence, audio Save/reload/Reuse/Generate capture, image upload/canvas/refresh, update guards, English help and six responsive widths. These use real local project APIs where applicable and fixtures for inference; no GPU prompt was submitted. See the [exact-commit GitHub Actions results](https://github.com/underworldhistory1-ctrl/minimax-h3-higgsfield/actions/workflows/verify.yml) for final Windows/Linux regression and packaging status.

No finite suite proves every external LoRA, arbitrary control combination or artistic output. Supported prerequisites are automated and checked; best visual strengths or performance require target-GPU comparisons. [Selection policy](MATLOW_AND_SELECTIONS.md) · [Compatibility](COMPATIBILITY_MATRIX.md) · [Historical GPU evidence](PRODUCTION_READINESS_2026_10_15.md).
