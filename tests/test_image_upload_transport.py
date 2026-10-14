import base64,json,unittest
from aiohttp import web,FormData
from aiohttp.test_utils import AioHTTPTestCase
from h3_lab.reference_upload import reference_upload

class ImageUploadTransportTests(AioHTTPTestCase):
 async def get_application(self):
  app=web.Application()
  async def upload(request):
   try:
    name,read=await reference_upload(request,request.query.get('kind','image'),32)
    data=b''
    while chunk:=await read(size=1024):
     data+=chunk
     if len(data)>32:raise ValueError('too large')
    return web.json_response({'filename':name,'bytes':len(data),'data':base64.b64encode(data).decode()})
   except ValueError as e:return web.json_response({'error':str(e)},status=400)
  app.router.add_post('/upload',upload);return app
 async def test_json_preserves_exact_file_and_multipart_remains_supported(self):
  data=b'\x00png-fixture\xff';body={'filename':'reference.png','data':base64.b64encode(data).decode()}
  result=await self.client.post('/upload',json=body);self.assertEqual(result.status,200);self.assertEqual((await result.json())['data'],body['data'])
  form=FormData();form.add_field('file',data,filename='reference.png',content_type='image/png')
  result=await self.client.post('/upload',data=form);self.assertEqual(result.status,200);self.assertEqual((await result.json())['bytes'],len(data))
 async def test_binary_stream_preserves_images_videos_audio_and_rejects_bad_headers(self):
  data=b'\x00binary-media\xff'
  for kind,ext in [('image','jpg'),('video','mp4'),('audio','wav')]:
   response=await self.client.post('/upload?kind='+kind+'&filename=ref.'+ext,data=data,headers={'Content-Type':'application/octet-stream'})
   self.assertEqual(response.status,200);self.assertEqual((await response.json())['data'],base64.b64encode(data).decode())
  for query,payload in [('filename=',data),('filename=..%2Fx.jpg',data),('filename=x.jpg',b'x'*33)]:
   self.assertEqual((await self.client.post('/upload?'+query,data=payload,headers={'Content-Type':'application/octet-stream'})).status,400)
  self.assertEqual((await self.client.post('/upload',data='text')).status,400)
  async def chunks():
   yield b'a'*20
   yield b'b'*20
  self.assertEqual((await self.client.post('/upload?filename=x.mp4&kind=video',data=chunks(),headers={'Content-Type':'application/octet-stream'})).status,400)
 async def test_rejects_invalid_and_oversized_images_before_file_creation(self):
  for body in ({},[],{'filename':'x.png','data':'not base64!'},{'filename':'x.png','data':''},{'filename':'x.png','data':base64.b64encode(b'x'*33).decode()},{'filename':'x.png','data':'x'*5000},{'filename':'../x.png','data':'eA=='},{'filename':'a\\x.png','data':'eA=='},{'filename':'a\x00.png','data':'eA=='}):
   with self.subTest(body=body):self.assertEqual((await self.client.post('/upload',json=body)).status,400)
  self.assertEqual((await self.client.post('/upload?kind=video',json={'filename':'x.mp4','data':'eA=='})).status,400)


class ReferenceUploadRouteTests(AioHTTPTestCase):
 async def get_application(self):
  import ast,pathlib,tempfile,types,math,os,time,uuid,asyncio,threading
  self.temp=tempfile.TemporaryDirectory();self.root=pathlib.Path(self.temp.name)
  root=pathlib.Path(__file__).resolve().parents[1]
  node=next(n for n in ast.parse((root/'__init__.py').read_text(encoding='utf-8')).body if isinstance(n,ast.AsyncFunctionDef) and n.name=='upload_ref');node.decorator_list=[]
  for child in ast.walk(node):
   if isinstance(child,ast.ImportFrom) and child.module=='h3_lab.reference_upload':child.level=0
  ns={'web':web,'pathlib':pathlib,'math':math,'os':os,'uuid':uuid,'asyncio':asyncio,'time':time,'_lock':threading.Lock(),'_tracked':{},'INPUT_PREFIX':'h3_studio_kf','_safe_input_path':lambda name:str(self.root/name),'folder_paths':types.SimpleNamespace(get_input_directory=lambda:str(self.root))}
  exec(compile(ast.Module(body=[node],type_ignores=[]),str(root/'__init__.py'),'exec'),ns)
  app=web.Application();app.router.add_post('/upload',ns['upload_ref']);return app
 def tearDown(self):
  super().tearDown();self.temp.cleanup()
 async def test_actual_image_route_shares_media_checks_for_json_and_multipart(self):
  from pathlib import Path
  data=(Path(__file__).resolve().parents[1]/'docs/demo/superman/character-reference-preview.jpg').read_bytes()
  result=await self.client.post('/upload?kind=image&resize=1',json={'filename':'hero.jpg','data':base64.b64encode(data).decode()})
  self.assertEqual(result.status,200);meta=await result.json();self.assertEqual((meta['width'],meta['height']),(1600,900));self.assertEqual((self.root/meta['name']).read_bytes(),data)
  result=await self.client.post('/upload?kind=image&filename=hero.jpg',data=data,headers={'Content-Type':'application/octet-stream'});self.assertEqual(result.status,200);self.assertEqual((self.root/(await result.json())['name']).read_bytes(),data)
  form=FormData();form.add_field('file',data,filename='hero.jpg',content_type='image/jpeg');result=await self.client.post('/upload?kind=image',data=form);self.assertEqual(result.status,200)
  count=len(list(self.root.iterdir()))
  for body in ({'filename':'bad.png','data':base64.b64encode(b'not an image').decode()},{'filename':'bad.exe','data':base64.b64encode(data).decode()}):
   self.assertEqual((await self.client.post('/upload?kind=image',json=body)).status,400);self.assertEqual(len(list(self.root.iterdir())),count)
