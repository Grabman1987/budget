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

## Cloud handoff verification (2026-10-19)

The additional cloud agent reused implementation commit `18725a63` in an isolated
worktree; it did not start a second implementation. `npm ci` and
`npm run build:e2e` succeeded with Node 22.23.3 and npm 10.9.9.

Fresh genuine Playwright launch probes still fail before page assertions:
Chromium headless shell build 1248 is absent; WebKit build 2370 is present but
requires `libgtk-4.so.1`, `libgraphene-1.0.so.0`, `libharfbuzz-icu.so.0`,
`libmanette-0.2.so.0`, `libhyphen.so.0` and `libGLESv2.so.2` in this runtime.
The Chromium installation attempt returned HTTP 403 `Domain forbidden` for
`https://cdn.playwright.dev/builds/cft/156.0.8078.4/linux64/chrome-linux64.zip`.
The current enforced network policy includes the CDN, but excludes its
`storage.googleapis.com` redirect destination (confirmed by the coordinator).
No alternate-host workaround or substitute browser acceptance is claimed.

The desktop/mobile browser results below belong to the original implementer's
system-Chromium run. They are historical evidence for the unchanged UI tree,
not successful canonical browser checks in this handoff. This work is being
handed off as an explicitly authorized draft PR, pending the listed integration
and exact-browser checks; no merge, deployment or issue completion is claimed.

## Reduction reference

The owner clarified in this session that the ≥30% comparison is against the
**audit state in the issue**, not today's main. The synthetic sample contains
19 groups, 36 visible categories and 11 single-category groups.

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

## Verification status

- E2E production build passed.
- System Chromium 154.0.8037.57 is available. Playwright 1.64.1 expects Chromium
  156 (build 1248) and WebKit 2370. The regular desktop/mobile/WebKit run failed
  before page assertions because these executables are absent.
- Two `playwright install chromium webkit` attempts failed with HTTP 403
  `Domain forbidden` at `cdn.playwright.dev`. The owner authorizes Internet
  access, but the runtime still reports a restricted network policy without
  that host. This is an environment blocker, not a denied owner permission.
- A temporary, uncommitted config selects `/usr/bin/chromium` for diagnostic
  desktop/mobile runs. The committed Playwright config and existing tests are
  unchanged. This fallback does not prove WebKit acceptance or exact-browser
  screenshot parity.
- New desktop and Chromium-mobile cases passed: band selection, Enter/Tab/Escape, C/G, unchanged
  assignment/quick-assignment/move/cover requests and undo, refusal above free
  money, transition to two categories, desktop multiple-month collapse, sample
  counts, overflow, bar containment, light/dark Axe, and ≥44px phone controls.
  Existing serial Plan regressions also passed for ghosts/quick assignment,
  alternative views, target inventory, card debt, rollover, negative assignments,
  insufficient-source confirmation, and UI/API assignment guards.
- Existing compact-grid and inspector regressions passed on desktop and
  Chromium mobile: **4/4** scenarios (the earlier combined run was 11/11
  including new cases and setup).
- Final `BUDGET_REQUIRE_AGE=1 VITEST_MAX_WORKERS=2 npm run check`: all
  workspace typechecks, CSS scale, ESLint and Prettier passed (one pre-existing
  unused-disable warning in `packages/ui/src/components/panel.tsx`). Unit result:
  **480 files passed, one failed; 4,381 tests passed, one failed, zero skips**.
  The sole failure is the old `Lebensmittel` button selector at
  `apps/web/src/budget/budget-ui.test.tsx:335`; the band is now named
  `Alltag · Lebensmittel`. No test was edited. All other unit suites, including
  account settings, Dropbox and required-age backup/restore, passed.
- Earlier overlapping diagnostic runs had timeouts; the final aggregate ran
  with bounded workers and no concurrent browser run. A final serial browser
  regression run passed **19/19** (including three setup cases) in 1.8 minutes.
  Test timeouts and tolerances are unchanged.

Only synthetic fixture data appear in screenshots. `desktop-light.png` is the
1440px reference. A Chromium phone screenshot is explicitly named `mobile-*`;
it must not be represented as an iPhone/WebKit result. Required WebKit iPhone
checks and the actual dark iPhone image remain open.

## Remaining integration work

- Complete exact-browser desktop/mobile/WebKit acceptance and the iPhone dark
  image once browser installation is available.
- Opus must update only the accessible-name selector in
  `apps/web/src/budget/budget-ui.test.tsx:335` from `Lebensmittel` to
  `Alltag · Lebensmittel`, retaining all following inspector/edit/Escape/focus
  and outside-click assertions. This follows issue #481 / owner decision 7A;
  the new browser case separately verifies the combined name and interactions.
  Required independent review/test-change labelling remains with Opus. Then
  rerun the aggregate to obtain a genuinely green check.
- Opus scope review, any required independent review, CI and integration remain
  separate gates. No live/deployment acceptance is claimed.

## Reproduction

- Canonical: `npm run build:e2e`, then
  `npx playwright test e2e/issue-481-single-category-band.spec.ts --project=desktop --project=mobile --project=webkit-iphone --workers=1`.
  Browser installation is required; the current environment cannot run this
  canonical command successfully.
- Final unit gate (with age/age-keygen on PATH):
  `BUDGET_REQUIRE_AGE=1 VITEST_MAX_WORKERS=2 npm run check`.
- Diagnostic final browser run: the new spec plus `e2e/plan.spec.ts`,
  `e2e/plan-views.spec.ts`, `e2e/plan-ghost.spec.ts`, desktop/mobile, one worker.
  The temporary config imports `playwright.config.ts` and only overlays
  `use.launchOptions.executablePath: '/usr/bin/chromium'` and
  `args: ['--no-sandbox']` for non-WebKit projects. It is removed before commit.
- Visual review: opened the issue's audit/decision images and generated desktop
  light / Chromium-phone dark images. A new bar-containment assertion caught
  and now guards a band-height overflow. There is no changed Plan screenshot
  baseline; existing baselines were not regenerated. No local Impeccable engine
  was available; the repository adapter and browser evidence were used.
