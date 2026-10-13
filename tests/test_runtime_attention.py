import pathlib
import types
import unittest
from h3_lab.runtime_attention import runtime_attention


class TestRuntimeAttention(unittest.TestCase):
    def test_explicit_launch_backends_are_reported_without_arguments(self):
        for flag, label, quantized in [("--use-pytorch-cross-attention", "PyTorch dense", False),
                ("--use-ck-attention", "Comfy Kitchen INT8", True), ("--use-sage-attention", "Sage attention", True)]:
            result = runtime_attention(["main.py", flag, "secret-token"], {})
            self.assertEqual(result["label"], label)
            self.assertEqual(result["quantized"], quantized)
            self.assertNotIn("secret-token", str(result))

    def test_loaded_runtime_function_has_priority_over_requested_flags(self):
        def attention_pytorch():
            pass
        result = runtime_attention(["--use-ck-attention"], {"comfy.ldm.modules.attention":
            types.SimpleNamespace(optimized_attention=attention_pytorch)})
        self.assertEqual(result["label"], "PyTorch dense")
        self.assertFalse(result["quantized"])
        self.assertTrue(result["checkpoint_overrides_possible"])

    def test_unknown_runtime_is_not_reported_as_verified_pytorch(self):
        self.assertEqual(runtime_attention([], {})["implementation"], "runtime_default")

    def test_supported_launch_paths_use_explicit_pytorch_baseline(self):
        root = pathlib.Path(__file__).resolve().parents[1]
        for name in ["deploy/launcher.py", "deploy/activate_v2.py", "deploy/openbayes_h3_supervisor.py",
                "deploy/openbayes_h3.sh", "deploy/comfyui.service", "deploy/install_windows.py", "install.sh", "deploy/salad/entrypoint.sh"]:
            text = (root / name).read_text(encoding="utf-8")
            self.assertIn("--use-pytorch-cross-attention", text)
            self.assertNotIn("--use-ck-attention", text)
            self.assertNotIn("--use-sage-attention", text)
