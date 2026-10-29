# Changelog

## 2.5.9 - 2026-10-29

- Wait for workspace scripts before draft restoration and retain explicit page links during refresh.
- Open Production directly and create independent workspaces on Save/Generate without a mandatory project dialog.
- Add scene naming and a project destination picker that saves a new scene/shot without overwriting existing project work.
- Validate and attach scene media, preserve revision guards, and deduplicate assignment retries after lost responses.
- Save the previous working scene on New scene; settle pending autosaves before resetting unassigned setups.
- Reset Clear setup through shared defaults, persist the reset across refresh and report storage failures accurately.
- Expose Download on video/image cards, add scoped all-word generation search and collapse advanced project tools.

## 2.5.8 - 2026-10-29

- Add image Replace directly on collapsed reference cards and project element replacement with stable names and editable shot bindings.
- Preserve archived originals for take history, portable bundles, Reuse and cross-project copying; prevent replacement cycles when selecting an earlier image.
- Reject invalid images, guard stale dialog edits, reconcile lost replacement acknowledgements and deduplicate retried project creation requests.
- Prevent case-insensitive alias collisions and avoid display names shadowing other elements' canonical mentions.
- Normalize catalog mentions once per synchronization, paginate element cards, defer expanded image previews and debounce live prompt preview work.
- Guard asynchronous fit previews against stale files and lock project inputs while loading; avoid redundant asset filesystem lookups on current manifests.

## 2.5.7 - 2026-10-29

- Add a ComfyUI node-editor shortcut beside Updates in both workspaces, respecting configured servers and provider proxy prefixes.
- Show an accessible numbered update badge, recheck while Studio is visible and preserve discovery when reopening the update sheet.
- Refresh the update dialog with frosted glass styling, clear revision/status information and guarded installation controls.
- Remove obsolete V2 standby labels and static release numbers from the shared header; keep historical release and model version names intact.
- Remove the legacy 7,000-character prompt restriction and package reuse navigation in installed runtimes.

## 2.5.6 - 2026-10-15

- Require native CUDA 13 acceleration and verify the actual loaded worker, attention backend and runtime identity; preserve virtual-environment interpreter symlinks.
- Offer explicit CK INT8 attention alongside the PyTorch fused SDPA default. A matched RTX 5090 Original workload measured 582.94 s versus 1201.28 s; this is not a universal speed or perceptual-equivalence claim.
- Supervise Linux workers, use cgroup-aware RAM-pressure caching, atomically save completed latents before decode and track supported decode recovery with cancellation-safe child jobs. Sampling itself has no resumable checkpoint.
- Close update admission before asynchronous source validation and reject stale restart authorization while runtime writes are in progress.
- Fix Qwen Image readiness, uploads and WebSocket routing behind provider proxy prefixes; verify reference upload and INT8 graph selection in the live browser.
- Refresh owned gzip assets during installation and back up/remove obsolete Brotli sidecars so the server cannot keep serving the previous interface.
- Preserve current project selection in Elements, locked picker behavior and mobile layout.
- Reconcile H3 Higgsfield naming, current release metadata, model/profile names and current versus historical deployment evidence across the repository guides. Mark the existing CUDA 12.8 Salad image as a legacy artifact, not a newly verified CUDA 13 build.
- Verified for 2.5.6: 453 Python tests, 170 JavaScript tests, root/provider-proxy browser regressions and a real-server Qwen reference upload with INT8 graph capture (no extra GPU job).
- Production evidence before this presentation refresh: 452 Python tests,170 JavaScript tests, real project/asset API browser navigation, full Original and Singularity video/audio decoding and an owned idle-worker automatic restart. Current docs/version checks are recorded in the release notes.

## 2.5.5 - 2026-10-15

- Fail server API verification when an expected pinned LoRA is absent from live discovery; report exact names and model-path/launcher recovery guidance.

- Repair sequential project @mention attachment, display-name resolution and backward aliases while preserving stable asset identities and saved takes.
- Add official-source update discovery, guarded installation and durable restart/recovery status. Installation never submits a GPU smoke job from the UI.
- Default contextual workflow help to English with a persisted Arabic choice.
- Reorder existing controls into shot direction, render setup and optional guidance; preserve settings/listeners and verify expanded layouts across desktop, tablet and mobile.
- Reconcile current README/start/graph documentation and release history. See the dated production-readiness report for exact checks and runtime limitations.

## 2.5.4 - 2026-10-15

- Stream video-workspace image, video, audio, keyframe and control uploads through the shared validated route, retaining progress and cancellation.
- Verify Anime2Realism + Combat V2 + media references + timed keyframes across native, MotionCache and Spectrum graphs.
- Correct Element naming integration and canonical 24 fps reference-video metadata; lifecycle regressions are addressed in 2.5.5.

## 2.5.3 - 2026-10-15

- Use bounded JSON transport for Qwen images through hosted gateways; retain errors and working inputs.
- Keep canvas/aspect selection editable after adding references and persist selections independently per tab.

## 2.5.2 - 2026-10-15

- Install the pinned LiseTY Anime → Realism Ref2VA adapter and enforce its source-video, Original References and trigger requirements.

## 2.5.1

- Project card actions unlock after initial workspace loading and after catalog operations; active operations still keep them disabled.


## 2.5.0 — 2026-10-15

- Preserve complete unsaved video/image setups across Refresh per tab, with immutable IndexedDB media, active leases, bounded storage, explicit Clear, protected failure recovery and stale-restore guards.
- Keep active projects, server selection, image precision and image job tracking per tab.
- Add exact native AV masking and final-video restoration for an optional audio-only refinement pass; protect continuation audio prefixes and reject invalid/nonfinite outputs.
- Synchronize capability-gated controls, saved drafts, projects, complete/legacy Reuse, take settings, progress labels and timing signatures.
- Validate final-image branch selection and all submitted audio sampler links/options server-side. Source soundtrack reuse bypasses generated-audio enhancement.
- Ship local nodes and upstream MIT attribution with no model downloads or external runtime dependency. Preserve existing defaults and untested settings boundaries.
- Local verification: 353 Python tests, 151 JavaScript tests, 72 graph combinations and real project API/browser flows. No GPU audio quality validation on this release.

## 2.4.0 — 2026-10-14

- Project naming inside Production, project folders and Unfiled, cached search/sort, automatic filing of new projects in the selected folder.
- Independent asset folders, rename, visible multi-selection and copy/move between projects. Protect current drafts, legacy clips, take ancestry and accepted sequences; preserve IDs/aliases/media ownership. Revision checks and durable roll-forward journal recover interrupted transfers.
- Reuse on every video card with full saved-draft recovery or honest legacy fallback. Restore prompt, inputs, configuration and source provenance without modifying original takes. Missing media, LoRAs, checkpoints or generated contexts remain blocked through Save/reload; acknowledge an edited setup explicitly.
- Named project ZIP downloads, complete runtime packaging and official 2.3.2 upgrade fingerprints. Preserve automatic main updates, idle-operation checks and rollback policy.
- 346 Python and 148 JavaScript checks passed; browser tests use real local project/asset APIs and CPU media with captured generation submissions. No new GPU inference or remote deployment in this release.


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
