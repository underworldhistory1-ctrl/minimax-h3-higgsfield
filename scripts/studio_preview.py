"""Persistent localhost Studio simulator. No model, provider or GPU is contacted.

Real project/assets, prompt media sampling and control validation are exercised;
only provider inference, Comfy readiness and generated clips are simulated.
"""
import argparse
import asyncio
import json
import pathlib
import shutil
import subprocess
import sys
import uuid
import hashlib
import io

from aiohttp import web
from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import promptwriter
import h3_lab.routes as lab_routes
from h3_lab.paths import owned_path
from h3_lab.prompt_context import probe

NODES = ('UNETLoader MiniMaxH3SigmaShift CLIPLoader VAELoader MiniMaxH3ImageToVideo '
         'MiniMaxH3ReferenceToVideo ConditioningZeroOut KSampler H3ReleaseForDecode VAEDecode '
         'VAEDecodeAudio CreateVideo H3SaveVideo LoadImage LoadVideo GetVideoComponents '
         'ImageFromBatch TrimAudioDuration LoadAudio MiniMaxH3AddGuide LoraLoaderModelOnly '
         'ModelPatchLoader MiniMaxH3FunControlNetApply ImageToMask LTXVSeparateAVLatent '
         'LTXVConcatAVLatent MinimaxH3LatentUpscaler3D').split()
MODELS = dict.fromkeys(['fl2va', 'ref2va', 'text_encoder', 'video_vae', 'audio_vae'], True)
CAPS = {'simulation': True, 'ready': True, 'add_guide': True, 'guides_ready': True,
        'controlnet_ready': True, 'controlnet_missing_reasons': [], 'refine_ready': True,
        'refine_missing_reasons': [], 'continuation_ready': False, 'models': MODELS,
        'missing_reasons': ['Local simulation: model availability is mocked.']}


def mock_chat(messages):
    """Deterministic schema formatter, not a model or an image understanding claim."""
    payload = json.loads(messages[-1]['content'][0]['text'])
    refs = payload['references']
    tags = ' '.join(ref['tag'] for ref in refs)
    definitions = '\n'.join(ref['tag'] + (f" from <Picture {ref['picture_idx']}>" if ref.get('subject_idx') else '') + ': attached ' + ref.get('role', 'custom') for ref in refs) or 'No connected subjects.'
    body = '[Shot 1] ' + payload['brief'] + (' Connected guidance: ' + tags if tags else '')
    fields = promptwriter.REF_FIELDS if payload['mode'] == 'refs' else promptwriter.FIELDS
    values = {'subject_definitions': definitions, 'summary': payload['brief'],
              'retention_analysis': '\n'.join(ref['tag'] + ': weak_reference, apply only the requested ' + ref.get('role', 'custom') + ' guidance.' for ref in refs) or 'No references.',
              'detailed_description': body, 'integrated_multimodal_description': body,
              'overall_soundscape': 'No invented dialogue. Follow only the supplied sound instructions.',
              'non_diegetic_music': 'No added music.'}
    return '\n\n'.join(field + ':\n' + values[field] for field in fields)


