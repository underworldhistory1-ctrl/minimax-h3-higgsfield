"""Local real project/asset/export API fixture. Never starts ComfyUI or inference."""
import pathlib
import sys
import subprocess
import tempfile
from aiohttp import web
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[2]))
from h3_lab.routes import register_lab_routes
from h3_lab.assembly import get_ffmpeg_path

root=pathlib.Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory(prefix='h3-workspace-browser-') as folder:
    video=pathlib.Path(folder)/'video';video.mkdir()
    subprocess.run([get_ffmpeg_path(),'-v','error','-f','lavfi','-i','testsrc2=size=864x480:rate=24',
        '-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','13','-c:v','libx264','-preset','ultrafast',
        '-c:a','aac',str(video/'h3_studio_123abc456def_00001_.mp4')],check=True)
    app=web.Application(client_max_size=30*1024*1024)
    register_lab_routes(app,folder,output_root=folder,input_root=pathlib.Path(folder)/'input')
    app.router.add_static('/web/',root/'web')
    web.run_app(app,host='127.0.0.1',port=int(sys.argv[1] if len(sys.argv)>1 else 18925))
