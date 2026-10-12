import unittest
from h3_lab.shared_timing import Observer, profile

class TimingTests(unittest.TestCase):
    def test_profile_distinguishes_topology_and_decode(self):
        a = {'1': {'class_type': 'Decode', 'inputs': {'samples': ['2', 0], 'tile_size': 256}}}
        b = {'1': {'class_type': 'Decode', 'inputs': {'samples': ['3', 0], 'tile_size': 256}}}
        self.assertNotEqual(profile(a), profile(b))
        b['1']['inputs']['samples'] = ['2', 0]
        b['1']['inputs']['tile_size'] = 512
        self.assertNotEqual(profile(a), profile(b))

    def test_profile_ignores_creative_text_seed(self):
        a = {'1': {'class_type': 'Sampler', 'inputs': {'seed': 1, 'prompt': 'private', 'steps': 20}}}
        b = {'1': {'class_type': 'Sampler', 'inputs': {'seed': 2, 'prompt': 'changed', 'steps': 20}}}
        self.assertEqual(profile(a), profile(b))

    def test_partial_first_stage_excluded_and_cancelled_not_learned(self):
        o = Observer(); o.started = 1000
        row = [0, 'job', {'1': {'class_type': 'Sampler', 'inputs': {}}}, {'create_time': 100}]
        o.observe(row, {'phase': 'sampling', 'node': '1', 'step': 5, 'total': 20}, 2000)
        o.observe(row, {'phase': 'decoding', 'node': '2'}, 3000)
        o.finish('job', {'status': {'status_str': 'success'}}, 4000)
        self.assertEqual(list(o.database['samples'].values()), [[1000]])
        o.observe(row, {'phase': 'saving', 'node': '3'}, 5000)
        o.finish('job', {'status': {'status_str': 'error'}}, 6000)
        self.assertEqual(list(o.database['samples'].values()), [[1000]])

    def test_step_eta_requires_two_measured_intervals(self):
        o = Observer()
        row = [0, 'job', {}, {}]
        p = {'phase': 'sampling', 'node': '1', 'step': 5, 'total': 20}
        self.assertIsNone(o.observe(row, p, 1000)['eta_ms'])
        p['step'] = 6
        self.assertIsNone(o.observe(row, p, 2000)['eta_ms'])
        p['step'] = 7
        self.assertEqual(o.observe(row, p, 3000)['eta_ms'], 13000)

if __name__ == '__main__':
    unittest.main()
