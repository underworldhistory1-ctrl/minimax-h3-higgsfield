# H3 Studio handoff for a new assistant

The user operates MiniMax H3 through the **English H3 Studio web UI**, with English-default bilingual contextual help. ComfyUI nodes are backend infrastructure. Read `START_HERE_AR.md`, then `README.md`, `docs/GRAPH_MAP.md`, and `docs/COMPATIBILITY_MATRIX_AR.md` before changing or deploying anything.

## What this folder contains

- `web/index.html` and `web/studio.js`: the production interface.
- `__init__.py`: ComfyUI extension API for uploads, readiness, library, thumbnails, timing samples, settings metadata, and cleanup.
- `workflows/`: quality and short smoke graphs in UI and API formats.
- `deploy/`: idempotent bootstrap, pinned model/LoRA downloads, landing-page redirect, installer, and read-only server verification.
- `docs/`: UX flow, compatibility boundaries, and dated audit.

## Operating rules

1. Get the **new** rental's SSH host, port, credentials, ComfyUI URL and authentication method from the user. Never reuse, print, or save credentials from an older rental. The scripts prompt for passwords or read a token from an environment variable.
2. Inspect the ComfyUI queue before changing a running server. Do not restart, interrupt, delete outputs, or switch checkpoints during an active render.
3. For a new Linux server, use `launcher.sh` or the SSH handoff `deploy/provision_h3.py` with the adjacent `h3-cloud-setup.zip`. For native Windows, use `launcher.ps1` with ComfyUI Portable or a source checkout. The launcher reuses verified storage, resumes downloads and its saved smoke job, checks the queue before restart, and reports file/API/GPU validation separately. Read `docs/LAUNCHER.md`. Never interrupt an active render.
4. Verify `/h3_studio/readiness`, `/h3_studio/loras`, `/h3_studio/library`, and the user-facing page after restart. `deploy/verify_h3_server.py` performs read-only API checks. A ready API is not proof that every LoRA or render method preserves quality.
5. Preserve `ComfyUI/output/video/` and its hidden `.h3-studio-*.json` metadata files. This is the generated video library and timing/settings history. A new empty server has none of those unless the optional `library-backup.zip` is restored with `--library-backup`. Take a fresh library snapshot only after the ComfyUI queue is empty.
6. Original quality (FL2VA for Text/Frames, Ref2VA for References) is the default. The default canvas is 1280×704, 362 frames / 15.1 s, 20 steps, 24 fps, with native audio. Spectrum, MotionCache, Realism People, Combat V2, and Motion Repair V2 are prepared but selected only by the user in the UI. Optional Turbo v4 EMA is available for Original Text/Frames with the pinned upstream loader and adaptive sampler; Original References has separate LightX2V8stepv1.0; see docs/TURBO_V4.md. Other old Turbo files and historical outputs are retained. Independent Singularity and Hybrid profiles are capability-gated. The current dated audit records a completed Singularity INT8 + Anime Realism render and full file decode; Hybrid and universal output quality remain unverified. Read docs/PRODUCTION_READINESS_2026_10_15.md and docs/MODERNIZATION_2026_10_13_AR.md. Combat V2 can be selected in References with an experimental Ref2VA notice; its creator tested FL2VA only.
7. The model weights are **not** bundled. The default launcher also prepares Qwen Image INT8, Refine and ControlNet; its read-only plan reports exact missing bytes. Never promise a seconds-long install onto an empty disk. Verified cached model files are reused on subsequent rentals.
8. Do not use the nodes editor as the user's main UI. H3 Studio is `/extensions/h3_studio/index.html`; the server root redirects there after login. `/?view=nodes` is for technical work.
9. In References mode, a multi-panel storyboard image uses the Storyboard role and compiles to `<Picture N>`; character images compile to `<Subject N>`. Both use the native `ref_images` input. This guides shots but does not lock exact frames.

## Proven scope and limits

The 15 October runtime audit records complete Original Ref2VA INT8 + Combat V2 and Singularity v1.3 INT8 + Anime Realism outputs with full video/audio decoding, a matched CK INT8 attention speed check and an owned idle-worker restart. No finite check proves every prompt, LoRA combination, visual detail, or audio sync. Before claiming a new server fully ready, report the live readiness result and what was or was not rendered on that specific server.

## Current source audit

Read `docs/PRODUCTION_READINESS_2026_10_15.md` for the current software and connected-server evidence. Do not assume an earlier rental is still connected in a new session. Preserve separate statuses for automated checks, real local API/browser checks and actual GPU inference. Keep current behavior in README, release history in CHANGELOG, and avoid repeated update appendices.
