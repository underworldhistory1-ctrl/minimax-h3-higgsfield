# Changelog

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
