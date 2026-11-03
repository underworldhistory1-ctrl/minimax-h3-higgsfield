# Upgrade and rollback

Run the normal Linux/Windows launcher from official source outside custom_nodes. Default policy follows main with ancestry checks. Local edits/divergent history prevent replacement. `--no-update` explicitly freezes custom/offline source.

Admission closes and accepted jobs, preparation, exports and native queue must drain before runtime changes. Backups preserve replaced files. Actual loaded source/interpreter/CUDA/backend are checked. Recovery failures remain visible. Never restart a busy worker.

The Updates panel handles supported code-only updates with recognized provenance. Dependency/core changes need the full launcher. Installed source is not proof of models/GPU readiness. Restart when idle and reload Studio afterward.

V2 is an older migration. Never load h3_studio and h3_studio_v2 together; their routes/nodes conflict. Preserve input/output, lab_storage and h3_lab_contexts. Export/import ZIPs or use documented backups; changing source does not move side-install data.

Rollback requires drained work and preserved data, then a recorded runtime snapshot or selected source revision with updates explicitly disabled. Check model/environment compatibility. Code rollback does not undo data moves and does not require deleting weights/media. Current Turbo/Pika support supersedes historical retirement notes. [Launcher](LAUNCHER.md) · [Compatibility](COMPATIBILITY_MATRIX.md).
