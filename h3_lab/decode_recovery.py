"""Build decode-only recovery from a stored graph, never a client-supplied graph."""
import copy


def recovery_graph(token, workflow, output_token):
    if not isinstance(workflow, dict) or any(not isinstance(node, dict) for node in workflow.values()):
        raise ValueError('Original workflow is unavailable')
    graph = copy.deepcopy(workflow)
    releases = [key for key, node in graph.items()
                if node.get('class_type') == 'H3ReleaseForDecode'
                and node.get('inputs', {}).get('token') == token]
    outputs = [key for key, node in graph.items()
               if node.get('class_type') == 'H3SaveVideo'
               and node.get('inputs', {}).get('filename_prefix') == 'video/h3_studio_' + token]
    if len(releases) != 1 or len(outputs) != 1:
        raise ValueError('Original checkpoint/output graph is unavailable or ambiguous')
    graph[releases[0]] = {'class_type': 'H3LoadSavedLatent', 'inputs': {'token': token}}
    graph[outputs[0]]['inputs']['filename_prefix'] = 'video/h3_studio_' + output_token
    allowed = {'H3LoadSavedLatent', 'VAELoader', 'VAEDecode', 'VAEDecodeAudio',
               'H3LabTrimAV', 'ImageCrop', 'ImageScale', 'CreateVideo', 'H3SaveVideo'}
    result, visiting = {}, set()
    def visit(key):
        if key in visiting:
            raise ValueError('Cyclic recovery graph')
        if key in result:
            return
        node = graph.get(key)
        if not isinstance(node, dict) or node.get('class_type') not in allowed:
            raise ValueError('Recovery requires an unsupported or sampling node')
        inputs = node.get('inputs', {})
        if not isinstance(inputs, dict):
            raise ValueError('Invalid recovery node inputs')
        visiting.add(key)
        for value in inputs.values():
            if isinstance(value, list) and len(value) == 2 and isinstance(value[0], str) and isinstance(value[1], int):
                visit(value[0])
        visiting.remove(key)
        result[key] = node
    visit(outputs[0])
    if releases[0] not in result:
        raise ValueError('Output does not depend on the saved checkpoint')
    return result
