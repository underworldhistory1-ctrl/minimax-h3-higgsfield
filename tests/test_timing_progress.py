from types import SimpleNamespace
import unittest
from h3_lab.timing import sampler_progress_snapshot


class TimingProgressTests(unittest.TestCase):
    def registry(self, states):
        graph = {"8": {"class_type": "KSampler"}, "103": {"class_type": "KSampler"}, "9": {"class_type": "VAEDecode"}}
        return SimpleNamespace(prompt_id="job", dynprompt=SimpleNamespace(get_node=lambda key: graph[key]), nodes=states)

    def test_active_refinement_replaces_finished_base(self):
        registry = self.registry({"8": {"state": "finished", "value": 20, "max": 20}, "103": {"state": "running", "value": 4, "max": 10}})
        result = sampler_progress_snapshot(registry, "job")
        self.assertEqual((result["node"], result["step"], result["total"]), ("103", 4, 10))
        self.assertEqual(len(result["nodes"]), 2)

    def test_decode_does_not_replay_finished_sampling(self):
        registry = self.registry({"8": {"state": "finished", "value": 20, "max": 20}, "9": {"state": "running", "value": 1, "max": 2}})
        self.assertIsNone(sampler_progress_snapshot(registry, "job")["step"])
        self.assertIsNone(sampler_progress_snapshot(registry, "other")["step"])


if __name__ == "__main__":
    unittest.main()
