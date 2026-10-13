import subprocess
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, Mock
from deploy.update_source import update_source


class SourceUpdateTests(unittest.TestCase):
    def run_update(self, status='', before='old', target='new', ancestor=0):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root/'.git').mkdir()
            (root/'deploy').mkdir()
            (root/'deploy/compatibility.json').write_text(json.dumps({'approved_source_commits':[target]}))
            values = ['https://github.com/underworldhistory1-ctrl/minimax-h3-higgsfield.git', 'main', status, before, target]
            with patch('deploy.update_source.subprocess.check_output', side_effect=values), \
                 patch('deploy.update_source.subprocess.run', side_effect=[Mock(returncode=0), Mock(returncode=ancestor), Mock(returncode=0), Mock(returncode=0)]) as run:
                if status or ancestor:
                    with self.assertRaises(RuntimeError):
                        update_source(root, policy='verified')
                    self.assertFalse(any('merge' in call.args[0] for call in run.call_args_list))
                    if status:
                        run.assert_not_called()
                else:
                    self.assertTrue(update_source(root, policy='verified'))
                    self.assertEqual(run.call_args_list[-1].args[0][-3:], ['merge', '--ff-only', 'origin/main'])

    def test_fast_forward_only(self):
        self.run_update()

    def test_dirty_source_is_preserved_without_fetch(self):
        self.run_update(status=' M web/studio.js')

    def test_divergent_commits_are_preserved(self):
        self.run_update(ancestor=1)

    def test_archive_has_no_implicit_git_mutation(self):
        with tempfile.TemporaryDirectory() as directory, patch('deploy.update_source.subprocess.run') as run:
            self.assertFalse(update_source(Path(directory)))
            run.assert_not_called()
