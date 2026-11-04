# Storyboards, spatial plans and timed images

Reviewed 4 November 2026 against the pinned ComfyUI 0.43.0 H3 nodes and the official MiniMax prompt guide. Recommendations below are a preparation strategy, not a measured improvement in generated video.

## Choose the input for its actual purpose

| Material | Studio destination | What it supplies |
| --- | --- | --- |
| Clean multi-panel storyboard | References / Storyboard | Viewpoint, composition, staging and panel-to-shot or panel-to-beat guidance |
| Separate ordered storyboard images | References / Storyboard sequence group | Ordered visual beats; final character/style can come from different references; no automatic timestamps or keyframes |
| Overhead map with camera and subject arrows | Keep in planning context by default; optionally References / Spatial plan | Experimental semantic layout and route guidance; no metric trajectory control |
| Character, environment or prop views | References / Character, Location or Object | Visible identity/appearance, with multi-view groups where appropriate |
| Clean individual target image at a chosen time | Temporal keyframes, when supported | A real AddGuide conditioning anchor at the selected frame index |
| Desired opening/closing output image | Frames mode | Actual first/last-frame conditioning on the matching FL2VA path |

A storyboard sheet or diagram is not an output frame. Do not put one into Frames or Temporal keyframes unless the generated video should literally contain that sheet or diagram.

Choose **Storyboard sheet** in the upload menu for a single sheet, or **Storyboard sequence** to upload separate images together. Arrange sequence members with their drag grips or arrows; use the group menu to join existing storyboard images. A sequence is a group of independent native image references, not a collage and not a timed-keyframe track. Each image counts toward the nine-image reference limit. Mention the group through its displayed alias, choose the shared sequence structure and specify final character/style sources in the prompt. The compiler describes storyboard appearance as staging guidance, while separately supplied identity/style references remain authoritative. Model adherence still needs visual review.

## Recommended preparation

1. Keep a clean board containing only the useful visual beats. Move the overhead map, legends and dense production data into a separate planning image/document. A combined sheet remains usable, but reduces the pixels available to each panel and asks the model to distinguish more visual functions at once.
2. Translate geography into written movement relative to visible landmarks. Describe camera travel, camera aim and subject travel separately. A pan rotates the view; tracking changes the camera's position. Keep the written route and final visual style authoritative.
3. Upload the clean board as Storyboard. Choose Follow the prompt, One continuous take or Separate shots. Panels can be successive moments of the same continuous shot; neither panel count nor panel numbering requires a cut. In Separate shots, specify where cuts occur rather than assuming every panel is a different shot.
4. Mention the board with its actual alias and state the panel order/beat map. Select the output duration and canvas in Studio. Printed timestamps, aspect-ratio labels, lens values and camera heights do not change graph settings automatically.
5. Add clean identity or location references when those details matter. A small drawn face in a board is not a substitute for a useful character image.
6. Use the separate Spatial plan role only if sending the map itself is useful. Mention its alias, distinguish camera and subject routes in Additional instruction, and compare against the simpler text-plus-board baseline. Remove the diagram if it causes unwanted aerials, annotation leakage or style contamination.

The compiler marks Spatial plan as a Picture, not as a visible Subject. Its guided prompt transfers only requested planning relationships and suppresses arrows, labels, legends, borders and camera icons. It does not reconstruct hidden geometry, enforce collisions, read calibrated 3D camera poses or create a new camera-control node. Both board and optional map still use independent native `ref_images` slots, each consuming one image slot.

Complete native prompts retain their own subject definitions, shot structure and instructions. Card sequence controls add guidance to Guided prompts; they are not hard cut-prevention switches. An optional local preparation provider receives the role and sequence metadata too. Native compilation works without an API key or external provider.

## When stronger conditioning is needed

For specific composition at specific times, prepare individual clean frames and assign them explicitly in Temporal keyframes. AddGuide operates through native conditioning; it does not automatically split a board, interpret its arrows or enforce the drawn path between frames. Pictures supplied only to AddGuide are not automatically visible as reference Pictures to the text encoder. Studio's reference path and timed-guide path remain distinct.

For more structural motion, a rendered/previsualized guide video with the project's supported pose/depth ControlNet path can provide different conditioning from a static diagram. Model, duration and compatibility requirements still apply; this is not guaranteed physics or exact camera reconstruction.

Independent tools such as [Camera H3 v3](https://github.com/NyckM/3d-Camera-control-H3-Minimax) use source video, MoGe geometry, depth reprojection and Meridian models/adapters. They are a different video-based pipeline, not an automatic reader for storyboard arrows. This release does not install or claim validation of that stack.

## Primary sources and evidence

- [MiniMax native reference prompt guide](https://github.com/MiniMax-AI/MiniMax-H3/blob/main/skills/h3-prompt-writing/references/ref-en.txt): Pictures as shot-planning anchors, explicit shot mapping and Subjects abstracted from references.
- [Pinned ComfyUI H3 implementation](https://github.com/Comfy-Org/ComfyUI/blob/426f5eea52a7ece1dd599fff4cb6cd1f352ddd24/comfy_extras/nodes_minimax_h3.py): actual reference, first/last-frame and AddGuide inputs.
- [ComfyUI multiframe guide](https://github.com/Comfy-Org/docs/blob/main/tutorials/video/minimax/minimax-h3-multiframe.mdx): timed guide conditioning and distinction from text-encoder reference inputs.
- [MiniMax storyboard authoring workflow](https://github.com/MiniMax-AI/MiniMax-H3/blob/main/skills/3d-animation-short-generator/references/storyboard-guidelines.md): text storyboards remain authoritative; pencil sheets are optional visualizations in that workflow. Its per-second panel convention is not a universal model requirement.

Source tests and a local real-API/browser fixture verify tags, saved sequence choices, provider metadata and independent graph inputs without automatic AddGuide/first-frame insertion. Inference is simulated; no new GPU adherence, camera accuracy or output-quality result is claimed.
