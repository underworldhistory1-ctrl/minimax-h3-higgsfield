import gzip
import pathlib
import tempfile
import unittest
from unittest.mock import patch
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer
from deploy import install_windows as installer


class CompressedAssetUpdateTests(unittest.IsolatedAsyncioTestCase):
    async def test_shared_copy_includes_linux_bootstrap_dependencies(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            installer.copy_runtime(root)
            runtime = root / 'custom_nodes/h3_studio'
            for name in ('deploy/bootstrap_h3_server.sh', 'deploy/download_h3_models.sh', 'web/h3/tab-session.js'):
                self.assertEqual((runtime / name).read_bytes(), (installer.PROJECT / name).read_bytes())

    async def test_update_serves_new_assets_and_preserves_old_sidecars(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = pathlib.Path(tmp)
            source, root = base / 'source', base / 'comfy'
            target = root / 'custom_nodes' / 'h3_studio'
            names = ('__init__.py', 'web/index.html', 'web/image-studio.js')
            for name in names:
                for tree, value in ((source, b'new asset'), (target, b'old asset')):
                    path = tree / name
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(value)
            asset = target / 'web/image-studio.js'
            old_gzip = gzip.compress(b'old asset')
            asset.with_name(asset.name + '.gz').write_bytes(old_gzip)
            asset.with_name(asset.name + '.br').write_bytes(b'old brotli')
            orphan = target / 'web/user-file.gz'
            orphan.write_bytes(b'user data')
            with patch.object(installer, 'PROJECT', source), patch.object(installer, 'RUNTIME_FILES', names):
                installer.copy_runtime(root)
            app = web.Application()
            app.router.add_static('/web', target / 'web')
            async with TestClient(TestServer(app)) as client:
                response = await client.get('/web/image-studio.js', headers={'Accept-Encoding': 'gzip'})
                self.assertEqual(await response.read(), b'new asset')
            self.assertFalse(asset.with_name(asset.name + '.br').exists())
            backups = list((target / '.h3-backup').glob('*/web/image-studio.js.gz'))
            self.assertEqual(len(backups), 1)
            self.assertEqual(backups[0].read_bytes(), old_gzip)
            self.assertEqual(backups[0].with_suffix('.br').read_bytes(), b'old brotli')
            self.assertEqual(orphan.read_bytes(), b'user data')
