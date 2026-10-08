"""Install missing dependencies without guessing interpreters or replacing CUDA."""
import contextlib
import io
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch

from deploy import install_windows

ROOT = Path(__file__).resolve().parents[1]


class WindowsPythonSafetyTests(unittest.TestCase):
    def test_existing_unresolved_environment_requires_explicit_interpreter(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(install_windows, "call") as call:
            root = Path(directory) / "ComfyUI"
            root.mkdir()
            with self.assertRaisesRegex(RuntimeError, "--comfy-python"):
                install_windows.select_python(root, None, False)
            call.assert_not_called()
            override = root / "actual-python.exe"
            override.touch()
            self.assertEqual(install_windows.select_python(root, str(override), False), (override.resolve(), False))

    def test_working_cuda_with_missing_aux_dependencies_is_constrained_and_never_reinstalled(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            python = root / "python.exe"
            constraints_paths = []
            observed = []
            versions = "torch==2.11.0+cu128\ntorchvision==0.26.0+cu128\ntorchaudio==2.11.0+cu128"

            def call(*args, **kwargs):
                observed.append(args)
                if kwargs.get("capture"):
                    return versions
                if "-c" in args and "pip" in args:
                    path = args[args.index("-c") + 1]
                    self.assertEqual(path.read_text().strip(), versions)
                    constraints_paths.append(path)

            with patch.object(install_windows.subprocess, "run", side_effect=[Mock(returncode=1), Mock(returncode=0)]), \
                 patch.object(install_windows, "call", side_effect=call), contextlib.redirect_stdout(io.StringIO()):
                install_windows.ensure_python_env(python, root, False)
            self.assertTrue(constraints_paths)
            self.assertTrue(all(not path.exists() for path in constraints_paths))
            self.assertFalse(any("--index-url" in args for args in observed))
            self.assertFalse(any("--upgrade" in args for args in observed))
            self.assertTrue(any("-r" in args and "av" in args for args in observed))

    def test_ready_environment_has_no_package_mutations(self):
        with patch.object(install_windows.subprocess, "run", return_value=Mock(returncode=0)), \
             patch.object(install_windows, "call") as call:
            install_windows.ensure_python_env(Path("python.exe"), Path("ComfyUI"), False)
            call.assert_not_called()


class LinuxPythonSafetyTests(unittest.TestCase):
    def bash(self):
        bash = shutil.which("bash")
        if not bash and Path("C:/Program Files/Git/bin/bash.exe").is_file():
            bash = "C:/Program Files/Git/bin/bash.exe"
        if not bash:
            self.skipTest("Bash is unavailable")
        return bash

    def test_aux_dependency_repair_preserves_working_cuda_stack(self):
        source = (ROOT / "install.sh").read_text(encoding="utf-8")
        block = source[source.index("if ! \"$H3_PYTHON\" -c"):source.index("free_gib=")]
        harness = '''set -Eeuo pipefail
H3_PYTHON=fake_python
COMFY_ROOT=/comfy
existing=1
full_probes=0
fake_python() {
    if [[ "$1" == -c ]]; then
        case "$2" in
            *"importlib.metadata"*) printf 'torch==2.11.0+cu128\\n' ;;
            *"import torch, av"*)
                full_probes=$((full_probes+1))
                if [[ "$full_probes" == 1 ]]; then return 1; fi ;;
            *"import torch;"*) return 0 ;;
        esac
    else
        echo "PACKAGE_COMMAND:$*"
        if [[ "$*" == *" -c "* ]]; then cat "$5"; fi
    fi
}
'''
        result = subprocess.run([self.bash(), "-s"], input=harness + block,
                                capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        commands = [line for line in result.stdout.splitlines() if line.startswith("PACKAGE_COMMAND:")]
        self.assertEqual(len(commands), 1, result.stdout)
        self.assertIn("-m pip install -c", commands[0])
        self.assertIn("requirements.txt av", commands[0])
        self.assertNotIn("--upgrade", commands[0])
        self.assertNotIn("--index-url", commands[0])
        self.assertIn("torch==2.11.0+cu128", result.stdout)

    def test_existing_unresolved_or_invalid_override_environment_stops(self):
        source = (ROOT / "install.sh").read_text(encoding="utf-8")
        block = source[source.index('if [[ -n "${COMFY_PYTHON:-}"'):
                       source.index('export COMFY_PYTHON="$H3_PYTHON"')]
        for override in ("", "/nonexistent/comfy/python"):
            with self.subTest(override=override):
                harness = 'set -Eeuo pipefail\nCOMFY_ROOT=/nonexistent/comfy\nexisting=1\n'
                environment = dict(os.environ, COMFY_PYTHON=override)
                result = subprocess.run([self.bash(), "-s"], input=harness + block,
                                        capture_output=True, text=True, env=environment, timeout=10)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("COMFY_PYTHON", result.stderr)


if __name__ == "__main__":
    unittest.main()
