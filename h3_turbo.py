"""Expose the upstream adaptive AV Turbo sampler through Studio's KSampler contract."""

def register_sampler():
    import comfy.samplers
    from comfy.k_diffusion import sampling

    def sample_h3_turbo(*args, **kwargs):
        import nodes
        cls = nodes.NODE_CLASS_MAPPINGS.get('MiniMaxH3TurboSampler')
        if cls is None:
            raise RuntimeError('Install the pinned MiniMax-H3 Turbo nodes before using Turbo v4.')
        sampler = cls().get_sampler()[0]
        return sampler.sampler_function(*args, **kwargs)

    sampling.sample_h3_turbo = sample_h3_turbo
    for names in (comfy.samplers.KSAMPLER_NAMES, comfy.samplers.SAMPLER_NAMES, comfy.samplers.KSampler.SAMPLERS):
        if 'h3_turbo' not in names:
            names.append('h3_turbo')
