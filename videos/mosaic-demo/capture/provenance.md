# Browser capture provenance

These assets derive from actual interactions with the local applications. No interface, result, source rectangle, learner slot, or model finding was synthesized.

Run `python3 scripts/process-capture.py` to process completed numbered takes incrementally. The script excludes the probe directory and reads only JPEG filenames explicitly listed in each recording.json. Stray images from failed takes are ignored. Source hashes and first/last timestamps are recorded in manifest.json.

For moving clips, successive CDP timestamps define each JPEG's duration. A microsecond concat input time base preserves these intervals before 30fps resampling. The last listed frame receives a documented 0.4-second end hold. No motion interpolation or playback-rate change is applied here. MP4 output is 1600×1000 H.264, CRF16, yuv420p. Actual duration may differ by one 30fps frame. The wall duration field is retained as capture metadata; it is not confused with final film timing.

Final WebP stills are encoded at quality95 directly from the actual 3200×2000 final@2x.png. The 1600×1000 final.png and every listed JPEG are dimension-checked. The known initial Mosaic overview replacement is therefore represented by its current correct final@2x.png. No generated output-image evidence is substituted; separately verified Mosaic PNG exports stay separate.

Later slow-motion, trims, crop motion, holds, and processing-wait cuts must be recorded by the final film composition. A slowed interaction is still real footage; it must not imply real-time performance. The contact sheet is labeled for review and must not be used as film imagery.

Generated: 2026-10-21T05:59:58.430129+00:00

| Step | Listed frames | CDP span | Clip duration | Still |
| --- | ---: | ---: | ---: | --- |
| 01-overview | 1 | 0.000000s | 0.400s | assets/capture/01-overview.webp |
| 02-sources | 10 | 0.214210s | 0.600s | assets/capture/02-sources.webp |
| 03-read-together | 7 | 0.897184s | 1.300s | assets/capture/03-read-together.webp |
| 04-inspect-client | 3 | 0.072646s | 0.467s | assets/capture/04-inspect-client.webp |
| 05-incomplete-mask | 10 | 0.524721s | 0.933s | assets/capture/05-incomplete-mask.webp |
| 06-channel-evidence | 10 | 0.879102s | 1.266s | assets/capture/06-channel-evidence.webp |
| 07-undo-trial | 13 | 0.522619s | 0.933s | assets/capture/07-undo-trial.webp |
| 08-one-mask-repair | 13 | 0.280309s | 0.666s | assets/capture/08-one-mask-repair.webp |
| 09-customer-mask | 20 | 0.491167s | 0.900s | assets/capture/09-customer-mask.webp |
| 10-keep-credit | 11 | 0.263934s | 0.666s | assets/capture/10-keep-credit.webp |
| 11-two-mask-repair | 17 | 0.300120s | 0.700s | assets/capture/11-two-mask-repair.webp |
| 12-export-verify | 7 | 0.133184s | 0.533s | assets/capture/12-export-verify.webp |
| 13-separate-test-omit | 3 | 0.110596s | 0.500s | assets/capture/13-separate-test-omit.webp |
| 14-separate-test-export | 8 | 0.199552s | 0.600s | assets/capture/14-separate-test-export.webp |
| 15-fresh-reading-consent | 7 | 0.333869s | 0.733s | assets/capture/15-fresh-reading-consent.webp |
| 16-fresh-reading-start | 15 | 0.266462s | 0.667s | assets/capture/16-fresh-reading-start.webp |
| 17-fresh-reader-result | 4 | 0.531839s | 0.933s | assets/capture/17-fresh-reader-result.webp |
| 18-proposed-output-region | 1 | 0.000000s | 0.400s | assets/capture/18-proposed-output-region.webp |
| 19-fresh-reader-summary | 1 | 0.000000s | 0.400s | assets/capture/19-fresh-reader-summary.webp |
| 20-review-exported-bundle | 17 | 0.330962s | 0.733s | assets/capture/20-review-exported-bundle.webp |
| 21-review-proposed-link | 4 | 0.603027s | 1.000s | assets/capture/21-review-proposed-link.webp |
