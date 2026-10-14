# Changelog

## 2.3.2 — 2026-10-14

- Complete known runtime fingerprints for both the original installer files and V2 additions, allowing unmodified2.3.0/2.3.1 releases to upgrade safely. Preserve refusal for customized runtime files.
- Include the seed/short-duration2.3.1 fixes and the full tested package.


## 2.3.1 — 2026-10-14

- Repair invalid saved fractional seeds to the reproducible default 42 with visible feedback. Preserve valid user overrides; no seed promises better quality.
- Share exact uint64 seed parsing between video/image UI and submission validation. Resolve Random once before compilation; preserve large history/project seeds and refinement increment/rollover.
- Remove the UI and prompt-preparation five-second floor. Use the native 5+17k frame grid consistently in Text, Frames, References and control planning, with accurate actual durations and an experimental short-clip notice.
- Preserve genuine video-reference trimming and continuation-context limits.
- Verify all three Generate paths without GPU submission, project save/reload, and backend rejection of fractional seeds.

## 2.3.0 — 2026-10-14

- Separate Projects, Production, Elements, Generations, Favorites and Activity workspaces; preserve project assets, aliases and native reference mappings.
- Cache bounded thumbnails and support multi-upload, editing and custom asset categories.
- Protect shared preparation/export operations during updates.


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
