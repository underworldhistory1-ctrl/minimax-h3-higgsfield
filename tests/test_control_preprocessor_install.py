"""Offline contracts for pinned control preprocessing provisioning."""
import hashlib
import io
import os
import pathlib
import tempfile
import unittest
from unittest.mock import Mock, patch

from deploy import download_control_preprocessors as installer


class PreprocessorInstallTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = pathlib.Path(self.directory.name)
        self.environment = patch.dict(os.environ, {}, clear=False)
        self.environment.start()
        self.addCleanup(self.environment.stop)
        os.environ.pop("AUX_ANNOTATOR_CKPTS_PATH", None)
        self.content = b"verified miniature test fixture"
        self.model = ("owner/test", "a" * 40, "fixture.onnx",
                      hashlib.sha256(self.content).hexdigest(), len(self.content))
        self.models = patch.object(installer, "MODELS", (self.model,))
        self.models.start()
        self.addCleanup(self.models.stop)

    def target(self):
        return installer.checkpoint_root(self.root) / self.model[0] / self.model[2]

    def test_offline_missing_returns_false_without_network_then_verified_cache_skips_download(self):
        with patch.object(installer.urllib.request, "urlopen") as network:
            self.assertFalse(installer.provision_weights(self.root, offline=True))
            self.assertFalse(installer.checkpoint_root(self.root).exists())
            target = self.target()
            target.parent.mkdir(parents=True)
            target.write_bytes(self.content)
            self.assertTrue(installer.provision_weights(self.root, offline=True))
            self.assertTrue(installer.provision_weights(self.root))
            network.assert_not_called()

    def test_download_uses_pinned_revision_verifies_and_honors_configured_checkpoint_root(self):
        configured = self.root / "persistent" / "annotators"
        os.environ["AUX_ANNOTATOR_CKPTS_PATH"] = str(configured)
        with patch.object(installer.urllib.request, "urlopen", return_value=io.BytesIO(self.content)) as network:
            self.assertTrue(installer.provision_weights(self.root))
            url = network.call_args.args[0].full_url
            self.assertEqual(url, f"https://huggingface.co/owner/test/resolve/{'a' * 40}/fixture.onnx")
        self.assertEqual(self.target().read_bytes(), self.content)
        self.assertTrue(self.target().is_relative_to(configured))
        self.assertFalse(self.target().with_name("fixture.onnx.part").exists())

    def test_corrupt_existing_weight_fails_closed_without_overwrite(self):
        target = self.target()
        target.parent.mkdir(parents=True)
        target.write_bytes(b"wrong")
        with patch.object(installer.urllib.request, "urlopen") as network:
            self.assertFalse(installer.provision_weights(self.root, offline=True))
            with self.assertRaisesRegex(ValueError, "Existing preprocessor weight"):
                installer.provision_weights(self.root)
            network.assert_not_called()
        self.assertEqual(target.read_bytes(), b"wrong")

    def test_invalid_or_oversized_download_never_publishes_weight(self):
        for data in (b"x" * len(self.content), self.content + b"oversized"):
            with self.subTest(data_length=len(data)), \
                 patch.object(installer.urllib.request, "urlopen", return_value=io.BytesIO(data)):
                with self.assertRaises(ValueError):
                    installer.provision_weights(self.root)
                self.assertFalse(self.target().exists())
                self.assertFalse(self.target().with_name("fixture.onnx.part").exists())

    def test_dependencies_replace_gpu_runtime_and_verify_platform_imports(self):
        directory = installer.aux_root(self.root)
        directory.mkdir(parents=True)
        (directory / "requirements.txt").write_text("numpy\nopencv-python\nonnxruntime-gpu; platform_system == 'Windows'\n", encoding="utf-8")
        requirements = []
        paths = []

        def command(args, **kwargs):
            if "rev-parse" in args:
                return Mock(stdout=installer.AUX_REVISION + "\n")
            if "-c" in args and "importlib.metadata" in args[-1]:
                return Mock(stdout='{"absent":true}\n', returncode=0)
            if "-r" in args:
                path = pathlib.Path(args[args.index("-r") + 1])
                paths.append(path)
                requirements.append(path.read_text(encoding="utf-8"))
            return Mock(returncode=0)

        with patch.object(installer.subprocess, "run", side_effect=command) as run:
            installer.install_dependencies(self.root)
        self.assertIn("opencv-python", requirements[0])
        self.assertIn(installer.ONNXRUNTIME, requirements[0])
        self.assertNotIn("onnxruntime-gpu", requirements[0])
        self.assertTrue(all(not path.exists() for path in paths))
        self.assertFalse(any("--force-reinstall" in call.args[0] for call in run.call_args_list))
        self.assertIn("CPUExecutionProvider", run.call_args_list[-1].args[0][-2])
        self.assertIn("cv2.Canny", run.call_args_list[-1].args[0][-2])
        self.assertIn("DwposeDetector", run.call_args_list[-1].args[0][-2])
        self.assertIn("DepthAnythingV2Detector", run.call_args_list[-1].args[0][-2])
        with patch.object(installer.subprocess, "run", return_value=Mock(stdout="wrong-revision")) as run:
            with self.assertRaisesRegex(ValueError, "pinned auxiliary revision"):
                installer.install_dependencies(self.root)
            self.assertEqual(run.call_count, 1)

    def test_working_shared_gpu_runtime_with_cpu_provider_is_preserved(self):
        directory = installer.aux_root(self.root)
        directory.mkdir(parents=True)
        (directory / "requirements.txt").write_text("numpy\nopencv-python\nonnxruntime-gpu\n", encoding="utf-8")
        requirements = []

        def command(args, **kwargs):
            if "rev-parse" in args:
                return Mock(stdout=installer.AUX_REVISION + "\n")
            if "-c" in args and "importlib.metadata" in args[-1]:
                return Mock(stdout='{"providers":["CPUExecutionProvider","CUDAExecutionProvider"]}\n', returncode=0)
            if "-r" in args:
                requirements.append(pathlib.Path(args[args.index("-r") + 1]).read_text())
            return Mock(returncode=0)

        with patch.object(installer.subprocess, "run", side_effect=command) as run:
            installer.install_dependencies(self.root)
        self.assertNotIn("onnxruntime", requirements[0])
        self.assertFalse(any("--force-reinstall" in call.args[0] for call in run.call_args_list))
        self.assertFalse(any(installer.ONNXRUNTIME in call.args[0] for call in run.call_args_list))
        self.assertNotIn("CUDAExecutionProvider", run.call_args_list[-1].args[0][-2])

    def test_broken_shared_runtime_stops_before_any_package_install(self):
        directory = installer.aux_root(self.root)
        directory.mkdir(parents=True)
        (directory / "requirements.txt").write_text("numpy\nonnxruntime-gpu\n", encoding="utf-8")
        for status in ('{"broken":true}', '{"absent":false}', '{"providers":["CUDAExecutionProvider"]}'):
            with self.subTest(status=status):
                def command(args, **kwargs):
                    if "rev-parse" in args:
                        return Mock(stdout=installer.AUX_REVISION + "\n")
                    if "-c" in args:
                        return Mock(stdout=status, returncode=0)
                    return Mock(returncode=0)
                with patch.object(installer.subprocess, "run", side_effect=command) as run:
                    with self.assertRaisesRegex(ValueError, "shared installation was not replaced"):
                        installer.install_dependencies(self.root)
                self.assertFalse(any("pip" in call.args[0] for call in run.call_args_list))


if __name__ == "__main__":
    unittest.main()
