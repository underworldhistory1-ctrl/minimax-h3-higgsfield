# H3 Interface 2.11.0

Released 4 November 2026. This release changes Production organization and multi-view references; it does not replace the pinned model or runtime.

## Production layout

Workspace, Shot inputs, Render setup and Optional guidance have distinct separators and disclosure arrows. Each child section can also be folded. Workspace and less frequently used tools start collapsed. Shortcuts reveal each stage; Collapse all clears the visible rail without changing its inputs. Fold preferences survive refresh in the same tab.

Existing controls are moved rather than copied. Their IDs, listeners, values, mode visibility and capability gates remain attached. Project operations and export/import tools remain available inside Workspace; Elements remains a separate reusable asset library. Fresh automatic scenes can open Elements through the same working-project creation path as the main navigation.

Summary focus alone does not open a section. Mention insertion, New scene and Extend explicitly reveal the prompt before focusing it. Prompt errors also reveal their section. Project restoration refreshes reference controls after releasing its loading lock.

## Multi-view references and prompts

Before an image batch upload, choose Separate references, One character, One environment, One element or One style. A group displays its views side by side, with a single group mention action and Add views. Expanded cards retain individual instructions, fit, original-resolution override, replacement, removal and role selection.

Guided prompts bind every group image to one native Subject. Any member's alias mentions the group, while each Picture/file stays connected independently. Location and object groups use the existing native image-reference path, not an invented node. Changing a member's role detaches it; incompatible stored mixed-role groups are rejected. Complete native prompts retain explicit subject numbering and instructions. Grouping does not bypass media limits or guarantee identity preservation.

Reference arrows reorder within the selected group; native Picture indices remain visible even when the group's files were originally noncontiguous. Prompt chips combine group previews, while autocomplete keeps every member searchable. Case-insensitive duplicate aliases are rejected before compilation and local prompt preparation.

## Verification and boundaries

- Python suite: 594 tests, 593 pass and one platform skip.
- JavaScript suite: 299 pass, including character/location/object/style compilation, native-definition authority, instructions, mixed-role rejection and duplicate alias guards.
- Real local browser with real project/upload/graph routes and simulated inference: keyboard/mouse folding, jump navigation, automatic Elements creation, grouped uploads, horizontal views, group-only ordering, mention insertion into a collapsed prompt, reload/save persistence, eight independent graph image inputs, cancel, prompt-error reveal and narrow-screen overflow.
- Existing reference browser journey: original-resolution sizing, selected audio/video playback ranges, save/reuse persistence, object URL cleanup and malformed group recovery.
- Independent JavaScript and general code reviews; no actual GPU generation or perceptual comparison in this release.

All software tests have finite coverage. Artistic quality, motion, identity and audio still require review of real outputs. See [reference controls](REFERENCE_CONTROLS.md), [graph contract](GRAPH_MAP.md) and the [historical GPU audit](PRODUCTION_READINESS_2026_10_15.md).
