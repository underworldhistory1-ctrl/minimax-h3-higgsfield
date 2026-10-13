"""Spatial enlargement of an existing take, without another diffusion run."""

import os
import pathlib
import subprocess
import uuid
import tempfile
import threading
import hashlib
from fractions import Fraction

from .assembly import get_ffmpeg_path, inspect_media


def upscale_take(source, destination, target="2x", progress=None):
    """Keep frame order/timing, aspect ratio and compressed audio; verify before publish."""
    report = progress or (lambda **fields: None)
    report(status="preparing", progress_percent=0)
    targets = {"2x": None, "1080": 1080, "1440": 1440}
    if not isinstance(target, str) or target not in targets:
        raise ValueError("Upscale target must be 2x, 1080 or 1440")
    original = inspect_media(str(source))
    streams = original.get("streams", [])
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    if not video:
        raise ValueError("Source has no video stream")
    rotations = [video.get("tags", {}).get("rotate", 0)] + [s.get("rotation", 0) for s in video.get("side_data_list", [])]
    if any(float(angle) % 360 for angle in rotations):
        raise ValueError("Normalize rotated video before exporting an enlarged take")
    width, height = int(video["width"]), int(video["height"])
    if width < 2 or height < 2:
        raise ValueError("Invalid source dimensions")
    multiplier = 2 if target == "2x" else targets[target] / min(width, height)
    if multiplier <= 1:
        raise ValueError("Choose a target larger than the source video")
    # Even H.264 dimensions, no crop, padding or aspect-ratio stretch.
    out_width, out_height = (int(round(x * multiplier / 2)) * 2 for x in (width, height))
    if max(out_width, out_height) > 8192 or out_width * out_height > 33554432:
        raise ValueError("Upscale exceeds the supported export canvas")
    count = int(video.get("nb_read_frames") or video.get("nb_frames") or 0)
    if count <= 0:
        raise ValueError("Could not verify source frame count")
    destination = pathlib.Path(destination)
    temporary = destination.with_name(destination.stem + "." + uuid.uuid4().hex + ".part.mp4")
    command = [get_ffmpeg_path(), "-nostdin", "-v", "error", "-y", "-threads", "2",
        "-i", str(source), "-map", "0:v:0", "-map", "0:a:0?",
        "-vf", f"scale={out_width}:{out_height}:flags=lanczos",
        "-filter_threads", "1", "-c:v", "libx264", "-threads", "2",
        "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p",
        "-fps_mode", "passthrough", "-c:a", "copy", "-movflags", "+faststart", str(temporary)]
    try:
        report(status="encoding", frames_total=count, frames_done=0, progress_percent=0)
        command[1:1] = ["-progress", "pipe:1", "-nostats", "-stats_period", "0.5"]
        with tempfile.TemporaryFile(mode="w+b") as errors:
            process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=errors, text=True)
            timed_out = threading.Event()
            def timeout():
                timed_out.set(); process.kill()
            timer = threading.Timer(600, timeout); timer.daemon = True; timer.start()
            fields = {}
            try:
                for line in process.stdout:
                    key, separator, value = line.strip().partition("=")
                    if separator: fields[key] = value
                    if key == "progress":
                        done = min(count, max(0, int(fields.get("frame", 0))))
                        fps = float(fields.get("fps", 0))
                        report(status="encoding", frames_done=done, frames_total=count, progress_percent=round(95 * done / count, 1),
                            eta_seconds=round((count-done)/fps, 1) if fps > 0 and done < count else None)
                process.wait()
            finally:
                timer.cancel(); process.stdout.close()
                if process.poll() is None: process.kill(); process.wait()
            if timed_out.is_set(): raise ValueError("Video upscale timed out after 600 seconds")
            if process.returncode:
                errors.seek(0); raise ValueError("Video upscale failed: " + errors.read().decode(errors="replace")[-1200:])
        report(status="verifying", progress_percent=97, frames_done=count, frames_total=count, eta_seconds=None)
        media = inspect_media(str(temporary))
        output = next((s for s in media.get("streams", []) if s.get("codec_type") == "video"), {})
        if (output.get("width"), output.get("height")) != (out_width, out_height):
            raise ValueError("Export dimensions did not match the requested canvas")
        def display_ratio(stream):
            sar = stream.get("sample_aspect_ratio", "1:1")
            sar = Fraction(sar.replace(":", "/")) if sar not in ("N/A", "0:1") else Fraction(1)
            return Fraction(stream["width"], stream["height"]) * sar
        if abs(float(display_ratio(output) / display_ratio(video)) - 1) > .0001:
            raise ValueError("Upscale changed the display aspect ratio")
        if int(output.get("nb_read_frames") or output.get("nb_frames") or 0) != count:
            raise ValueError("Upscale changed the frame count")
        if Fraction(output.get("r_frame_rate", "0/1")) != Fraction(video.get("r_frame_rate", "0/1")):
            raise ValueError("Upscale changed the frame rate")
        if abs(float(output.get("duration", 0)) - float(video.get("duration", 0))) > .001:
            raise ValueError("Upscale changed the video duration")
        source_audio = next((s for s in streams if s.get("codec_type") == "audio"), None)
        output_audio = next((s for s in media.get("streams", []) if s.get("codec_type") == "audio"), None)
        if bool(source_audio) != bool(output_audio):
            raise ValueError("Upscale did not preserve the audio stream")
        if source_audio and abs(float(source_audio.get("duration", 0)) - float(output_audio.get("duration", 0))) > .001:
            raise ValueError("Upscale changed the audio duration")
        subprocess.run([get_ffmpeg_path(), "-nostdin", "-v", "error", "-threads", "2",
            "-i", str(temporary), "-f", "null", "-"], capture_output=True, check=True, timeout=600)
        digest = hashlib.sha256()
        with temporary.open('rb') as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b''): digest.update(chunk)
        os.replace(temporary, destination)
        return {"sha256": digest.hexdigest(), "verified": True, "verification": "dimensions_frames_fps_duration_aspect_audio_and_full_decode","width": out_width, "height": out_height, "frames": count,
            "fps": video["r_frame_rate"], "audio_preserved": bool(source_audio),
            "method": "lanczos_existing_take", "generation_performed": False}
    finally:
        temporary.unlink(missing_ok=True)
