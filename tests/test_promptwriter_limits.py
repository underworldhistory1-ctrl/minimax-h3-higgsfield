import unittest

import promptwriter


class LongPromptTests(unittest.TestCase):
    def test_long_text_prompt_keeps_format_validation(self):
        prompt = (
            'integrated_multimodal_description: [Shot 1] '
            + 'The camera follows the moving subject. ' * 800
            + '\noverall_soundscape: Wind.\nnon_diegetic_music: N/A'
        )
        self.assertGreater(len(prompt), 28000)
        self.assertEqual(promptwriter.validate(prompt, seconds=12), [])
        broken = prompt.replace('[Shot 1]', '[Shot 2]')
        self.assertIn('missing [Shot 1] marker', promptwriter.validate(broken))

    def test_long_reference_prompt_keeps_subject_validation(self):
        prompt = (
            'subject_definitions: <Subject 1> is the person in <Picture 1>.\n'
            'summary: [Reference to video] A person walks.\n'
            'retention_analysis: fully_preserved\n'
            'detailed_description: [Shot 1] '
            + 'The camera follows <Subject 1> through the courtyard. ' * 600
            + '\noverall_soundscape: Wind.\nnon_diegetic_music: N/A'
        )
        self.assertGreater(len(prompt), 28000)
        self.assertEqual(promptwriter.validate_ref(prompt, seconds=12), [])
        broken = prompt.replace('<Picture 1>', 'the photo')
        self.assertIn('never cites <Picture 1>', promptwriter.validate_ref(broken))


if __name__ == '__main__':
    unittest.main()