def create_app(storage):
    storage = pathlib.Path(storage).resolve()
    inputs, outputs, fixtures = storage / 'input', storage / 'output' / 'video', storage / 'fixtures'
    for directory in (inputs, outputs, fixtures): directory.mkdir(parents=True, exist_ok=True)
    captured = []
    pending_settings = {}
    history = {}
    queue_state = {'external': False, 'hold': False, 'deleted': [], 'interrupts': 0}
    pending = {}
    sockets = set()
    foreign_job = [0, 'simulated_foreign_project', {}, {'client_id': 'foreign-client'}, []]
    metadata_path = storage / 'gallery.json'
    metadata = json.loads(metadata_path.read_text()) if metadata_path.exists() else {}
    for index, color in enumerate(['#234e70', '#3e355b', '#24534c', '#624933']):
        filename = f'h3_studio_{index + 1:012x}_00001_.mp4'
        thumbnail = fixtures / (filename + '.jpg')
        if not thumbnail.exists():
            image = Image.new('RGB', (640, 352), color)
            draw = ImageDraw.Draw(image); draw.text((32, 38), 'SIMULATED STUDIO CLIP', fill='white'); draw.text((32, 64), 'CPU preview - no H3 model output', fill='white')
            image.save(thumbnail)
        if not (outputs / filename).exists():
            subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-loop', '1', '-i', str(thumbnail), '-f', 'lavfi', '-i', 'anullsrc=r=32000:cl=mono', '-t', '6', '-r', '24', '-c:v', 'libx264', '-preset', 'ultrafast', '-threads', '2', '-pix_fmt', 'yuv420p', '-c:a', 'aac', str(outputs / filename)], check=True)
        metadata.setdefault(filename, {'simulation': True, 'settings': {'mode': 'text', 'model': 'H3 FL2VA · simulated', 'canvas': '1280×704', 'render_method': 'native', 'steps': 20, 'seed': index + 42, 'loras': [], 'prompt': 'Local simulation preview. No model inference.'}})
    shutil.copy2(outputs / 'h3_studio_000000000001_00001_.mp4', fixtures / 'motion.mp4')
    Image.new('RGB', (1280, 704), (35, 65, 98)).save(fixtures / 'reference.png')
    Image.new('L', (1280, 704), 255).save(fixtures / 'mask.png')
    def save(): metadata_path.write_text(json.dumps(metadata, indent=2), encoding='utf-8')
    save()
    # Patches apply only inside this dedicated simulator process.
    promptwriter.studio_provider_status = lambda: {'configured': True, 'model': 'SIMULATED deterministic formatter', 'simulation': True, 'reason': 'No provider/model connection.'}
    promptwriter.studio_chat = mock_chat
    from h3_lab.control_preprocess import preprocessor_status
    lab_routes.check_capabilities = lambda *args: {**CAPS, 'control_preprocessors': preprocessor_status()}

    class SimulatedComfy:
        async def submit_prompt(self, spec, extra_data):
            prompt_id = 'simulation_' + uuid.uuid4().hex
            graph = spec['workflow']; captured.append({'prompt_id': prompt_id, 'prompt': graph, 'render_spec': spec, 'simulation': True})
            (storage / 'captured_graphs.json').write_text(json.dumps(captured, indent=2), encoding='utf-8')
            node_id, node = next((key, value) for key, value in graph.items() if value['class_type'] == 'H3SaveVideo')
            prefix = node['inputs'].get('filename_prefix', node['inputs'].get('prefix', 'video/h3_studio_' + extra_data['h3_lab_request_id']))
            filename = pathlib.PurePosixPath(prefix).name + '_00001_.mp4'
            shutil.copy2(fixtures / 'motion.mp4', outputs / filename)
            shutil.copy2(fixtures / 'h3_studio_000000000001_00001_.mp4.jpg', fixtures / (filename + '.jpg'))
            metadata[filename] = {'simulation': True, 'settings': pending_settings.get(extra_data['h3_lab_request_id'])}; save()
            history[prompt_id] = {'prompt': [0, prompt_id, graph, extra_data], 'outputs': {str(node_id): {'videos': [{'filename': filename, 'subfolder': 'video', 'type': 'output'}]}}, 'status': {'completed': True, 'status_str': 'success'}}
            if queue_state['hold']:
                pending[prompt_id] = [len(captured), prompt_id, graph, extra_data, []]
            return {'prompt_id': prompt_id, 'number': len(captured)}
        async def get_queue(self): return {'queue_running': [foreign_job] if queue_state['external'] else [], 'queue_pending': list(pending.values())}
        async def get_history(self, prompt_id=None):
            completed = {key: value for key, value in history.items() if key not in pending}
            return {prompt_id: completed[prompt_id]} if prompt_id in completed else completed if prompt_id is None else {}
        async def delete_from_queue(self, ids):
            for prompt_id in ids:
                queue_state['deleted'].append(prompt_id)
                if pending.pop(prompt_id, None):
                    record = history.pop(prompt_id, {})
                    for output in record.get('outputs', {}).values():
                        for file in output.get('videos', []):
                            metadata.pop(file['filename'], None); (outputs / file['filename']).unlink(missing_ok=True)
                    save()
            return {'ok': True}
        async def interrupt(self):
            queue_state['interrupts'] += 1
            return {'ok': True}

    @web.middleware
    async def simulation(request, handler):
        path = request.path
        if path in ('/', '/extensions/h3_studio/index.html'):
            html = (ROOT / 'web' / 'index.html').read_text(encoding='utf-8')
            banner = '<div id="simulationBanner" role="status" style="padding:8px 18px;background:#253f5c;color:#e4f0ff;font:14px/1.4 Segoe UI,sans-serif">LOCAL SIMULATION · Mock prompt provider, mocked GPU readiness and synthetic clips. No AI model has run.</div>'
            html = html.replace('<body>', '<body>' + banner).replace('</head>', '<style>.shell{height:calc(100dvh - 98px)}.result-label:before{content:"SIMULATION · ";color:#84b8ff;font-size:11px}@media(max-width:720px){.shell{height:auto}}</style></head>')
            return web.Response(text=html, content_type='text/html')
        if path == '/system_stats': return web.json_response({'devices': [{'name': 'LOCAL CPU SIMULATOR · no GPU'}]})
        if path == '/h3_studio/readiness': return web.json_response({'simulation': True, 'models': MODELS, 'nodes': dict.fromkeys(NODES, True), 'quality': {'h3_vae_tile_fix': True}, 'system_ram_limit_gb': 128})
        if path == '/h3_studio/loras': return web.json_response({'items': ['Motion_Repair_V2.safetensors', 'Combat_V2.safetensors', 'Realism_People.safetensors'], 'simulation': True})
        if path == '/h3_studio/library': return web.json_response({'items': [{'filename': name, 'subfolder': 'video', 'type': 'output', **data} for name, data in reversed(list(metadata.items()))], 'simulation': True})
        if path == '/h3_studio/thumbnail': return web.FileResponse(owned_path(fixtures, request.query['filename'] + '.jpg'))
        if path == '/view': return web.FileResponse(owned_path(storage / 'output', request.query.get('subfolder', 'video') + '/' + request.query['filename']))
        if path == '/h3_studio/upload_ref':
            reader = await request.multipart(); field = await reader.next()
            data = await field.read(); kind = request.query.get('kind', 'image')
            name = 'h3_studio_kf_' + uuid.uuid4().hex + pathlib.Path(field.filename).suffix
            destination = inputs / name; destination.write_bytes(data)
            if kind == 'video' and request.query.get('trim_duration'):
                trimmed = inputs / ('h3_studio_kf_trim_' + uuid.uuid4().hex + '.mp4')
                subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-ss', request.query.get('trim_start', '0'), '-i', str(destination), '-t', request.query['trim_duration'], '-vf', 'fps=24', '-c:v', 'libx264', '-preset', 'ultrafast', '-threads', '2', '-c:a', 'aac', '-y', str(trimmed)], capture_output=True, check=True, timeout=60)
                destination.unlink(); destination = trimmed; name = trimmed.name
            info = {'name': name, 'kind': kind}
            if kind == 'image':
                with Image.open(destination) as image: info.update(width=image.width, height=image.height)
            else:
                media = probe(destination); video = next((stream for stream in media['streams'] if stream['codec_type'] == 'video'), None)
                duration = float(media['format']['duration'])
                info.update(duration=duration, has_audio=any(s['codec_type'] == 'audio' for s in media['streams']))
                if video: info.update(width=video['width'], height=video['height'], fps=24, frame_count=int(video.get('nb_frames', round(duration * 24))))
            return web.json_response(info)
        if path == '/h3_studio/register_job':
            body = await request.json(); pending_settings[body['token']] = body.get('settings'); return web.json_response({'ok': True})
        if path in ('/h3_studio/settings', '/h3_studio/details', '/h3_studio/track'):
            body = await request.json(); name = body['filename']; metadata.setdefault(name, {})['settings'] = body['settings']; save(); return web.json_response({'ok': True})
        if path == '/h3_studio/verify_video': return web.json_response({'ok': True, 'has_video': True, 'has_audio': True, 'simulation': True})
        if path == '/__captured': return web.json_response(captured)
        if path == '/__simulation/control_file_info':
            from h3_lab.control import video_metadata
            from PIL import ImageChops
            file = owned_path(inputs, request.query['filename'])
            frame = subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-i', str(file), '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1'], capture_output=True, check=True, timeout=30).stdout
            with Image.open(io.BytesIO(frame)) as image:
                red, green, blue = image.convert('RGB').split()
                gray = ImageChops.difference(red, green).getbbox() is None and ImageChops.difference(red, blue).getbbox() is None
                extrema = red.getextrema()
            return web.json_response({**video_metadata(file), 'sha256': hashlib.sha256(file.read_bytes()).hexdigest(), 'grayscale': gray, 'pixel_range': extrema})
        if path == '/__simulation/mask_info':
            file = owned_path(inputs, request.query['filename'])
            with Image.open(file) as image:
                values = sorted(set(image.convert('L').getdata()))
                return web.json_response({'width': image.width, 'height': image.height, 'values': values})
        if path == '/__simulation/queue':
            if request.method == 'POST':
                body = await request.json()
                for key in ('external', 'hold'):
                    if key in body: queue_state[key] = bool(body[key])
                if not queue_state['hold']: pending.clear()
            return web.json_response({**queue_state, **await comfy.get_queue()})
        if path == '/__simulation/event':
            body = await request.json()
            for socket in list(sockets):
                if not socket.closed: await socket.send_json(body)
            return web.json_response({'ok': True, 'clients': len(sockets)})
        if path == '/queue':
            if request.method == 'POST': await comfy.delete_from_queue((await request.json()).get('delete', []))
            return web.json_response(await comfy.get_queue())
        if path == '/interrupt': return web.json_response(await comfy.interrupt())
        if path.startswith('/history'): return web.json_response(await comfy.get_history(path.removeprefix('/history/') if path.startswith('/history/') else None))
        if path == '/ws':
            ws = web.WebSocketResponse(); await ws.prepare(request)
            sockets.add(ws)
            try:
                async for message in ws: pass
            finally: sockets.discard(ws)
            return ws
        if path == '/object_info/MiniMaxH3AddGuide': return web.json_response({'MiniMaxH3AddGuide': {'input': {'required': {}, 'optional': {}}}})
        if path.startswith('/h3_studio/') and not path.startswith('/h3_studio/lab/'):
            return web.json_response({'ok': True, 'simulation': True})
        return await handler(request)

    app = web.Application(middlewares=[simulation], client_max_size=550 * 1024 * 1024)
    comfy = SimulatedComfy()
    lab_routes.register_lab_routes(app, str(storage), input_root=inputs, output_root=storage / 'output', comfy_client=comfy)
    app.router.add_static('/__fixtures/', fixtures)
    app.router.add_static('/extensions/h3_studio/', ROOT / 'web', show_index=True)
    return app


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=18772)
    parser.add_argument('--storage', default=str(ROOT / '.studio-preview'))
    options = parser.parse_args()
    print(f'LOCAL SIMULATION at http://127.0.0.1:{options.port}/extensions/h3_studio/index.html — no GPU or provider calls.', flush=True)
    web.run_app(create_app(options.storage), host='127.0.0.1', port=options.port, print=None)
