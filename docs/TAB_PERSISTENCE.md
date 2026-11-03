# Tab persistence

Each video/image tab keeps an independent working setup. Refresh restores prompt/settings, references with names/roles/order, frames, guides, control, audio, LoRAs and Dials. Binary inputs use IndexedDB; small state uses tab storage. Wait for pending writes before leaving. Clear affects this tab, not saved server projects/media or another tab.

A new plain Studio page starts empty with a new render identity, even if session storage was copied. Explicit project/Reuse/job links open requested work; shared storage does not implicitly reopen the last project. Clicking the H3 logo refreshes after preserving pending work.

Local drafts are not cross-device project saves. Save scene writes to the server with revision checks. Saved unavailable settings remain visible and block submission. History polling can reconcile missed WebSocket events. Independent pages can queue distinct jobs under serialized admission.

[Scene entry](SCENE_WORKSPACE_2026_10_29.md) · [Projects](PROJECT_WORKSPACE.md).
