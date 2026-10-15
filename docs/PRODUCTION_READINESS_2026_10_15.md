# Production readiness audit — 15 October 2026

## Current server-runtime follow-up

A later authorized audit connected to the current RTX 5090 deployment and repaired
its runtime as well as source. The earlier software-only results below remain
historical; this follow-up does not certify every configuration.

| Check | Observed result |
|---|---|
| Native acceleration | Actual loaded worker: Torch2.9.1+cu130, CUDA13.0, enabled comfy-kitchen CUDA backend |
| Original Ref2VA INT8 + Combat V2 | Complete 1024x576,362-frame video with audio; full-file decode passed |
| Singularity INT8 + Anime Realism | Complete 1024x576,209-frame video with audio; full-file decode passed |
| Matched attention comparison | Same Original job/settings/references/seed, fresh worker: PyTorch Flash1201.28s versus CK INT8 attention582.94s; steady56.3 versus25.04s/step |
| Output review | Both matched files decoded fully; coherent frame spot checks at1/7/13s. Quantized attention changes output; perceptual equivalence and universal quality are not claimed |
| Regression checks | 452 Python tests and170 JavaScript tests passed; real project/asset API browser navigation passed without GPU inference |
| Limits | Host cgroup40GB with no swap remained near its limit in sampling; no new OOM kills were observed in these production checks. Sampling itself has no restart checkpoint |

Repairs include CUDA/native-backend preflight, verification of the actual loaded
worker and attention implementation, preserving venv interpreter symlinks, Linux
supervision, RAM-pressure node caching, atomic completed-latent saving, tracked
and cancellation-safe decode recovery, and update/restart admission barriers.
Regression tests reproduced and prevented stale restart authorization and an
async source-validation race that could reopen admission during an update.
See [launcher evidence and limits](LAUNCHER.md) and [decode recovery](DECODE_RECOVERY.md).

No user media, prompts, credentials or private server addresses are included here.

## Original 2.5.5 software audit scope

Audit started from official main commit a98c47104348640c7e36b8db2b58ef570ccd9c08 (2.5.4). Work is isolated on fix/production-readiness-2.5.5. The final branch commit is the revision containing this report.

No rental, running ComfyUI model worker or GPU was connected during this audit. Historical videos and old server evidence do not certify this revision.

## Confirmed defects and repairs

| Area | Root cause | Repair / owning files |
|---|---|---|
| Multiple typed mentions | Concurrent attachments competed for a shared catalog lock; later elements failed silently | Serialized attachment and mention resolution in project-workspace.js, compiler and production preflight |
| Display-name mentions | Visible project names and canonical aliases diverged; current references could retain stale names | Normalize unambiguous names to stable reference associations while retaining legacy aliases; preserve author text and asset IDs |
| Same media in different inputs | Global content deduplication was incorrectly treated as permission to replace per-shot names | Keep catalog identity separate from shot-local aliases and roles |
| Delayed reference actions | Async media loading could return after the user edited a prompt or changed context | Preserve newer work; reject stale insertion and await pending mention preparation before submission |
| Workflow help | Arabic-only contextual help contradicted the English interface default | English-default persisted bilingual explanations, including dynamic guidance |
| Update workflow | No visible source-update check/action in Studio | Trusted official-source checks and guarded installation through the launcher; durable recovery/restart status |
| Live LoRA discovery | The server verifier only printed the LoRA list and could pass with expected adapters missing | Compare live discovery with the shared pinned download manifest, report exact missing names and fail readiness; installed adapters still remain off until selected |
| Documentation | README accumulated repeated historical feature sections; graph and persistence descriptions were stale | Current behavior in README/UX/graph guides, release history in CHANGELOG and evidence in this report |
| Option hierarchy | Advanced model controls preceded shot inputs and prompt; narrow desktop workbench left little review space | Move existing controls into shot direction, render setup and optional guidance; preserve listeners and values; stack tablet panes |

Additional repairs: rollback snapshots include audio-refinement and prompt-format modules; Salad applies the shared runtime memory patches and launcher flags; remote-only LoRA checks do not contact download sources. The runtime manifest ships the version, bilingual help and update modules. A trusted clean-source receipt connects the UI updater to the correct deployed installation.

Prompt presets enable an adapter and write an example prompt; they preserve the selected checkpoint, render method, keyframes and other enabled adapters. A remaining UI-only profile restriction was removed after the experimental graph matrix exposed it. Filename guesses alone no longer disable ordinary installed LoRAs. Actual source-media and node requirements remain checked.

The project library now has bounded thumbnail cards, Grid/List preference, folder/name/count/date hierarchy, search/clear/empty/error states and accessible naming dialogs. Real available project images supply previews.

## Execution chain checked

Project upload → owned asset storage and stable IDs → display name / legacy alias → typed or selected mention → visible active references → prompt compiler native tags → resolved input filenames → deterministic graph → backend job admission.

Direct uploads, project references, mixed media ordering, duplicate/overlapping names, project isolation, saved drafts, Save/Load, Reuse, rename, transfer, import/export and missing-input protection are covered by targeted unit/API/browser tests. Coverage does not prove every possible user history or storage failure.

## Verification layers

