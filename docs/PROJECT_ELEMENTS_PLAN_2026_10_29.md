# Project and element integrity — 2.5.8

Scope: project creation, shot reference identity, reusable elements, replacement, responsive loading and safe save/restore. Preserve historical takes, queued jobs and original asset bytes. No server deployment or GPU changes in this work.

1. Reproduce naming collisions, replacement gaps, asynchronous editing races and unnecessary catalog/prompt work.
2. Add direct shot replacement with decode-before-commit and stable alias/position/role; old current reference disappears only after success.
3. Add project element image replacement: upload detached content, revision-checked catalog swap, editable root/scene drafts rebased, historical takes unchanged. Reject existing-element conflicts and stale revisions. Failure retains the original.
4. Guard project creation and reference mutations while loading; bind dialog actions to their original project and revision.
5. Reduce repeated mention normalization/compilation, lazy-load expanded previews and paginate large catalogs. Avoid unnecessary filesystem lookups for current manifests.
6. Test real project/asset APIs and browser interactions: duplicates, stale dialogs, corrupt files, rapid double action, replacement at limits, refresh/reopen, cross-project isolation and retained historical inputs. Review diffs independently and publish the tested release.

Physical old asset deletion is deliberately excluded when older takes, other projects or jobs may still reference it. Replacement removes the old picture from the editable slot/catalog, while immutable media remains available to history.

## Failure analysis and verification

| Failure case | Final behavior / evidence |
| --- | --- |
| Rapid double Create / lost creation response | One request identity is reused on retry; concurrent server retries yield one project. Real browser and service tests pass. |
| Same file names with different letter case / legacy duplicate aliases | Unique catalog identifiers; shot-local aliases remain independent. A display name cannot shadow another element's canonical alias. |
| Invalid/corrupt image or offline upload | The current reference and element are retained. Image bytes are checked before client swap and before server registration. |
| Replacement response lost after server commit | One read-back verifies the exact swap; the mutation is not resubmitted. Browser failure injection passes. |
| Another device edits the element | Expected revision rejects a stale write. The dialog remains bound to its original project and revision. |
| Replace A with B, then choose A again | Mapping targets are pruned and flattened; current catalog IDs stop stale replacement traversal. |
| Old take needs original A after catalog replacement B | Archived originals stay owned and portable; historical restore carries provenance and survives autosave/refresh. Reuse and cross-project copy retain original media. |
| Delayed crop/contain conversion finishes after replacement | Source file, selected fit and canvas are checked before committing the preview; stale work cannot overwrite new bytes/preview. |
| Large element library and long prompt typing | 60 initial element cards, all-element search, lazy expanded previews, 120 ms search/live-preview debounce and one mention-normalization pass per catalog synchronization. A 200-element browser fixture verifies bounded card counts. |
| Current manifest read | No per-asset original-file lookup is needed when catalog fields already exist; legacy fields still migrate. |

Final targeted checks: **101 Python tests**, **244 JavaScript tests**, and real local API/browser suites `project-elements.cjs`, `project-workspace.cjs`, `project-library.cjs` and `updates.cjs` passed. These cover fixture server storage and UI behavior, not GPU inference or visual generation quality.

A broader Windows run executed 510 Python tests during development, with one skip and nine Linux shell/path assertion failures (CRLF passed to Bash and Windows versus POSIX path expectations). These unrelated platform checks are recorded rather than represented as passing. No active remote render was restarted or modified.
