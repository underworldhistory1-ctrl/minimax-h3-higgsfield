# Reference controls

Reference mode supports the model's native image, video and audio slots. Roles and instructions compile into its structured prompt; they do not invent unsupported per-reference attention-strength inputs.

- Choose One character, One environment, One element or One style before uploading alternate views together. They appear in one group with side-by-side previews. Separate references remains the default: different people or places are not merged automatically.
- Use + Add views to extend a group. In an expanded image card, Reference group can join an existing same-role group or separate that view. Changing an image role detaches it from its old group. Group arrows reorder views within that group; Picture labels show the actual native input indices.
- In Guided mode, mentioning any member includes every view in its group. Prompt chips show the group thumbnails together. Every image retains its own source file, fit, quality override and instruction. Groups cannot mix roles or bypass native reference limits. Explicit native subject definitions remain authoritative and may intentionally assign images differently.
- Add an independent instruction to every reference role. Storyboard panel order is a separate field; a board is not automatically split into timed frames.
- Storyboard sequence structure distinguishes a continuous take from separate shots. Spatial plan is a separate, experimental Picture role for layout/route diagrams; prefer describing its useful directions in text first. Neither choice turns drawings into exact camera trajectories. See [boards, plans and timed images](STORYBOARD_AND_SPATIAL_PLANS.md).
- Preview the selected video/audio range before submitting. Playback stops at the selected end; video soundtrack selection remains independent of standalone audio references.
- Use Original resolution per image to bypass the wrapper's optional 2048-pixel resize. This preserves uploaded pixels, not the model's internal resolution: native reference encoding still follows its selected size policy, canvas and VRAM limits.
- Scene save, local draft restoration and Reuse retain reference settings. Missing assets or incompatible settings must be resolved before generation.

Video references and standalone audio each have their own 15-second total budget; neither needs to fill it. Video soundtracks remain paired. This UI coordinates supported workflows without requiring an API key. It does not automatically judge identity, acting, composition or the best artistic strength.

Explicit Structured/native-complete prompts own their directives. The UI warns that card roles, panel order and instructions are bypassed in that path; choose Guided mode to compile card instructions automatically.

Production sections and stages have independent disclosure arrows. Collapse completed work or use the section shortcuts to jump between stages. Fold state is per tab and does not modify render inputs. Mention insertion reveals the prompt when closed; validation errors reveal their prompt section.
