# Plan single-category bands — issue #481

Scope: presentation in Plan › Monat, single-month Groups view. Based on
`e14932de` and owner decision 7A. Codex implements this pilot; Opus retains
required reviews and integration. No merge or queue loop was started.

A band reuses `EnvelopeRow`, `AssignCell`, the inspector and existing mutation
callbacks. Group number/name, category figures, available pill, status/bar,
checkbox and + share one row. + opens the existing category form. A second
visible category restores a normal group. Alternative and multiple-month
layouts remain separate; collapse-all excludes bands only in the single-month
Groups view. A distinct category name remains in the button's accessible name.

## Verified cloud results (2026-10-19)

The coordinator repaired the obsolete inspector selector (`f484767e`), then
fixed a real desktop overlap and reviewed the collapse/detail test adaptations
(`d309fa89`). Existing financial and geometry assertions were retained.

- Exact-head GitHub CI [39240826745](https://github.com/Grabman1987/budget/actions/runs/39240826745)
  **passed** at `d309fa89b4936645e8e9cf7b36a5cdb95345bad8`, including all 12
  canonical Chromium/WebKit E2E shards, visual checks, both Windows unit shards,
  static checks, Linux unit tests, Docker and encrypted restore.
- The coordinator independently ran the unchanged repository Playwright config
  and real `webkit-iphone` project against synthetic local servers in an
  isolated Ubuntu 24.04 Docker container: **9/9 passed** (three API setup cases,
  two single-band cases, four menu cases). This includes light/dark Axe,
  44px phone controls, row counts, no sideways scroll, selection, keyboard,
  mutation/undo and the transition to two categories.
- The actual WebKit 27.2 dark iPhone capture is `webkit-iphone-dark.png`;
  measured rows are in `webkit-iphone-rows.json`. The coordinator opened the
  image for visual inspection. This replaces the earlier missing-iPhone-image
  blocker; it is not an image from Chromium emulation.
- Node 22.23.3 / npm 10.9.9 / pinned Playwright 1.64.1. Ubuntu's actual system
  dependencies were installed inside Docker with `playwright install-deps
  chromium webkit`, then the official pinned Ubuntu WebKit was downloaded.
  No host dependency check was disabled and no browser configuration changed.
- Chromium remains unavailable in this managed host because its CDN redirects
  to denied `storage.googleapis.com`. Its exact-browser acceptance above comes
  from the canonical GitHub runner, not a substituted system executable.
- The existing inspector unit file passed **18/18** after its one-literal
  selector adjustment. Separate reviewers checked that adjustment and the
  collapse/detail/desktop-track changes. Named Opus review and integration
  remain separate pending gates.

## Historical diagnostic runs

The implementation initially used system Chromium 154 for diagnostic desktop
and phone runs. Those results are superseded for browser acceptance by the
canonical exact-head CI and genuine WebKit run above. Earlier host-only WebKit
launches failed on missing libraries; the Docker result does not assert that
the host itself now has those packages. The official pinned Playwright Docker
image download also failed with HTTP403; the successful container instead uses
a digest-pinned Ubuntu base and the project's own browser installer.

## Reduction reference

The synthetic sample contains 19 groups, 36 visible categories and 11
single-category groups. Both references are reported explicitly; no new owner
approval of a comparison baseline is claimed here.

| Content rows (excluding gaps and the table head) | Count |
| --- | ---: |
| Audit: group headers + category rows + per-group add rows | 74 |
| Current main after Z1: group headers + category rows | 55 |
| This change: normal groups/children + single bands | 44 |

Reduction against the audit is **40.54%**; the additional reduction against
current main is **20%**. No category or financial amount is removed. The old
structure is documented in the issue's `desktop-light-006-plan-monat.jpg`;
`row-7.png` defines the selected band alternative. The audit commit
`8450b6b4c3bc73cac65e413533190b00fa6c5875`, `plan-page.tsx:679`,
also confirms one `plan-add-row` per expanded group. New E2E assertions count all
44 content rows, all 36 category representations, all 11 bands, and the ≥30%
audit reduction. JSON measurements are generated beside the screenshots.

## Open acceptance and integration gates

The original issue requires a sample table at least 30% shorter but does not
explicitly choose audit-state versus current-main row counts. The implementation
passes 30% against the documented audit structure; its additional reduction
against current main is only 20%. Do not treat those percentages as equivalent
or mark this acceptance criterion complete without resolving the reference.

The required named Opus scope/test-change review, applicable test-change label,
serial integration and live verification remain pending. This evidence commit
does not merge or deploy the feature and does not close the issue.

## Reproduction

Build with `npm run build:e2e`. With the project's pinned browser and actual
system dependencies installed, the coordinator's unchanged canonical command was:

```sh
npx playwright test e2e/issue-481-single-category-band.spec.ts e2e/issue-588-plan-menus.spec.ts --project=webkit-iphone
```

The normal repository setup bootstraps synthetic disposable databases through
its API-only setup projects; it does not require a Chromium launch for this
WebKit project. No private database, financial data, provider or credentials
were used. The standalone browser smoke also launched real WebKit 27.2 and
rendered a synthetic page. Rootless host launch failures and the still-blocked
Chromium download are retained in the environment's external setup logs.
