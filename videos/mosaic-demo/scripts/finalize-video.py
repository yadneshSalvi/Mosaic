#!/usr/bin/env python3
"""Normalize the rendered mix without re-encoding video; write delivery evidence."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess


def run(args):
    return subprocess.run(args, check=True, capture_output=True, text=True)


def measure(path):
    result = run(['ffmpeg', '-hide_banner', '-i', str(path), '-vn', '-af',
                  'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'])
    return json.loads(re.findall(r'\{[^{}]*"input_i"[^{}]*\}', result.stderr, re.S)[-1])


parser = argparse.ArgumentParser()
parser.add_argument('input', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
if args.input.resolve() == args.output.resolve():
    parser.error('Input and delivery paths must differ.')
args.output.parent.mkdir(parents=True, exist_ok=True)
before = measure(args.input)
audio_filter = (f'loudnorm=I=-16:TP=-1.5:LRA=11:measured_I={before["input_i"]}'
                f':measured_TP={before["input_tp"]}:measured_LRA={before["input_lra"]}'
                f':measured_thresh={before["input_thresh"]}:offset={before["target_offset"]}'
                ':linear=true:print_format=json')
run(['ffmpeg', '-y', '-hide_banner', '-i', str(args.input), '-map', '0:v:0', '-map', '0:a:0',
     '-c:v', 'copy', '-af', audio_filter, '-c:a', 'aac', '-b:a', '256k', '-ar', '48000',
     '-movflags', '+faststart', str(args.output)])
after = measure(args.output)
probe = json.loads(run(['ffprobe', '-v', 'error', '-show_format', '-show_streams',
                        '-of', 'json', str(args.output)]).stdout)
video = next(s for s in probe['streams'] if s['codec_type'] == 'video')
audio = next(s for s in probe['streams'] if s['codec_type'] == 'audio')
assert 160 < float(probe['format']['duration']) < 180, 'Unexpected submission duration'
assert (video['width'], video['height']) == (1920, 1080)
assert video['avg_frame_rate'] == '60/1'
assert video['pix_fmt'] == 'yuv420p'
assert abs(float(after['input_i']) + 16) < 0.5
assert float(after['input_tp']) <= -1.0
# Decode every frame and inspect for black intervals, including transition boundaries.
decode = run(['ffmpeg', '-hide_banner', '-v', 'info', '-i', str(args.output), '-an',
              '-vf', 'blackdetect=d=0.1:pix_th=0.05:pic_th=0.98', '-f', 'null', '-'])
black = [line for line in decode.stderr.splitlines() if 'black_start:' in line]
assert not black, f'Unexpected black intervals: {black}'
report = {
    'file': args.output.name, 'bytes': args.output.stat().st_size,
    'sha256': hashlib.sha256(args.output.read_bytes()).hexdigest(),
    'duration_seconds': float(probe['format']['duration']),
    'video': {k: video.get(k) for k in ['codec_name', 'width', 'height', 'pix_fmt',
                                      'avg_frame_rate', 'nb_frames', 'duration']},
    'audio': {k: audio.get(k) for k in ['codec_name', 'sample_rate', 'channels', 'duration']},
    'loudness_before': before, 'loudness_after': after,
    'all_frames_decoded': True, 'black_intervals': black,
    'method': 'Two-pass audio loudness normalization; video stream copied unchanged.'
}
report_path = args.output.with_suffix('.qa.json')
report_path.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'output': str(args.output), 'duration': report['duration_seconds'],
                  'LUFS': after['input_i'], 'true_peak_dBTP': after['input_tp'],
                  'all_frames_decoded': True, 'report': str(report_path)}, indent=2))
