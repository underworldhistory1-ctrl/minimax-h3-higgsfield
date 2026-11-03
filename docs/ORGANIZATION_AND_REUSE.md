# Organization and Reuse

Projects support naming, search, sorting and folders. Element folders are independent from categories. Copy/move to project uses selected assets; Copy preserves the source, while Move checks retained drafts/shots/dependencies. Project IDs stay stable under `lab_storage/projects/<project-id>` and shared media retains explicit ownership. ZIP is the portable bundle.

Moves check both revisions and use durable transaction IDs; retry/restart completes one operation. These guards are not separate-user authorization. Take transfers include references and continuation ancestors. Accepted-sequence entries and descendants left behind can prevent Move; Copy remains available.

Reuse opens an independent setup in Production under the original project's automatic Reuse folder. Nested Reuse remains with that root after renaming. The URL identifies the restored workspace; retries neither duplicate it nor overwrite later edits. No render starts automatically and the source remains intact.

Only recorded settings/inputs can be restored. Missing models, references or context files stay visible and block generation. Legacy partial metadata is labeled. Confirm edited setup explicitly accepts a modified reconstruction, without inventing missing historical data. Manual folder choices are preserved.

New project saves current work before opening defaults. Save/Export guard duplicate requests and save current state. A scene without a shot keeps a local checkpoint; explicit server Save/Export requires a shot. Tests cover transfers, nested Reuse, import/export, exact seeds and concurrency. Browser/API checks are not GPU inference.

Back up lab_storage before important updates: code rollback does not undo completed data moves. [Projects](PROJECT_WORKSPACE.md) · [Scene entry](SCENE_WORKSPACE_2026_10_29.md) · [Evidence](organization/verification.json).
