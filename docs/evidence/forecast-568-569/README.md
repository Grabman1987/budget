# #568/#569 forecast delivery evidence

Status: independent source review CLEAR; focused/compatibility tests, workspace
types, build:e2e and canonical WebKit acceptance verified below. Full required CI,
Chromium and live acceptance remain pending.
Refs #568 and #569; neither issue is complete at this checkpoint.

## Reconstruction and review

Base `331bf3750341e0ad90f2392a2290160c6149bafb` → source adoption
`a6399267c4eaa543ddbb09e53e06551db1639fd8` → account selector correction
`15db3018900a9180a79ca27d6628cf2fb95a047f` → native matcher correction
`03fc3f7e75d91a46902f72375af97df0c09c0ba2`.

[Adoption notes](ADOPTION.md) identify the exact prepared source/test overlays
and justify each of the three existing-test adapters. [Independent review](REVIEW.md)
records the original P2 account selector finding, its correction and both reviewed
deltas. Combined review is CLEAR at `03fc3f7e`; the reviewer ran no tests.

The account correction adds the absent 35-day option to the existing selector.
The subsequent test-only correction replaces unsupported `toHaveValue` matchers
with equivalent native `value` property assertions. Literal expectations,
financial rules, existing assertions and timeouts remain unchanged.

## Actual verification

| Revision   | Check                                                                                                  | Actual result                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `15db3018` | NEW domain 35d, real API 35d, Router tools/card, salary provenance, unchanged liquidity-lowpoint tests | Five files / 21 tests PASS in root's focused run.                                                               |
| `15db3018` | NEW account horizon regression                                                                         | Failed on unsupported Chai property `toHaveValue`; this was not a selected-value mismatch. Fixed in `03fc3f7e`. |
| `03fc3f7e` | NEW account horizon regression                                                                         | One test PASS, 7.13 seconds, root execution.                                                                    |
| `03fc3f7e` | Scoped ESLint and formatting                                                                           | PASS, root execution.                                                                                           |
| `03fc3f7e` | All-workspace `npm run typecheck`                                                                      | PASS, 115.93 seconds.                                                                                           |
| `03fc3f7e` | Existing forecast report/liquidity/income-pause domain and liquidity/income-pause API compatibility    | Five files / 53 tests PASS, 6.98 seconds.                                                                       |
| `03fc3f7e` | `npm run build:e2e`                                                                                    | PASS, 8.28 seconds.                                                                                             |
| `03fc3f7e` | `issue-568-569-forecast.spec.ts`, canonical `webkit-iphone`, one worker                                | Seven PASS including three setup tests and four feature scenes, 82.99 seconds; no retry/skip.                   |

The five previously passing files are unchanged at `03fc3f7e`. Therefore the
focused evidence totals 22 passing tests across six files, established in two
runs; no single six-file rerun is implied. Local execution logs remain in the
coordinator's `sprint-20261022` control directory; this document records results
without including synthetic database or environment artifacts.

## Browser evidence

All artifacts below were generated from verified source `03fc3f7e` in canonical
`webkit-iphone`. Feature scenes explicitly cover 1440×900 desktop and configured
390-wide geometry in both themes; this does not claim a physical-device run or
Chromium execution. Root opened these four original images and found the chart
labels readable without overlap, with the account/household scope clear:

- [Card · desktop light](browser/forecast-card-desktop-light.png)
- [Detail · configured light](browser/forecast-detail-configured-light.png)
- [Card · configured dark](browser/forecast-card-configured-dark.png)
- [Detail · desktop dark](browser/forecast-detail-desktop-dark.png)

Raw four-scene geometry and environment receipts:
[desktop light](browser/forecast-desktop-light.json),
[desktop dark](browser/forecast-desktop-dark.json),
[configured light](browser/forecast-configured-light.json),
[configured dark](browser/forecast-configured-dark.json).
The successful feature checks cover shared literal card/detail low and salary
markers, compactness, no overflow, scoped Axe, keyboard/privacy/draft retention,
target geometry and real skip/Undo/unskip. Only the four inspected PNGs are
retained here; attachments and uninspected duplicate images are excluded.

## Compatibility and main refresh

Independent full caller/fixture review is CLEAR at `43846fa8` (see
[review delta](REVIEW.md#existing-callerfixture-delta--clear)). It covers all
additional existing-test adapters and truthful compact-card scope wording.

Affected shell snapshot rerun [39770384412](https://github.com/Grabman1987/budget/actions/runs/39770384412)
used exact `9e61403e`: actual **44 PASS**, with existing project skips; no baseline
changes. It resolved the four missing-chart readiness failures in run 39769372353. Workflow job success alone was not treated as test success.
This rerun predates the subsequent scope wording/compatibility adapter commit;
updated wording still requires browser/snapshot revalidation.

A single normal merge incorporated live main
`1c19a465649490417f174787a9806b3347b7b7a6` (#740 / PR754) as merge commit
`b23e84427031839fc45ea876f33e531256c28813`, without conflicts or history rewrite.
Current Heute task navigation, Plan filters, the 35d account selector and incoming
statement receipt links remain intact. Existing screenshots/receipts above are
historical verified `03fc3f7e` evidence, not proof of the merged source or the new
scope wording. Required changed-caller browser checks and exact-head CI remain.

## Pending gates

- Required complete lint/unit/build and Chromium desktop/mobile CI on the exact
  final head. CI may fulfill the complete-check requirements under current rules;
  no redundant full local run is claimed.
- Existing relevant income-pause/liquidity/navigation/issue-567 browser regressions.
- Independent final evidence review and serialized main-green/deployed/live
  integration gate before closure.

No Chromium, CI, deployment or live completion is claimed. The original
9000-cent salary fixture, financial oracles, security, locks, audit/Undo checks,
tolerances and time limits are preserved.
