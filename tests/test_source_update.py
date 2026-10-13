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

    def test_default_latest_updates_without_manifest_approval_and_orders_idle_backup(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'.git').mkdir()
            events=[]
            def run(command, **kwargs):
                events.append(command)
                return Mock(returncode=0)
            values=['https://github.com/underworldhistory1-ctrl/minimax-h3-higgsfield.git','main','','old','new']
            with patch('deploy.update_source.subprocess.check_output',side_effect=values), patch('deploy.update_source.subprocess.run',side_effect=run):
                self.assertTrue(update_source(root,before_update=lambda:events.append('idle')))
            idle=events.index('idle')
            self.assertIn('update-ref',events[idle+1]);self.assertEqual(events[idle+1][-2:],['refs/h3-launcher/previous-source','old'])
            self.assertEqual(events[idle+2][-3:],['merge','--ff-only','origin/main'])

    def test_latest_wait_failure_never_updates_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'.git').mkdir()
            values=['https://github.com/underworldhistory1-ctrl/minimax-h3-higgsfield.git','main','','old','new']
            def blocked():raise RuntimeError('Queue is still running')
            with patch('deploy.update_source.subprocess.check_output',side_effect=values), patch('deploy.update_source.subprocess.run',return_value=Mock(returncode=0)) as run:
                with self.assertRaisesRegex(RuntimeError,'Queue'):update_source(root,before_update=blocked)
                self.assertFalse(any('merge' in c.args[0] or 'update-ref' in c.args[0] for c in run.call_args_list))

    def test_launcher_defaults_to_latest_policy(self):
        from deploy.launcher import parser
        self.assertEqual(parser().parse_args([]).update_policy,'latest')
        self.assertEqual(parser().parse_args(['--update-policy','notify']).update_policy,'notify')

    def test_latest_real_git_fast_forward_and_backup(self):
        import shutil
        if not shutil.which('git'):self.skipTest('Git is required')
        with tempfile.TemporaryDirectory() as directory:
            base=Path(directory);remote=base/'origin.git';author=base/'author';client=base/'client'
            def git(*args):return subprocess.check_output(['git',*map(str,args)],text=True,stderr=subprocess.DEVNULL).strip()
            git('init','--bare',remote);git('init','-b','main',author)
            git('-C',author,'config','user.email','tests@example.invalid');git('-C',author,'config','user.name','H3 Tests')
            (author/'VERSION').write_text('2.0.0');git('-C',author,'add','VERSION');git('-C',author,'commit','-m','baseline');git('-C',author,'remote','add','origin',remote);git('-C',author,'push','origin','main')
            git('clone','--branch','main',remote,client);before=git('-C',client,'rev-parse','HEAD')
            (author/'VERSION').write_text('2.1.0');git('-C',author,'commit','-am','release');git('-C',author,'push','origin','main');target=git('-C',author,'rev-parse','HEAD')
            original=subprocess.check_output
            def inspect(command, **kwargs):
                if command[-3:]==['remote','get-url','origin']:return 'https://github.com/underworldhistory1-ctrl/minimax-h3-higgsfield.git'
                return original(command,**kwargs)
            with patch('deploy.update_source.subprocess.check_output',side_effect=inspect):self.assertTrue(update_source(client))
            self.assertEqual(git('-C',client,'rev-parse','HEAD'),target)
            self.assertEqual(git('-C',client,'rev-parse','refs/h3-launcher/previous-source'),before)
            self.assertEqual((client/'VERSION').read_text(),'2.1.0')
