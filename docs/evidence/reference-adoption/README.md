# PP return adoption — synthetic verification

Decision: [reference adoption](../../product/reference-adoption.md). Branch `feat/reference-adoption-m1`, based on research commit `3d266406` and product baseline `01a10de8`. Owner decision dated 2026-10-15; verification continued on 2026-10-16. No private ledger or PP file was accessed or changed for this implementation.

## Financial acceptance

| Independent synthetic case | Required result | Evidence |
| --- | --- | --- |
| Opening 100, deposit 100, closing 220 EUR | PP TTWROR 10%, replacing end-flow 20% | `packages/domain/src/invest/returns.test.ts` |
| Opening 100, deposit 100, withdrawal 100, closing 110 EUR | 5%, while actual net contribution is zero | Same domain test through `depotFlows` and `windowPerformance` |
| Opening zero, funding 100, closing 99 EUR | −1%; initial-day costs count | Domain test and investment API first-buy-fee case |
| Full sale of 105 EUR against opening 100 | 5% with closing holdings zero | Domain test |
| 101 EUR buy including fee; end holding 100 plus gross dividend 10 / net 7.50 | TTWROR/XIRR 8.910891%; actual gain 6.50 and net contribution 93.50 | `apps/server/src/api/invest.test.ts`; class cash/Dietz also agree |
| Cash-only USD depot: opening valuation 90 EUR, later 100 EUR | All-time scope includes pre-purchase cash and returns 11.111111% | Investment API case |
| Same-day class change plus purchase and 20% quote gain | Old class 0%; effective new class 20%; unchanged total 20% | `packages/db/src/repos/asset-exposure.test.ts` |
| Internal opening class withdrawal leaves 50 EUR which earns 10% | Remaining class return 10%, not diluted to 5% | Domain test using explicit internal opening timing |
| Foreign dividend net/tax each converts to half a cent | PP TTWROR and security XIRR retain their distinct rounding order | `packages/domain/src/invest/series.test.ts` |
| Operator PP source: same-day deposit 500000 / withdrawal −12000 cents | Both signs preserved, not replaced by net 488000 | `packages/import-pp/src/migration.test.ts` |
| Reinvested reward of 5 EUR on a 100 EUR holding | Security TTWROR 4.76190476% with PP gross timing; 0.5% on 1000 EUR including cash; actual gain remains 5 EUR | `packages/db/src/repos/operator-owner-trades.test.ts` |
| Empty cash account without transactions | No invented return history | Investment API case |
| All dated investor cash flows cancel, including a same-day cash round trip | XIRR unavailable, never the −99.99% search bound | Domain validity test |

The corresponding defect tests were observed failing before each production correction. Prototype-generated monthly reference arithmetic remains tested as historical fixture behavior; it does not override the owner's newer PP convention. The unchanged daily sample now pins 38.066304730729% instead of 38.2%; it is regression evidence, not an independent PP export. Literal cases above establish the convention independently.

## Verification state

- Focused final financial run: **30 files / 272 passed**, one worker, including domain, portfolio repositories, class exposure, sample fixtures, operator replay and investment API.
- Investment API after cash-start correction: **24 passed**; all included in the focused run.
- Later final cash-history/reward/XIRR validity run: **3 files / 73 passed**, including all 24 investment API tests and 36 owner-trade tests. Full-run and targeted final-head evidence is distinguished below.
- Earlier UI run: **17 passed**, desktop 1440, mobile 390 and WebKit iPhone, light/dark, keyboard/touch, Axe, empty/unavailable/privacy and sample-value checks. It preceded the final class/replay corrections.
- Latest rebuilt three-project UI run completed with two WebKit timeouts: the glossary's 30-second limit and the wealth tour's 180-second limit expired during Axe evaluation. Neither reported an accessibility violation or failed a financial assertion. Windows had approximately 100 MiB available RAM during this run.
- Isolated WebKit rerun completed with **2 failed / 3 setup tests passed** in 4.5 minutes, with unchanged limits/assertions. The glossary reached its screenshot before timing out; the wealth tour timed out in Axe again. Memory availability fell to approximately 30 MiB. Resource pressure is observed, not a proven sole cause. Final WebKit acceptance remains **open**; an earlier passing run does not supersede these results. [Rerun log](browser-webkit-final.txt).
- Full `npm run check` with one worker and required `age`: all workspace typechecks and full lint/format passed (one existing unrelated unused-disable warning in `panel.tsx`). The complete 434-file unit run finished with **3973 passed / 1 failed / no skips** in 1282 seconds. Its sole failure expected a flat class index in a month without capital; the intended unavailable gap was already returned correctly. Only that assertion was updated. The affected **12 API tests then passed**, with fresh server typecheck, changed-test lint/format and `build:e2e` also passing. Production code did not change after that full run. This is full-run-plus-targeted evidence, **not** a claim that a subsequent single `npm run check` invocation exited green; required exact-head CI remains before publication.

The first concurrent attempt timed out in an unrelated export test while Windows reported under 100 MiB available RAM and was cancelled. The serialized complete run passed the export tests. Assertions/timeouts were not weakened; the one expected class-index change follows the explicit no-capital gap policy and retains the January/February return assertions.
- The initially missing Playwright browser versions were installed before the successful UI run. Test-only `age` v1.3.2 was isolated outside the repository and its release SHA-256 verified (`f48d8f8f9ebe903ab5027ed067652f2cc1db94bc206976430133b905dcd8e8c7`); standalone required-age backup tests **7 passed**. No application dependency or owner backup key was changed.
- Research trace validator: 392 rows, 24 capabilities, 11 specifications, 14 work packages, no errors.
- Independent read-only review closed the depot cash-start issue and confirmed PP tax conversion. A second review checked internal class timing, after-tax facts and operator gross flows. The shared XIRR solver itself filters dates to `(start,end]`.

The original Impeccable engine/launcher was unavailable locally; the project adapter, existing prototype/screens and rendered browser checks were used. No detector execution is claimed. Existing reference screenshots are preserved; new captures belong in this evidence directory.

## Current synthetic captures

The final rebuilt report was inspected at desktop 1440 and mobile 390. Screenshots contain synthetic fixtures only:

- Report: [desktop light](portfolio-performance-light-desktop.png), [desktop dark](portfolio-performance-dark-desktop.png), [mobile light](portfolio-performance-light-mobile.png), [mobile dark](portfolio-performance-dark-mobile.png).
- Portfolio overview: [desktop light](portfolio-desktop-light.jpg), [WebKit iPhone dark](portfolio-webkit-iphone-dark.jpg). The latter capture completed before the later, unrelated wealth-tour Axe timeout.

## Remaining acceptance

Private PP parity requires identical report boundaries, account/security inclusion, quotes, FX, actions and tax basis. Missing capital/valuation remains a visible quality gap rather than PP's warning-plus-zero presentation. Unlinked deliveries are external until explicit pair/lot provenance exists. Risk estimators, average/FIFO basis and benchmark price-index scope are separate existing contracts. Before publication, obtain a clean exact-head full check/required CI and close the WebKit timeouts. These tests do not prove private Gate 3, deployment, cross-device Explorer storage or transfer implementation; the latter two have approved contracts and remain subsequent packages.
