"""Report server-wide attention without exposing process arguments or secrets."""
import sys


def runtime_attention(arguments=None, modules=None):
    arguments = sys.argv if arguments is None else arguments
    modules = sys.modules if modules is None else modules
    module = modules.get("comfy.ldm.modules.attention")
    implementation = getattr(getattr(module, "optimized_attention", None), "__name__", None)
    source = 'loaded_runtime' if implementation is not None else 'unknown'
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
        if implementation != 'runtime_default':
            source = 'launch_argument'
    return {"implementation": implementation, "source": source, "label": labels.get(implementation, "Runtime default / unknown"),
            "quantized": implementation in ("attention_comfy_kitchen_int8", "attention_sage", "attention_sage3"),
            "scope": "server_dense_default", "checkpoint_overrides_possible": True}


def runtime_acceleration(modules=None):
    """Describe the loaded worker, without importing packages or launching GPU work."""
    modules = sys.modules if modules is None else modules
    torch = modules.get('torch')
    cuda = getattr(getattr(torch, 'version', None), 'cuda', None)
    result = {'torch': str(getattr(torch, '__version__', 'unavailable')),
              'cuda_runtime': cuda, 'native_cuda_ready': False}
    try:
        version = tuple(int(part) for part in str(cuda).split('.')[:2])
        kitchen = modules.get('comfy_kitchen')
        backend = kitchen.list_backends().get('cuda', {})
        device = modules.get('comfy.model_management').get_torch_device()
        result['execution_device'] = getattr(device, 'type', str(device).split(':')[0])
        result['native_cuda_ready'] = bool(result['execution_device'] == 'cuda'
            and torch.cuda.is_available() and version >= (13, 0)
            and backend.get('available', False) and not backend.get('disabled', False))
    except (AttributeError, TypeError, ValueError, RuntimeError, OSError):
        pass
    return result
