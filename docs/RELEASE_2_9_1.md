# H3 Interface 2.9.1 - reference workflow fixes

Date: 2026-11-03. Focused reference workflow corrections; no new model or GPU deployment.

## Behavior

An image assigned to a Character group could keep its group after the Character Swap shortcut changed its role to Custom. Prompt compilation then rejected the stale group. The shortcut now clears that group, matching the manual role selector. It retains the per-reference instruction, original-resolution override and existing sampling choices.

A Linux FFmpeg 8.0.1 compatibility check also exposed a stall while preparing a video whose audio begins late. Video and audio now share one bounded filter graph. The existing delayed-audio regression completes while preserving opening silence, later sound and exact frame count. The original command stalled locally and in CI; the corrected command completed in approximately 0.35 seconds on the local CPU fixture.

## Verification

All **286 JavaScript tests pass**, including a regression that executes the actual shortcut and prompt compiler. Independent code and JavaScript reviews cover the shortcut correction. The media correction retains existing timing, fit and frame-count tests; all 11 continuation-upload and bounded-padding tests pass locally on Windows FFmpeg 8.1.

A local browser journey exercised the visible controls: create a Character group, retain an image instruction and resolution override, add a source video, apply the replacement preset, submit the native reference graph with the correct Character Swap LoRA, cancel, save and reload. The graph and restored scene matched the selections; no browser JavaScript errors occurred. Inference was simulated, so this does not measure generated quality or GPU compatibility.

GitHub Actions checks Windows/Linux on Python 3.12 and 3.13 for the published commit. The preceding [2.9.0 verification](RELEASE_2_9.md) documents the broader 589-test Python suite, persisted graph matrix and browser coverage. No finite suite establishes every possible configuration or guarantees zero bugs.
