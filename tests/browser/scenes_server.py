"""Ephemeral localhost scene browser fixture; real storage APIs, no ComfyUI/GPU."""
import asyncio
import pathlib
import subprocess
import sys
import tempfile

from aiohttp import web

root = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root))
from h3_lab.routes import register_lab_routes
from h3_lab.assembly import get_ffmpeg_path


async def run(folder):
    stopped = asyncio.Event()
    app = web.Application(client_max_size=30 * 1024 * 1024)
    register_lab_routes(app, folder, output_root=folder, input_root=folder / 'input')
    app.router.add_static('/web/', root / 'web')

    async def stop(request):
        stopped.set()
        return web.json_response({'stopping': True})

    app.router.add_post('/__scenes_fixture_stop', stop)
    runner = web.AppRunner(app)
    await runner.setup()
    try:
        site = web.TCPSite(runner, '127.0.0.1', 0)
        await site.start()
        port = site._server.sockets[0].getsockname()[1]
        print(f'SCENES_FIXTURE_URL=http://127.0.0.1:{port}', flush=True)
        await stopped.wait()
    finally:
        await runner.cleanup()


with tempfile.TemporaryDirectory(prefix='h3-scenes-browser-') as temporary:
    folder = pathlib.Path(temporary)
    video = folder / 'video'
    video.mkdir()
    subprocess.run([
        get_ffmpeg_path(), '-v', 'error', '-f', 'lavfi', '-i',
        'testsrc2=size=864x480:rate=24', '-f', 'lavfi', '-i',
        'sine=frequency=440:sample_rate=44100', '-t', '13', '-c:v',
        'libx264', '-preset', 'ultrafast', '-c:a', 'aac',
        str(video / 'h3_studio_123abc456def_00001_.mp4'),
    ], check=True, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    asyncio.run(run(folder))
