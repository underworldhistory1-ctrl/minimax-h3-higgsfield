import contextlib
import io
from pathlib import Path
import subprocess
import sys
import types
import unittest
from unittest.mock import Mock, patch

from deploy import environment_audit, install_windows


class CUDAInstallPreflightTests(unittest.TestCase):
    def test_old_driver_stops_before_any_package_mutation(self):
        # The production preflight must run before even upgrading pip.
        calls = []
        def call(*args, **kwargs):
            calls.append(args)
            if '--check-install' in args:
                raise RuntimeError('CUDA 13 requires NVIDIA driver 580+')
            return ''
        with patch.object(install_windows.subprocess, 'run', return_value=Mock(returncode=1)), \
                patch.object(install_windows, 'call', side_effect=call), contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(RuntimeError, '580'):
                install_windows.ensure_python_env(Path('python.exe'), Path('ComfyUI'), True)
        self.assertFalse(any('pip' in args for args in calls), calls)

    def test_driver_and_architecture_are_checked_without_torch(self):
        for output, allowed in [('575.57.08, 12.0\n', False), ('580.65.06, 7.0\n', False),
                                ('580.65.06, 12.0\n', True), ('580.65.06, 8.0\n', True)]:
            with self.subTest(output=output), patch.object(environment_audit.subprocess, 'run',
                    return_value=Mock(returncode=0, stdout=output)):
                if allowed:
                    environment_audit.check_install_compatibility(python_version=(3, 10))
                else:
                    with self.assertRaises(RuntimeError):
                        environment_audit.check_install_compatibility(python_version=(3, 10))

    def test_unknown_driver_and_unsupported_python_fail_closed(self):
        for output, version in [('not available', (3, 10)), ('580.65.06, 12.0', (3, 9))]:
            with patch.object(environment_audit.subprocess, 'run', return_value=Mock(returncode=0, stdout=output)):
                with self.assertRaises(RuntimeError):
                    environment_audit.check_install_compatibility(python_version=version)

    def test_windows_full_probe_includes_shared_audit(self):
        with patch.object(install_windows.subprocess, 'run', return_value=Mock(returncode=0)) as run:
            install_windows.ensure_python_env(Path('python.exe'), Path('ComfyUI'), False)
        command = run.call_args.args[0]
        self.assertIn('runpy.run_path', command[2])
        self.assertTrue(str(command[-1]).endswith('environment_audit.py'))

    def test_missing_native_backend_or_pip_conflict_repairs_requirements_without_replacing_cuda(self):
        torch = types.SimpleNamespace(version=types.SimpleNamespace(cuda='13.0'),
            cuda=types.SimpleNamespace(is_available=lambda: True, synchronize=lambda: None),
            ones=lambda *args, **kwargs: types.SimpleNamespace(sum=lambda:
                types.SimpleNamespace(item=lambda: 1)))
        modules = {'torch': torch, **{name: types.ModuleType(name) for name in
                    ('av', 'aiohttp', 'PIL', 'comfyui_frontend_package')}}
        for report in ({'ready': False, 'acceleration': {'native_cuda_ready': False}},
                       {'ready': False, 'dependency_consistent': False}):
            def run(command, **kwargs):
                try:
                    with patch.object(sys, 'argv', ['probe', *command[3:]]), \
                            patch.dict(sys.modules, modules), \
                            patch('runpy.run_path', return_value={'audit': lambda: report}):
                        exec(command[2], {})
                    return subprocess.CompletedProcess(command, 0)
                except AssertionError:
                    return subprocess.CompletedProcess(command, 1)
            with self.subTest(report=report), patch.object(install_windows.subprocess, 'run', side_effect=run), \
                    patch.object(install_windows, 'call', return_value='torch==2.9.1+cu130') as call, \
                    contextlib.redirect_stdout(io.StringIO()):
                install_windows.ensure_python_env(Path('python.exe'), Path('ComfyUI'), False)
            commands = [item.args for item in call.call_args_list]
            self.assertTrue(any('-r' in command for command in commands), commands)
            self.assertFalse(any('--index-url' in command for command in commands), commands)

    def test_linux_full_probe_includes_shared_audit_and_preflight(self):
        source = (Path(__file__).resolve().parents[1] / 'install.sh').read_text()
        block = source[source.index('if ! "$H3_PYTHON" -c'):source.index('free_gib=')]
        self.assertIn('runpy.run_path', block)
        self.assertLess(block.index('--check-install'), block.index('pip install'))


if __name__ == '__main__':
    unittest.main()
