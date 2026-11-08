# Mobile shell and sheets — #995

All screenshots use the repository's synthetic sample ledger. No private data or
production services were used. Browser emulation is not physical-device acceptance.

## Evidence

- iPhone WebKit: 390 × 844 CSS pixels, simulated 47px top and 34px bottom safe areas.
  [Light register](iphone-register-light.png), [dark register](iphone-register-dark.png),
  [light sheet](iphone-sheet-light.png), [dark sheet](iphone-sheet-dark.png),
  [light list end](iphone-register-end-light.png), [dark list end](iphone-register-end-dark.png).
- Desktop Chromium: 1440 × 900 CSS pixels.
  [Light register](desktop-register-light.png), [dark register](desktop-register-dark.png),
  [light dialog](desktop-dialog-light.png), [dark dialog](desktop-dialog-dark.png).

The phone dock reserves 49px plus the bottom safe area. Its 24px icons and 11px
labels retain at least 44px touch targets. The shell reserves the FAB slot below
page content. Native dialogs retain their focus handling and discard guard; only
the phone handle accepts downward dismissal. Date headings reuse the existing
date formatter and input order, without changing ledger amounts or writers.

## Regression coverage

- `issue-995-mobile-sheets.spec.ts`: finite date-filtered history, safe-area and
  touch geometry, list-end clearance, light/dark screenshots, desktop dialogs,
  downward versus sideways gestures, unsaved-input preservation, focus return,
  and no API writes.
- `panel.test.tsx`: short, horizontal, upward, cancelled and accepted gestures;
  guard refusal, one guard invocation per gesture, keyboard activation, rollback.
- `booking-table-581.test.tsx`: both register variants retain row order, supplied
  dates, cent-formatted amounts and the existing booking opener.
- `css-scale.test.ts`: the 11px exception applies only to the redesign dock;
  generic tabs and registers remain rejected.
- Existing `mobile-panels`, `booking-acceptance`, `capture-dialog-layout` and
  `issue-586-mobile-capture` assertions now distinguish the ON sheet inset from
  OFF full-screen geometry. Financial, discard and touch-target assertions remain.
- Existing `mobile-shell` and `tap-targets` assertions follow the requested dock
  height and label size; their touch-target and content-clearance checks remain.

The initial end-of-list test used the shell month parameter rather than the
register's date filters. Scrolling correctly triggered `LoadOlder` and appended
another page. The corrected fixture uses explicit `von`/`bis` dates and asserts
that no load-more sentinel remains before measuring the final row. Product
pagination and scrolling were not changed.

Independent review approved the final implementation and scoped test adaptations.

## Local validation

- Redesign ON: `npm run build:e2e`.
- Rollback OFF: `npm run build -w @budget/web` with `VITE_BUDGET_REDESIGN=0`.
- `npm run typecheck`, changed-file ESLint and Prettier checks, CSS scale check.
- Focused Vitest: panel gestures, both booking-table variants and mobile shell.
- Focused Playwright: `e2e/issue-995-mobile-sheets.spec.ts`, desktop and
  `webkit-iphone`, `--workers=1`: 8 passed including setup, with the phone-only
  gesture test intentionally inapplicable to desktop.
- `VITEST_MAX_WORKERS=1` is set for local test runs and the enabled pre-push hook.

Integration retains the issue's ordering after #984. Existing affected screenshot
baselines remain subject to the repository's targeted CI snapshot workflow before
merge; these images are review evidence, not replacement baselines.

## PR #997 CI repair

Merged `origin/main` before repair, including #984. Inspected every failed job in
CI run `42412398660` with `gh run view --job ... --log-failed`.

| Failed job | Classification and repair |
| --- | --- |
| chromium-5/8 | Selector/focus drift: distinguish the header close button from the new handle in capture specs, and cover both keyboard stops. Product defect: search must retain its full-screen phone exception. |
| chromium-6/8, webkit-3/6 | Product defect in compact capture: the extra sheet chrome reduced keyboard space. Reclaim the decorative gap and handle at a visual viewport height of 500px or less; preserve the physical safe areas and pinned save action. |
| chromium-7/8 | Same compact-capture defect; retain the existing fully visible primary-field assertions in #970. |
| chromium-8/8 | Selector drift in loan, portfolio and shell dismissal; mobile panel checks now name the header close button exactly. Dock height expectation follows the intended compact ON dock. |
| webkit-1/6 | Capture close-selector drift and the full-screen search regression above. |
| webkit-6/6 | Compact-capture regression and loan close-selector drift above. |
| visual | Same shell/capture failures plus intended dock/FAB differences in expected payments, goals, net worth and shell snapshots. Inspected the downloaded Linux image diffs. |
| check | Aggregate failure from the browser jobs above. |

The dock is 49px plus the bottom safe area, replacing 64px in ON only. Content
clearance is dock + 16px gap + 58px FAB + 16px content gap: 139px without a safe
area, 173px with a synthetic 34px inset. Icons remain 24px, labels 11px, and touch
targets at least 44px. Normal sheets start at `max(24px, top safe area)`. Compact
capture starts at `max(visual viewport top, top safe area)` and ends at the visual
viewport bottom, with the bottom safe area reserved inside the dialog. The 500px
threshold matches the existing compact capture layout; actual visual viewport
events also cover iOS keyboard panning that does not resize the layout viewport.

Per-file test rationale for this repair:

