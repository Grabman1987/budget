# Forecast daily-step completion (Refs #476)

The acceptance audit found one remaining requirement after #567/#568/#569: daily balances and their buffer band were drawn as diagonals. The shared LiquidityChart now uses the existing StepLine and an opt-in stepped Band, so each daily value holds until the next date. Both the Heute card and Plan detail use this drawing. All underlying series, cents, event dates, markers, tooltip values and write/Undo paths are unchanged. Other Band callers keep their default linear geometry.

## Focused regression and scope

- `apps/web/src/reports/liquidity-chart.test.tsx`: one new geometry regression inspects both lines, both band edges and the closed fill. It failed on a diagonal in the existing band before the fix. Existing low-point and salary assertions are retained.
- `packages/ui/src/charts/lines.test.tsx`: literal two-point paths verify the step occurs at the next x coordinate and the default band remains linear after rendering a stepped band. This also detects shared mutable generator state.
- No existing expected amount, timeout, tolerance or coverage was weakened. No financial source or migration changes.
- Initial targeted checks passed 16 tests across three files; that checkout still had Vite 7.3.6/jsdom 27.4.0 installed. These runs establish the reproduction/fix, not exact-lock build acceptance.

## Final source verification

Independent source/test review is CLEAR at `176e3f5bb340d471e6d6beb23489bfe5e664fa69`.
After `npm ci` with Node 22.23.3, the final lockfile resolves web Vite 8.3.5 and jsdom 30.1.3.
The three focused suites passed **16/16** (69.97s); the subsequent `build:e2e` passed.
The unchanged `e2e/issue-568-569-forecast.spec.ts` passed **15/15** in 5.0 minutes:
three setup cases plus twelve feature cases across desktop, mobile Chromium and
canonical `webkit-iphone`, including desktop/390px and light/dark. No retry or skip.
Checks include scoped Axe, 44px coarse-pointer targets, overflow, literal low-point
and salary dates/amounts, keyboard/privacy and actual skip/Undo/unskip.

[Proof](proof.json) records the command, source hashes and the twelve synthetic
geometry receipts. Root inspected the four retained [browser images](browser):
desktop-light card/detail and WebKit configured-dark card/detail. Steps, dates,
low-point labels and page width are intact. These are browser-emulated profiles,
not physical-device or authenticated hosted-preview evidence. Fixed navigation in
full-page mobile captures is not a claim that it scrolls with page content.

## Parent acceptance

The independent parent audit confirmed the existing card/detail shared series, low point, salary provenance, route/redirect, tools, keyboard, privacy, real skip/Undo, overflow, accessibility and synthetic evidence. Later owner routing decisions retain Plan > Prognose; the step geometry requirement was not superseded. Historical evidence remains in ../forecast-568-569 and is qualified by revision; it is not relabelled as a fresh run.

The old `3.1` subtitle is a separate outstanding wording cleanup under #469/#487.
The page already uses Plan metadata/registers; report navigation and report head
classes are restricted to Reports. The later owner Plan-subpage decision therefore
does not require reopening the delivered routing change. The subtitle is not claimed fixed.

Independent final evidence review, affected Linux shell screenshots, required
final-head CI and verified publication are still pending. #476 remains open until
those gates pass.
