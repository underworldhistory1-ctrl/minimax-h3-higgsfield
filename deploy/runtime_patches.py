"""Idempotent compatibility patches for the verified ComfyUI/H3 node versions."""
import argparse
import ast
import hashlib
from pathlib import Path

MLP_HELPER = '''def h3_mlp_chunked(x, fc1, fc2, linear_input_act, grad_enabled, chunk_size=4096):
    # Token-local MLP: bound activation scratch without concatenating outputs.
    if grad_enabled or x.shape[-2] <= chunk_size:
        return linear_input_act(fc2, fc1(x), 'swiglu')
    result = None
    for start in range(0, x.shape[-2], chunk_size):
        end = min(start + chunk_size, x.shape[-2])
        value = linear_input_act(fc2, fc1(x[..., start:end, :].contiguous()), 'swiglu')
        if result is None:
            result = value.new_empty((*x.shape[:-1], value.shape[-1]))
        result[..., start:end, :].copy_(value)
        del value
    return result


'''


def patch_model(source):
    if 'def h3_mlp_chunked(' in source:
        return source
    tree = ast.parse(source)
    mlp = next((n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == 'MLP'), None)
    if mlp is None:
        raise RuntimeError('Unsupported H3 core: MLP missing')
    forward = next(n for n in mlp.body if isinstance(n, ast.FunctionDef) and n.name == 'forward')
    old = ast.get_source_segment(source, forward)
    expected = "return comfy.ops.linear_input_act(self.fc2, self.fc1(x), 'swiglu')"
    if expected not in old:
        expected = expected.replace("'swiglu'", '"swiglu"')
    if len(forward.body) != 1 or expected not in old:
        raise RuntimeError('Unsupported H3 core: MLP forward differs from verified version')
    source = source.replace(old, old.replace(expected, 'return h3_mlp_chunked(x, self.fc1, self.fc2, comfy.ops.linear_input_act, torch.is_grad_enabled())'), 1)
    return source.replace('class MLP(nn.Module):', MLP_HELPER + 'class MLP(nn.Module):', 1)


def patch_cache(source):
    source = source.replace("(output_video - video).detach().clone()", "(output_video - video).clone()")
    source = source.replace("(output_audio - audio).detach().clone()", "(output_audio - audio).clone()")
    replacements = {
        'video + self.video_residual, audio + self.audio_residual': 'video + self.video_residual.to(video), audio + self.audio_residual.to(audio)',
        '(output_video - video).clone()': "(output_video - video).detach().to(device='cpu', copy=True)",
        '(output_audio - audio).clone()': "(output_audio - audio).detach().to(device='cpu', copy=True)",
    }
    for before, after in replacements.items():
        if after in source:
            continue
        if source.count(before) != 1:
            raise RuntimeError('Unsupported MotionCache source; preserve it and review compatibility')
        source = source.replace(before, after, 1)
    return source


def patch_navigation(source):
    # Permit only public Studio document navigation; keep API Origin checks.
    if '# H3_PUBLIC_DOCUMENT_NAVIGATION' in source:
        return source
    if 'safe_studio_navigation' in source:
        if "'/extensions/h3_studio/index.html'" in source and "'/extensions/h3_studio/image.html'" in source:
            return source
        source = source.replace("'/extensions/h3_studio_v2/index.html',", "'/extensions/h3_studio/index.html', '/extensions/h3_studio_v2/index.html',")
        source = source.replace("'/extensions/h3_studio_v2/image.html',", "'/extensions/h3_studio/image.html', '/extensions/h3_studio_v2/image.html',")
        return source
    old = "if sec_fetch_site == 'cross-site':"
    if source.count(old) != 1:
        raise RuntimeError('Unsupported navigation middleware; cross-site protection was preserved')
    return source.replace(old, """# H3_PUBLIC_DOCUMENT_NAVIGATION
            safe_studio_navigation = (
                request.method in ('GET', 'HEAD')
                and request.headers.get('Sec-Fetch-Mode') == 'navigate'
                and request.headers.get('Sec-Fetch-Dest') == 'document'
                and request.path in (
                    '/extensions/h3_studio/index.html', '/extensions/h3_studio/image.html',
                    '/extensions/h3_studio_v2/index.html', '/extensions/h3_studio_v2/image.html',
                )
            )
            if sec_fetch_site == 'cross-site' and not safe_studio_navigation:""", 1)


def apply_patches(root):
    root = Path(root)
    specs = [(root/'comfy/ldm/minimax/model.py', patch_model), (root/'server.py', patch_navigation)]
    cache = root/'custom_nodes/ComfyUI-MiniMax-H3-MotionCache/motion_cache.py'
    if cache.exists():
        specs.append((cache, patch_cache))
    plan = []
    for path, transform in specs:
        original = path.read_text(encoding='utf-8')
        updated = transform(original)
        ast.parse(updated)
        if original != updated:
            plan.append((path, original, updated))
    # Validate all sources first. Keep recoverable original copies.
    for path, original, updated in plan:
        backup = root/'.h3-runtime-backups'/hashlib.sha256(original.encode()).hexdigest()[:16]/path.relative_to(root)
        backup.parent.mkdir(parents=True, exist_ok=True)
        if not backup.exists():
            backup.write_text(original, encoding='utf-8')
        temporary = path.with_suffix(path.suffix+'.h3-update')
        temporary.write_text(updated, encoding='utf-8')
        temporary.replace(path)
    return bool(plan)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--comfy-root', required=True)
    print('H3 compatibility patches changed:', apply_patches(parser.parse_args().comfy_root))
