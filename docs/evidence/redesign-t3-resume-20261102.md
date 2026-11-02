# T3 continuation on current main — 2 November 2026

Refs #824, existing draft PR #880. Implementation continues in the shared managed
cloud workspace, isolated worktree `/workspace/work/t3-resume`, existing branch
`feat/redesign-t3-investment-basis-20261030`. Original head
`2d9c0f40528a956763d997b68f14684f2fafd315` is preserved as a parent of normal merge
`05b91d48`; its other parent is main
`ef765f5f9ec4956693f4d5ed5597e9f818a33f04`. No rebase or force push.

## Bounded reconciliation

T2 #879 was squash-integrated on main as `6d7a550a`; T6/S2/S3/T7/E0 also
advanced main. The merge retains current main's approved plan, T2 evidence and
redesign checkpoint byte-for-byte. Root owns rollout reporting separately.
Three API/type/key-list conflicts retain precisely the existing T3 additive
`investmentBasis` import, read and optional type. Today and offline label changes
auto-merge with current main. The canonical helper, money/valuation partition,
authentication, snapshot epoch, writers, migration, audit and Undo are unchanged.

The seven original T3 source/test blobs checked against the preserved head are
unchanged: both dedicated investment tests, freedom-universe-615 test,
`dimension-page.tsx`, `investment-basis.tsx`, `kennzahlen.tsx`, and the canonical
helper export in `packages/db/src/repos/index.ts`.

The common smoke retains main's S1/S2/S3/T6 implementation and adds calls to the
existing T2 proof and extracted T3 proof after the ON checks. This restores the
original T3 stacked forecast coverage while preserving later main coverage.
`scripts/dev/redesign-t3-proof.ts` moves the old T3 functions without altering
financial, focus, viewport, screenshot, deadline or Undo assertions. Its only
functional interface adaptation supplies the existing bookmark as an argument.
No baseline, package, lockfile, schema, workflow or deployment configuration edit.

The 2026-11-01 owner approval in PR #880 comment
[6562889973](https://github.com/Grabman1987/budget/pull/880#issuecomment-6562889973)
explicitly permits the authenticated additive forecast35d/investmentBasis reads
and potential saved-response payload while redesign is OFF. It does not authorize
new formulas, security/writer policies, migrations, release or flag activation.
This continuation preserves that exception; it needs no renewed approval.

## Local verification

- Focused T3: three files, **17/17 passed**, 7.24 s, one worker. Command:
  `BUDGET_REQUIRE_AGE=0 node node_modules/vitest/vitest.mjs run apps/server/src/api/heute-investment-basis.test.ts apps/server/src/api/freedom-universe-615.test.ts apps/web/src/heute/investment-basis.test.tsx --maxWorkers=1 --no-file-parallelism`.
- Genuine pre-push gate: current outcome pending. Initial diagnosed setup failure
  was the missing worktree link to prepared nested web dependencies
  (`@vitejs/plugin-react`); dependencies now link to the prepared installation.
  Extraction also left one extra blank line, corrected by Prettier. No product or
  protected test expectation changed to address either failure.
- Browser/build and current 1440/390 evidence: pending.

Repository profiles applied: budget-caveman, budget-verified-delivery,
budget-security-review and budget-impeccable; managed cloud-environment-runtime
also read. SPEC, AGENTS, DESIGN, design tokens, current task/approved plan,
queue rules and fast-path guide were consulted. No original Impeccable launcher
was found in the available workspace, so no CLI detector claim is made.
Prepared dependencies and cached pinned browsers are reused; no package install.

## Evidence limits and remaining gates

Earlier CI 41091848939 and its inspected artifact remain historical evidence for
original head 2d9c0f4. Unchanged T3 blobs preserve the earlier assertions and
financial contract; later shell integration requires fresh visual/browser evidence.
No old CI is reported as exact-head verification of this candidate.

Independent full final-diff and test-impact review, fresh exact-head required CI,
PR retargeting from the old T2 branch to main, and named owner synthetic/device
acceptance remain open. This implementer stops with a local reviewable candidate.
Nothing has been pushed, merged, deployed, activated, closed or changed on the
Board; STOP files remain intact. Production redesign stays OFF.
