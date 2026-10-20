---
doc: spec
status: draft
implementation_authorization: delegated by user; human document review pending
---
# Mosaic — Technical Spec

## How This Works, In Plain Language
The browser keeps the screenshots and draws the evidence links. A small graph routine follows explicit relationships between typed entities. A repair routine finds source regions that every detected route depends on. The browser paints black rectangles into fresh images, opens the new PNG bytes again and checks that the expected pixels really changed. For new bundles and optional fresh readings, a local server sends explicitly consented images to a vision model; the model proposes links and the user reviews them, with editable region bounds and quotes.

## The Core Journey Through the System
Implements `prd.md > The Core Journey`. Fixture PNGs and annotations load into the same typed workspace used for imports. Selection highlights source regions. Graph functions enumerate routes, then find a region cut. Export functions paint masks, encode PNG, decode bytes and verify pixels. The output report uses observed masked regions to rerun route search. Import dialog calls the local analysis endpoint only with consent; validated proposed evidence replaces workspace after success.

## Stack
Agent-selected under delegated authority: React + TypeScript for typed browser interactions ([React](https://react.dev/), [TypeScript](https://www.typescriptlang.org/)); Vite for the local client ([Vite](https://vite.dev/)); Node/Express for a small loopback API ([Express](https://expressjs.com/)); Zod for runtime validation ([Zod](https://zod.dev/)); Sharp for server image decoding and fixture creation ([Sharp](https://sharp.pixelplumbing.com/)); native Canvas for flattened export ([Canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)); Vitest for pure graph and raster logic tests ([Vitest](https://vitest.dev/)). Lockfile records actual resolved versions. No database or authentication.

## Where It Runs and How Someone Tries It
Node 22+; `npm install`, `npm run dev`; open http://localhost:5173. API runs on loopback port 3001 with Vite proxy `/api`. `npm test` and `npm run build` verify. Keyless demo works without external services. Optional `.env` contains OPENAI_API_KEY for cloud extraction. Required submission includes public GitHub and a short real demo video; deployment is optional and not performed here.

## Look and Feel
Implements `prd.md > Look and Feel`: CSS variables for warm paper/ink/cobalt; responsive grid; strong editorial title; document cards in a dot-grid canvas; source dialogs; precise badges and meaningful route highlights. Fonts can use local/system fallbacks without blocking render. Transitions honor prefers-reduced-motion.

## Components
### Evidence workspace
`src/App.tsx` and `src/styles.css`; owns selected source/path, dialog, import, masks and output state. Implements `prd.md > Evidence inspection` and `prd.md > States and Boundaries`.
### Graph engine
`src/lib/graph.ts`: validation-aware directed path enumeration and exact minimal region hitting set, bounded to small inputs. Implements `prd.md > Repair planning`.
### Raster export
`src/lib/redaction.ts`: outward-rounded pixel rectangles, fresh canvas encode, decode emitted bytes, opaque-mask and preserved-pixel verification. Implements `prd.md > Export verification`.
### Analysis boundary
`server/index.ts` and `server/analysis.ts`: consent, request/size/schema/decode checks, OpenAI request with timeout, sanitized failures. All provider links become suggested. Implements `prd.md > New bundles`.
### Full-resolution source preservation
The browser receives the original image data and correctly oriented dimensions. Only a separate provider copy is resized to 1600 pixels; export uses the full-resolution decoded source. Fonts are self-hosted. ZIP/report downloads use neutral filenames and omit quotes, protected labels and source identifiers.

### Fictional sample
`src/lib/sample.ts`, `public/samples/*.png` and generation script. Actual raster images with deterministic annotated regions; no API call, clearly labeled. Uses the same graph and export code.

## Data Model
Workspace {title, sources, entities, regions, relations, protectedFrom, protectedTo, origin}. Sources carry id/name/width/height/data URL. Entity type and id define identity. Region normalized rectangle and quote grounds a relation. Relation includes typed endpoints, predicate, region id, status. In-memory only. A shared region can support several relations. ExportReport includes files, pixel checks, verified region ids, remaining routes and limitations.

## File Structure
```
Mosaic/
├── src/App.tsx                 # complete workspace interactions
├── src/styles.css             # responsive evidence-desk styling
├── src/lib/types.ts           # typed data and runtime schemas
├── src/lib/graph.ts            # path search and region cut
├── src/lib/redaction.ts        # flattened output and actual-byte checks
├── src/lib/sample.ts           # labeled fictional annotation data
├── server/index.ts            # bounded local HTTP boundary
├── server/analysis.ts         # vision extraction and validation
├── scripts/generate-samples.ts # reproducible fixture raster images
├── public/samples/            # fictional PNG screenshots
├── tests/                     # graph/schema/export tests
├── devpost/                   # public project documents
├── plans/                     # ignored detailed working plans
└── package.json               # reproducible commands/dependencies
```

## External Services and Dependencies
OpenAI Chat Completions at `https://api.openai.com/v1/chat/completions`, bearer server-only key, image data URLs plus protected association, strict JSON-schema response. Use a vision-capable model set by OPENAI_MODEL (default gpt-5.4); model availability was checked with independent fictional uploads. Provider JSON has bounded strings/arrays/coordinates and one validation-guided retry within a shared 90-second timeout. [Official API reference](https://platform.openai.com/docs/api-reference/chat/create). Billing and limits depend on configured account; app imposes request bounds and timeout, never quotes an unverified cost. No images are persisted by the application; provider processing/data policies still apply and are disclosed.

## Important Failure Modes
- Incorrect/ambiguous extraction → suggested facts, exact source preview and explicit confirmation; no automatic confirmed identity.
- Unavailable key/provider/timeout → actionable sanitized error, prior workspace remains, sample stays usable.
- Export encode/decode/mask failure → failed result with reason, never claim verified; retry or adjust regions.
- Search bounds exceeded → explicit incomplete analysis, no exact all-path promise.

## What Was Simplified and Why
Raster files only avoid hidden PDF layers. No persistence avoids storing sensitive work. Fixed small graph limits make exact all-path repair reviewable. Deterministic fictional extraction is labeled and confined to the demo; all redaction/export operations are real.

## Decisions and Open Issues
No learner uncertainty was independently supplied; do not invent one. Implementation risk: model coordinates need grounded user review. Post-export proof is pixel removal of known evidence, not exhaustive re-OCR or privacy certification. Human review and demo recording remain pending. Runtime docs and actual provider response are to be checked during implementation.

## Approved Competitive Extension: Preserve Useful Content
Under the user's explicit improvement direction, Mosaic supports keep-visible source regions as hard pixel constraints. Shared outward-rounded geometry rejects any candidate or manual mask intersecting kept pixels, regardless of region ID. Exact cut search distinguishes infeasible constraints from incomplete search. Pinning content invalidates stale outputs and removes conflicting masks; actual exports independently verify kept pixels.

The sample's third source becomes a public project credit: customer identity is intentionally useful while its association with the incident remains confidential. Keeping the credit visible changes the optimal candidate cut from one name mask to two incident identifier masks.

The main evidence canvas renders actual selected-path relationships and source-region provenance, including repeated use of one source and arbitrary source ordering. The canvas uses evidence provenance rather than source-order decoration.

## Approved Competitive Extension: Fresh Reader
An optional explicit-consent request sends only actual exported PNG bytes under neutral IDs and the starting incident/fact to a new model context. The request must reject a protected target field and omit the original graph, quotes, filenames and annotations. A bounded response proposes customer attributions with source-backed evidence; supported attributions require a valid graph path. The browser compares these names to the protected target locally.

The UI separates pixel verification from this fresh reading and distinguishes recovered association, ambiguous/different attribution, starting fact absent, no supported attribution, not run and error. A fresh context using the same provider is not independent-provider validation or a privacy guarantee. Reader findings are inspected on the actual exported images and enter a new review workspace through an explicit user action as suggested links. That workspace uses actual exported PNG bytes; masked old evidence is removed, exact repeated occurrences are deduplicated, and full schema bounds are revalidated. All asynchronous results are tied to their export version. Verified Keep visible choices whose regions survive carry into the new exported-image review.


### Fresh-reader boundary
`src/lib/recipient.ts` exposes a strict request `{consent:true, startingFact, sources:[{id:"output-N", data:PNGDataURL}]}` with 2–6 files, no extra properties, no target or original filename. `server/recipient.ts` validates static PNG signatures, image bounds, decoded bytes and allowed metadata-free chunks; the provider receives the exact data URLs. Maximum 6 MB per PNG, 24 MB total, 12 megapixels, shared 90-second timeout with at most one validation-guided correction using only the same exported inputs and the model's own prior response. `/api/recipient-check` shares origin, JSON, no-store and one-active-request controls with initial analysis. Cancel and modal teardown invalidate client epochs and abort the provider request; late results cannot attach to another export.

The response has 12 entities, 16 regions, 20 relations and 3 attributions at most. Status is supported, ambiguous, not_found or starting_fact_not_found. Source/reference uniqueness and bounds are validated. Every supported customer needs a returned directed path from the starting entity; a negative headline contradicted by its graph is rejected. The browser uses exact NFKC/case/whitespace-normalized customer-name comparison, never a hidden target in the provider request. Same-provider results remain proposals. Non-customer targets do not enable this bounded check.
