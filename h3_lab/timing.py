"""Pure progress snapshots for base and refinement samplers."""


def sampler_progress_snapshot(registry, prompt_id):
    empty = {"prompt_id": prompt_id, "step": None, "total": None, "nodes": {}}
    if registry.prompt_id != prompt_id:
        return empty
    samplers = {}
    for node_id, progress in registry.nodes.items():
        try:
            node = registry.dynprompt.get_node(str(node_id))
            is_sampler = node.get("class_type") in ("KSampler", "KSamplerAdvanced")
        except (AttributeError, KeyError, TypeError):
            is_sampler = str(node_id) in ("8", "sampler")
        if not is_sampler:
            continue
        state = getattr(progress.get("state"), "value", progress.get("state"))
        if state == "pending":
            continue
        samplers[str(node_id)] = {"step": progress.get("value"), "total": progress.get("max"), "state": state}
    active = [(node, value) for node, value in samplers.items() if value["state"] == "running"]
    if not active:
        return dict(empty, nodes=samplers)
    node, value = active[-1]
    return {"prompt_id": prompt_id, "node": node, **value, "nodes": samplers}
