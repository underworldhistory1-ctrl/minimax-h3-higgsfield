# Verified behavior and production boundaries

On the project's RTX 5090 server, Original mode produced a short clip and a 15.1-second clip with decodable video and audio. A 25 fps clip with audio was accepted as a reference, converted to 24 fps, and cleaned up afterward. New installs require the upstream H3 VAE tile fix before the UI permits generation. Qwen's graphs match the pinned ComfyUI 2.1 schemas and the source project's graph contract.

On one 39 GB system-RAM RTX 5090 workspace, both 15.1-second Original and 14.38-second MotionCache Ref2VA renders exhausted system RAM during video decoding after all 20 sampling steps. The latter sampled for 50 minutes before the process was killed, with no MP4 saved. Studio blocks 12.25 seconds and longer at 1280×704 or above on hosts with under 56 GB reported RAM, rather than risk another long render. This does not measure the GPU's 32 GB VRAM; for that full-length setting, at least 64 GB advertised system RAM is recommended, pending a successful validation render.

Qwen Image 2.1 weights use the Qwen Research License and are not licensed for commercial use. They are downloaded at runtime and are not redistributed by this repository.

DLSS 5 Visual Enhancer is an optional Windows post-processing path and is not installed on Linux cloud servers. The studio first preserves source quality through the corrected H3 VAE, INT8 ConvRot weights, and high-quality MP4 saving; enhancement can be applied later on a compatible Windows RTX machine.

Windows installation is newly supported, but a complete first-time Windows GPU install has not yet been run by this project. The verified render evidence above is from Linux.

This evidence does not guarantee every prompt, LoRA combination, speed method, or a new GPU image. A video reference guides **new generation**; it is not a pixel-locked one-object edit. Optional ControlNet region guidance uses an aligned static mask; it does not automatically track a moving character or guarantee a pixel-locked edit.



## Current software checks — 8 October 2026

168 Python tests and 77 JavaScript tests passed. JSONC and YAML prompt previews were exercised in the local browser, and a local simulated generation completed without browser errors. Independent JavaScript and Python reviews found no remaining blockers after corrections. These checks do not measure GPU image quality or validate a live AI provider.
