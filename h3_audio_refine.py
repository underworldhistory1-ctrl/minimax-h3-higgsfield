"""Exact video protection for a native H3 audio-only sampling pass.

Uses the published AudioRefine per-stream masking approach (MIT; see
docs/licenses/H3-AudioRefine-MIT.txt). No approximation cache or extra weights.
"""
import torch


def streams(latent):
    samples = latent.get('samples')
    if not getattr(samples, 'is_nested', False):
        raise ValueError('Audio enhancement requires packed MiniMax H3 video/audio latents')
    parts = samples.unbind()
    if len(parts) != 2 or parts[0].ndim != 5 or parts[1].ndim != 4 or parts[1].shape[2] != 2:
        raise ValueError('Invalid MiniMax H3 audio/video stream shapes')
    return parts


class H3AudioRefineMask:
    CATEGORY = 'H3 Studio/audio'
    FUNCTION = 'apply'
    RETURN_TYPES = ('LATENT',)

    @classmethod
    def INPUT_TYPES(cls):
        return {'required': {'latent': ('LATENT',), 'preserve_frames': ('INT', {'default': 0, 'min': 0, 'max': 362})}}

    def apply(self, latent, preserve_frames=0):
        from comfy.nested_tensor import NestedTensor
        video, audio = streams(latent)
        if type(preserve_frames) is not int or not 0 <= preserve_frames <= 362:
            raise ValueError('Invalid preserved continuation frame count')
        video_mask = torch.zeros((1, 1, *video.shape[2:]), dtype=torch.float32)
        audio_mask = torch.ones((1, 1, *audio.shape[2:]), dtype=torch.float32)
        ticks = round(preserve_frames * 40 / 24)
        if ticks >= audio.shape[-1] and ticks:
            raise ValueError('Continuation occupies all audio; no new audio to enhance')
        audio_mask[..., :ticks] = 0
        out = latent.copy()
        out['noise_mask'] = NestedTensor((video_mask, audio_mask))
        return (out,)


class H3AudioRestoreVideo:
    CATEGORY = 'H3 Studio/audio'
    FUNCTION = 'restore'
    RETURN_TYPES = ('LATENT',)

    @classmethod
    def INPUT_TYPES(cls):
        return {'required': {'source': ('LATENT',), 'refined': ('LATENT',), 'preserve_frames': ('INT', {'default': 0, 'min': 0, 'max': 362})}}

    def restore(self, source, refined, preserve_frames=0):
        from comfy.nested_tensor import NestedTensor
        video, original_audio = streams(source)
        refined_video, audio = streams(refined)
        if video.shape != refined_video.shape or original_audio.shape != audio.shape:
            raise ValueError('Audio enhancement changed AV dimensions')
        if type(preserve_frames) is not int or not 0 <= preserve_frames <= 362:
            raise ValueError('Invalid preserved continuation frame count')
        ticks = round(preserve_frames * 40 / 24)
        if ticks >= audio.shape[-1] and ticks:
            raise ValueError('Continuation occupies all audio')
        if not torch.isfinite(audio).all():
            raise ValueError('Audio enhancement produced non-finite samples')
        if ticks:
            audio = audio.clone()
            audio[..., :ticks] = original_audio[..., :ticks].to(audio.device, audio.dtype)
        out = refined.copy()
        out.pop('noise_mask', None)
        out['samples'] = NestedTensor((video, audio))
        return (out,)


NODE_CLASS_MAPPINGS = {'H3StudioAudioRefineMask': H3AudioRefineMask, 'H3StudioAudioRestoreVideo': H3AudioRestoreVideo}
