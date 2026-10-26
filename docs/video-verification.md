# Submission video verification

**26 October update:** a revised cut adds a 40-second AI-agent chapter and retimes the existing demonstration. See [revision notes](video-revision.md). The timecodes below identify the original 21 October cut audited here.

Independent agent audit, 21 October 2026, against [the public website](https://mosaic-evidence.vercel.app). The audit inventoried the final 165.7-second submission video's audio and rendered claims, then reproduced the demonstrated workflows through the deployed interface using fictional images.

## Video claims reproduced

| Video | Website action and observed result |
| --- | --- |
| 0:17–0:45 | Open the three-image example. The incident connects through client/project references to Northstar Health. Selecting a link opens its source region for inspection. |
| 0:46–1:04 | Mask the client reference. One of the two known routes remains through the operations channel. Inspect that alternate route's evidence. |
| 1:05–1:18 | Undo the trial and find a repair. One candidate mask over the shared customer name removes both known routes. |
| 1:18–1:35 | Mark the public customer credit Keep visible and find a new repair. Two incident identifiers are masked; the public credit remains visible; zero known routes remain. The minimum is over candidate regions subject to preservation. |
| 1:36–1:59 | Export new PNGs and download the actual ZIP. The application decodes the output files and checks masks, unchanged pixels and the kept region. An independent decoder/pixel comparison also passes. |
| 2:00–2:12 | Consent to a fresh reading of the exported images. Source and request-boundary tests confirm exact exported PNG bytes, the starting incident, no original graph, and no explicit protected-answer hint in a new model context. |
| 2:13–2:32 | In a separate deliberately incomplete review, reject the incident-to-channel link, keep the credit, repair the remaining known route with the client mask, and export. On the first fresh-reader attempt, the live service proposed the surviving Northstar association through the visible channel/project evidence. Returned regions were inspected on actual outputs, and those exported images were reopened for review. |
| 2:32–2:43 | The UI distinguishes known evidence from proposed model observations. It does not certify privacy. |

## Independent exported-file proof

The audit downloaded the production sample originals and the ZIP produced by the live interface, decoded each as RGBA, and compared **2,100,000 pixels** independently of the application's own report.

| Output | Masks | Incorrect mask pixels | Unintended changes outside masks |
| --- | ---: | ---: | ---: |
| `mosaic-01.png` — support | 2 | 0 | 0 |
| `mosaic-02.png` — registry | 0 | 0 | 0 |
| `mosaic-03.png` — directory | 0 | 0 | 0 |

All three outputs retain their 1000 × 700 dimensions. Exactly 22,710 support-image pixels changed, within the two expected rectangles. Registry and directory pixels remained identical, including the public customer credit. The ZIP passed integrity checking. The separate incomplete-review export was retained separately from this fully repaired bundle.

## Fresh-reader scope

The complete two-mask output yielded no supported customer attribution in the audit. The separate one-mask/incomplete-review output yielded the association described in the film, on its first attempt. These are recorded model observations, not guarantees of identical future responses or exhaustive privacy detection.

The reader receives exported images and the starting fact as user-specific evidence, along with neutral output IDs, consent, and generic system/schema instructions. It receives no original evidence graph or explicit target-answer hint. A public customer name can intentionally remain in the image pixels. The client compares the returned customer with the protected target locally. Returned evidence is structurally validated and remains subject to human inspection; semantic truth is not certified.

Reopening the incomplete output added suggested relations requiring review before export. The resulting graph counted four routes because parallel reviewed and newly proposed relations can form separate graph paths; that is not a claim of four different real-world associations.

## Additional checks and limits

A new upload of three fictional PNGs completed through the production AI service, produced reviewable link proposals, and supported correction of a proposed region before confirmation. The export remained gated on unresolved suggested evidence. All **52 automated tests passed**.

An apparent unresponsive-dialog issue was caused by another audit tab's native print dialog blocking the shared testing browser. After that tab closed, Mosaic interactions and dialog dismissal worked normally. No implementation defect or material mismatch with the demonstrated video behavior was found.

Raw screenshots, both downloaded bundles, production source images, and the independent pixel verifier are retained in the local ignored `plans/audit-evidence/` folder. This agent-run audit uses fictional data and does not constitute a professional privacy review.
