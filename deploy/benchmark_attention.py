#!/usr/bin/env python3
"""Synthetic H3-shaped attention microbenchmark, never a pipeline quality claim.

Run only on an idle GPU, using the repaired runtime's Python executable:
  python benchmark_attention.py --comfy-root /path/to/ComfyUI
No checkpoint, server setting, or production process is modified. JSON goes to stdout.
"""
import argparse
import contextlib
import importlib.metadata
import json
from pathlib import Path
import statistics
import subprocess
import sys

PINNED_COMMIT = "3b4c0b0e457cf0a51cf3038e0a6750d8f96ce251"


def math_reference_safe(length, heads):
    # Conservative FP32 score/probability/workspace estimate, at most 128 MiB.
    return 3 * heads * length * length * 4 <= 128 * 1024**2


def shape_safe(length, heads, fused):
    return any(fused.values()) or math_reference_safe(length, heads)


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--comfy-root", type=Path, default=Path.cwd())
    parser.add_argument("--lengths", type=int, nargs="+", default=[256, 1024])
    parser.add_argument("--heads", type=int, default=56)
    parser.add_argument("--head-dim", type=int, default=128)
    parser.add_argument("--warmup", type=int, default=3)
    parser.add_argument("--repeats", type=int, default=10)
    parser.add_argument("--seed", type=int, default=12345)
    args = parser.parse_args(argv)
    if not all(1 <= n <= 32768 for n in args.lengths):
        parser.error("sequence lengths must be in [1, 32768]; larger shapes are intentionally excluded")
    if not 1 <= args.heads <= 56 or not 1 <= args.head_dim <= 256:
        parser.error("heads must be in [1, 56], head dimension in [1, 256]")
    if not 1 <= args.warmup <= 100 or not 1 <= args.repeats <= 1000:
        parser.error("warmup must be in [1, 100], repeats in [1, 1000]")
    return args


def package_version(name):
    try:
        return importlib.metadata.version(name)
    except importlib.metadata.PackageNotFoundError:
        return None


def main(argv=None):
    args = parse_args(argv)
    root = args.comfy_root.resolve()
    if not (root / "comfy" / "ops.py").is_file():
        raise SystemExit("--comfy-root must contain comfy/ops.py")
    revision = subprocess.run(["git", "rev-parse", "HEAD"], cwd=root,
                              capture_output=True, text=True, check=False).stdout.strip()
    if revision != PINNED_COMMIT:
        raise SystemExit(f"Expected ComfyUI {PINNED_COMMIT}; found {revision or 'unknown'}")

    # ComfyUI has its own CLI parser. Never expose this script's flags to it.
    saved_argv = sys.argv[:]
    sys.path.insert(0, str(root))
    try:
        sys.argv = [str(root / "main.py"), "--use-pytorch-cross-attention"]
        with contextlib.redirect_stdout(sys.stderr):
            import torch
            import comfy.ops as comfy_ops
            import comfy_kitchen as ck
    finally:
        sys.argv = saved_argv
    if not torch.cuda.is_available():
        raise SystemExit("CUDA required; this script has no CPU inference fallback")
    if not ck.int8_attention_is_available(torch.device("cuda")):
        raise SystemExit("Native comfy-kitchen INT8 attention extension unavailable")
    from torch.nn.attention import SDPBackend, sdpa_kernel
    torch.manual_seed(args.seed)

    def timed(fn):
        for _ in range(args.warmup):
            out = fn()
            del out
        torch.cuda.synchronize()
        samples = []
        for _ in range(args.repeats):
            start, end = torch.cuda.Event(enable_timing=True), torch.cuda.Event(enable_timing=True)
            start.record()
            out = fn()
            end.record()
            end.synchronize()
            samples.append(start.elapsed_time(end))
            del out
        return {"median_ms": statistics.median(samples), "min_ms": min(samples),
                "max_ms": max(samples), "samples_ms": samples}

    def dispatch(fn):
        try:
            with torch.profiler.profile(activities=[torch.profiler.ProfilerActivity.CPU,
                                                   torch.profiler.ProfilerActivity.CUDA]) as prof:
                out = fn()
                torch.cuda.synchronize()
                del out
            return {"cuda_kernels": sorted({e.name for e in prof.events()
                                            if e.device_type == torch.autograd.DeviceType.CUDA}),
                    "sdpa_cpu_ops": sorted({e.name for e in prof.events()
                                             if "scaled_dot_product" in e.name})}
        except Exception as exc:
            return {"profiler_error": str(exc)}

    report = {
        "scope": "SYNTHETIC attention only; no model, LoRA, offload, full-pipeline timing or perceptual quality claim",
        "approximation": "Comfy Kitchen quantizes Q/K/V and attention probabilities; dense SDPA retains full connectivity",
        "comfy_commit": revision, "torch": torch.__version__, "torch_cuda": torch.version.cuda,
        "comfy_kitchen": package_version("comfy-kitchen"),
        "comfy_aimdo": package_version("comfy-aimdo"),
        "gpu": torch.cuda.get_device_name(), "capability": torch.cuda.get_device_capability(),
        "vram_bytes": torch.cuda.get_device_properties(0).total_memory,
        "native_ck_attention_available": True, "dtype": "bfloat16", "seed": args.seed,
        "batch": 1, "heads": args.heads, "head_dim": args.head_dim,
        "shape_limit_note": "Long shapes require eligible fused SDPA; no quadratic math fallback benchmark above 128 MiB estimated workspace",
        "warmup": args.warmup, "repeats": args.repeats, "cases": [],
    }
    with torch.inference_mode():
        for length in args.lengths:
            q, k, v = [torch.randn((1, args.heads, length, args.head_dim), device="cuda",
                                  dtype=torch.bfloat16) for _ in range(3)]
            params = torch.backends.cuda.SDPAParams(q, k, v, None, 0.0, False, False)
            fused = {name: getattr(torch.backends.cuda, f"can_use_{name}_attention")(params)
                     for name in ("flash", "cudnn", "efficient")}
            case = {"length": length, "eligible_fused_sdpa": fused}
            report["cases"].append(case)
            if not shape_safe(length, args.heads, fused):
                case["skipped"] = "No eligible fused SDPA backend; quadratic math reference exceeds safety cap"
                del q, k, v
                continue
            dense = lambda: comfy_ops.scaled_dot_product_attention(q, k, v, dropout_p=0.0, is_causal=False)
            quant = lambda: ck.int8_attention(q, k, v)
            reference, actual = dense().float(), quant().float()
            delta = actual - reference
            case["ck_vs_dense"] = {
                "relative_rmse": (delta.square().mean().sqrt() / reference.square().mean().sqrt().clamp_min(1e-12)).item(),
                "max_abs": delta.abs().max().item(),
                "mean_abs": delta.abs().mean().item(),
            }
            if math_reference_safe(length, args.heads):
                with sdpa_kernel([SDPBackend.MATH]):
                    exact = torch.nn.functional.scaled_dot_product_attention(q, k, v).float()
                case["dense_vs_math_max_abs"] = (reference - exact).abs().max().item()
                del exact
            del reference, actual, delta
            case["pytorch_dense"] = timed(dense)
            case["native_ck_int8"] = timed(quant)
            case["speed_ratio_dense_over_ck"] = case["pytorch_dense"]["median_ms"] / case["native_ck_int8"]["median_ms"]
            case["pytorch_dispatch"] = dispatch(dense)
            case["ck_dispatch"] = dispatch(quant)
            del q, k, v
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
