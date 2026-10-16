# Scenes and shots design
User approved project > user-created scenes > multiple shots per scene on 16 October 2026 and delegated execution decisions.

- New projects contain no predefined scenes. Create Scene requires a user name; each scene starts empty and exposes Create Shot.
- Scenes have stable scene_id and name, ordered by scenes array. Shots have stable shot_id, name, draft, ordered by shots array. shot_id is also the clip_id for new takes. Existing clips, takes, draft, assets and IDs remain intact.
- project.scenes defaults to [] without eager migration. Existing project draft and unassigned takes are visible in Legacy content. Never fabricate scenes or assign historical takes by guessing.
- Elements are project-wide; each shot owns its reference bindings and settings. Missing restored media blocks generation using existing contracts.
- Scene/shot selection belongs to this browser tab and project, not a shared mutable server selection. Save current draft before navigation; hydrate the target only after the save succeeds. Revision conflicts retain the unsaved editor.
- CRUD: create, rename, duplicate, exact-permutation reorder, safe delete. Copies receive new scene/shot IDs and copy drafts, not historical takes. Deletion refuses any associated takes, queued/running/uncertain jobs, or draft dependencies and never deletes media. Legacy material can be moved into an explicitly named shot without renaming historical IDs.
- All new render submissions capture scene_id, shot_id and clip_id in submitted metadata and project_snapshot. Server and browser completion use that immutable snapshot; changing tabs cannot redirect outputs.
- Reuse targets the selected scene/shot; legacy videos can be reused into an explicit shot. It opens Production without starting a render. Protect active work and unknown membership.
- Export/import and duplicate preserve all scene drafts and associated reference IDs. Transfer and accepted sequences preserve scene ownership or refuse cross-scene ambiguity explicitly.
- Verification: backend schema/CRUD/revisions/ownership and legacy tests; JS navigation/reuse/submission restoration tests; browser create two scenes, distinct drafts, switch/refresh/reuse, no GPU job automatically submitted. Preserve old projects and outputs during deployment; deploy only when render/preparation/export idle.
