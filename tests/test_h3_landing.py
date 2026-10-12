import unittest
from deploy.make_h3_landing import redirect_source


class LandingTests(unittest.TestCase):
    def test_existing_redirect_migrates_to_v2_idempotently(self):
        original = '<html><head></head><body>Original editor</body></html>'
        standard = redirect_source(original,'h3_studio')
        updated = redirect_source(standard,'h3_studio_v2')
        self.assertIn('/extensions/h3_studio_v2/index.html',updated)
        self.assertNotIn('/extensions/h3_studio/index.html',updated)
        self.assertEqual(updated,redirect_source(updated,'h3_studio_v2'))
        self.assertIn('get("view")!=="nodes"',updated)
        self.assertIn('Original editor',updated)

    def test_untrusted_directory_rejected(self):
        with self.assertRaises(ValueError):
            redirect_source('<head></head>', '../other')
