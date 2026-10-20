---
doc: checklist
status: draft
implementation_authorization: delegated by user; human document review pending
---
# Build Checklist

Build mode: fast, under explicit autonomous implementation authorization. Human review is tracked separately and not inferred from agent checks.

## Slices

- [ ] **1. Inspect an actual cross-file association**
  Becomes usable: The fixture workspace, source inspector and two source-backed routes work.
  Why now: Kernel first; every later action has actual evidence.
  PRD ref: `prd.md > Evidence inspection`
  Spec ref: `spec.md > Evidence workspace`
  Build: Scaffold, typed graph, fixture raster sources and polished workspace.
  Verify (mechanical): Graph tests and production build.
  Learner check: Open a source and follow both routes.
  Commit: `Build inspectable evidence workspace`

- [ ] **2. Repair and verify exported pixels**
  Becomes usable: A minimal region cut, previews and real verified PNG downloads.
  Why now: Proves the distinctive loop before API complexity.
  PRD ref: `prd.md > Repair planning`
  Spec ref: `spec.md > Raster export`
  Build: Exact cut search, preview, encode/decode, mask checks and downloads.
  Verify (mechanical): Alternative-route, cut and output-byte verification tests.
  Learner check: Toggle one incomplete repair, then recommended repair and export.
  Commit: `Add minimal repair and verified raster export`

- [ ] **3. Analyze and review a new bundle**
  Becomes usable: Consent-gated uploads yield suggested source-backed facts.
  Why now: Generalize a working loop beyond fixtures.
  PRD ref: `prd.md > New bundles`
  Spec ref: `spec.md > Analysis boundary`
  Build: Bounded API, schema, decode, provider call, import and review UI.
  Verify (mechanical): Invalid request tests plus live fictional extraction if key available.
  Learner check: Import PNGs, consent, inspect and confirm evidence.
  Commit: `Add consented image analysis and evidence review`

- [ ] **4. Harden and document the complete journey**
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

Activity and evidence: implementation authorized; no human learning activity claimed.
Route and stops: to be derived from actual finished code.
Edit outcome: not performed.
Reflection: not requested or invented.
Activity mode: pending; reference map will remain independently useful.

## Revisions
