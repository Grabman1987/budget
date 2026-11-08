# Mobile Heute and tabs — #1005

Synthetic sample ledger only. Local CLI implementation with independent code,
test-impact and visual review by a separate Codex agent. No financial calculations,
ledger writes, migrations or deployment configuration changed.

The redesign phone header puts search, the accessible review counter and profile
beside Heute. The month name is visible in full. Month and period share a row when
they fit, with wrapping for long months at narrow widths or enlarged text. The
segment paints a 36px track inside 44px touch targets. The lead uses the existing
40px token, with a quiet dimension line. Existing cards retain one outer border.

The dock uses 22px icons and the existing 11px label token. Its height is 52px
without a device bottom inset and 78px with the synthetic 34px home-indicator inset;
every tab retains a 44px target. Task amounts have their own non-wrapping column.
Task links reserve horizontal room for the floating capture button.

## Initial implementation evidence

These captures predate the CI follow-up that restores full month names, reduces
the no-inset dock to 52px, and uses word-boundary wrapping in the task title column.
The 34px-inset dock shown here remains 78px tall.

| Profile | Light | Dark |
| --- | --- | --- |
| Chromium 1440 × 900 | [Light](desktop-heute-1440-light.png) | [Dark](desktop-heute-1440-dark.png) |
| Chromium 390 × 844 | [Light](mobile-heute-390-light.png) | [Dark](mobile-heute-390-dark.png) |
| WebKit iPhone 390 × 664 | [Light](webkit-iphone-heute-390-light.png) | [Dark](webkit-iphone-heute-390-dark.png) |

Phone captures include a synthetic 34px bottom safe area. Browser emulation is not
a physical iPhone acceptance test. These Windows captures are review evidence,
not replacements for the Linux screenshot baselines.

## Validation and test changes

- `npm run typecheck`, changed-file ESLint/Prettier and the CSS scale checker.
- Redesign ON: 31 focused Vitest tests across `redesign-mobile-chrome`, `header-q5`
  and `background-refresh`; `VITEST_MAX_WORKERS=1`, `--maxWorkers=1`.
- OFF production web build and ON e2e build.
- `issue-1005-mobile-heute.spec.ts`: 21 passing tests including setup; layout, safe areas, initial and scrolled task
  hit targets, month/review navigation, Axe and both themes across desktop,
  mobile and `webkit-iphone`. The test awaits the actual aggregate response;
  a cold WebKit read initially outlasted the UI assertion. No timeout was raised.
- `issue-995-mobile-sheets.spec.ts --grep=safe-area`: nine passing tests including
  setup across the three profiles. Only intended dock/icon dimensions changed;
  FAB clearance remains checked relative to the dock. No sheet assertions removed.
- `redesign-mobile-chrome.test.tsx`: zero, nonzero and unavailable review counts
  retain accessible labels and the inbox destination.
- `header-q5.test.tsx`: follows the ON counter placement while preserving the
  original OFF status-line assertions.

Each Playwright command runs one spec with `--workers=1`. The full local e2e suite
was not run. Independent visual review found a FAB overlap during implementation;
the final layout restores clearance and tests exposed targets before scrolling.
