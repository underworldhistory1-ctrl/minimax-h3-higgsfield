"""Bounded, owned-media preparation for the local promptwriter provider."""
import base64
import copy
import hashlib
import io
import json
import pathlib
import re
import subprocess
from PIL import Image, ImageOps
from .paths import owned_path

try:
    from .. import promptwriter
except ImportError:
    import promptwriter


def probe(path):
    result = subprocess.run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(path)],
                            capture_output=True, timeout=20)
    if result.returncode:
        raise ValueError('Cannot inspect reference media.')
    return json.loads(result.stdout)


def picture_part(path=None, data=None):
    with Image.open(path if path else io.BytesIO(data)) as source:
        image=ImageOps.exif_transpose(source).convert('RGB')
        image.thumbnail((768,768))
        buffer=io.BytesIO();image.save(buffer,format='JPEG',quality=82)
    return {'type':'image_url','image_url':{'url':'data:image/jpeg;base64,'+base64.b64encode(buffer.getvalue()).decode()}}


class PromptContextService:
    def __init__(self, input_root, *, writer=None):
        self.input_root=pathlib.Path(input_root).resolve()
        self.writer=writer or promptwriter.prepare_studio_context
        self.cache={}

    def prepare(self, incoming):
        spec=copy.deepcopy(incoming)
        if not isinstance(spec,dict): raise ValueError('Preparation request must be an object.')
        mode=spec.get('mode','text')
        refs=spec.get('references',[]) if mode=='refs' else []
        if not isinstance(refs,list) or len(refs)>12: raise ValueError('Invalid references.')
        if mode=='refs' and not refs: raise ValueError('References mode requires attached media.')
        if mode=='frames':
            frames=spec.get('frames',{})
            if not isinstance(frames,dict): raise ValueError('Frames must be an object.')
            frames={**frames,'start':frames.get('start') or frames.get('first'),'end':frames.get('end') or frames.get('last')}
            frames={key:(value.get('filename') or value.get('file') if isinstance(value,dict) else value) for key,value in frames.items()}
            refs=[{'alias':slot,'kind':'image','role':'frame','filename':frames[slot]} for slot in ('start','end') if frames.get(slot)]
            if not refs: raise ValueError('Frames mode requires a start or end image.')
        if any(not isinstance(r,dict) or r.get('kind') not in ('image','video','audio') for r in refs): raise ValueError('Invalid reference type.')
        if any(sum(r['kind']==kind for r in refs)>limit for kind,limit in (('image',9),('video',3),('audio',3))):
            raise ValueError('Reference count exceeds H3 limits.')
        if sum(r['kind']=='audio' or r['kind']=='video' and bool(r.get('use_audio')) for r in refs)>3:
            raise ValueError('Too many audio references including soundtracks.')
        length=spec.get('target_frames',362)
        if type(length) is not int or length<124 or length>362 or (length-5)%17:
            raise ValueError('Select a supported H3 duration before preparation.')
        parts=[];bindings=[];hashes=[];aliases=set();pic=sub=vid=aud=0
        for ref in sorted(refs,key=lambda r:('image','video','audio').index(r['kind'])):
            alias=ref.get('alias','')
            if not isinstance(alias,str) or not re.fullmatch(r'[\w-]{1,32}',alias) or alias in aliases:
                raise ValueError('Invalid or duplicate reference name.')
            aliases.add(alias)
            name=ref.get('filename','')
            if not isinstance(name,str) or not pathlib.PurePosixPath(name).name.startswith('h3_studio_kf_'):
                raise ValueError('Only uploaded Studio input files may be prepared.')
            path=owned_path(self.input_root,name)
            max_bytes={'image':25,'video':500,'audio':100}[ref['kind']]*1024*1024
            if path.stat().st_size>max_bytes or not path.stat().st_size: raise ValueError('Reference file is empty or too large.')
            digest=hashlib.sha256()
            with path.open('rb') as stream:
                for chunk in iter(lambda:stream.read(1024*1024),b''): digest.update(chunk)
            hashes.append(digest.hexdigest())
            binding={k:ref.get(k) for k in ('alias','kind','role','instruction','audio_transcript') if ref.get(k) is not None}
            role=str(ref.get('role','custom')).lower().strip()
            if ref['kind']=='image':
                pic+=1;binding['picture_idx']=pic
                if mode=='frames' or role in ('custom','storyboard'):
                    binding['tag']=f'<Picture {pic}>'
                else:
                    sub+=1;binding.update(tag=f'<Subject {sub}>',subject_idx=sub)
                parts.append({'type':'text','text':f'<Picture {pic}> (@{alias}, {role})'})
                parts.append(picture_part(path))
            elif ref['kind']=='video':
                metadata=probe(path)
                video=next((s for s in metadata['streams'] if s.get('codec_type')=='video'),None)
                if not video: raise ValueError('Reference lacks video.')
                numerator,denominator=video.get('avg_frame_rate','0/1').split('/')
                fps=float(numerator)/float(denominator or 1)
                if abs(fps-24)>.02: raise ValueError('Prepare uploaded video normalized to 24 fps first.')
                duration=float(video.get('duration') or metadata.get('format',{}).get('duration') or 0)
                if not 1.9<=duration<=15.1: raise ValueError('Reference video must be 2–15 seconds.')
                source_frames=int(video.get('nb_frames') or round(duration*24))
                used=5+17*((min(length,source_frames)-5)//17)
                if used<5: raise ValueError('Reference is too short.')
                vid+=1;binding.update(tag=f'<Video {vid}>',video_idx=vid,effective_seconds=used/24,used_frames=used)
                if ref.get('use_audio'):
                    if not any(s.get('codec_type')=='audio' for s in metadata['streams']): raise ValueError('Selected video has no soundtrack.')
                    aud+=1;binding['paired_audio_tag']=f'<Audio {aud}>'
                samples=6
                for index in range(samples):
                    timestamp=(used-1)/24*index/(samples-1)
                    frame=subprocess.run(['ffmpeg','-v','error','-ss',str(timestamp),'-i',str(path),'-frames:v','1','-vf','scale=768:768:force_original_aspect_ratio=decrease','-f','image2pipe','-vcodec','mjpeg','pipe:1'],capture_output=True,timeout=15)
                    if frame.returncode or not frame.stdout: raise ValueError('Cannot extract video reference frames.')
                    parts.append({'type':'text','text':f'<Video {vid}> (@{alias}) sample at {timestamp:.3f}s of {used/24:.3f}s usable span'})
                    parts.append(picture_part(data=frame.stdout))
            else:
                metadata=probe(path)
                if not any(s.get('codec_type')=='audio' for s in metadata.get('streams',[])): raise ValueError('Reference lacks audio.')
                aud+=1;binding.update(tag=f'<Audio {aud}>',audio_idx=aud)
                parts.append({'type':'text','text':f'<Audio {aud}> (@{alias}): audio attached to H3, not listened to by this preparation provider. User transcript: '+str(ref.get('audio_transcript','Not supplied.'))})
            bindings.append(binding)
        spec['bindings']=bindings
        # Filename is intentionally excluded: content+intent determines cache identity.
        cache_spec=copy.deepcopy(spec)
        for ref in cache_spec.get('references',[]): ref.pop('filename',None)
        key=hashlib.sha256(json.dumps({'spec':cache_spec,'media_hashes':hashes,'provider':promptwriter.studio_provider_status()},ensure_ascii=False,sort_keys=True).encode()).hexdigest()
        if key in self.cache: return copy.deepcopy(self.cache[key])
        result=self.writer(spec,parts)
        result.update(fingerprint=key,media_hashes=hashes)
        if len(self.cache)>=8: self.cache.pop(next(iter(self.cache)))
        self.cache[key]=copy.deepcopy(result)
        return result
