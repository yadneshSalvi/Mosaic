# Final film verification

- Final file: `renders/mosaic-submission.mp4`, 165.7 seconds; 1920×1080, H.264, 60 fps, yuv420p, AAC stereo at 48 kHz.
- Final mix: -16.03 LUFS, -1.50 dBTP. Two-pass audio normalization copied the video stream unchanged.
- Every video frame decoded successfully. No black interval of 0.1 seconds or longer was detected at the configured threshold.
- 43 encoded frames inspected, including both sides of every chapter boundary, important proof details, the opening and the final held card. Source preview and encoded output agree. Review contact sheets remain under `renders/mosaic-submission-review/`.
- A fresh Deepgram pass on the finished mixed MP4 recovered 100% of the normalized locked script, all five chapters and the closing phrase. See `../assets/audio/final-mix-qc.json`; the canonical dry-narration transcript and caption timing were preserved.
- Captions were checked for valid duration, ordering, overlap and fit inside the film. They are separate from the picture.
- Independent story and visual reviews found no blocking comprehension issue. Evidence comes from actual application footage and actual output files; fictional examples and Mosaic's separate omitted-link test are labeled where applicable.
- Native authoring checks passed. Remaining lint advisories describe intentional composition-local media timestamps and scene track density, not runtime errors. See `native-check.json`.
- Original deterministic code generated all background music and effects. The exact voice model was Gemini 3.1 Flash TTS; timestamps came from Deepgram. Automated measurements and model observations are documented without claiming human listening.

The renderer used hardware GPU screenshot capture. Minor trailing-whitespace cleanup after rendering does not change visible content; the source passed a fresh native check afterward. Delivery duration and SHA-256 are in `delivery.json`. Final MP4s are local deliverables; no public video upload has been performed.
