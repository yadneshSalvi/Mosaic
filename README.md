# Mosaic

**Small clues. Unexpected connections.**

Mosaic is a working evidence desk for designers and developers preparing client case studies. It shows how individually incomplete screenshots can disclose an association when read together, then helps remove the specific evidence that connects them.

The loop is **protected association → source-backed paths → minimal region repair → flattened PNG export → actual exported-pixel check**.

## Try it locally

Requires Node.js 22.16 or newer.

```sh
npm install
npm run dev
```

Open **http://localhost:5173**. The local API runs at **http://127.0.0.1:3001**. No deployment, database, account, or key is required for the fictional sample.

The sample contains three actual PNGs and five annotated relationships. Follow `Incident 042 → C-17 → Project Cedar → Northstar Health`, then inspect the alternate route through `#cedar-ops`. Masking only the client reference leaves that alternate route intact. The recommended customer-name region disconnects both detected routes.

1. Open a source or select a route link to inspect its exact evidence.
2. Choose **Find minimal repair**. You can toggle individual regions or reset.
3. Choose **Export & verify**. Mosaic creates fresh PNG bytes and decodes them again.
4. Download each PNG, a neutral verification report, or the whole ZIP bundle.

## Analyze your own screenshots

Copy `.env.example` to `.env` and set a server-side `OPENAI_API_KEY`. Never put keys in a client variable or source code. `OPENAI_MODEL` defaults to `gpt-5.4`; use a vision-capable model that supports Chat Completions structured outputs and the configured reasoning option. Restart the API after changing environment variables.

Choose **New bundle**, select 2–6 PNG/JPEG files, and enter the fact and target whose association you want to protect. Limits: 6 MB per file, 24 MB total, static images from 48 pixels to 12 megapixels. An explicit checkbox is required before sending images and the association to OpenAI.

AI extraction proposes evidence; it does not confirm it. Open every suggested region, compare its quote and relationship to the actual source, adjust its bounds/quote if needed, and confirm or reject the link. Export remains gated while suggested links exist. A rejected edge is excluded from the graph. If extraction fails, the previous workspace remains intact; there is no silent sample fallback.

The app preserves full-resolution original image data in the workspace. Only analysis copies are resized to at most 1600 pixels on each axis. Normalized coordinates transfer to the full-resolution source. JPEG EXIF orientation is respected. Export flattens transparency onto white.

## What verification proves

For every exported PNG, Mosaic:

- Decodes the actual newly encoded bytes in a fresh canvas.
- Checks output dimensions and every pixel in each outward-rounded mask rectangle, including alpha.
- Compares every unmasked pixel with the decoded source canvas.
- Recalculates directed paths using only evidence regions whose exported pixels were verified.

The exact repair algorithm minimizes the number of distinct **candidate evidence regions**, breaking ties by normalized area. Mark useful content **Keep visible** to exclude every overlapping pixel region from the repair. In the sample, preserving the public customer credit changes one name mask into two incident-identifier masks; the exported kept pixels are checked for exact preservation. It enumerates all simple directed paths within strict bounds and declines an exact result if the search is incomplete. Independent visible occurrences retain independent evidence; an unmasked duplicate can keep a route alive.

This is **not a privacy guarantee**. The detector can miss facts, coordinates can be inaccurate, people can infer more than the graph represents, and files outside the bundle are unknown. The export check does **not** rerun OCR or model analysis. It proves removal of reviewed, known evidence pixels and disconnection of the detected graph, not universal anonymity. The UI and verification report preserve this distinction.

## Data and credentials

The fictional sample and its graph/export loop run in the browser. The sample annotations are deterministic and labeled. Fonts are bundled locally. New uploads go through the loopback API to OpenAI only after consent. The application does not persist images, requests, or extracted text, and does not log bodies or provider errors. OpenAI's own processing policies still apply; `store: false` is sent with analysis requests. Session images disappear on refresh. No analytics or database is included.

Exported PNGs contain raster pixels rather than editable overlays or original EXIF. Download filenames are neutral (`mosaic-01.png` etc.). The JSON report and ZIP do not contain original filenames, extracted quotes, entity labels, region IDs, or the protected association.

## Development and verification

```sh
npm test              # graph, raster, analysis and HTTP checks
npm run build         # TypeScript and production bundle
npm run format:check  # source formatting
npm audit             # dependency advisories
npm run samples       # regenerate the three fictional source PNGs
```

- `src/lib/graph.ts`: bounded route enumeration and exact candidate-region cut.
- `src/lib/redaction.ts`: coordinate bounds, raster export, emitted-byte decode, pixel checks.
- `src/lib/types.ts`: typed evidence and runtime cross-reference validation.
- `server/analysis.ts`: real image decode, source preservation, structured extraction and one validation-guided retry.
- `server/index.ts`: local-only HTTP boundary, origin/payload/concurrency restrictions and sanitized errors.
- `src/App.tsx`: evidence workspace, review, region editing, repair and downloads.

See the [scope](devpost/scope.md), [PRD](devpost/prd.md), [technical spec](devpost/spec.md), [build checklist](devpost/checklist.md), [verification record](devpost/verification.md), and offline [app map](devpost/app-map.html).

## Hackathon status

Built using the Devpost Build With AI: Basics planning pack. Public planning documents precede implementation in Git history. Detailed working plans and personal learner context are intentionally ignored. The agent was explicitly authorized to implement autonomously; document statuses do not claim human review. The short actual demo video, human review/learning reflection, and final Devpost submission remain separate tasks. Deployment is optional and has not been performed.

## License

Mosaic source and original sample assets are available under the [MIT License](LICENSE). Dependencies and bundled DM Sans / Manrope fonts retain their own licenses.
