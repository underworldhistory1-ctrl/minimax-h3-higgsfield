# Project/reference audit — 2026-10-21

Historical review based on `85e5967`, fixes beginning at `75e4c48`. Shot mention names were separated from catalog names; case-insensitive conflicts rejected; unchanged project reopening stopped redundant reloads; busy tabs could open another project separately.

Navigation checkpoints drafts and skips unchanged writes. Asset requests are shared with a 64 MB bounded cache and 8 MB per-file retention. Independent downloads preserve order; failures stay visible/retryable. Refresh keeps explicit page links and stale list responses cannot overwrite newer state.

The original review passed 225 JS tests and live browser/API checks. Two-image retrieval totaling 10081761 bytes took about 3637ms initially and 0.12ms cached in the same controller: asset retrieval, not full project opening. Catalog names/revisions remained stable and active generation was not interrupted.

A follow-up passed 232 JS and 56 focused Python tests. Reuse gained independent durable workspaces grouped under the original root, including nested reuse and renaming. Retries avoided duplicates; Save/Export guarded current/empty-scene state; manual folders remained intact. Live export/Reuse matched stored inputs/settings without new GPU generation.

Large histories still transfer data; cross-device edits can conflict; missing references are not guessed away. [Projects](PROJECT_WORKSPACE.md) · [Reuse](ORGANIZATION_AND_REUSE.md) · [Scene entry](SCENE_WORKSPACE_2026_10_29.md). Detailed original evidence remains in Git history.
