"""Small CPU-only brightness diagnostics; never repair or certify a generated take."""
import math
import pathlib
import statistics
import subprocess
from .assembly import get_ffmpeg_path

WARNINGS = [
    'Brightness periodicity is only a suspected artifact; intentional lighting can produce the same signal.',
    'This check cannot rule out local pixel shimmer, seams, identity drift, or other visual defects.',
    'Only the first 362 frames, sampled at 24 fps, are analyzed. Watch the take to judge quality.',
]


def detect_luma_flicker(luma):
    values = [float(x) for x in luma]
    if len(values) > 362 or any(not math.isfinite(x) or not 0 <= x <= 255 for x in values):
        raise ValueError('Expected at most 362 finite grayscale frame means')
    differences = [values[i + 1] - values[i] for i in range(len(values) - 1)]
    # Large luma jumps are scene-cut candidates, not evidence of flicker.
    cuts = [i for i, value in enumerate(differences) if abs(value) >= 28]
    excluded = {j for i in cuts for j in range(max(0, i - 2), min(len(differences), i + 3))}
    usable = [x for i, x in enumerate(differences) if i not in excluded]
    center = statistics.median(usable) if usable else 0
    residual = [x - center for x in differences]
    lag = 17
    pairs = [(residual[i], residual[i + lag]) for i in range(max(0, len(residual) - lag))
             if i not in excluded and i + lag not in excluded]
    numerator = sum(a * b for a, b in pairs)
    denominator = math.sqrt(sum(a * a for a, _ in pairs) * sum(b * b for _, b in pairs))
    correlation = numerator / denominator if denominator > 1e-9 else 0
    repeating_edges = sum(abs(a) >= 1.5 and abs(b) >= 1.5 and a * b > 0 for a, b in pairs)
    rms = math.sqrt(sum((x - center) ** 2 for x in usable) / len(usable)) if usable else 0
    suspected = len(values) >= 69 and correlation >= .55 and repeating_edges >= 6 and rms >= .65
    findings = []
    if suspected:
        findings.append({'kind': 'suspected_periodic_brightness_flicker', 'period_frames': lag,
                         'period_seconds': lag / 24,
                         'message': 'Brightness changes repeat near a 17-frame interval. Review playback; this is not a confirmed model artifact.'})
    return {'status': 'review' if suspected else 'no_periodic_flicker_detected',
            'findings': findings, 'metrics': {'analyzed_frames': len(values), 'analysis_fps': 24,
                'mean_luma': statistics.mean(values) if values else None,
                'min_luma': min(values) if values else None, 'max_luma': max(values) if values else None,
                'difference_rms': rms, 'lag_17_correlation': correlation,
                'repeating_edges': repeating_edges, 'scene_cut_candidates': len(cuts),
                'excluded_difference_samples': len(excluded)}, 'warnings': list(WARNINGS)}


def analyze_quality(path):
    source = pathlib.Path(path)
    if not source.is_file():
        raise FileNotFoundError('Generated take was not found')
    # Decode one tiny grayscale plane per frame; raw output stays below 232 KB.
    result = subprocess.run([get_ffmpeg_path(), '-nostdin', '-v', 'error', '-threads', '2',
        '-i', str(source), '-t', '15.2', '-map', '0:v:0', '-an', '-vf',
        'fps=24,scale=32:20:flags=area,format=gray', '-frames:v', '362',
        '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1'], capture_output=True, check=True, timeout=60)
    frame_size = 32 * 20
    if not result.stdout or len(result.stdout) % frame_size or len(result.stdout) > frame_size * 362:
        raise ValueError('Take could not be decoded into bounded diagnostic frames')
    means = [sum(result.stdout[i:i + frame_size]) / frame_size
             for i in range(0, len(result.stdout), frame_size)]
    return detect_luma_flicker(means)
