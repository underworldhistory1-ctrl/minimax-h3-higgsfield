# H3 Interface 2.9.0 — reference direction and transparent installation

Date: 2026-11-03. Source, CPU and browser verification; no new GPU deployment or model render.

## Changes

- Rename the visible product to H3 Interface and publish a separate public documentation site. Preserve h3_studio URLs, storage identities, existing projects, history and legacy official Git origins during upgrades.
- Group multiple Character pictures into one native Subject. Preserve independent default subjects and explicit native subject definitions. Forward group identity and every Picture relation through optional local/remote AI preparation, with regression coverage.
- Add independent instructions for every reference role, separate storyboard panel ordering, per-image original-resolution override and selected-range audio/video preview. Scene save, local restoration and Reuse preserve these settings. Complete Structured/native prompts retain directive authority and expose the card-guidance boundary.
- Recompute dynamic LoRA and capability controls after project loading and source import; prevent disabled loading controls from remaining stuck or overriding continuation guards.
- Reject unknown optional-node edits even when HEAD matches the pinned revision, including ignored executable additions. Recognize only the exact owned MotionCache transformation; preserve unknown user changes.
- Require HTTPS for external keyed prompt providers, reject HTTPS downgrade redirects and strip Authorization on cross-origin redirects.
- Publish installer behavior, privilege/update boundaries and upstream provenance. Preserve Charles Mod's MIT copyright and permission notice; add H3 Interface contribution attribution. Model and external-pack rights remain separate.

## Verification

The local Python suite ran **589 tests: 588 passed, one platform skip**. All **285 JavaScript tests passed**. Existing graph-contract regression includes the persisted 528-combination matrix. Security and JavaScript reviews found issues that were fixed and covered by focused regressions.

The new reference browser journey uses real local project/asset/resolve APIs with simulated inference. It verifies group mapping, instructions, original-resolution settings across reload/Save/Reuse, actual derived input dimensions (2304×1408 original versus 2048×1252 auto-fit), selected source playback stopping and media resource cleanup. Existing general, continuation and Qwen browser journeys were brought into line with explicit project creation and current canvas/upload protocols; they exercise cancellation, response loss, saved input restoration, continuation guides and image creation/edit graph capture.

The public site was inspected at desktop and mobile widths, with index/follow metadata, canonical URL, sitemap and SoftwareApplication structured data. These make public content available for discovery; they do not prove Google indexing or guarantee ranking. GitHub Actions provides Windows/Linux Python 3.12/3.13 checks for the exact published commit.

No finite suite guarantees zero bugs, arbitrary external-LoRA compatibility, GPU speed or perceptual quality. Native reference encoding can still resize original-resolution images. Automatic workflow coordination is deterministic; optional AI preparation needs a configured model. See [reference controls](REFERENCE_CONTROLS.md), [installer transparency](PROVENANCE_AND_INSTALLER.md) and [compatibility](COMPATIBILITY_MATRIX.md).
