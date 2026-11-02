# H3 Studio 2.7.0 — 2 November 2026

This release hardens installation and updates, and selects native Comfy Kitchen INT8 attention by default. Original remains the generation method; model and LoRA choices remain explicit. Quantized attention can alter outputs and does not guarantee universal speed gains.

## Runtime policy

- ComfyUI 0.43.0: `426f5eea52a7ece1dd599fff4cb6cd1f352ddd24`.
- Exact core package requirements are audited in the selected Python environment.
- Native CUDA 13+ backend, loaded attention and interpreter identity are checked separately.
- `--attention-backend pytorch` / `-AttentionBackend pytorch` selects the baseline.
- Fresh setup and Git upgrades share source/root locks and request-drain checks.
- Recognized core patches have backups and a previous-core ref. Unknown edits block automatic migration.
- Older Portable builds require an official matching distribution upgrade.

## Archive updates

Default latest launches from ZIP archives create and reuse an official Git checkout under the selected root, preserving the archive. Packaged commit ancestry and file hashes prevent older main or local archive edits from being silently substituted. --no-update keeps a deliberately frozen archive.

## Recovery behavior

Pending smoke jobs retain their identity and are followed before source/default changes. Source updates merge the inspected SHA after rechecking local state. Supervisor replacement verifies exact process arguments, endpoint root identity, and local/remote worker identity before signaling a PID-safe handle. Unknown workers are never terminated by process-name search. Older workers without identity/drain support require a provider stop when idle.

A failed update stays paused until a verified worker loads. Reports distinguish files prepared, API ready and GPU validated. These checks cannot prove every environment and model combination error-free.

## Validation boundaries

Tests cover graph construction across supported generation paths, API/storage behavior, installer decisions, package drift, Git migrations, update locking, saved job recovery and process ownership. The release report records actual test counts.

GitHub Actions now runs the regression suites, shell checks and release packaging on Windows and Linux with Python 3.12 and 3.13. The active workflow and its reference copy are included in release source archives. Consult the Actions result for the exact source commit; CPU CI does not establish CUDA compatibility or render quality.

Actual ComfyUI 0.43 source patches were parsed and checked for idempotence. The Docker base tag was verified in the official registry; a full image build was not run. The remote GPU server disconnected before deployment. No new fresh-machine CUDA install, end-to-end GPU render, performance comparison or perceptual review was completed on this pin. Earlier GPU measurements remain historical evidence for their recorded runtime only.
