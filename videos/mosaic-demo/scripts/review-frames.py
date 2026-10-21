#!/usr/bin/env python3
"""Extract real encoded frames, including both sides of every chapter cut."""
import argparse
import json
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw

parser = argparse.ArgumentParser()
parser.add_argument('video', type=Path)
parser.add_argument('--at', default='')
args = parser.parse_args()
project = Path(__file__).resolve().parents[1]
meta = json.loads((project / 'audio_meta.json').read_text())
duration = meta['total_duration_s']
times = {0.1, duration - 0.1}
times.update(range(8, int(duration), 10))
for act in meta['voices'][1:]:
    times.update([act['act_start_s'] - 0.05, act['act_start_s'] + 0.05])
times.update(float(value) for value in args.at.split(',') if value)
times = sorted(t for t in times if 0 <= t < duration)
output = args.video.parent / (args.video.stem + '-review')
output.mkdir(parents=True, exist_ok=True)
frames = []
for index, seconds in enumerate(times):
    target = output / f'{index:02d}-{seconds:07.3f}s.jpg'
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-ss', str(seconds), '-i', str(args.video),
                    '-frames:v', '1', '-q:v', '2', str(target)], check=True)
    frames.append((seconds, target))
for offset in range(0, len(frames), 12):
    page = frames[offset:offset + 12]
    sheet = Image.new('RGB', (1200, 248 * ((len(page) + 2) // 3)), '#e6e4df')
    draw = ImageDraw.Draw(sheet)
    for index, (seconds, target) in enumerate(page):
        picture = Image.open(target).convert('RGB')
        picture.thumbnail((400, 225))
        x, y = (index % 3) * 400, (index // 3) * 248
        sheet.paste(picture, (x, y + 23))
        draw.text((x + 8, y + 5), f'{seconds:.3f}s — encoded MP4', fill='#111111')
    sheet.save(output / f'contact-{offset // 12 + 1}.jpg', quality=92)
(output / 'times.json').write_text(json.dumps(times, indent=2) + '\n')
print(json.dumps({'frames': len(frames), 'output': str(output)}))
