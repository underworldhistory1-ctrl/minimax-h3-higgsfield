import sys
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path
from types import SimpleNamespace
import subprocess

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "deploy"))
from uninstall_h3 import SCRIPT, apply_plan, plan, main


class UninstallTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        (self.root / "main.py").write_text("")
        self.extension = self.root / "custom_nodes" / "h3_studio"
        (self.extension / "web").mkdir(parents=True)
        (self.extension / "__init__.py").write_text("")
        (self.extension / "web" / "index.html").write_text("studio")
        (self.extension / "project.json").write_text("project")
        self.frontend = self.root / "index.html"
        self.frontend.write_text("<head>" + SCRIPT + "NEW FRONTEND</head>")
        for name in ("models", "output", "input"):
            (self.root / name).mkdir()
            (self.root / name / "keep.txt").write_text("keep")

    def test_preview_does_not_mutate(self):
        targets, source = plan(self.root, self.frontend)
        self.assertEqual(targets, [self.extension])
        self.assertTrue(self.extension.exists())
        self.assertIn(SCRIPT, source)
        self.assertFalse((self.root / "h3-uninstall-backups").exists())

    def test_full_removal_retains_data_and_new_frontend(self):
        targets, source = plan(self.root, self.frontend)
        apply_plan(self.root, self.frontend, targets, source)
        self.assertFalse(self.extension.exists())
        saved = next((self.root / "h3-uninstall-backups").iterdir())
        self.assertEqual((saved / "h3_studio" / "project.json").read_text(), "project")
        self.assertEqual(self.frontend.read_text(), "<head>NEW FRONTEND</head>")
        for name in ("models", "output", "input"):
            self.assertEqual((self.root / name / "keep.txt").read_text(), "keep")
        targets, source = plan(self.root, self.frontend)
        apply_plan(self.root, self.frontend, targets, source)
        self.assertEqual(len(list(saved.parent.iterdir())), 1)

    def test_landing_only_keeps_studio(self):
        targets, source = plan(self.root, self.frontend, True)
        apply_plan(self.root, self.frontend, targets, source)
        self.assertTrue(self.extension.exists())
        self.assertNotIn(SCRIPT, self.frontend.read_text())

    def test_refuse_unknown_installation_and_redirect(self):
        (self.extension / "__init__.py").unlink()
        with self.assertRaises(ValueError):
            plan(self.root, self.frontend)
        self.frontend.write_text('<script id="h3-studio-landing">unknown</script>')
        with self.assertRaises(ValueError):
            plan(self.root, self.frontend, True)

    def test_frontend_changed_after_preview(self):
        targets, source = plan(self.root, self.frontend)
        self.frontend.write_text("updated")
        with self.assertRaises(ValueError):
            apply_plan(self.root, self.frontend, targets, source)
        self.assertTrue(self.extension.exists())

    def test_frontend_write_failure_rolls_back_extension(self):
        targets, source = plan(self.root, self.frontend)
        with patch("uninstall_h3.os.replace", side_effect=PermissionError("locked")):
            with self.assertRaises(PermissionError):
                apply_plan(self.root, self.frontend, targets, source)
        self.assertTrue(self.extension.exists())
        self.assertEqual(self.frontend.read_text(), source)

    def test_failed_queue_check_prevents_apply(self):
        package = self.root / "frontend_package"
        (package / "static").mkdir(parents=True)
        index = package / "static" / "index.html"
        index.write_text(self.frontend.read_text())
        with patch("sys.argv", ["uninstall_h3", "--comfy-root", str(self.root), "--apply"]), \
             patch("uninstall_h3.importlib.util.find_spec", return_value=SimpleNamespace(origin=str(package / "__init__.py"))), \
             patch("uninstall_h3.subprocess.run", side_effect=subprocess.CalledProcessError(1, "queue")):
            with self.assertRaises(subprocess.CalledProcessError):
                main()
        self.assertTrue(self.extension.exists())
        self.assertIn(SCRIPT, index.read_text())


if __name__ == "__main__":
    unittest.main()
