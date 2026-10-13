# Verified behavior and production boundaries

On the project's RTX 5090 server, Original mode produced a short clip and a 15.1-second clip with decodable video and audio. A 25 fps clip with audio was accepted as a reference, converted to 24 fps, and cleaned up afterward. New installs require the upstream H3 VAE tile fix before the UI permits generation. Qwen's graphs match the pinned ComfyUI 2.1 schemas and the source project's graph contract.

On one 39 GB system-RAM RTX 5090 workspace, both 15.1-second Original and 14.38-second MotionCache Ref2VA renders exhausted system RAM during video decoding after all 20 sampling steps. The latter sampled for 50 minutes before the process was killed, with no MP4 saved. Studio displays a system-RAM risk notice for longer high-resolution renders on smaller hosts; that historical observation is no longer a universal hard duration block. This does not measure the GPU's 32 GB VRAM; for that full-length setting, at least 64 GB advertised system RAM is recommended, pending a successful validation render.

Qwen Image 2.1 weights use the Qwen Research License and are not licensed for commercial use. They are downloaded at runtime and are not redistributed by this repository.

DLSS 5 Visual Enhancer is an optional Windows post-processing path and is not installed on Linux cloud servers. The studio first preserves source quality through the corrected H3 VAE, INT8 ConvRot weights, and high-quality MP4 saving; enhancement can be applied later on a compatible Windows RTX machine.

Windows installation is newly supported, but a complete first-time Windows GPU install has not yet been run by this project. The verified render evidence above is from Linux.

This evidence does not guarantee every prompt, LoRA combination, speed method, or a new GPU image. A video reference guides **new generation**; it is not a pixel-locked one-object edit. Optional ControlNet region guidance uses an aligned static mask; it does not automatically track a moving character or guarantee a pixel-locked edit.



## Current software checks — 2.1.0, 13 October 2026

Version 2.1.0 passed 283 Python tests and 133 JavaScript tests. Browser fixtures cover the sidebar, reference aliases/order, model/sampling persistence and Character Swap native tag bindings. Release checks additionally exercise automatic source updates and rollback ordering. No new GPU render was performed for this release; Singularity, Hybrid and Character Swap quality remain unverified locally. Historical GPU results do not certify those profiles.

## Live-server verification — 2.1.1, 13 October 2026

289 Python tests and 139 JavaScript tests passed. A real browser checked the live HTTPS UI without fixture APIs. The current RTX 5090 server's existing Original Ref2VA + static-image Canny ControlNet output was independently decoded and checked: 864×480,124frames,24fps,H.264/AAC. This review submitted no additional GPU render. Singularity availability is verified, but independent Singularity, Hybrid and Character Swap rendering remains untested. See [server evidence and limitations](SERVER_VERIFICATION_2026_10_13_AR.md).

## Resolution and same-take export — 2.1.2, 14 October 2026

296 Python tests and 140 JavaScript tests passed. Browser fixtures verified existing references/model flows plus same-take export, unchanged generation settings and export/project/server/result race recovery. Five real FFmpeg export tests also passed on the current Linux server in an isolated staging folder while preserving the active render. This feature uses CPU post-processing of existing media; no new GPU inference is claimed. Direct high-resolution diffusion remains experimental and is not guaranteed to reproduce a successful draft. [Details](RESOLUTION_AND_SAME_TAKE_AR.md).

A real existing H3 draft was enlarged on that server: 864×480 to 1728×960, 311 frames at24fps, approximately12.96seconds. Original SHA-256 was unchanged; copied audio framemd5, including packet timing, matched exactly. The isolated test took26.55CPU seconds and did not modify the live runtime or submit a GPU job.

## Explicit attention baseline — 2.1.3, 14 October 2026

300 Python tests and 141 JavaScript tests passed; browser fixtures verify visible/saved backend and timing isolation. On the current RTX 5090, the pinned ComfyUI PyTorch attention function matched PyTorch SDPA with finite outputs on packed non-contiguous head layouts (widths 96/128, 37 query and 41 key tokens). No model render or quality A/B was performed for the backend change. An intentionally misaligned storage-buffer stress case is unsupported by native CUDA attention and was excluded from the H3-layout check; it is not an H3 production graph reproduction. Existing externally launched workers can retain prior arguments; new project launch paths request PyTorch explicitly.

## Library actions — 2.1.4, 14 October 2026

307 Python tests, 141 JavaScript tests and expanded browser fixtures passed. Visible Options and Delete actions on each generated-video card share an export dialog. Explicit pinned deletion is distinct from unpinned-only bulk cleanup. Browser fixtures cover card-specific export, failure retention, pin protection and server-switch races. Seven backend tests cover the real route, output-only path scope, lease/failure reporting and real secure wipe; the Windows directory-sync branch is simulated rather than run on native Windows. Export tests remain separate from GPU inference.


## Project workspace and shared exports — 2.2.0, 14 October 2026

321 Python tests and 141 JavaScript tests passed. Existing browser contracts passed. A browser used real local project and asset routes to create/open/rename projects, upload multiple images, edit category/name/notes, add a custom category, insert project @ references, preserve edits during delayed media loading and restore drafts/catalogs after switching and reload. Backend tests cover concurrent attachment, immutable historical identity, conflicts, unused-asset bundles and completed-job recovery without repeatedly probing already attached videos.

A real CPU export enlarged a synthetic 13-second 864×480 video to 1728×960, 312 frames at24fps. A separate browser context observed actual encoding frames after the initiating page closed, reloaded and recovered verified completion and its download. Full decoding, source audio preservation and SHA256 passed. HTTP cancellation regressions cover both durable admission and duplicate synchronous waiters. Launcher idle checks include CPU exports. GPU readiness fixtures are explicitly simulated in these browser tests; no new GPU render was performed.


## Off-queue operation readiness — 2.2.1

The shared status reports media export, prompt/source preparation, control work and quality analysis. The installer refuses idle while any are active, including a blocked muted-video export with an otherwise empty render queue. Three new tests cover real concurrent HTTP visibility, all operation categories and malformed status. This is an operation-aware guard, not an atomic admission gate for every external ComfyUI client.

## 2.3.0 workspace navigation

Actual local project/asset API browser coverage: separate pages, stable reference aliases, multi-upload, editing, custom categories, preview dialog, browser back/forward, preserving prompt edits during delayed asset fetches, project switching/reload and mobile Generate hit-testing. Thumbnail tests exercise concurrent cache requests, bounded dimensions, EXIF rotation, transparency and unchanged originals. Legacy recovered jobs use their saved target_frames, without inventing a124-frame length. GPU rendering quality for the new UI is not claimed from these checks.

Final 2.3.0 checks:327 Python tests and141 JavaScript tests passed; actual local project/asset browser navigation and the existing production UI regressions passed. Actual CPU upscale preserved312 frames at24fps and audio, produced1728×960 from864×480, and survived closing the submitting browser and refreshing a second independent browser context. Library image fixture:228890 original bytes vs9484 cached thumbnail bytes; this measures image transfer reduction, not whole-app speed.
