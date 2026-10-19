# Shared chart accessibility — #555

Scope: the shared chart containers and one report pilot, based on `e14932de`.
Owner decisions in #488 (16 October 2026) require a data statement, image
semantics, hover inspection and a table alternative. This change does not
redesign charts or change their calculation, geometry or source values.

## Contract

- `ChartSvg`, `ChartValues` and `ChartValue` require a `label` containing the
  key statement. SVG drawings retain their image role. Interactive SVG groups
  and HTML drawings gain a separate, visually hidden labelled image summary,
  leaving their links, native tables and controls accessible.
- Geometric primitives (lines, bars, axes, bands and marks) remain parts of the
  enclosing chart image, not separate flattened images. The public-container
  inventory test requires a matching contract case for a new `Chart*` export.
- The optional `table` prop is forwarded by all three containers. The disclosure
  is outside the chart's pointer/arrow-key handler; native disclosure controls
  and horizontal table scrolling keep their own keyboard behavior.
- Every inspected point/series value is copied verbatim into the table in
  source order. Signed cents, micro-unit prices, percentages and unavailable
  values are not rounded, summed, padded or replaced. Dates use the same date
  labels as inspection. Amount privacy masks captions, summaries and values.
- The Vermögen und Schulden report enables the shared disclosure. Its three
  series reuse the existing `chartPoints` values. Other reports can opt in;
  their native tables and existing disclosure designs are retained. This
  bounded change does not claim a full report-wide table migration.

## Verification

- Node 22.23.3, npm 10.9.9; `npm ci` passed.
- Focused unit run: `packages/ui/src/charts/accessibility.test.tsx`,
  `frame.test.tsx`, `plot-motion.test.tsx`: **3 files, 19 tests passed**.
  New cases cover the public contract, native SVG/HTML links and table roles,
  exact ordered values, privacy, stale-data replacement, opt-in and empty data.
- `npm run typecheck -w @budget/ui`, focused ESLint and the CSS scale check passed.
- JSDOM does not implement closed-disclosure visibility or summary's native
  Enter action. Unit cases inspect native `open` state with pointer activation;
  the new canonical browser case separately checks true visibility, Enter,
  focus return, API-to-table parity, both themes, Axe and phone/overflow geometry.
- Browser launch probes in this runtime failed before page assertions:
  Chromium shell build 1248 is absent; WebKit build 2370 lacks
  `libgtk-4.so.1`, `libgraphene-1.0.so.0`, `libharfbuzz-icu.so.0`,
  `libmanette-0.2.so.0`, `libhyphen.so.0`, `libGLESv2.so.2`.
  No alternate browser, skipped check or relaxed tolerance substitutes for these.
- Full check, production/E2E build completion, independent review and PR CI are
  recorded separately in the PR as their actual results become available.

## Required browser acceptance

After the genuine project browsers and system libraries are available:

```bash
npm run build:e2e
npx playwright test e2e/issue-555-chart-accessibility.spec.ts --project=desktop --project=mobile --project=webkit-iphone --workers=1
```

The case records synthetic report captures in its Playwright artifact directory.
No desktop, phone, iPhone or Axe success is claimed from the current failed
launch probes. Required report/browser acceptance, approved evidence images,
independent review, CI and live verification remain open; #555 stays open.
No existing test, configuration, manifest, lockfile or screenshot baseline changed.
