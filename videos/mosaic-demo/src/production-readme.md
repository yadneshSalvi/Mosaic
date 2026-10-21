# Mosaic production source

This composition uses five 1920×1080 act sub-compositions at 60 fps and a 165.61-second final timeline. Every functional screen is actual captured software. The capture manifest preserves real source timestamps; high-resolution stills retain native 1600×1000 source coordinates while supplying 3200×2000 image pixels. The two export proof images are the actual emitted PNG files.

## Rebuild

```sh
npm ci
npm run stage:vendor
npm run build:video
npm run carve:audio
npm run check
```

`build:video` reads `capture/manifest.json`, `script.json` and final `audio_meta.json`; it writes `index.html`, the five files in `compositions/frames`, and `shotplan.json`. All 38 phrase cues match actual Deepgram word onsets, including split names and hyphenated words. With final audio present, any unmatched cue is a build failure. Every source event and camera pose is checked against its actual act window.

`carve:audio` uses the copied official HyperFrames carve helper with pinned `@hyperframes/core@0.8.181`. It writes native EQ and volume automation onto the music bed against the voiceover group. Re-run it after every build because rebuilding index.html intentionally replaces the derived attributes. Final stem paths are lossless FLAC. Stem volumes stay at 1; the delivery owner performs final summed-audio loudness normalization with `scripts/finalize-video.py`.

## Evidence and visual QA

The final native report is `.hyperframes/final-authoring-check.json`: zero lint errors, zero runtime errors, zero layout findings, and all 28 contrast checks passing. Its 15 reviewed warnings all identify nonzero nested media starts; those starts are intentionally composition-local, as the source contract requires, and were verified in assembled proof frames. No duplicate media discovery, timeline density or overlapping text findings remain.

Full-resolution delivery proof frames and contact sheets are in `.hyperframes/delivery-proof`. Exact proof moments include 129 seconds for the complete Withheld text; 147.3 seconds for the returned source region on exported pixels; 157.8 seconds for the native Needs review state; and 165.59 seconds for the final lockup. The one source world per act uses explicit source-coordinate camera poses with clamped edges; its intentional overflow is clipped by the fixed screen mask. No runtime network, clock, randomness or media playback commands drive the picture.

The first four acts follow the fully repaired two-mask bundle. Act five remains labeled as a separate, deliberately incomplete review and uses the actual positive fresh-reading capture. Processing-time removal is labeled. The emitted-file proof and positive incomplete-test observation are never conflated. Captions are delivered as the separate SRT, not burned over software evidence.

Local visual dependency licenses are in `assets/licenses`; local font declarations are in `src/fonts.css`; the frame preset and brand role decisions are in `frame.md`.
