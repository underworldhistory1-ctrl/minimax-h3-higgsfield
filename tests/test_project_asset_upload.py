import io
import pathlib
import tempfile
from urllib.parse import urlencode

from aiohttp import FormData, web
from aiohttp.test_utils import AioHTTPTestCase
from PIL import Image

from h3_lab.routes import register_lab_routes


class ProjectAssetUploadTests(AioHTTPTestCase):
    async def get_application(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temp.name)
        app = web.Application()
        self.services = register_lab_routes(app, str(self.root), input_root=self.root / 'input')
        self.project = self.services['projects'].create_project('Existing project')
        buffer = io.BytesIO()
        Image.new('RGB', (24, 16), 'blue').save(buffer, 'PNG')
        self.picture = buffer.getvalue()
        return app

    def tearDown(self):
        super().tearDown()
        self.temp.cleanup()

    async def test_binary_upload_into_existing_elements_preserves_media_name_and_identity(self):
        query = urlencode({'project_id': self.project['project_id'], 'category': 'characters',
                           'name': 'Named Hero', 'filename': 'original-file.png'})
        response = await self.client.post('/h3_studio/lab/assets?' + query, data=self.picture,
                                         headers={'Content-Type': 'application/octet-stream'})
        self.assertEqual(response.status, 201, await response.text())
        asset = (await response.json())['asset']
        project = self.services['projects'].get_project(self.project['project_id'])
        self.assertEqual(project['assets'][0]['name'], 'Named Hero')
        self.assertEqual(project['assets'][0]['asset_id'], asset['asset_id'])
        self.assertEqual(asset['original_name'], 'original-file.png')
        media = await self.client.get('/h3_studio/lab/assets/' + asset['asset_id'] + '/file')
        self.assertEqual(await media.read(), self.picture)
        resolved = await self.client.post('/h3_studio/lab/assets/' + asset['asset_id'] + '/resolve', json={})
        self.assertEqual(resolved.status, 200)
        self.assertIn('filename', await resolved.json())

    async def test_multipart_upload_remains_backward_compatible(self):
        body = FormData()
        body.add_field('file', self.picture, filename='legacy.png', content_type='image/png')
        response = await self.client.post('/h3_studio/lab/assets?project_id=' + self.project['project_id'], data=body)
        self.assertEqual(response.status, 201, await response.text())

    async def test_invalid_or_empty_transport_never_creates_catalog_assets(self):
        for name, data in [('../escape.png', self.picture), ('empty.png', b''), ('bad.exe', self.picture)]:
            query = urlencode({'project_id': self.project['project_id'], 'filename': name})
            response = await self.client.post('/h3_studio/lab/assets?' + query, data=data,
                                             headers={'Content-Type': 'application/octet-stream'})
            self.assertEqual(response.status, 400, name)
        self.assertEqual(self.services['projects'].get_project(self.project['project_id'])['assets'], [])
