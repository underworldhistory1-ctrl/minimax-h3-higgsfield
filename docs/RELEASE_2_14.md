# 2.14.0 - Verified selection paths and resilient image recovery

Released 4 November 2026. This release hardens supported UI-to-graph contracts. Model weights and runtime pins are unchanged.

- Output soundtrack reuse has an explicit video source selector. The chosen reference alias survives reorder, save/reload and settings reuse. Duplicate uploads with different trims remain distinct. Missing or ambiguous sources block submission; leaving References clears interactive reuse. Selected source audio must cover the output duration.
- Backend admission verifies declared media filenames, native reference slots and paired audio trims, frame loaders, CLIP/VAEs, exact model/LoRA/Dials/shift/accelerator chains, refinement conditioning and seed, continuation source/trim wiring and relevant capabilities. Unsupported graphs fail before queue admission.
- Reference and guide uploads use separate asset maps, so aliases such as source, mask and control cannot overwrite reserved control inputs. Submitted metadata includes resolved input filenames and the compiled prompt.
- Known LoRA family restrictions use shared selection rules. Busy/project-loading configuration stays locked. Text/Frames generation ignores inactive reference trims.
- Qwen recovery bounds network waits, avoids overlapping pollers and ignores stale responses. Metadata retries retain the finished image, observed render time and unlocked controls without repeated preview downloads. Cancellation cleanup is bounded.

Validation: 605 Python tests (604 pass, one platform skip), 323 JavaScript tests, independent backend/JavaScript/security reviews, the existing 528-case and new 2,096-case supported graph matrices, and real local browser/API journeys with simulated inference. Browser journeys cover explicit soundtrack selection and persistence, submitted source wiring, malformed request rejection, mode transitions, Qwen retry/unlock, storyboard/layout/reference behavior, continuation and connected controls.

These checks establish construction, admission and interface behavior for tested supported paths. No new GPU inference, measured speedup, perceptual quality comparison or universal bug-free guarantee is claimed. ComfyUI 0.44.0 is the next GPU-validation target; the tested runtime remains pinned to 0.43.0. See [upstream audit](UPSTREAM_AND_ORCHESTRATION.md).
