---
doc: checklist
status: draft
implementation_authorization: delegated by user; human document review pending
---
# Build Checklist

Build mode: fast, under explicit autonomous implementation authorization. Human review is tracked separately and not inferred from agent checks.

## Slices

- [x] **1. Inspect an actual cross-file association**
  Becomes usable: The fixture workspace, source inspector and two source-backed routes work.
  Why now: Kernel first; every later action has actual evidence.
  PRD ref: `prd.md > Evidence inspection`
  Spec ref: `spec.md > Evidence workspace`
  Build: Scaffold, typed graph, fixture raster sources and polished workspace.
  Verify (mechanical): Graph tests and production build.
  Learner check: Open a source and follow both routes.
  Commit: `Build inspectable evidence workspace`

- [x] **2. Repair and verify exported pixels**
  Becomes usable: A minimal region cut, previews and real verified PNG downloads.
  Why now: Proves the distinctive loop before API complexity.
  PRD ref: `prd.md > Repair planning`
  Spec ref: `spec.md > Raster export`
  Build: Exact cut search, preview, encode/decode, mask checks and downloads.
  Verify (mechanical): Alternative-route, cut and output-byte verification tests.
  Learner check: Toggle one incomplete repair, then recommended repair and export.
  Commit: `Add minimal repair and verified raster export`

- [x] **3. Analyze and review a new bundle**
  Becomes usable: Consent-gated uploads yield suggested source-backed facts.
  Why now: Generalize a working loop beyond fixtures.
  PRD ref: `prd.md > New bundles`
  Spec ref: `spec.md > Analysis boundary`
  Build: Bounded API, schema, decode, provider call, import and review UI.
  Verify (mechanical): Invalid request tests plus live fictional extraction if key available.
  Learner check: Import PNGs, consent, inspect and confirm evidence.
  Commit: `Add consented image analysis and evidence review`

- [x] **4. Harden and document the complete journey**
  Becomes usable: Responsive, accessible, documented local app with auditable proof.
  Why now: Review integration and publication after core behavior works.
  PRD ref: `prd.md > States and Boundaries`
  Spec ref: `spec.md > Where It Runs and How Someone Tries It`
  Build: Review UI, failure recovery, privacy, README, app map and demo notes.
  Verify (mechanical): Full relevant tests, typecheck, build and parent browser QA.
  Learner check: Explore the complete loop and note remaining changes.
  Commit: `Polish workspace and document verification`

## Hands-on Checkpoints
- [ ] Early usable behavior explored — after first source-backed workspace (human feedback pending)
- [ ] Final kick-the-tires exploration and feedback completed

## Final Review
- [ ] Final review complete — feedback resolved and learner confirms ready to ship

## Code Tour and App Map
- [ ] Learning activity complete — reference route will be prepared; human activity pending
- [ ] Optional edit and transfer reflection addressed
- [ ] `devpost/app-map.html` generated from finished code, checked, and shown

Activity and evidence: graph and emitted-byte verification were implemented and tested; offline reference map prepared. No human learning activity claimed.
Route and stops: reference-only route: `src/App.tsx > applyRepair`, `src/lib/graph.ts > minimumRegionCut`, `src/lib/redaction.ts > exportWorkspace`; not toured by the learner.
Edit outcome: not performed.
Reflection: not requested or invented.
Activity mode: pending; reference map will remain independently useful.

## Revisions

- The first two slices were verified together: 12 graph/raster tests, TypeScript and Vite build passed; parent inspected real sources and exported bytes in the in-app browser. The third slice API landed with six additional trust-boundary tests; live analysis remains under review.
- The output verifier now rejects zero-coverage/out-of-bounds rectangles and reads emitted PNG alpha without compositing; independent audit found these edge cases before release.
- Per-region confirmation provenance and an export revision guard were added so edited fixture evidence can be reviewed and an outdated in-flight export cannot replace a newer workspace.

- Live extraction of an independent fictional three-file bundle succeeded with a different association; strict model-schema bounds and one corrective retry were added after an earlier invalid model result. Full integrated browser verification remains separate.
- Full-resolution originals now stay intact; only provider copies resize to 1600 pixels. A ZIP download and neutral verification report make the delivered artifact convenient without leaking redacted identifiers.
- Sharp and Vitest were updated to patched releases after dependency audit; the resulting audit reports zero vulnerabilities.

- Integrated parent browser review passed the real upload→review→repair→export flow and ZIP integrity/pixel comparison. At 390 pixels there was no document overflow; source inspection and partial-repair feedback worked. A desktop document-caption/footnote overlap was corrected by reserving vertical space.
- Agent implementation verification is complete: 25 tests, TypeScript/build, formatting and zero-vulnerability dependency audit. Human checkpoint/review/reflection boxes deliberately remain unchecked.
- Offline app map was generated and its relative links and function anchors verified. It is a reference route; no completed learner walkthrough is claimed.

## Approved Competitive Extension
- [x] Keep-visible pixel constraints, constrained cut, actual provenance canvas and preserved-pixel export checks.
- [x] Explicit-consent fresh-reader endpoint over actual exported bytes, bounded grounding, local target comparison and stale-result protection.
- [x] Integrated constrained repair/fresh-reader browser review, tests, source audit and updated demo evidence.

- Preservation tranche passed 32 tests and an independent 500-graph constrained-cut oracle, including 89 impossible cases. Browser verification observed one name mask become two identifier masks while preserving every credit pixel; both masks appeared in every relevant preview. Impossible constraints and 390-pixel layouts passed.
- Fresh-reader contract and emitted-artifact review passed 46 tests plus independent request-taint and review-byte checks. Live fictional baseline recovered Northstar Health without a protected-name hint; the preserved-credit repair returned no supported attribution. These are observations, not privacy proof. Integrated fresh-reader browser review subsequently passed both negative-observation and positive-recovery outcomes.

- Final agent browser continuity passed: an intentionally omitted channel link was recovered from emitted PNGs, actual proposed boxes were inspected, verified customer-credit preservation carried into the new review, three proposals were confirmed, and one additional channel mask disconnected all detected routes. The resulting export verified three PNGs and the retained credit. Mobile layout/contrast and desktop console checks passed. This is agent verification, not learner approval.

## Production deployment

- [x] Deploy the full app and Node AI API to [mosaic-evidence.vercel.app](https://mosaic-evidence.vercel.app).
- [x] Preserve full-size upload transport using temporary private Vercel Blob storage, signed scoped upload tickets, exact decoded-byte limits, and cleanup after reads.
- [x] Verify production health, sample incomplete repair, constrained repair, three exported PNGs, preserved pixels, and a completed fresh reading of actual exports.
- [x] Verify a fictional 8,404,986-byte image bundle (about 11.2 MB JSON) through the hosted upload and analysis path; five returned links remain proposals for review.
- [x] Verify unauthenticated private-Blob access is rejected and no temporary uploads remain after the fresh-reader check.
- [x] Pass the current full suite: 52 tests across seven files, TypeScript, and production build.
- [ ] Human final review and learning reflection completed.
- [ ] Final Devpost submission completed.

Hourly orphan cleanup is configured, but a completed scheduled retention cycle is not claimed. A fresh reading that returns no supported attribution is not a privacy guarantee. Production checks were performed by the agent; human checkpoints above remain unchanged.
