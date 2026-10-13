# Changelog

## 2.1.5 — 2026-10-14

- Keep each card's video label and generation dimensions visible above the new actions; remove circular percentage height from its preview button.
- Add browser geometry checks to prevent labels being clipped behind card actions.

## 2.1.4 — 2026-10-14

- Visible Options and Delete actions on every generated video card.
- Shared video-options dialog with per-video upscale, download, playback and settings.
- Move current-video deletion out of collapsed tools.
- Explicit generated-video deletion endpoint also handles pinned outputs, preserves leased files and reports failures without removing the card.
- Protect library actions against server switching, repeated deletion and concurrent export.

## 2.1.3 — 2026-10-14

- Remove hidden global CK/Sage attention from H3 launch paths; explicitly request the official PyTorch dense baseline.
- Report the actual server dense backend in the UI and saved settings, with native checkpoint overrides distinguished.
- Separate measured timing observations by attention backend so earlier accelerated timings do not predict the new baseline.
- Preserve the 2.1.2 same-take enlargement and existing graph/LoRA choices.

## 2.1.2 — 2026-10-14

- Separate generation resolution from enlargement of an accepted take.
- Rename misleading High detail / Full HD generation labels as experimental; explain H3 native canvas and seed limitations.
- Add CPU Lanczos export of an existing take, copied audio, frame/timing/aspect verification and atomic failure cleanup.
- Preserve project settings and correctly track export progress through project, server and result changes.
- Regression tests for resolution-only graph changes, export cancellation, malformed targets, real media and browser interactions.

## 2.1.1 — 2026-10-13

- Integrated current HyperAI server fixes, retaining original reference identities and projects.
- Static image and prepared-image ControlNet inputs, exact 24fps hold-still guidance, cancellation and cleanup.
- Excluded input previews from completed generated-video selection.
- Preserved Automatic/AI/direct prompt preparation on project restore.
- Fixed Original checkpoint labels after switching modes or restoring projects.
- Added contextual Arabic guidance for controls, references and model settings.
- Verified live server APIs, real browser access and an existing Original Ref2VA + Canny still-control video/audio output.

## 2.1.0 — 2026-10-13

- Centralized model/workflow, advanced sampling, refinement and acceleration settings.
- Independent Singularity and distinct Hybrid conditioning / tensor-overlay profiles.
- References-mode Fun ControlNet capability checks for the required upstream implementation.
- Verified Character Swap adapter, Original Ref2VA graph checks and guided setup.
- Separate video-style directions and explicit source soundtrack reuse.
- Wider resizable sidebar and compact multi-image references.
- Dependency audits, verified asset reuse, resumable downloads and runtime rollback.
- Automatic fast-forward source updates on official main by default, with optional notify/verified policies.
- Removed Turbo selection/downloads and obsolete installation instructions.

Validation boundaries: docs/VERIFIED_BEHAVIOR.md. New models and LoRA combinations have no local GPU validation.
