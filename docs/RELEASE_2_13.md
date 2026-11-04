# 2.13.0 - Storyboard sequences and personal layouts

Released 4 November 2026. This release changes interface organization and reference preparation. Model and ComfyUI pins are unchanged.

- Storyboard sheet uploads one contact-sheet image. Storyboard sequence uploads separate images into one ordered group. Each member retains its own native image slot; one group mention includes the group's images in Guided compilation. The group order provides narrative progression, not exact timing. Character, environment and style references supply final appearance separately.
- Spatial plans remain semantic camera/subject-route guidance. No diagram, board or sequence becomes an opening frame or timed guide automatically. Explicit Temporal keyframes and Frames mode retain their native conditioning routes.
- Customize layout supports stage/section order, cross-stage moves, visibility and reset. Separate video/image browser preferences persist. Hiding controls preserves values; mode/capability rules still apply. Validation reveal opens relevant hidden sections.
- Reference cards/groups, Qwen references and timed guides support drag handles, Alt + arrow keys and button alternatives. Numeric references follow their original media after reorder. Explicit native Subject definitions preserve their identities. Guide reorder leaves timestamps unchanged.
- SortableJS 1.15.7 is bundled offline under MIT with pinned source and file hashes in `web/h3/vendor/sortable-manifest.json`; no CDN or new API key is needed.

Validation: 596 Python tests (595 pass, one platform skip), 314 JavaScript tests, independent Python/JavaScript reviews, and actual local browser/API journeys with simulated model execution. Browser checks include real mouse reference dragging, keyboard order changes, sequence upload/grouping, synchronized modes, saved project reload, layout persistence/reset, hidden-control reveal, separate native image inputs and no implicit AddGuide/first-frame insertion. Existing reference, spatial, workspace, image, continuation and connected-control journeys are also checked.

The persisted 528-combination graph regression matrix checks supported selection contracts; it does not prove every arbitrary combination or generated result. No new GPU inference, perceptual quality measurement, calibrated trajectory control or universal bug-free claim is established by this release.

See [reference controls](REFERENCE_CONTROLS.md) and [storyboard guidance](STORYBOARD_AND_SPATIAL_PLANS.md).