| Layer | Status | Evidence boundary |
|---|---|---|
| Source inspection | PASS | Frontend state, compiler, graph builder, route services, launchers, manifests, compatibility guards and recent commits inspected |
| Baseline Python | PASS | 362 tests, no failures/skips, Python 3.14.3 on native Windows |
| Baseline JavaScript | PASS | 155 tests before changes |
| Final Python | PASS | 394 tests in 79.519 seconds, exit0, no failures or skips |
| Final JavaScript | PASS | 170 tests, no failures or skips |
| Cross-language graph admission | PASS | Selected JS graph → Python validation for4 profiles ×3 methods, with Anime/CharacterSwap/Combat, timed image guides and image/video/audio references |
| Browser/API integration | PASS | 12 browser suites: Elements, organization/Reuse, seed/duration, image, model controls, Anime preset preservation, audio refinement, tab persistence, shared CPU export, responsive layout, project library and update UI; readiness/inference are explicitly simulated |
| Actual CPU media export | PASS | FFmpeg enlarged a synthetic 864×480 video to 1728×960, preserving 312 frames at24fps and copied audio; another browser recovered progress after submitter closure |
| Live ComfyUI API and installed weights | NOT TESTED | No current server connected |
| Fresh GPU installation / model rendering | NOT TESTED | No driver, model download, GPU job, visual quality or audio-sync claim |
| Singularity / Hybrid / Character Swap output quality | NOT TESTED | Graph contracts and capability gates are separate from real rendering |

## Changed implementation files

- Elements: `h3_lab/projects.py`, `h3_lab/routes.py`, `web/studio.js`, `web/h3/project-workspace.js`, `project-controller.js`, `prompt-compiler.js`, `connected-studio.js`.
- Configuration/graphs: `web/h3/configuration.js`, `configuration-ui.js`, `h3_lab/configuration.py`; existing graph builder preserves the selected loader and ordered adapter chain.
- Updates/deployment: `h3_lab/updates.py`, `__init__.py`, `deploy/ui_update.py`, `launcher.py`, `download_optional_loras.py`, `salad/entrypoint.sh`, `v2_runtime_files.txt`, `runtime_hashes.json`, `compatibility.json`. All 136 non-self runtime files have current accepted raw/LF fingerprints while historical hashes remain recognized.
- Interface: `web/h3/guidance-language.js`, `updates-ui.js`, `organization-ui.js`, `studio-ux.js`, both HTML entries and shared organization/workspace CSS.
- Release: `VERSION` 2.5.5, README/start/handoff, changelog and current workflow/compatibility/launcher guides.

[Projects grid](demo/audit-2.5.5/projects-grid.png) · [Projects list](demo/audit-2.5.5/projects-list.png) · [Production layout](demo/audit-2.5.5/production-layout.png) · [Mobile update control](demo/audit-2.5.5/updates-mobile.png). Screenshots contain local fixture projects; they are not generated model outputs.

## Workflow boundaries

Original FL2VA/Ref2VA remain the defaults. No additional model or LoRA is selected automatically. Singularity and Hybrid remain capability-gated. Spectrum and MotionCache remain exclusive approximate accelerators. Character Swap and Anime→Realism retain their reference-conditioning/source-media requirements, while Singularity and both Hybrid profiles are available for experimentation; Combat on Ref2VA remains experimental. Compound ControlNet/continuation/refinement paths require unimplemented temporal/canvas adaptation and remain explicitly unsupported. Those structural limits differ from the removed profile/LoRA restrictions based only on missing quality evidence. Timed guides are explicit inputs; a storyboard sheet is not silently split into frames. Audio refinement preserves the video branch and is bypassed for source soundtrack reuse.

## Reproduce local checks

Use an installed Python with the repository's test dependencies and Node.js:

~~~text
python -m unittest discover -s tests -v
node --test tests/js/*.test.cjs
python tests/browser/workspace_server.py 18925
node tests/browser/project-workspace.cjs
node tests/browser/organization.cjs
node tests/browser/audio-refine.cjs
node tests/browser/tab-persistence.cjs
node tests/browser/shared-export.cjs
node tests/browser/layout-audit.cjs
node tests/browser/project-library.cjs
node tests/browser/updates.cjs
~~~

The image-workspace, modernization and anime-realism browser fixtures default to port18923; run a second workspace fixture there or pass the supported H3_TEST_URL for video fixtures. Playwright with its Chromium executable must be installed. The workspace server runs only CPU fixtures and temporary storage.

## Original software-audit verdict

Source release is ready for deployment validation after the verified local checks. A complete production-runtime acceptance is NOT TESTED. Missing LoRAs can no longer pass the server verification step, but network, storage, credentials and server-path faults can still require recovery. UI code updates do not download absent model weights; use the full launcher for that repair. Production rendering acceptance requires the current server's readiness/API verification and a deliberately authorized minimal GPU render, then viewing/listening to the result. No finite test certifies every prompt or adapter combination.

## Original audit publication and review limits

A fresh public API check confirmed main remained at the audited base during the work. GitHub CLI and Git transport have no authenticated write credential in this environment; a noninteractive push dry-run failed before publishing. The validated commit/patch is local, and upstream main has not been changed.

Independent review found the proxy, async mention, stale-name and cross-mode prompt defects; these were repaired and regression-tested. A reviewer tool hang limited the final independent review, so the complete fresh automated/browser run is the final evidence rather than a claim of unconditional reviewer approval. Initial older browser fixtures used pre-migration localStorage and native prompt dialogs; they were updated for per-tab sessionStorage and the actual naming dialog. A full Python run exposed one old test expecting destructive alias rewriting; its expectation was reconciled with canonical alias preservation and the suite rerun.
