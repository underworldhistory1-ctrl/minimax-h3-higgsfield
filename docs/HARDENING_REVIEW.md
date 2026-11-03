# Hardening audit — 2026-10-12

Historical source/CPU review, not current server readiness. It covered larger canvases, Full HD cropping, refinement output sizing and settings/timing metadata. New canvas support was not GPU quality validation.

Installer protections preserved the working CUDA stack, selected ComfyUI's actual interpreter, verified/resumed downloads, checked source/import/API and CUDA execution, and retained smoke request identities. Decode releases generation models and preserves complete sampler latents. These guards do not resolve incompatible dependencies or inadequate hardware.

Input fixes covered cropped-image identities, own-property filename lookup, storyboard order/card instructions, explicit structured prompts and silent controls with separate dialogue. Storage admission checks both queues, fsync and operator budget where cluster free space hides quotas. Headroom is not a filesystem reservation; outputs are not purged automatically.

Current instructions: [Launcher](LAUNCHER.md), [resolution](RESOLUTION_AND_SAME_TAKE.md), [storage code](../h3_lab/storage.py), [compatibility](COMPATIBILITY_MATRIX.md). Original detailed wording remains in Git history.
