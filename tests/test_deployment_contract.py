import unittest
import contextlib
import io
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from unittest.mock import Mock, patch


ROOT = Path(__file__).resolve().parents[1]


class DeploymentContractTests(unittest.TestCase):
    def test_salad_feature_weights_default_skip_and_remote_fail_closed(self):
        bash = shutil.which("bash")
        if not bash and Path("C:/Program Files/Git/bin/bash.exe").is_file():
            bash = "C:/Program Files/Git/bin/bash.exe"
        if not bash:
            self.skipTest("Bash is unavailable")
        entrypoint = (ROOT / "deploy/salad/entrypoint.sh").read_text(encoding="utf-8")
        functions = entrypoint[entrypoint.index("prepare_feature_model() {"):entrypoint.index("sync_once() {")]
        defaults = "\n".join(line for line in entrypoint.splitlines()
                             if line.startswith(('H3_INSTALL_REFINE=', 'H3_INSTALL_CONTROLNET=')))
        harness = '''set -Eeuo pipefail
H3_NODE=/extension
COMFY_ROOT=/comfy
REMOTE=''
QWEN_IMAGE_PROFILES=int8
log() { :; }
die() { echo "$*" >&2; exit 1; }
python() {
    echo "$*"
    case "$1" in
        */download_refine_models.py|*/download_control_models.py|*/download_control_preprocessors.py)
            if [[ "${3:-}" == --offline-check ]]; then return 1; fi ;;
    esac
    return 0
}
'''
        for refine, control, source, expected, returncode in (
                (None, None, "huggingface", ["refine"], 0),
                ("0", None, "huggingface", [], 0),
                ("0", "1", "huggingface", ["control"], 0),
                (None, None, "remote", [], 1)):
            with self.subTest(refine=refine, control=control, source=source):
                environment = dict(os.environ, MODEL_SOURCE=source)
                for key, value in (("H3_INSTALL_REFINE", refine), ("H3_INSTALL_CONTROLNET", control)):
                    environment.pop(key, None)
                    if value is not None:
                        environment[key] = value
                result = subprocess.run([bash, "-s"], input=harness + defaults + "\n" + functions + "\ndownload_models\n",
                                        text=True, capture_output=True, env=environment, timeout=10)
                self.assertEqual(result.returncode, returncode, result.stderr)
                for feature in ("refine", "control"):
                    commands = [line for line in result.stdout.splitlines()
                                if f"download_{feature}_models.py" in line and "--offline-check" not in line]
                    self.assertEqual(bool(commands), feature in expected, result.stdout)
                preprocessors = [line for line in result.stdout.splitlines()
                                 if "download_control_preprocessors.py" in line and "--offline-check" not in line]
                self.assertEqual(bool(preprocessors), "control" in expected)
                if source == "remote":
                    self.assertIn("verified Refine weights", result.stderr)

    def test_salad_includes_pinned_refine_node_and_dependencies(self):
        dockerfile = (ROOT / "Dockerfile.salad").read_text(encoding="utf-8")
        self.assertIn("ARG REFINE_REVISION=40316cf008b2fd8663263270669eb4da23f89d2c", dockerfile)
        self.assertIn('checkout --detach -q "${REFINE_REVISION}"', dockerfile)
        self.assertIn("https://github.com/LBH-123-AI/Comfyui_Minimax_h3_latent_Upscaler.git", dockerfile)
        self.assertIn('python -m pip install --no-cache-dir -r "${COMFY_ROOT}/custom_nodes/Comfyui_Minimax_h3_latent_Upscaler/requirements.txt"', dockerfile)
        self.assertIn('import torch, einops, safetensors, typing_extensions', dockerfile)
        self.assertIn('ARG AUX_REVISION=0cd290477128d42cdc3e76a826a402d866e8c684', dockerfile)
        self.assertIn('from deploy.download_control_preprocessors import install_dependencies', dockerfile)

    def test_windows_default_installs_refine_and_explicit_skip_omits_it(self):
        from deploy import install_windows
        for extra_args, expected, control in (([], True, False), (["--no-refine"], False, False),
                                              (["--refine"], True, False), (["--controlnet"], True, True)):
            with self.subTest(extra_args=extra_args), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                (root / "main.py").touch()
                python = Path(sys.executable)
                call = Mock()
                speed_node = Mock()
                with contextlib.ExitStack() as stack:
                    stack.enter_context(patch.object(sys, "argv", ["install_windows.py", "--no-start", *extra_args]))
                    stack.enter_context(patch.object(sys, "platform", "win32"))
                    replacements = {
                        "executable": Mock(return_value=Path("nvidia-smi")),
                        "git_executable": Mock(return_value=Path("git")),
                        "ffmpeg_tools": Mock(), "verify_ffmpeg_encoders": Mock(),
                        "resolve_root": Mock(return_value=root),
                        "queue_status": Mock(return_value="online"),
                        "prepare_comfy": Mock(return_value=False),
                        "ensure_native_nodes": Mock(),
                        "select_python": Mock(return_value=(python, False)),
                        "ensure_python_env": Mock(), "copy_runtime": Mock(),
                        "install_workflows": Mock(), "call": call, "speed_node": speed_node,
                    }
                    for name, replacement in replacements.items():
                        stack.enter_context(patch.object(install_windows, name, replacement))
                    stack.enter_context(patch.object(install_windows.subprocess, "run", return_value=Mock(returncode=0)))
                    stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
                    self.assertEqual(install_windows.main(), 0)
                refine_downloads = [entry for entry in call.call_args_list
                                    if any(str(arg).endswith("download_refine_models.py") for arg in entry.args)]
                refine_nodes = [entry for entry in speed_node.call_args_list
                                if "Comfyui_Minimax_h3_latent_Upscaler" in entry.args]
                self.assertEqual(len(refine_downloads), int(expected))
                self.assertEqual(len(refine_nodes), int(expected))
                if expected:
                    self.assertIn("40316cf008b2fd8663263270669eb4da23f89d2c", refine_nodes[0].args)
                    self.assertEqual(refine_downloads[0].args[-1], root)
                controls = [entry for entry in call.call_args_list
                            if any(str(arg).endswith("download_control_models.py") for arg in entry.args)]
                preprocessors = [entry for entry in call.call_args_list
                                 if any(str(arg).endswith("download_control_preprocessors.py") for arg in entry.args)]
                self.assertEqual(bool(controls), control)
                self.assertEqual(bool(preprocessors), control)
                if control:
                    self.assertIn("--install-dependencies", preprocessors[0].args)
                    aux_nodes = [entry for entry in speed_node.call_args_list if "comfyui_controlnet_aux" in entry.args]
                    self.assertEqual(len(aux_nodes), 1)
                    self.assertIn("0cd290477128d42cdc3e76a826a402d866e8c684", aux_nodes[0].args)

    def test_salad_image_pins_combined_h3_and_qwen_comfy_revision(self):
        dockerfile = (ROOT / "Dockerfile.salad").read_text(encoding="utf-8")
        self.assertIn("3b4c0b0e457cf0a51cf3038e0a6750d8f96ce251", dockerfile)
        self.assertIn("TextEncodeQwenImage21", dockerfile)
        self.assertIn("QwenImage21Cache", dockerfile)
        self.assertIn("strip[..., :, x_idx[j]:x_idx[j] + x_len[j]]", dockerfile)

    def test_salad_defaults_to_int8_and_verifies_selected_profile(self):
        entrypoint = (ROOT / "deploy/salad/entrypoint.sh").read_text(encoding="utf-8")
        self.assertIn('QWEN_IMAGE_PROFILES="${QWEN_IMAGE_PROFILES:-int8}"', entrypoint)
        self.assertIn("download_qwen_image_models.py", entrypoint)
        self.assertIn("--offline-check", entrypoint)
        self.assertIn('output/images', entrypoint)

    def test_all_installers_share_verified_comfy_revision(self):
        expected = "3b4c0b0e457cf0a51cf3038e0a6750d8f96ce251"
        for filename in ("install.sh", "deploy/install_windows.py", "Dockerfile.salad"):
            self.assertIn(expected, (ROOT / filename).read_text(encoding="utf-8"), filename)


if __name__ == "__main__":
    unittest.main()
