---
doc: prd
status: draft
implementation_authorization: delegated by user; human document review pending
---
# Mosaic — Product Requirements
An evidence workspace for case-study authors. Source: `scope.md > The Unique Kernel`.

## The Core Journey
1. Open a labeled fictional case-study bundle and immediately see three sources plus a protected association.
2. Inspect the detected route and switch to an alternate route. Open any source and see the exact highlighted evidence.
3. Review all relevant evidence. Sample annotations are fixture-confirmed; imported facts remain suggested until confirmed individually.
4. Ask for a minimal repair; see the selected regions, remaining routes and readable before/after preview. Toggle masks and watch routes return if an edit is incomplete.
5. Export flattened PNGs; reopen emitted bytes, validate opaque masks and unchanged unmasked pixels, then calculate routes based on the regions actually verified.
6. Download individual files and a small report. Result says what was checked and limits its claim to known evidence in supplied files.
7. Import a new bundle from the same workspace; specify endpoints and consent before any cloud transmission. Review results, then repeat the repair/export loop.

## Screens and Layout
One workspace, a source inspector dialog, import dialog and output dialog. A compact top bar carries identity and new-bundle action. The main view contains purpose, protected pair, files, evidence canvas and route explanation. Repair controls occupy a stable panel and can reset. On mobile the evidence canvas stacks and file navigation scrolls locally.

## Look and Feel
Warm white paper, dark charcoal, ultramarine/cobalt primary, quiet yellow exposure cues; editorial headings, small monospaced metadata, generous whitespace and fine dot grid. Readable documents and exact link callouts matter more than decorative metrics. Visible focus, keyboard dialogs and reduced motion.

## Features and Behavior
### Evidence inspection
Every link has endpoint types, a predicate, one quoted source region and an explicit confirmed/suggested/rejected status. Selecting it opens the actual source with that region highlighted. Exact typed ids are shared across documents; ambiguous words are not silently treated as identities.
Acceptance: the five fixture links form two paths; each can be traced to pixels. Rejecting a link removes it from active search without changing the original image.

### Repair planning
Search all supported simple directed paths and choose the fewest distinct evidence regions whose removal disconnects all of them; area is a tie-break. Suggested edges count conservatively. If bounded search cannot complete, disable exact-cut claim. User can toggle suggested masks and return to original.
Acceptance: one shared customer-name region cuts both fixture paths; removing only the C-17 link leaves the alternate route visible.

### Export verification
Rasterize fresh PNGs with opaque black masks. Decode the resulting bytes independently. Check dimensions, every mask pixel and preserved pixels. Recompute graph using only regions whose mask checks passed. Download files only after reporting the actual check result.
Acceptance: a faulty or missing mask cannot produce the success state; exports remain useful images and contain no source EXIF metadata. Message explicitly excludes missed evidence, indirect inference and files outside the bundle.

### New bundles
Support 2–6 PNG/JPEG files, 6 MB each, bounded dimensions and 24 MB total. Before cloud analysis clearly state that images and chosen association go to OpenAI via the local server. Require affirmative consent. Show pending state and cancel; preserve previous workspace on error. All model facts start suggested, with region boxes and review controls.
Acceptance: upload content changes source images and graph; unsupported files, missing key, API error and unusable response give actionable errors without leaked provider details.

## States and Boundaries
Sample / import / analyzing / evidence review / repair preview / export checking / verified output. Empty results explain no detected route rather than imply privacy. Session data disappears on refresh; no server persistence. The demo is labeled and deterministic. Imported evidence must be reviewed; unreviewed status remains visible.

## Product Decisions
The learner chose Mosaic, planning-before-code, autonomous implementation, exceptional UI/UX and local verification. Product particulars and stack are agent recommendations under that authorization, not claimed individually reviewed choices.

## What We're Building
A complete inspect → all-path repair → flattened export → observed output-check loop, plus a genuine new-file path and clear uncertainty.

## Deferred From the POC
PDF, local OCR, drawn custom masks, saved projects and collaborative review require broader document handling/storage and do not prove the chosen bounded kernel.

## Possible Later Enhancements
Re-extract text from exported files locally, compare independent detectors, and offer manual region drawing for evidence the model missed.

## Non-Goals
No privacy percentage, no 'safe to share' guarantee, no arbitrary image upload to third parties before consent, no automatic identity inference from common tokens.

## Open Questions
Human document/visual review remains pending. Provider extraction quality and coordinate grounding are empirical risks to verify with a fictional live request, not assumptions of correctness.

## Approved Extension: Keep Visible and Read the Exports
The author can mark a source region **Keep visible**. Every repair must preserve those actual pixels, including against overlapping masks. If no known candidate repair satisfies the choices, Mosaic explains the conflict without silently dropping a preservation constraint. The useful public customer credit remains visible while its incident-identifying links are removed.

Every connector in the main evidence view must correspond to an actual relation with source-region provenance. File order cannot imply graph order, and multiple edges may come from one source.

After export, the author may explicitly consent to a fresh model reading of the emitted PNGs plus the starting fact only. The model is not given the protected answer or original graph. Proposed customer associations are locally compared and remain reviewable observations. No result certifies privacy; errors and abstentions remain distinct. New evidence can be returned to review explicitly, never automatically confirmed.
