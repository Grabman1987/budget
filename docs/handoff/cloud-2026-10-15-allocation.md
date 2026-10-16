# Cloud continuation: wealth-stage allocation — 2026-10-15

Latest verified main remains `01a10de8b251f3b3bb05d8a5df6ae534e7d0d631`. Prior delivered packages and the original backlog are recorded in [Blueprint handoff](https://github.com/Grabman1987/budget/blob/design/blueprint-revision-04/docs/handoff/cloud-2026-10-15-blueprint.md). PUB1 #490 remains excluded. No new agents were started; earlier agents remain frozen. External draft #505 is preserved.

## Current work

- Worktree `/workspace/work/allocation-stages`, branch `feat/allocation-wealth-stages`, based on the exact main above. The commit containing this file is the code checkpoint; the PR head is authoritative for any later continuation.
- Existing universe and resolver reused; lower-bound stage input; explicit account/cash-class selection saved atomically with targets and optimistic scope checks; seven-stage editable template; labels/conditions/optional enabled flag; grouped undo/redo; wide desktop form. [Contract](../allocation-wealth-stages.md), [evidence](../evidence/allocation-wealth-stages/README.md).
- The uploaded workbook remains only in cloud attachment storage. It is not in the repository. No production data/configuration, provider names, instrument identifiers or secrets were copied or altered. The template requires the user to choose actual classes and accounts inside the app. It does not create actual trades or edit standing savings rates.
- Figma source and prototype V18–V21 are implemented in the existing file. START now has 170 scenarios; new links have no invalid destinations. [Desktop flow](https://www.figma.com/design/Nv9oaV96Npql6onEofCFEi?node-id=260-1865), [phone flow](https://www.figma.com/design/Nv9oaV96Npql6onEofCFEi?node-id=260-2002). Design branch `design/blueprint-revision-04`, commit `618b54d8`; native source, component adjustments, IDs and validation are under `design/figma/revision-05-allocation/` on that branch.

## Exact open product decision

The async question has no answer yet: should conditional stages wait for explicit approval, retaining the last approved targets until then, or should every entered stage activate solely by threshold? The draft implements the first option, with all conditional template stages initially disabled and each stage independently releasable. The zero stage must remain enabled. Existing policies without the optional flag retain automatic behavior. Conditions in the supplied plan include managed-futures product approval and actual liquidity/withdrawal needs at later thresholds. Do not treat elapsed time as the owner's answer. No merge or activation of this default has been performed.

## Verification

- Node 22.23.3 `BUDGET_REQUIRE_AGE=1 VITEST_MAX_WORKERS=2 npm run check`: **434 files / 3,965 tests passed**, no skips; typecheck and lint/format pass. One pre-existing unused ESLint-disable warning in `packages/ui/src/components/panel.tsx:208` remains; no new lint error.
- `npm run build:e2e` passes. `asset-classes-settings.spec.ts` + `portfolio-allocation.spec.ts`: **16 passed** with one worker, desktop diagnostic Chromium 141 and current WebKit 2370 / Playwright 1.64.1. Both themes use full Axe checks. The Chromium version is diagnostic only; required current Chromium CI remains outstanding.
- The new test's class selection was subsequently isolated to three known synthetic classes plus its own created class to prevent parallel-worker races. The narrowed new-flow rerun passed **5/5** (three setup checks plus the new flow on desktop and current WebKit); exact log `/workspace/work/allocation-browser-isolation.log`. Its only sample-data addition is undone in `finally`.
- Full log `/workspace/work/allocation-full-check-final.log`; complete browser log `/workspace/work/allocation-browser-final.log`; final build `/workspace/work/allocation-build-final.log`; Impeccable detector `/workspace/work/allocation-impeccable-detect.json` is `[]`.
- Temporary `playwright.cloud.config.ts` selected installed runtimes only and was removed before commit. Browser executable override, environment variables and synthetic setup secrets are not committed.

## Next action

1. Locate the draft PR for `feat/allocation-wealth-stages` and read its current head/CI. The code checkpoint is published with the pending decision explicit; do not infer merge readiness from this handoff.
2. After the owner answers, adjust the conditional default if needed, update the contract/Figma review copy, and recheck affected tests. Preserve all existing acceptance assertions. The original priority backlog (cash/bank transfer status and remaining #491/#499 audit packages) remains open.
3. Before any actual merge: inspect all eight required checks on the exact last head. Lead merges serially, then verify all main checks, the actual automatic deployment including the one-machine guard, and exact public live `/health` revision. No issue may close from this draft or from local test counts.

Execution remains cloud only. Node binary: `/workspace/work/toolchain/node_modules/node/bin/node`; age: `/workspace/.budget-tools/age/usr/bin`; WebKit cache `/workspace/work/playwright-webkit-current/browsers`. Current Chromium download was blocked in this environment; do not describe Chromium 141 as the CI version. Git transport and the GitHub connector work; the old `gh` credential does not, and no credential inspection or deploy-key request is needed.
