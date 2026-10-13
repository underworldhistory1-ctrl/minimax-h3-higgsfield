"""Report server-wide attention without exposing process arguments or secrets."""
import sys


def runtime_attention(arguments=None, modules=None):
    arguments = sys.argv if arguments is None else arguments
    modules = sys.modules if modules is None else modules
    module = modules.get("comfy.ldm.modules.attention")
    implementation = getattr(getattr(module, "optimized_attention", None), "__name__", None)
    labels = {
        "attention_pytorch": "PyTorch dense",
        "attention_comfy_kitchen_int8": "Comfy Kitchen INT8",
        "attention_sage": "Sage attention",
        "attention_sage3": "Sage attention 3",
        "attention_xformers": "xFormers",
        "attention_sub_quad": "Sub-quadratic attention",
        "attention_split": "Split attention",
    }
    if implementation is None:
        flags = {"--use-pytorch-cross-attention": "attention_pytorch",
                 "--use-ck-attention": "attention_comfy_kitchen_int8",
                 "--use-sage-attention": "attention_sage"}
        implementation = next((name for flag, name in flags.items() if flag in arguments), "runtime_default")
    return {"implementation": implementation, "label": labels.get(implementation, "Runtime default / unknown"),
            "quantized": implementation in ("attention_comfy_kitchen_int8", "attention_sage", "attention_sage3"),
            "scope": "server_dense_default", "checkpoint_overrides_possible": True}
