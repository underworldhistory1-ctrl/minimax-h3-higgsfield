import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from deploy import download_optional_loras


class OptionalLoraOfflineTests(unittest.TestCase):
    def test_offline_check_never_downloads_or_creates_model_directories(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'main.py').touch()
            with patch('sys.argv', ['download_optional_loras', str(root), '--offline-check']), \
                 patch.object(download_optional_loras.urllib.request, 'urlopen') as network:
                self.assertEqual(download_optional_loras.main(), 1)
            network.assert_not_called()
            self.assertFalse((root / 'models').exists())


if __name__ == '__main__':
    unittest.main()
