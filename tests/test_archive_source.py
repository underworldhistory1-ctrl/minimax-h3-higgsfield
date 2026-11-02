import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch

from deploy import archive_source, launcher


class ArchiveSourceTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.base = Path(self.directory.name)
        self.author = self.base / 'author'
        self.remote = self.base / 'origin.git'
        self.root = self.base / 'ComfyUI'
        self.archive = self.base / 'archive'
        self.archive.mkdir()
        (self.archive / 'VERSION').write_text('2.7.0')
        self.command('init', '--bare', self.remote)
        self.command('init', '-b', 'main', self.author)
        self.command('-C', self.author, 'config', 'user.name', 'Test')
        self.command('-C', self.author, 'config', 'user.email', 'test@example.invalid')
        (self.author / 'deploy').mkdir()
        (self.author / 'deploy/launcher.py').write_text('print("fixture")\n')
        (self.author / 'VERSION').write_text('2.7.0')
        (self.archive / 'deploy').mkdir()
        (self.archive / 'deploy/launcher.py').write_text('print("fixture")\n')
        self.command('-C', self.author, 'add', '.')
        self.command('-C', self.author, 'commit', '-m', 'release')
        self.commit = self.command('-C', self.author, 'rev-parse', 'HEAD')
        self.command('-C', self.author, 'remote', 'add', 'origin', self.remote)
        self.command('-C', self.author, 'push', 'origin', 'main')
        self.source = patch.object(archive_source, 'OFFICIAL_SOURCE', str(self.remote))
        self.source.start()
        self.addCleanup(self.source.stop)
        self.runner = Mock()
        self.runner.run.side_effect = lambda command: subprocess.run(
            list(map(str, command)), check=True, capture_output=True)

    def command(self, *args):
        return subprocess.check_output(['git', *map(str, args)], text=True,
                                       stderr=subprocess.DEVNULL).strip()

    def test_official_checkout_is_persistent_reused_and_preserves_archive(self):
        self.root.mkdir()
        (self.root / 'saved.mp4').write_bytes(b'preserve output')
        target = archive_source.prepare_checkout(self.root, self.runner)
        archive_source.validate_archive_version(self.archive, target)
        self.assertEqual(target, self.root / '.h3-launcher/source')
        self.assertEqual(self.command('-C', target, 'rev-parse', 'HEAD'), self.commit)
        count = self.runner.run.call_count
        self.assertEqual(archive_source.prepare_checkout(self.root, self.runner), target)
        self.assertEqual(self.runner.run.call_count, count)
        self.assertEqual((self.archive / 'VERSION').read_text(), '2.7.0')
        self.assertEqual((self.root / 'saved.mp4').read_bytes(), b'preserve output')

    def test_existing_unknown_source_is_preserved(self):
        target = self.root / '.h3-launcher/source'
        target.mkdir(parents=True)
        (target / 'custom.txt').write_text('keep')
        with self.assertRaisesRegex(RuntimeError, 'unrecognized'):
            archive_source.prepare_checkout(self.root, self.runner)
        self.assertEqual((target / 'custom.txt').read_text(), 'keep')
        self.runner.run.assert_not_called()

    def test_edited_persistent_checkout_cannot_be_executed(self):
        target = archive_source.prepare_checkout(self.root, self.runner)
        (target / 'deploy/launcher.py').write_text('custom code')
        with self.assertRaisesRegex(RuntimeError, 'customized'):
            archive_source.prepare_checkout(self.root, self.runner)
        self.assertEqual((target / 'deploy/launcher.py').read_text(), 'custom code')

    def test_newer_archive_never_downgrades_to_main(self):
        target = archive_source.prepare_checkout(self.root, self.runner)
        (self.archive / 'VERSION').write_text('2.8.0')
        with self.assertRaisesRegex(RuntimeError, 'newer than official'):
            archive_source.validate_archive_version(self.archive, target)

    def test_equal_version_unpublished_commit_is_not_discarded(self):
        target = archive_source.prepare_checkout(self.root, self.runner)
        import hashlib
        files = {name: hashlib.sha256(path.read_bytes()).hexdigest()
                 for name, path in archive_source.archive_files(self.archive).items()}
        (self.archive / '.h3-archive.json').write_text(json.dumps({'source_commit': 'f' * 40, 'files': files}))
        with self.assertRaisesRegex(RuntimeError, 'does not contain'):
            archive_source.validate_archive_version(self.archive, target)
        (self.archive / '.h3-archive.json').write_text(json.dumps({'source_commit': self.commit, 'files': files}))
        archive_source.validate_archive_version(self.archive, target)

    def test_failed_fetch_does_not_publish_partial_source(self):
        self.runner.run.side_effect = RuntimeError('connection reset')
        with self.assertRaisesRegex(RuntimeError, 'connection reset'):
            archive_source.prepare_checkout(self.root, self.runner)
        self.assertFalse((self.root / '.h3-launcher/source').exists())
        self.assertEqual(list((self.root / '.h3-launcher').glob('source-clone-*')), [])

    def test_archive_launch_pins_root_during_reexec(self):
        api = Mock()
        checkout = self.root / '.h3-launcher/source'
        with patch.object(launcher, 'PROJECT', self.archive), \
             patch('sys.argv', ['launcher', '--comfy-root', str(self.root)]), \
             patch('deploy.launcher_smoke.ComfyAPI', return_value=api), \
             patch.object(launcher, 'prerequisites'), \
             patch.object(launcher, 'wait_for_install_idle'), \
             patch.object(launcher, 'close_admission'), \
             patch.object(archive_source, 'prepare_checkout', return_value=checkout), \
             patch.object(archive_source, 'validate_archive_version') as validate, \
             patch('deploy.update_source.update_source', return_value=False), \
             patch.object(launcher.os, 'execv') as execute:
            self.assertEqual(launcher.main(), 0)
        validate.assert_called_once_with(self.archive, checkout)
        command = execute.call_args.args[1]
        self.assertEqual(command[1], str(checkout / 'deploy/launcher.py'))
        self.assertEqual(command[-2:], ['--comfy-root', str(self.root.resolve())])

    def test_modified_packaged_archive_is_not_silently_replaced(self):
        import hashlib
        target = archive_source.prepare_checkout(self.root, self.runner)
        receipt = {'source_commit': self.commit, 'files': {
            name: hashlib.sha256(path.read_bytes()).hexdigest()
            for name, path in archive_source.archive_files(self.archive).items()}}
        (self.archive / '.h3-archive.json').write_text(json.dumps(receipt))
        archive_source.validate_archive_version(self.archive, target)
        (self.archive / 'VERSION').write_text('2.7.0\n')
        with self.assertRaisesRegex(RuntimeError, 'Archive has local changes'):
            archive_source.validate_archive_version(self.archive, target)

    def test_plain_zip_same_version_custom_code_is_preserved_and_rejected(self):
        target = archive_source.prepare_checkout(self.root, self.runner)
        (self.archive / 'deploy/launcher.py').write_text('unpublished fix')
        with self.assertRaisesRegex(RuntimeError, 'recognized official ancestor'):
            archive_source.validate_archive_version(self.archive, target)
        self.assertEqual((self.archive / 'deploy/launcher.py').read_text(), 'unpublished fix')

    def test_unchanged_older_plain_zip_updates_after_main_advances(self):
        (self.author / 'deploy/launcher.py').write_text('print("new release at same version")\n')
        self.command('-C', self.author, 'commit', '-am', 'new code')
        self.command('-C', self.author, 'push', 'origin', 'main')
        latest = self.command('-C', self.author, 'rev-parse', 'HEAD')
        target = archive_source.prepare_checkout(self.root, self.runner)
        self.assertEqual(self.command('-C', target, 'rev-parse', 'HEAD'), latest)
        archive_source.validate_archive_version(self.archive, target)
        self.assertEqual(archive_source.validate_plain_archive(self.archive, target), self.commit)

    def test_release_builder_refuses_dirty_git_provenance(self):
        from deploy import build_final_folder as builder
        with patch.object(builder, 'SOURCE_FILES', ('VERSION', 'deploy/launcher.py')):
            self.assertEqual(builder.source_revision(self.author), self.commit)
            (self.author / 'VERSION').write_text('2.7.1')
            with self.assertRaisesRegex(SystemExit, 'source edits'):
                builder.source_revision(self.author)

    def test_refresh_preserves_and_rejects_stale_package_source(self):
        from deploy import build_final_folder as builder
        output = self.base / 'release'
        stale = output / 'source/h3-studio-src/removed.py'
        stale.parent.mkdir(parents=True)
        stale.write_text('preserve stale source')
        (output / 'MANIFEST_SHA256.json').write_text(json.dumps({'project': 'H3 Studio'}))
        with patch.object(builder, 'SOURCE_FILES', ('VERSION',)), \
             patch.object(builder, 'source_revision', return_value=self.commit), \
             patch('sys.argv', ['builder', '--output', str(output), '--update']):
            with self.assertRaisesRegex(SystemExit, 'obsolete/unknown source'):
                builder.main()
        self.assertEqual(stale.read_text(), 'preserve stale source')
        self.assertFalse((output / 'h3-cloud-setup.zip').exists())
