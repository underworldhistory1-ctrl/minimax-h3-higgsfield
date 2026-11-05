# Pika integration audit — 5 November 2026

## Inspected scope

Source baseline `34bef465ea767500c291790764b0c0ae660d5edd`, live H3 Studio, pinned ComfyUI reference encoding, official Flex documentation and the installed Turbo publisher's model card were inspected. This is a dated observation of one rental, not a statement of universal readiness.

The official [Flex release](https://github.com/Pika-Labs/Pika-H3-Flex/blob/main/release.json) pins two six-evaluation adapters. The [Turbo model card](https://huggingface.co/Pika-Labs/Pika-H3-Flex-Turbo-LoRA) describes seven fused standard LoRAs with 2/4/8-step profiles. The installed integration follows the latter: matching FL2VA/Ref2VA, strength 1, Euler/simple, CFG 1, denoise 1, video shift 6/12 and audio shift 3. A separate official inference package is not installed by this feature.

## Workflow and reference evidence

- All seven installed Turbo names were advertised by the live LoRA endpoint.
- Eleven saved videos recorded the 8-step HD Ref2VA adapter at strength 1 and the expected sampling configuration. This does not establish that every saved declaration matches an unavailable historical execution graph.
- The retained ComfyUI history for `d26e766b-da0d-4f85-880d-3793c5e952c1` contained a successful 362-frame 1024x576 render. Its connected graph used the recorded adapter, shifts and sampler; the three image slots matched the compiled Picture/Subject definitions.
- The live ComfyUI node builds references as images, then videos with each enabled soundtrack, then standalone audio. Studio's compiler and graph builder agree with that order. Role labels guide the prompt; they do not create different conditioning channels.
- An interleaved-media regression verifies storyboard/character image slots, paired audio numbering, standalone audio numbering, and absence of implicit first-frame/keyframe conditioning.

## Output review

Four saved MP4s were decoded completely for both video and audio with FFmpeg: request prefixes `a5af58d5bf50`, `f83cb0066642`, `396979e1d462`, and `01f3c5b8faf2`. Their video streams contained 362, 362, 328 and 328 frames respectively, with 32 kHz stereo AAC. Contact sheets sampled their progression. Audible dialogue accuracy, complete motion/contact continuity and subjective quality were not established by decoding or sampled stills.

The two table-tennis outputs varied substantially in rendering style. The latest sampled output had visible facial features despite a faceless-character instruction. Both supplied character sheets themselves contain clearly rendered faces, while the generated prompt also requests identity preservation. This is conflicting conditioning; the evidence does not isolate the sampler, attention implementation, reference weighting or quantization as the cause. Do not silently replace the user's sources. A cleaner experiment uses character sheets matching the desired face design and a shorter prompt, with the same canvas, references, seed and model for a controlled comparison.

Three of eleven compiled prompts exceeded 8,000 characters (9,432; 10,035; 10,541). The separate official Flex CLI specifies at most 8,000 characters. That limit is not evidence that local ComfyUI truncated these prompts. The UI now reports long compiled Pika prompts without modifying them.

## Changes and limits

The active Pika tier/family is shown instead of the misleading full Original sampling summary. Saved-video settings receive the same identification. Conflicting adapters and extra passes that are automatically disabled are listed in a persistent status notice. The generic highest-quality LoRA advice is hidden for Pika/Turbo. Compiled prompt length advisories are visible without opening the preview.

No new model weights, custom node pack, backend sampling change or additional library was introduced. An existing user Pika render was active during inspection; it was not interrupted, restarted or replaced by a test. New GPU quality comparisons remain pending an idle device and a controlled, compatible input set.

## Patch verification

All 339 JavaScript tests and 21 focused Python tests passed, including the mixed-media graph test and actual Studio handler transitions. Two independent code reviews found a mutable-snapshot issue in the first notice implementation; it was fixed, regression-tested and re-reviewed with no remaining findings.

The four changed frontend files were backed up and copied to both the live source and runtime after exact baseline hash checks. All four HTTP responses matched the tested local file hashes. No backend file was deployed or worker restarted. At the time of runtime verification, source changes had not yet been committed or published. Subsequent source publication does not expand the GPU evidence below.

Chrome UI checks on a separate blank tab verified:

- Selecting HD Ref2VA after Combat + Refine disables both and displays their removal.
- Switching References to Text selects HD FL2VA, retains eight steps, changes shifts from 12/3 to 6/3, and reports the removed Ref2VA adapter.
- A 9,800-character test input remains intact and receives an advisory for its 10,025-character compiled form.
- Selecting Spectrum removes Pika, restores 20 steps and reports the adapter removal.
- Returning the test tab to Original and clearing its prompt leaves the user's original render running. The tab reported no captured console errors during these checks.

These UI checks did not submit a generation or alter the user's existing project.

## Singularity v2 follow-up

A reproduced profile-transition defect removed Pika because policy saw a temporarily empty checkpoint. The profile handler now resolves the installed v2 checkpoint first. A handler-level regression verifies that order. Existing saved checkpoint choices remain intact.

Pika variants now have one dedicated selector under Model configuration, separate from the six creative LoRAs. The selector uses the existing managed selection handler, gates installed family variants and continuation compatibility, and lists HD, full 4-step, Lite and Draft in order. Browser inspection confirmed References + Singularity v2 + full 4-step Turbo retained four sampling steps and shifts 12/3. The compiled prompt receives a separate v2 advisory above about 5,000 characters. Native prompt bypass warnings are visible.

Both code and JavaScript reviewers re-reviewed the final implementation after fixing a detached-panel event-binding issue. No remaining findings were reported. Live source and runtime deployment used exact expected hashes and a backup at `/opt/h3-singularity-ui-backup-20261105T004423Z`; no service restart occurred.

A new GPU smoke was planned but not submitted: the shared queue grew to one running and four pending user generations. Two browser file-chooser attempts timed out without attaching a file; upload behavior was not validated by these attempts. No user render was cancelled, reprioritized or modified. Existing Pika output evidence above does not certify Singularity v2 + Turbo quality. There is no new official Flex inference installation, dependency or model download. The working patch was deployed to the current rental before source publication. This audit does not declare a versioned release or a completed new GPU smoke.
