# Scenes execution ledger
Approved design and execution delegated by user, 16 October 2026.
Base c82028a is official d5a2565 snapshot.
Implementation: additive scenes/shots, scope isolation, CRUD, legacy compatibility, scoped reuse/assembly and immutable submission/recovery ownership.
Validation: 187/187 JavaScript tests passed. Real browser acceptance passed three consecutive runs against isolated real storage APIs; zero GPU submissions. Covers creation, independent drafts/references, refresh, CRUD, conflict retention, Reuse, protected deletion and submission ownership.
Linux server: all 48 focused scenes/projects/workspace/organization/assets/reuse tests passed. Full suite ran 467 tests with 3 failures and 12 errors during a user render: missing cv2 CPU dependency and memory admission/FFmpeg preparation failures prevent a full-suite pass claim. These paths were not changed by this feature.
Independent code/security review approved; ownership transfer, lifecycle reset and pending snapshot races corrected before acceptance. No new GPU output was generated for this feature.
Decisions: legacy content stays unassigned; copy legacy setup copies draft, not historical take identities. Scene transfer refuses ambiguous ownership. Same-tab navigation retains existing active-render lock; completion uses immutable snapshot for browser closure/other devices. Scene assembly selects all accepted shots within current scene.
Deployment must wait for an idle queue and operations before runtime changes/restart.
