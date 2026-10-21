# Mosaic submission film

A roughly 2:45, 1920×1080, 60 fps product demonstration, built from actual local software captures and actual exported artifacts. The fictional example is identified on screen. The edit is synchronized to real Deepgram word timestamps from Gemini 3.1 Flash TTS narration. Music and sound effects are original deterministic code synthesis.

The story is locked in [SCRIPT.md](SCRIPT.md), with [STORYBOARD.md](STORYBOARD.md), [capture provenance](capture/provenance.md), and [audio production notes](audio-production.md). [transcript.srt](transcript.srt) is a separate caption file; the film keeps the interface clear of burned-in narration.

## Watch and reproduce

Final local delivery: `renders/mosaic-submission.mp4`. Large renders, source screencast frames, WAV intermediates, preview caches and credentials are intentionally excluded from Git. The committed capture clips, high-resolution stills, actual outputs, local fonts, FLAC audio stems and composition source are sufficient to render without API calls. Attribution is in `assets/licenses/`.

From this directory:

```sh
npm ci
npm run stage:vendor
npm run build:video
npm run carve:audio
npx --yes hyperframes@0.8.181 check --snapshots
npx --yes hyperframes@0.8.181 preview --background --port 4173 --no-open
npx --yes hyperframes@0.8.181 render --fps 60 --quality delivery --workers 3 --strict --output renders/mosaic-render.mp4
python3 scripts/finalize-video.py renders/mosaic-render.mp4 renders/mosaic-submission.mp4
```

The Studio project is at `http://127.0.0.1:4173/#project/mosaic-demo` while its managed preview is running. To stop it, run `npx --yes hyperframes@0.8.181 preview --stop` from this directory.

`finalize-video.py` uses two-pass loudness normalization (target −16 LUFS, −1.5 dBTP) while copying the rendered video stream unchanged. It checks duration, 1080p/60 fps delivery, audio levels, a complete decode and black intervals, and writes a JSON report beside the MP4. Python 3 and ffmpeg/ffprobe are required.

Regenerating narration is optional and incurs provider calls. See `audio-production.md`; never put API keys into composition HTML or Git. The public assets are already frozen for reproducible rendering.

## Submission handoff

The MP4 and SRT are ready for a public YouTube or Vimeo upload after final review. A local video file is not a Devpost video URL. [Hackathon rules](https://learn-ai-basics.devpost.com/rules) require an under-three-minute demonstration and a public YouTube/Vimeo link. No upload or hackathon submission is performed by the rendering scripts.
