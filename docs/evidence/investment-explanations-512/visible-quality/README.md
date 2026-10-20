# #512 — visible historical valuation basis

**Current focused/browser checks and normal production build passed; exact-head CI and LIVE acceptance pending.** Basis: verified Main84bb plus the reviewed visible-basis code and compact layout. Earlier full-check and browser checkpoints below retain their original scope; they are not reruns on this layout.

## Behavior and acceptance scope

Report TTWROR and compact Wealth qualify the **same response’s selected security closing observations**. Carried quote/FX (including short exact-age carry), cost estimates, later execution, missing values and unknown/truncated sources remain distinct and can coexist. Unrelated current cash FX cannot qualify fresh selected history. The adjacent44px action opens/focuses the existing sources; original result text/verdict, amounts, method, period and destinations remain unchanged. No formula/API/DTO/resolver or existing test changed.

The compact cue shares the closed Wealth return row and wraps naturally on phone. Every reason and the closing-only limitation stays visible. Closing metadata excludes flow-FX, fee/tax, benchmark, cash and class-sleeve observations; it does not certify every return input. [Earlier explanation/source/undo evidence](../../investment-explanations-512.md) remains historical. All four public ACs await final CI/LIVE acceptance; parent508 and private Gate3 remain open separately.

## Current actual evidence

- Focused **36/36**, four files (NEW22+old14), **14.30s Vitest duration**; Webtypes, lint/check5 and two-UI formatter AST correspondence passed.
- The NEW sample-default1440×900 case uses the unchanged synthetic sample, route, period and value mode from the original Wealth test. Baseline fresh-build RED reproduced **chart bottom1002.375**, scroll0. The correction measured **884.875<900**, scroll0; source action44px, fully in-viewport and owning its centre, then Enter opened/focused the original disclosure. No viewport tolerance, clipping or scroll workaround was added to that geometry case.
- One fresh E2E build followed by canonical **9/9 first-attempt**, **101.832271s Playwright duration**: setup3+OWNfive+unchanged Wealth test. No skipped/flaky/unexpected cases; all30 physical exits/source3545/compiled166/process/container/lock guards0. OWN cases retain default30s; the original Wealth test retains its existing180s.
- That unchanged Wealth test regenerated seven tracked JPGs. Their raw outputs were archived, then all seven original bytes/full modes were restored before the separate post-source guard. They were not unchanged throughout and no new baseline was accepted.
- Prior mandatory AGE1/workers2 full check on local36819 (B414+reviewed A540f, whose incoming tree equals LIVE84bb): **563 files/5023 tests,472.72s Vitest duration**, normal build0. It predates this two-file layout fix and NEW geometry case. Earlier unused-binding lint STOP, first12-case phone hit failure, corrected7 and older-five checkpoints remain retained historical evidence. Current-layout normal production build19383 passed, all12 physical exits/source guards0; native166 outputs became normal157 outputs. No post-normal-build browser run is claimed. New exact-head CI remains pending.

## Eight current originals and limits

Root, the author and the independent reviewer opened all eight; current source/native/image review is HIGH CLEAR. Eight matching runtime objects and sixteen byte-equal reporter copies remain outside the repository, alongside the separate pre-interaction sample geometry JSON/PNG.

| Scene | Light | Dark |
| --- | --- | --- |
| Phone Report | [Original](phone-light-report.png) | [Original](phone-dark-report.png) |
| Phone Wealth | [Original](phone-light-overview.png) | [Original](phone-dark-overview.png) |
| Desktop Report | [Original](desktop-light-report.png) | [Original](desktop-dark-report.png) |
| Desktop Wealth | [Original](desktop-light-overview.png) | [Original](desktop-dark-overview.png) |

WebKit CSS390×664/coarse/DPR3→PNG1170 and true1440×900/fine/DPR1→PNG1440, both themes. RawMaxTouchPoints0; LIGHT attribute unset, DARKdark. Supported touch/Enter is not physical-device or Chromium proof. Actual fixed nav/skiplink/topbar/search/sidebar overlap other full-page photo content; the long phone previews do not prove every off-frame text legible. Target hit/focus and default chart bounds have separate assertions. Axe is Report-only; privacy covers inspected Overview amount/tooltip/ARIA/title channels. The11-selected-table conservation and post-setup non-GET/HEAD/OPTIONS API observer are not full-DB/auth/all-application guarantees.

## Reproduction

Use Node22 and the shared test lock. Preserve/archive/restore the original Wealth test’s seven media outputs when reproducing its unchanged case.

```bash
. /workspace/.budget-tools/env.sh
npx --no-install vitest run \
  apps/web/src/reports/portfolio-visible-quality-512.test.tsx \
  apps/web/src/reports/portfolio-calculation-provenance-512.test.tsx \
  apps/web/src/pages/portfolio-performance-disclosure-512.test.tsx \
  apps/web/src/wealth/portfolio-overview-disclosure-512.test.tsx \
  --maxWorkers=1 --no-file-parallelism
npm run build:e2e
bash /workspace/.budget-tools/cloud-control/run-webkit.sh \
  /workspace/cloud-investment-explanations-512 test \
  e2e/issue-512-visible-quality.spec.ts e2e/wealth-ux-v1.spec.ts \
  --project=webkit-iphone --workers=1 --reporter=json
```

Independent final-head review, exact-head CI and serial LIVE proof remain gates. No automatic public-AC/closure/private-Gate3 claim follows.
