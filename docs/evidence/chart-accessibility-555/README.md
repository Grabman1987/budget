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
  inventory test classifies all uppercase public exports against an explicit
  primitive/context list; any other new container needs a matching contract case.
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
- A production-JSX inventory found native image descendants in three report
  bars (Ausgabenanalyse, Budgettreue, Sparziele). Their existing data-rich names
  move to the shared wrapper while their visual child nodes become neutral.
  This preserves those names and prevents two images announcing the same bar;
  a production-source regression guard checks the duplication shape.
- Real WebKit testing then found a fourth, cross-component case: Budgettreue's
  allocation rows contain the shared `AllocationBar`, whose own image summary
  also duplicated the new wrapper summary. A default-off decorative option
  lets wrapped consumers reuse their existing share statements on the wrapper.
  A complete allocation-callsite inventory found One-Pager also uses the shared
  wrapper; its existing `splitLabel(data)` moves to that wrapper and its child
  becomes decorative too. Standalone Plan and month-close bars keep their image
  semantics. All production `ChartValue` / `ChartValues` children were inspected:
  their other imported children are table/scroll/link/term/swatch components,
  rather than independently labelled drawings. The source guard now catches
  undecorated imported allocation children as well as literal image elements.
  Real imported-component unit coverage and the canonical One-Pager browser path
  cover the two composition modes and the original data-rich statement.

## Verification

- Node 22.23.3, npm 10.9.9; `npm ci` passed.
- Focused unit run: `packages/ui/src/charts/accessibility.test.tsx`,
  `frame.test.tsx`, `plot-motion.test.tsx`, and the production-caller duplication
  guard and allocation component composition: **5 files, 25 tests passed**.
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
- The managed same-host Ubuntu container subsequently ran the genuine project
  WebKit/iPhone suite: 4/5 cases passed, including exact table values, both
  themes and Axe on the pilot. The multi-report case exposed the imported
  allocation-bar duplication above. This is a real source defect, not a waived
  assertion. The first allocation fix passed all five WebKit cases, but its
  three-report coverage omitted One-Pager; review found that remaining caller.
  The extended four-report browser case must pass on the final corrected source.
- Full check, production/E2E build completion, independent review and PR CI are
  recorded separately in the PR as their actual results become available.
  The first full check was stopped during typechecking when review reproduced
  duplicate image summaries in the pre-fix report callers. It is not a passed
  check; the corrected frozen source receives a fresh serialized full check.

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
