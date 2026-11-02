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

Ten original T3 runtime/test blobs checked against the preserved head are
byte-identical: both dedicated investment tests, freedom-universe-615 test,
`heute.test.ts`, server `heute.ts`, web `heute/api.ts`, `dimension-page.tsx`,
`investment-basis.tsx`, `kennzahlen.tsx`, and the canonical helper export in
`packages/db/src/repos/index.ts`.

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
- Genuine pre-push gate **passed** on `55e3f349`: workspace typechecks, scoped
  ESLint/Prettier, removed-identifier check and **188 related files; 1728 passed,
  two existing skips**, 96.65 s. `BUDGET_REQUIRE_AGE=0` is the standard gate limit.
  Initial diagnosed failures were the missing worktree link to prepared nested
  web dependencies (`@vitejs/plugin-react`) and one extraction blank line.
  Corrected links/Prettier resolved both; the first related suite also passed
  1728 tests, 96.49 s. No product or protected expectation changed.
- Fresh `npm run build:e2e`: **passed**. Current production OFF/ON and e2e ON
  frontends built once through the current common smoke.
- Current common smoke: both **1440×900 and 390×844 OFF → ON → OFF installed-PWA
  cycles passed**, including S3 navigation, T6 history/source, T2 exact saved
  forecast/offline/reconnect, T3 literal selected17000 versus positive20000,
  net-debt−9500, total110500, gross120500/10000, canonical comparison and loaded
  source/reload/Back focus. Both S3 320px modes and all twelve Chromium S2 gallery
  mode/theme/viewport cases also passed.
- **Whole smoke exit 1, infrastructure:** its final WebKit launch failed before
  assertions because the host lacks `libgtk-4.so.1`, `libgraphene-1.0.so.0`,
  `libharfbuzz-icu.so.0`, `libmanette-0.2.so.0`, `libhyphen.so.0`,
  `libGLESv2.so.2`. Current user is unprivileged and no sudo executable is
  installed. Cached pinned browsers were found and reused. No dependency install,
  full-smoke retry or test relaxation; WebKit remains for prepared CI.
- Twelve fresh T3 target captures are retained in
  [redesign-t3-20261102](redesign-t3-20261102/): basis, chain and sources at both
  viewports, light/dark. All twelve were inspected together, plus full-size phone
  light chain and desktop dark sources. Values, complete note/date, signed source
  contributions and comparison links are readable. The original native centering
  and real bounds checks passed for every capture; fixed chrome was not hidden.
  These cropped target images do not establish full-page, 320px T3, Axe, WebKit or
  physical-device acceptance. No identity with old artifact PNGs is claimed.

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

Independent full code/test-impact review is CLEAR at `55e3f349`; final evidence
review, fresh exact-head required CI,
PR retargeting from the old T2 branch to main, and named owner synthetic/device
acceptance remain open. This implementer stops with a local reviewable candidate.
Nothing has been pushed, merged, deployed, activated, closed or changed on the
Board; STOP files remain intact. Production redesign stays OFF.
