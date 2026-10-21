# Visual production sources

`design.json` is the frame/source geometry and exact brand-role manifest. `fonts.css` contains local-only font faces. The normative design spec is `../frame.md`, derived with the workflow build-frame remixer.

`../scripts/lib/screen-stage.mjs` is a Node source generator helper. Import its exported functions in the composition generator; use `mediaMarkup()` for a real captured image/video, `stageMarkup()` for its mask, and `cameraCode()` for the registered parent/child timeline's transform beats. It never writes index.html.

`../compositions/components/ui-focus-zoom.html` and `browser-device-stage.html` are installed registry provenance/reference primitives. Their skeleton UI is never used. The source-coordinate helper adapts the primitive camera law to real 1600×1000 source media, supports multiple narration cues and prevents blank edges.

All scene HTML must include the local @font-face declarations and `assets/vendor/gsap.min.js`. Body/chrome size is at least 24px unless it is nonessential metadata. Capture content uses its native CSS-pixel coordinate system, and must be zoomed until its load-bearing labels are readable. Use high-resolution stills for detailed evidence holds.
