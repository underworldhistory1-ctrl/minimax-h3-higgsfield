#!/usr/bin/env python3
"""Provision pinned CPU pose/depth dependencies and verified annotator weights."""
import argparse
import hashlib
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import urllib.request

AUX_REPOSITORY = "https://github.com/Fannovel16/comfyui_controlnet_aux.git"
AUX_REVISION = "0cd290477128d42cdc3e76a826a402d866e8c684"
ONNXRUNTIME = "onnxruntime==1.23.2"
# Only the pinned DWPose and Depth Anything V2 import paths are used. The full
# auxiliary extension requirements include unrelated annotators and build tools.
SCOPED_DEPENDENCIES = (
    "torch", "torchvision", "opencv-python", "scipy", "scikit-image", "numpy", "Pillow",
    "einops", "pyyaml", "huggingface_hub", "matplotlib", "safetensors",
)
# Official Hugging Face model API metadata (revision, LFS SHA-256 and size).
MODELS = (
    ("yzd-v/DWPose", "1a7144101628d69ee7a3768d1ee3a094070dc388", "yolox_l.onnx",
     "7860ae79de6c89a3c1eb72ae9a2756c0ccfbe04b7791bb5880afabd97855a411", 216746733),
    ("yzd-v/DWPose", "1a7144101628d69ee7a3768d1ee3a094070dc388", "dw-ll_ucoco_384.onnx",
     "724f4ff2439ed61afb86fb8a1951ec39c6220682803b4a8bd4f598cd913b1843", 134399116),
    ("depth-anything/Depth-Anything-V2-Small", "03876f8651c73a60fe4c2c48294e09fcb6838fcf",
     "depth_anything_v2_vits.pth", "715fade13be8f229f8a70cc02066f656f2423a59effd0579197bbf57860e1378", 99218434),
)


def valid(path, digest, size):
    if not path.is_file() or path.stat().st_size != size:
        return False
    hasher = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(4 * 1024 * 1024), b""):
            hasher.update(block)
    return hasher.hexdigest() == digest


def aux_root(comfy_root):
    return pathlib.Path(comfy_root).resolve() / "custom_nodes" / "comfyui_controlnet_aux"


def checkpoint_root(comfy_root):
    configured = os.environ.get("AUX_ANNOTATOR_CKPTS_PATH")
    return pathlib.Path(configured).resolve() if configured else aux_root(comfy_root) / "ckpts"


def existing_cpu_runtime():
    """Preserve shared CPU/GPU runtimes; report broken installations before pip."""
    probe = """import importlib.util, importlib.metadata, json
try:
    if importlib.util.find_spec('onnxruntime') is None:
        installed = False
        for name in ('onnxruntime', 'onnxruntime-gpu'):
            try:
                importlib.metadata.distribution(name)
                installed = True
            except importlib.metadata.PackageNotFoundError:
                pass
        print(json.dumps({'absent': not installed}))
    else:
        import onnxruntime
        print(json.dumps({'providers': onnxruntime.get_available_providers()}))
except Exception:
    print(json.dumps({'broken': True}))
"""
    result = subprocess.run([sys.executable, "-c", probe], capture_output=True, text=True)
    try:
        status = json.loads(result.stdout.strip().splitlines()[-1])
    except (IndexError, ValueError, TypeError) as error:
        raise ValueError("Existing ONNX Runtime could not be inspected; repair it before installing preprocessors.") from error
    if not isinstance(status, dict):
        raise ValueError("Existing ONNX Runtime returned invalid status; its installation was not replaced.")
    if result.returncode == 0 and status.get("absent") is True:
        return False
    if result.returncode == 0 and isinstance(status.get("providers"), list) and "CPUExecutionProvider" in status["providers"]:
        return True
    raise ValueError("Existing ONNX Runtime is broken or lacks CPUExecutionProvider. Repair it manually; its shared installation was not replaced.")


def install_dependencies(comfy_root):
    directory = aux_root(comfy_root)
    revision = subprocess.run(["git", "-C", str(directory), "rev-parse", "HEAD"],
                              check=True, capture_output=True, text=True).stdout.strip()
    if revision != AUX_REVISION:
        raise ValueError("Control preprocessor source must match the pinned auxiliary revision.")
    subprocess.run(["git", "-C", str(directory), "diff", "--quiet", "HEAD", "--", "src", "requirements.txt"], check=True)
    preserve_runtime = existing_cpu_runtime()
    # Do not install unrelated upstream annotators (for example MediaPipe or
    # AlbumentationsX) when only these two offline CPU extractors are requested.
    filtered = "\n".join(SCOPED_DEPENDENCIES) + "\n"
    if not preserve_runtime:
        filtered += ONNXRUNTIME + "\n"
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", encoding="utf-8", delete=False) as stream:
            temporary = pathlib.Path(stream.name)
            stream.write(filtered)
        subprocess.run([sys.executable, "-m", "pip", "install", "-r", str(temporary)], check=True)
        # Import checks catch incompatible NumPy/OpenCV/runtime wheels before startup.
        subprocess.run([sys.executable, "-c",
                        "import sys; sys.path.insert(0, sys.argv[1]); "
                        "import cv2, numpy, onnxruntime; "
                        "from custom_controlnet_aux.dwpose import DwposeDetector; "
                        "from custom_controlnet_aux.depth_anything_v2 import DepthAnythingV2Detector; "
                        "assert callable(cv2.Canny); "
                        "assert 'CPUExecutionProvider' in onnxruntime.get_available_providers()",
                        str(directory / "src")], check=True)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def provision_weights(comfy_root, *, offline=False):
    root = checkpoint_root(comfy_root)
    for repository, revision, filename, sha256, size in MODELS:
        target = root / repository / filename
        if valid(target, sha256, size):
            continue
        if offline:
            return False
        if target.exists():
            raise ValueError(f"Existing preprocessor weight failed verification; move aside: {target}")
        target.parent.mkdir(parents=True, exist_ok=True)
        part = target.with_name(target.name + ".part")
        url = f"https://huggingface.co/{repository}/resolve/{revision}/{filename}"
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "H3-Studio/2.0"})
            with urllib.request.urlopen(request, timeout=60) as response, part.open("wb") as output:
                received = 0
                while chunk := response.read(4 * 1024 * 1024):
                    received += len(chunk)
                    if received > size:
                        raise ValueError("Preprocessor weight download exceeded its pinned size.")
                    output.write(chunk)
            if not valid(part, sha256, size):
                raise ValueError(f"Preprocessor weight download failed size/SHA-256 verification: {filename}")
            part.replace(target)
            print("Installed preprocessor weight:", target)
        finally:
            part.unlink(missing_ok=True)
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("comfy_root", type=pathlib.Path)
    parser.add_argument("--offline-check", action="store_true")
    parser.add_argument("--install-dependencies", action="store_true")
    args = parser.parse_args()
    if not (args.comfy_root / "main.py").is_file():
        parser.error("ComfyUI main.py not found")
    if args.offline_check and args.install_dependencies:
        parser.error("Offline checking never installs dependencies")
    if args.install_dependencies:
        install_dependencies(args.comfy_root)
    return 0 if provision_weights(args.comfy_root, offline=args.offline_check) else 1


if __name__ == "__main__":
    raise SystemExit(main())
