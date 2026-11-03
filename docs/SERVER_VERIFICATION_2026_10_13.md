# Server verification — 2026-10-13

Historical 2.1.1 review on RTX 5090 (about 32 GB VRAM), about 39 GB host-RAM limit, PyTorch 2.9.1+cu130/CUDA 13.0. Not current server/core state. It compared 120 runtime files and decoded an already completed Original Ref2VA + reference image/static Canny output, without another GPU render.

- File: `h3_studio_a6e56d03cdba_00001_.mp4`.
- H.264 864×480, 124 frames, 24 fps, 5.166667s; AAC about 5.167s.
- SHA-256: `ac87a908edadf6c62b33480ad59d70c550dd8e07d1a4f11be5bf7e980c4900f1`.
- Stored settings: Native, 20 steps, res_multistep/simple, CFG 1, control strength 1.
- Durable job: `e17ed854-89fc-487c-abd6-a438b9fcb93e`; transient history was already cleared.

Live HTTPS checks found correct inputs/model names and no JS/mobile-overflow errors. 289 Python and 139 JS tests passed. Pose/Depth availability was not inference evidence. Qwen readiness was not a new image render. Prompt AI was disconnected; Automatic formatted locally. Temporary tunnels/shared storage were not durable deployment promises.

[Later GPU report](PRODUCTION_READINESS_2026_10_15.md) · [Current compatibility](COMPATIBILITY_MATRIX.md) · [Upgrade](V2_UPGRADE.md).
