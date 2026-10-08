# Connected Studio development specification and execution plan

Baseline: 2b2d902. Two deliverables: creator UI and generation preparation/control backend. Keep existing project/job/context contracts, English UI and localhost-only services. No live rentals, credentials, weights or production processes are touched. Unknown capabilities fail closed; never claim artistic validation from CPU checks.

## Design

Compare: (A) retain large single-result viewer, (B) compact composer + responsive results grid + focused details (selected), (C) full timeline editor (unnecessary for this scope). Typography 15px body, 14px fields, original charcoal/lime identity with blue reference mentions. Results are 240–360px cards; viewer bounded to viewport. Secondary options collapse. Details prioritize actual model, renderer, canvas, steps, seed, LoRAs/strengths, control/refine, prompt and reference thumbnails; no dates/duration/timing clutter.

Preparation: existing promptwriter module gains deterministic reference-aware LLM entrypoint; new h3_lab prompt service resolves owned assets, sends image/video sampled frames with exact labels, explicitly flags unavailable audio understanding, validates generated native schema and attached tag bindings, and never silently retries without vision. Writer provider configuration is server-side env; missing provider blocks AI preparation, raw native mode remains explicit. Async single-flight to avoid CPU/GPU resource races; bounded samples, network timeout, no automatic paid API or model downloads.

Control: dedicated control spec with strength/start/end, processed control video and optional source/mask. Native model patch loader → MiniMaxH3FunControlNetApply, FL2VA only according to native contract. Existing references are not secretly converted to structural controls. Provide prepared-control and masked-region UI; preprocessor/automatic tracking availability must not be invented. Require exact 24fps, canvas and frame metadata, no unsupported combination with continuation/refine. Model weights optional and hash-pinned. Motion Repair V2 optional, explicit selection; stage-specific LoRA strengths supported for refine.

## Task 1: deterministic prompt/graph correctness
- [x] Regression tests: Custom retention neutrality; Structured card warning; no repeated Shot1; reference video effective span; audio same span; refine prerequisites and UI actual steps.
- [x] Implement compiler and graph validation with schemas matching pinned upstream. Add motion repair stage strength and control graph. Test graph node allocation and unsupported combinations.
Ownership: web/h3/prompt-compiler.js, web/h3/graph-builder.js, focused JS tests.

## Task 2: creator UI
- [x] Compact responsive grid/viewer and legible typography, connected controls, meaningful colored detail chips.
- [x] Blue mentions via safe textarea overlay and safe DOM prompt viewer. Preserve caret, IME, paste and keyboard accessibility.
- [x] Reference thumbnails resolved from persisted project assets; report unavailable historical assets without guessing. Reuse actual snapshot roles/settings.
Ownership: web/index.html, web/studio.js detail function and visual helpers, web/image.html prompt styling, new web/h3/studio-ux.js, web/studio-ux.css. Reserve no new provider/control wiring here; primary integrates afterwards.

## Task 3: preparation/control services and integration
- [x] promptwriter preparation function with strict schema/alias validation, reference inputs and bounded LLM calls.
- [x] h3_lab prompt routes, owned-asset validation, provider status, multimodal reference sampling, no vision downgrade. Unit tests with stub provider.
- [x] New extension routes/capabilities for verified control/refine weights, aligned control source and mask inputs. Backend validates jobs before queue for these options.
- [x] Wire prepare-before-generate plus preview/retry/cancel; persist preparation fingerprints and actual graph settings.
- [x] Optional hash-pinned Motion Repair and ControlNet download support in installers, preserve existing defaults/outputs. Restore optional assets/settings via project draft.
Primary ownership: Python/deploy, integration modifications to studio.js after UI task.

## Task 4: verification/review/delivery
- [x] Python+JS tests, real CPU browser journeys at desktop/mobile, inspect screenshots, regression check existing video/image/continuation journeys.
- [x] Independent code-reviewer and JS reviewer; fix high-confidence findings then targeted rechecks.
- [x] Docs, package and report in outputs, explicit remaining live provider/GPU validation and any unsupported preprocessor paths. No push or deployment without session authorization.

## Validation boundary
Local implementation and CPU/browser checks completed; live vision-provider compatibility, memory release, GPU inference and same-seed visual comparisons remain pending. No claim of parity with hosted Context-IR or universal shimmer removal.

## Shared-server follow-up
Added explicit queue ownership/positions, busy preparation wait+cancel, foreign-event/preview isolation and retained unknown job states. Regression tests cover foreign running/history errors, deferred acknowledgement and real local queue transitions.
