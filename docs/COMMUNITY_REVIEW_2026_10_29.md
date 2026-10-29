# Community request review — 29 October 2026

This is a source and interface review. It does not establish new GPU performance or visual quality results. Older dated render audits remain historical evidence.

| Request / source | Existing behavior and decision |
| --- | --- |
| Portrait video ([issue #4](https://github.com/underworldhistory1-ctrl/minimax-h3-higgsfield/issues/4)) | Portrait resolution is already supported. Keep existing canvas controls and validated frame grid. |
| Easy access to ComfyUI ([discussion #2](https://github.com/underworldhistory1-ctrl/minimax-h3-higgsfield/discussions/2)) | Added a ComfyUI action beside Updates in video and image workspaces. It opens the node editor in another tab and respects a configured server or provider path prefix. |
| Optional local vision prompt enhancement ([discussion #5](https://github.com/underworldhistory1-ctrl/minimax-h3-higgsfield/discussions/5)) | Studio already has an optional prompt provider and reference-aware preparation. Do not install an older parallel extension by default. Direct prompting remains available. |
| INT8 encoder request ([discussion #6](https://github.com/underworldhistory1-ctrl/minimax-h3-higgsfield/discussions/6)) | Preserve the pinned encoder and loader contract. A community speed report alone does not establish compatibility, quality or memory requirements for another quantization. A new option needs pinned weights, loader checks and a matched render comparison. |
| Cloud bridge ([closed PR #3](https://github.com/underworldhistory1-ctrl/minimax-h3-higgsfield/pull/3)) | Not merged automatically. An older bridge requires current API, node and decoder validation before adoption. |
| Long cinematic prompts | The arbitrary 7,000-character prompt validator limit has been removed; schema and reference checks remain. Prompt length is not a quality guarantee or a change to the model context window. |
| Update discovery and design | Added an automatically checked numbered badge, a dark glass dialog, installed/available revision details, retained notification after a failed refresh, and keyboard/mobile support. Checks are read-only. Installation remains explicit and backend queue/admission protection stays in force. |
| Stale interface copy | Removed hard-coded release numbers from workspace titles/branding and obsolete V2 standby labels. Actual checkpoint/model versions and dated changelog entries remain meaningful. |

## Validation boundaries

Browser fixtures cover both workspaces, responsive layout, the numbered badge, failed/current checks, exact-commit install submission, progress, manual restart state and keyboard focus. Update service tests cover active queue and operation barriers. These tests do not install external models or submit GPU jobs.
