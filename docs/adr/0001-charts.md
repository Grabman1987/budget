# ADR 0001: Charts are own SVG on d3-scale and d3-shape

- Status: accepted (P1a spike, 29.09.2026)
- Confirms SPEC §9 ("Own SVG components … ECharts only if the P1 spike shows a clear need") and closes the open item "Chart library confirmation".

## Context

The report catalog (SPEC §7) has 30 reports with a fixed chart grammar from `DESIGN.md`: ISO line types (solid = actual, dashed `7 5` = plan/forecast, dash-dot `12 4 2 4` = previous), dimensioned gaps (Maßlinie with slash terminators), elevation marks, hatching for classes, heatmaps with a diverging scale, a Sankey with one income pool, sunburst, step lines and bars around zero. The prototype already draws all of them as hand-built SVG.

The spike ports two representative, structurally different charts into `apps/web`:

| Chart | Where | What it exercises |
| --- | --- | --- |
| Heute pace chart | `apps/web/src/charts/pace-chart.tsx`, model in `pace-model.ts` | linear scales, step line, three line types, today line, dimensioned actual/plan gap with slash terminators, red only for the "über Plan" alert |
| Geldfluss Sankey | `sankey-chart.tsx`, pure layout in `sankey-layout.ts` | custom layout (ribbons), class colours, dashed outline for "Übrig", phone layout that drops a column |

Both render from hard-coded synthetic data, are responsive through a `ResizeObserver` hook, are styled only with CSS classes (no inline `style`, so the strict CSP `style-src 'self'` holds), and are covered by unit tests (pure layout/model) and the Playwright smoke test.

Page: `/dev/diagramme`. Screenshots: `docs/p1a/`.

## Decision

Keep **own SVG components** built on `d3-scale` (scales) and `d3-shape` (`line`, later `arc`, `area`, `stack`). Do not add Apache ECharts.

## Why

1. **The grammar is custom and is the product's look.** Dimension lines, revision triangles, elevation marks, dash-dot previous-period lines and hatched class swatches are not chart-library concepts. In ECharts each of them would be a `custom` series or a `graphic` overlay, i.e. we would write the same SVG geometry against a heavier API and then fight its theming to reach the tokens.
2. **The prototype is the reference and is already SVG.** Porting `renderPace` and `sankey` took a few hundred lines of React; the geometry code carried over almost unchanged. No translation layer means less drift from `design/screens`.
3. **CSP and theming.** Own SVG uses CSS classes bound to design tokens, so light/dark and print tokens (P1b) apply for free and no inline styles are needed. ECharts sets styles from JS options and bakes colours into the option object.
4. **Testability.** Layout is pure (`sankeyLayout`, `paceModel`) and unit-tested; domain figures stay in `packages/domain` and are never recomputed in chart code.
5. **Accessibility and print.** Each chart is a single `<svg role="img">` with a generated text summary, drill-down can be real DOM (buttons, links, `<title>` tooltips), and the printable A4 sheets (reports 1.1, 5.1) render crisp vector output without a canvas fallback.
6. **Weight.** The whole web bundle of this spike (React, Router, Query, d3-scale/shape, both charts) is 364 kB minified / 120 kB gzip. A full ECharts build alone is of the same order or larger (not measured in this spike; its tree-shaken core would still need line, bar, heatmap, sunburst, sankey and custom renderers).

## Consequences

- Every chart type in the catalog is our code: axis/graticule, line (solid/dashed/dash-dot), bars around zero, step line, band, elevation mark become primitives in `packages/ui` (P1b task "Chart primitives"). P1b implemented them in `packages/ui/src/charts` (`ChartSvg`, `Graticule`, `AxisLine`, `XTicks`, `Line`/`StepLine` with the ISO line types, `BarsAroundZero`, `Band`, `ElevationMark`, `DimensionLine`, `ClassPatterns`, `LineLegend`); the spike's pace chart in `apps/web/src/charts` is now composed from them, the Sankey stays a spike until P6.
- Heatmap, sunburst and the pivot explorer (P6) are the largest own-code items. Sunburst uses `d3-shape` `arc` plus a small partition layout (`d3-hierarchy` if needed). The Explorer is a table, not a chart.
- Tooltips and hover are plain DOM/SVG `<title>` for now; an accessible tooltip primitive belongs to P1b.
- Real-time zoom/brush, if ever required, is not covered by this decision. If a future report needs it (for example daily price history with brushing in P5), reconsider ECharts **for that chart only** and record it in a new ADR.

## Alternatives considered

| Option | Verdict |
| --- | --- |
| Apache ECharts | Rejected: custom grammar needs `custom`/`graphic` escape hatches everywhere; heavier, style-by-JS conflicts with tokens and CSP. |
| Recharts / Visx | Rejected: still forces our line types and dimension marks through component props; Visx is essentially what we do with d3 directly. |
| Plotly / Chart.js (canvas) | Rejected: canvas breaks vector print, DOM drill-down and accessibility. |
