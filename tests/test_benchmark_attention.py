"""CPU-only safety validation; importing the benchmark must not import torch."""
import importlib.util
import contextlib
import io
from pathlib import Path
import unittest

PATH = Path(__file__).resolve().parents[1] / "deploy" / "benchmark_attention.py"


class BenchmarkSafetyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("attention_bench", PATH)
        cls.bench = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.bench)

    def test_h3_defaults_and_bounded_shapes(self):
        args = self.bench.parse_args([])
        self.assertEqual((args.heads, args.head_dim), (56, 128))
        self.assertEqual(args.lengths, [256, 1024])
        self.assertEqual(self.bench.parse_args(["--lengths", "16384", "32768"]).lengths,
                         [16384, 32768])
        for argv in (["--lengths", "0"], ["--lengths", "32769"],
                     ["--heads", "57"], ["--head-dim", "257"],
                     ["--warmup", "0"], ["--repeats", "0"]):
            with self.subTest(argv=argv), contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                self.bench.parse_args(argv)

    def test_math_backend_guard_uses_quadratic_storage(self):
        self.assertTrue(self.bench.math_reference_safe(256, 56))
        self.assertFalse(self.bench.math_reference_safe(4096, 56))
        self.assertFalse(self.bench.math_reference_safe(1024, 56))
        self.assertFalse(self.bench.shape_safe(32768, 56, {"flash": False}))
        self.assertTrue(self.bench.shape_safe(32768, 56, {"flash": True}))


if __name__ == "__main__":
    unittest.main()
