# #544/#546–548 portfolio checkpoint — independent source review

Reviewed `ce1e67b17a930d3441e827359f1adf5efcb38303` against base `6420676d257698767931dd151863765cec914acf` in `/workspace/impl-portfolio-544-548`. I did not author this checkpoint. Read the full 23-path owned diff, the package handoff, the four issue bodies, and relevant existing route, valuation, trade, savings, privacy and chart implementations. **Source review only; NOT VALIDATED** by tests, typecheck, build, browser, data/provider operation or CI. No repository files were changed.

## Findings

1. **P2 — Native Kurs changes are visually flattened.** In `apps/web/src/wealth/price-history.tsx:82-91`, the new shared `Drawing` domain unconditionally includes zero: `lo = Math.min(0, ...known)` and `hi = Math.max(0, ...known)`. For stored positive prices of 100 and 101 EUR, the one-euro movement consumes less than two pixels of the 212-pixel plot. The previous native-price chart used the observed minimum and maximum with padding. The Kurs toggle in #547 therefore loses the useful price history even though the exact quotes remain accessible through chart inspection. Keep a zero baseline for Wert if desired, but derive the Kurs y-domain from the stored prices (including a sane single-point fallback). This is a display-only correction; do not change `priceMicro` or valuation.

2. **P2 — The new EUR value axis can misstate a tick and omits its unit.** `apps/web/src/wealth/price-history.tsx:120` formats cent ticks through `kfmt(v / 100)`. The existing `kfmt` in `apps/web/src/wealth/networth-model.ts:100-101` rounds whole thousands, so a 2,500 EUR tick reads `3 T`, and a fractional EUR tick can collapse to `0`; the visible axis carries no EUR label. Exact tooltip/table values still come from `eur`, but the axis itself is misleading for #547. Use the already prepared #470 monetary-axis formatter and an explicit EUR unit when integrating that checkpoint, with tick precision derived from the displayed step. Keep the native Kurs axis in the quote currency and preserve all raw values.


**Correction to the initial review:** A third finding claimed that the Kennzahlen risk labels lacked interactive definitions. That was incorrect. The pinned `portfolio-metrics.tsx:38-40` already wraps Volatilität, Max. Rückgang and Sharpe in the existing `Term` component; the alleged gap is withdrawn. No source fix is requested for #546 risk explanations.

## Source trace and limits

- #544 route-backed registers, period propagation, and dated lead/table selection trace through `router.tsx`, `portfolio-registers.tsx`, `portfolio-page.tsx`, the dated `/positions` endpoint and `portfolioPositions`. The lead and grouped table use the same response. Mobile register CSS wraps to three columns instead of requiring a swipe. Viewport geometry and pixel overflow remain unverified.
- #546 reuses `portfolioPerformanceQuery(period)` and the report's returned performance/benchmark/daily-flow fields. The visible flow table explicitly labels actual after-tax flows. `eur` delegates to privacy-aware formatting, and percentages use `privateAmount`. No independent metric calculation or finance writer was added.
- #547 `instrumentHistory` runs inside one API transaction, reuses canonical dated positions and daily valuation, checks units/value endpoints, marks missing valuations, bounds the inclusive day count and leaves stored quote/trade precision untouched. `ChartSvg` and its data table apply `privateAmount` to inspected series; the new trade list masks units and monetary strings. Browser/keyboard/actual-date marker behavior remains unverified.
- #548 `savingsMonthStrip` uses explicit `savingsMonth` and `savingsPlanId` links, distinguishes missing/ambiguous, and does not promote approximate buys. Purchase history starts closed, while existing proposal/write/Undo paths are untouched. Month-strip literal cases and page height remain unverified.

The #470 axis formatter is in a separate source checkpoint; finding 2 is an integration seam. Existing tests mentioned in the handoff still require approved adaptation later. No runtime acceptance is claimed.
