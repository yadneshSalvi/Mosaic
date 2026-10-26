# Mosaic submission record

Submitted to **Build With AI: Basics** on **27 October 2026 (IST)**, following explicit user agreement. Devpost displayed **“Project submitted!”** and **“SUBMITTED TO Build With AI: Basics”**. This records submission, without claiming completion of human review or learning checkpoints.

- [Public Devpost entry](https://devpost.com/software/mosaic-chry8s)
- [Public source repository](https://github.com/yadneshSalvi/Mosaic)
- [Live application](https://mosaic-evidence.vercel.app)
- [Public demonstration video](https://www.youtube.com/watch?v=a5rrf2zpPdg)
- [MIT license](https://github.com/yadneshSalvi/Mosaic/blob/main/LICENSE)

## Submitted elevator pitch

Keep the story. Break the link. Mosaic shows what screenshots reveal together, helps remove the connecting evidence, and verifies the exported pixels while preserving useful content.

## Submitted technology requirement response

The Devpost Learn Skill Pack put planning first. Scope, PRD and spec were committed before code. I chose the direction and delegated detailed decisions to agents. The plan answers what to protect, keep and verify before implementation.

## Submitted project story

## Inspiration

A screenshot can look harmless on its own. Put it beside another screenshot, and a project code or channel name can connect an internal incident to a customer.

Mosaic starts with a publishing decision: a designer wants to share a client case study. The public customer credit belongs in the story. Its connection to an internal incident does not. Removing every name would lose useful content, while hiding one obvious identifier might leave another route intact.

That tension became the product: show how the clues connect, then help the author change the evidence while keeping what matters.

## What it does

Mosaic is a working evidence desk for screenshot bundles. Its fictional example opens immediately, without an account or API key. Three images connect Incident 042 to Northstar Health through two routes. Every link opens the source region behind it.

Try hiding the client reference. One route disappears, but the operations channel still connects the incident to the customer. Undo the trial and find a repair: one customer-name mask breaks both detected routes. Mark the public credit **Keep visible**, and Mosaic finds a different repair using two incident identifiers.

Export creates new PNGs, opens those exact bytes again, and checks every mask pixel and every pixel outside the masks. A separate, optional fresh reading sends only the exported images and starting fact to a fresh AI request. It receives no original graph or explicit protected-answer hint. Findings can reopen review on the actual exported images.

New bundles support two to six PNG or JPEG images. Cloud analysis requires consent, and suggested links require source review before export.

## How it was built

I selected the direction and priorities, then delegated implementation to coding agents. The Build With AI: Basics skill pack structured planning before code. [Scope](https://github.com/yadneshSalvi/Mosaic/blob/main/devpost/scope.md), [product requirements](https://github.com/yadneshSalvi/Mosaic/blob/main/devpost/prd.md) and the [technical spec](https://github.com/yadneshSalvi/Mosaic/blob/main/devpost/spec.md) were committed before implementation. Separate agents reviewed the work and checked the finished application.

The app uses React and TypeScript, a Node/Express API, OpenAI image analysis, native Canvas for exports and Vercel hosting. Original images retain their resolution; only copies sent for image analysis are resized. The interface uses a warm paper canvas, readable document cards and precise source highlights so the evidence stays central.

## Challenges

The hard part was deciding what a result could honestly prove. An early model response contained invalid evidence. Another claimed a connection with relationships pointing in the wrong direction. Those failures led to stricter validation, limited retries and a clear distinction between suggested and reviewed links.

Preserving content also required checking overlapping pixels, because different evidence regions can cover the same image area. Hosted uploads needed temporary private storage to carry larger requests without shrinking the source images.

## Accomplishments

The complete workflow runs on the public site. The recorded suite passes 52 tests. An independent agent audit decoded the three exported PNGs and compared 2.1 million pixels: no incorrect mask pixels and no unintended changes outside the masks.

In a separate, deliberately incomplete review, the fresh reader recovered the surviving customer association on its first audited attempt. That finding was inspected on the output images and returned as evidence to review.

## What the build taught

A convincing preview is not enough; the delivered file needs checking. Disconnecting a known graph also cannot establish privacy. Missing evidence, inaccurate regions and inference outside the supplied files remain possible. A fresh reading is another model observation, not certification. Those limits shaped both the implementation and the language of the interface.

## What's next

Next are local text recognition, saved workspaces, more file formats and evaluation with another provider. Testing with case-study authors would help establish whether the evidence review fits their publishing work. The current verification is agent-run and uses fictional data.