- `search-launch.test.tsx` and `global-search.spec.ts`: search stays full screen
  inside the sheet-enabled shell, without a swipe handle; focus and Escape remain.
- `booking-acceptance.spec.ts`: explicitly include the new handle in both directions
  through the existing focus loop; retain every form-control and discard assertion.
- `capture-dialog-layout.spec.ts`, `capture.spec.ts`, `loan-sheet.spec.ts`,
  `portfolio-positions.spec.ts`, `payee-analysis-report.spec.ts`: exact header-close
  selectors prevent substring collisions with "Blatt schließen". The payee report
  is the remaining same-pattern caller found by repository search.
- `mobile-panels.spec.ts`: exact close selectors replace ambiguous `.first()` calls.
  The inside-tap probe now uses the form body: the old point beside the moved title
  bar let Chromium touch adjustment activate Close before the dismissal assertion.
- `shell.spec.ts`: exact close selector and ON-only 49px dock geometry; OFF stays 64px.
- `issue-970-mobile-booking.spec.ts`: preserve fully visible primary fields and save,
  and verify compact capture hides the extra handle while keeping close available.
- `issue-586-mobile-capture.spec.ts`: retain existing keyboard/pan geometry and
  discard checks; add synthetic notch/home-area checks at unpanned and panned offsets.
- `issue-995-mobile-sheets.spec.ts`: verify the physical safe areas in compact
  capture and restoration of the swipe handle when the keyboard viewport grows.

Only affected Linux baseline specs are candidates for the manual snapshot workflow:
`expected`, `goals`, `networth`, `shell`, and the newly merged `issue-980-mobile-capture`
normal-height form screenshots. No financial expectations, timeouts or screenshot
tolerances change. Bot-run approval remains with the project lead.

Repair browser validation (ON, one spec at a time, `--workers=1`): the affected
Chromium cases passed in `booking-acceptance`, `capture-dialog-layout`, `capture`,
`global-search`, `loan-sheet`, `mobile-panels`, `portfolio-positions`, `shell`,
`payee-analysis-report`, `issue-980-mobile-capture`, `issue-970-mobile-booking` and
`issue-586-mobile-capture`. The repaired M04 inside-tap case passed on its focused
rerun. `issue-995-mobile-sheets` passed all six functional cases across Chromium
and iPhone WebKit (nine tests including setup), covering both themes and gestures.

Repair static/unit checks passed: ON `build:e2e`, OFF web build, workspace
typecheck, changed-file ESLint and Prettier, CSS scale, and 107 focused Vitest
tests in eight files. Unit suites retain their existing mode fixtures; browser
validation uses the ON build. `VITEST_MAX_WORKERS=1` and Git hooks remain enabled.

Windows WebKit attempts for #970 and #586 exhausted the unchanged 30-second test
budget during navigation/focus/form setup, before the old failing geometry
assertions. Traces showed multi-second page creation, navigation and click calls;
these runs are not claimed green. Linux CI remains the cross-platform gate. No
full local e2e suite or local baseline regeneration was run. Independent review
approved the final code and test impact, including the safe-area correction and
the M04 probe.

## Category focus after keyboard resize — PR #997 follow-up

Merged `origin/main` again before this repair. CI run `42422052281` has one
underlying failure: #734's mobile category field remains partly clipped after
the viewport shrinks to 450px (intersection ratio `0.6544744372367859`). The
downloaded Linux trace shows the input beneath the fixed capture header after
the five-second assertion wait. This is a product defect, not an unfinished
opening animation. The `check` job fails because its required E2E dependency
failed; its other dependencies passed. No CI configuration change is needed.

The viewport handler now reveals the active control within `.bk-body` after
applying compact sheet geometry. It coalesces viewport events into one animation
frame and adjusts only the form's scroll position. The correction applies to
redesign phone capture/edit sheets; desktop and OFF scrolling are unchanged.
Header, footer, safe areas, dock dimensions and financial behavior are unchanged.
Manual form scrolling does not trigger the correction.

Test rationale:

- `booking-panel.test.tsx`: synthetic geometry reproduces clipping before the
  fix, then covers both scroll edges, viewport panning, preserved focus/value,
  deliberate scrolling, OFF/desktop behavior and pending-frame cleanup.
- `issue-995-mobile-sheets.spec.ts`: adds a short focused category regression in
  both themes with synthetic 47px/34px safe areas and 450/430/844px viewports.
  It keeps `ratio: 1`, additionally checks the actual body clipping bounds,
  selected-option identity, focus and the pinned Save button. Existing tests,
  #734's assertions, timeouts and screenshot baselines remain unchanged.

Validation: the new unit regression failed on the expected clipping assertion
before the fix; all 20 focused tests in `booking-panel`, `combobox` and `panel`
then passed. The short browser regression reproduced the exact CI ratio in both
Chromium themes against the old ON bundle, and both passed against the repaired
ON bundle, including a rerun using the existing direct capture URL setup. The
ON E2E build, OFF web build and workspace typecheck passed. Independent code and
test-impact review approved the repair and direct-navigation fixture.

Local Windows limits: the long #734 scenarios exhausted their unchanged 30-second
budgets at varying steps. The short WebKit regression exhausted the same budget
before resize, first during register/FAB setup and then at the scroll fixture
after direct capture navigation. Neither is claimed green locally; Linux CI
remains the gate. No timeout, assertion or baseline was relaxed, and no full
local browser suite was run. Local tests use one worker.
