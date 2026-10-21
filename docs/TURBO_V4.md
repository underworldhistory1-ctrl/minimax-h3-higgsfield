# Optional H3 Turbo v4 EMA

Install the creator-recommended `minimax_h3_turbo_v4_step600_ema.safetensors` and the current upstream loader/sampler:

```bash
python deploy/install_h3_turbo.py --comfy-root /path/to/ComfyUI
```

The installer verifies pinned SHA256 hashes and never restarts a worker. Restart H3 only when its native queue and preparation work are empty. Existing user renders and files must be preserved.

Select **Turbo v4 EMA** under Render method with Original Text or Frames. Use 6-8 steps (6 initial), strength1.0. Studio routes the LoRA through the upstream MiniMaxH3TurboLoRA loader before SigmaShift, including the pruned INT8 time-conditioning injection, and delegates the `h3_turbo` KSampler option to the upstream adaptive AV Turbo sampler. The normal node8 progress, cancellation, saved latent/decode, seed and resource contracts remain in use. Turbo enforces simple scheduling, CFG1, denoise1, video shift12/audio shift3. It is optional and never selected by default.

Other adapters, extra refinement/audio passes, ControlNet and continuation are not validated with this release and are rejected. The v4 Text/Frames adapter is not certified for Ref2VA; References uses its separately selected LightX2V adapter below. Existing historical Turbo files are retained. Legacy metadata Reuse retains the render method without treating its managed adapter as a manual style LoRA.

The v5 raw training checkpoint is experimental; v4-600EMA remains the creator recommendation. Sampling speedup is not an end-to-end render speed guarantee. Fast motion and audio need output review.

Sources: https://huggingface.co/larryvrh/MiniMax-H3-Turbo-Lora and https://github.com/Larryvrh/ComfyUI-MiniMax-H3-Turbo . Exact revisions/hashes are in deploy/turbo-v4.json.

## References: LightX2V8stepv1.0

`--references` additionally installs `minimax_h3_ref2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors`. Select **References Turbo · LightX2V8steps** with Original References. This is a separate native Ref2VA adapter using LoraLoaderModelOnly, strength1, exactly8Euler/simple steps, shifts12/3, CFG1 and denoise1. It does not use Larry's v4 loader/sampler. No other adapters or extra passes are supported. The creator documents these settings at https://huggingface.co/lightx2v/Minimax-h3-Turbo/discussions/51 . v1.1 files exist but were not selected because the inspected publisher instructions explicitly validate v1.0. Use match reference sizing as recommended by the creator; canvas up to768p is the published scope. Output review is still required for each prompt.

## 21October2026 validation

Both pinned weights passed SHA256 verification and both methods became available through the running API and browser controls. A Ref2VA8-step test (Original prunedINT8, one character image, 864x480,124frames,seed42,match sizing) completed in81.14seconds; H.264 video and32kHz stereo audio fully decoded, durations5.166667/5.166688seconds. Three output frames retained the reference face/hair/costume in this small-motion shot. This is one tested case, not a guarantee for complex references or high resolutions. The first v4 test was externally interrupted during encoding. Its replacement completed in87.57seconds:864x480,124frames,6steps,seed42, H.264 video plus32kHz stereo audio; full decoding passed. Runtime logs confirmed208backbone modules,158bypass adapters,50INT8fc2 merges,51runtime AdaLN injections and the native ModelSamplingAV single-schedule sampler. A middle frame matched the requested red teapot shot.

All240JavaScript tests pass. Linux ran501Python tests:500passed and one video preparation test hit the production memory-headroom guard during an active render; all10tests in that module passed when retried after rendering. The missing pre-existing reuse_groups installer inventory entry is repaired alongside the new h3_turbo module. Windows shell/path assumptions were separately checked on Linux.
