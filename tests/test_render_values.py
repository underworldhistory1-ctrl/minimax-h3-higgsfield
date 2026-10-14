import unittest

from h3_lab.render_values import seed_value
from h3_lab.jobs import validate_resource_contract


class NativeSeedTests(unittest.TestCase):
    def test_exact_unsigned_64_bit_values(self):
        for value in (0, 42, 2**53 + 1, 2**64 - 1):
            self.assertEqual(seed_value(value), value)
            self.assertEqual(seed_value(str(value)), value)
        for value in (1.25, '1.25', True, -1, 2**64, float(2**53), '1e3', ''):
            with self.subTest(value=value), self.assertRaises(ValueError):
                seed_value(value)

    def test_sampler_submission_canonicalizes_large_seeds_and_rejects_fractions(self):
        for node_type, key in (('KSampler', 'seed'), ('KSamplerAdvanced', 'noise_seed')):
            spec = {'workflow': {
                'source': {'class_type': 'MiniMaxH3ReferenceToVideo', 'inputs': {
                    'width': 864, 'height': 480, 'length': 73, 'batch_size': 1}},
                'sampler': {'class_type': node_type, 'inputs': {key: str(2**64 - 1), 'steps': 20}}}}
            validate_resource_contract(spec)
            self.assertEqual(spec['workflow']['sampler']['inputs'][key], 2**64 - 1)
            spec['workflow']['sampler']['inputs'][key] = 1.25
            with self.assertRaises(ValueError):
                validate_resource_contract(spec)

    def test_qwen_create_and_edit_use_the_same_exact_seed_contract(self):
        from qwen_image import build_qwen_graph
        base = {'profile': 'int8', 'prompt': 'A quiet room', 'width': 1024,
                'height': 1024, 'steps': 40, 'seed': str(2**64 - 1)}
        for mode, refs in (('create', []), ('edit', ['reference.png'])):
            graph = build_qwen_graph({**base, 'mode': mode}, refs, 'seedtest')
            self.assertEqual(graph['sampler']['inputs']['seed'], 2**64 - 1)
            with self.assertRaises(ValueError):
                build_qwen_graph({**base, 'mode': mode, 'seed': 1.25}, refs, 'seedtest')
