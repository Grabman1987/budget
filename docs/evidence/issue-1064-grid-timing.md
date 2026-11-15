# WebKit grid diagnosis (#1064)

This is a diagnostic slice, not completion of #1064 or physical-iPhone acceptance.
All browser data comes from the synthetic sample ledger.

## Existing fixes on the starting revision

Starting revision: `3c64e14fc288c3204e46b2db9082cc506136e50d`.

- [#1063](https://github.com/Grabman1987/budget/pull/1063) already replaced the
  redesign's full-height pseudo-element with an ordinary tiled background. The
  OFF build retains its corner accent. Another grid implementation would need
  evidence against this current implementation first.
- [#1067](https://github.com/Grabman1987/budget/pull/1067) diagnosed the theme race
  in 596 and the long combined 591 scenario. Its report includes a with/without
  gradient comparison, CI timings and the preserved assertion mapping. The theme
  helper waits for CSS transitions; the three 591 cases keep the original checks.
  This slice does not independently reproduce that report's historical timings.

## Reproducible comparison

Build the redesign and run one spec with one worker:

```powershell
$env:VITE_BUDGET_REDESIGN = '1'
npm run build:e2e
$env:PLAYWRIGHT_JSON_OUTPUT_NAME = 'test-results/grid-report.json'
npx playwright test e2e/issue-1064-grid-timing.spec.ts --project=webkit-iphone --workers=1 --reporter=list,json
```

The same read-only Plan scenario runs in light/dark with three modes: today's
background, the reconstructed #1049 full-height pseudo-element, and no grid.
Computed-style assertions verify the selected mode, tile sizes and missing mask.
Each case attaches `grid-timing` JSON and a viewport image to the Playwright report.
The report includes browser version, viewport, main geometry, theme-switch and
screenshot wall time, and 12 animation-frame gaps while alternating page scroll.

Frame gaps measure scheduling cadence, not isolated GPU paint cost. Screenshot
time includes automation and PNG encoding. These are comparative diagnostics,
not a performance threshold or proof of the original 591/596 root cause. The
probe uses reduced motion, like 591; it does not reproduce 596's transition race.
It is not a replacement for either original spec. No existing test, timeout,
assertion, financial expectation or screenshot baseline is changed.

## Local observations (2026-11-15)

On Windows, the unchanged 591 spec failed all three cases at its existing 30 s
timeout. Light/dark reached touch-target geometry checks; disclosures reached the
reload. The light trace had approximately 4.7 s inside `axe.runPartial`; individual
assertions and browser calls throughout the scenario also took 0.5–3 s. This
happened with today's background, without the suspected full-height layer.
It establishes a local failure on the current code, not the cause of CI slowness.

The probe's initial development run used the default two-month Plan preference,
which hides the phone inspector. It failed readiness before comparing grid modes;
those runs are invalid performance evidence. The probe now explicitly selects one
month, matching 591. A concurrent typecheck during that development run is another
reason not to use its timings.

A second development run reached readiness, then exposed the app's inline-style
CSP. Those failed injections are also invalid comparison evidence. The probe now
inserts rules into an existing same-origin stylesheet through CSSOM; it neither
disables nor edits the app's CSP. Computed-style assertions detect ineffective
overrides.

The corrected probe subsequently passed all 18 cases across desktop, mobile and
WebKit iPhone (21 tests including setup), sequentially with one worker and no
concurrent compiler/test command. WebKit 27.2 used a 390 × 664 viewport and the
same 390 × 5569.5625 main geometry in all six cases. Page scroll range was 4906 px.
Both themes' background/legacy-layer viewport PNGs were byte-identical, also
confirmed by decoded-pixel comparison. The images were visually inspected; this
is limited to the sampled Plan viewport, not all pages or a physical device.

| Theme | Mode | Theme switch (ms) | Screenshot (ms) | Median frame gap (ms) | Max frame gap (ms) |
| --- | --- | ---: | ---: | ---: | ---: |
| Light | Background | 247 | 1555 | 174 | 695 |
| Light | Legacy layer | 98 | 922 | 34 | 448 |
| Light | No grid | 98 | 1050 | 219.5 | 384 |
| Dark | Background | 291 | 1188 | 33.5 | 467 |
| Dark | Legacy layer | 333 | 803 | 33.5 | 383 |
| Dark | No grid | 230 | 724 | 36 | 375 |

One preceding run of the corrected probe passed five cases but its first case
exceeded the unchanged 30 s budget around screenshot/attachment completion; its
trace records approximately 3.9 s in the screenshot call. The complete follow-up
run above is operational verification, not three-run stability or causal proof.
The mixed ordering (including slow frames without any grid) does not establish a
legacy-layer bottleneck. One sample per cell is insufficient to infer a speedup.

Static checks and the OFF web build passed. The existing theme-button unit test
is a related sanity check; no new unit test can measure browser paint or replace
the real-WebKit probe.

## Remaining acceptance

- Collect and compare valid mode timings on an otherwise idle WebKit runner.
  Investigate paint/layout directly if the comparison shows a consistent effect.
- Only change product rendering if that measurement confirms a grid bottleneck;
  compare both themes and regenerate only affected baselines if pixels change.
- Verify three consecutive green `webkit-3-6` jobs on the final fix. A green job
  elsewhere, a leaf lane or a local probe is not this acceptance.
- Keep the original 591/596 checks and physical-iPhone acceptance separate.

No migration or production change is included.
