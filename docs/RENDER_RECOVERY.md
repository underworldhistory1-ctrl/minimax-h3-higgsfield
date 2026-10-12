# Render progress and worker restart recovery

The Studio polls server progress as well as listening to the live socket. Loading,
sampling, decoding and saving remain visible after a browser refresh or socket
disconnect. Cancellation intent is retained while the worker reports progress.

If a worker restarts and an acknowledged job is absent from both its queue and
history, Studio checks for a valid saved video belonging to that request. A
verified output completes the job; otherwise it reports `SERVER_RESTARTED`
instead of leaving the job queued indefinitely. Recovery does not automatically
submit the render again.

Spectrum now uses two feature-history records and disables offline smoothing
replay. This avoids the previous full-step RAM archive, which exhausted a roughly
39 GiB container during a 15-second render. Spectrum remains an approximate
accelerator: this profile can change the visual result and should be compared
with Original quality.

An existing job can be monitored through the Studio URL with `?job=<job UUID>`.
The linked lookup follows the existing submission and cannot replace a newer
generation or reset progress for the same running prompt.

## Verification on 2026-10-12

- A recovery render completed in 3 minutes 24 seconds on an RTX 5090 without a
  new OOM kill or worker restart.
- Output: 864x480, 362 frames at 24 fps, 15.083333 seconds, H.264 video and AAC
  audio. Full FFmpeg decoding passed.
- The browser displayed saving progress and then Completed, 100%, and zero
  remaining time; the video loaded successfully.
- Backend job, progress and route tests passed (30 tests); connected graph tests
  passed (11 tests); JavaScript syntax and focused code reviews passed.

These checks establish pipeline completion and file integrity, not storyboard,
identity or artistic fidelity for every prompt.
