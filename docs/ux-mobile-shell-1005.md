# UX-3a — Phone shell, 2026-10-05

The phone keeps one floating action, `Buchung erfassen`, above the safe-area-aware
tab bar. The existing global search opens from a 44 px header button. The theme
switch moves into the profile menu so the area title and touch targets fit at
390 px. Desktop search and Ctrl K use the existing flow.

Shared sheet padding covers the tab bar, the 16 px FAB offset, the 58 px FAB and
16 px clearance above it. Page bodies and financial logic are unchanged.

The reported avatar interception did not reproduce on the prior tree in local
Chromium or WebKit: hit testing reached the summary, a touch opened the menu, and
its settings link worked on Heute, Einstellungen, Portfolio and Plan. The new
spec preserves that touch path. No speculative overlay fix was added; reproducing
the original failure on the owner's device remains open.

## Checks

- `mobile-chrome.test.tsx`: header search and a single booking capture action.
- `mobile-shell.spec.ts`: 390 px header search/focus return, single floating
  action, booking sheet, avatar hit testing/touch navigation and final-content
  clearance on all four reported pages; also runs in the WebKit phone project.
- Existing global-search, phone-layout and shell specs cover desktop Ctrl K,
  search results, keyboard/profile access, touch-target sizes and title clipping.

## Affected Linux baselines

No baseline is regenerated locally. Review these mobile images in pinned Linux CI:

- `shell.spec.ts-snapshots/shell-{heute-light,heute-dark,reports-light}-mobile-linux.png`
- `networth.spec.ts-snapshots/vermoegen-netto-{light,dark}-mobile-linux.png`
- `rules.spec.ts-snapshots/regelwerk-{light,dark}-mobile-linux.png`
- `goals.spec.ts-snapshots/sparziele-{light,dark}-mobile-linux.png`
- `expected.spec.ts-snapshots/expected-{light,dark,income-dark,panel-light}-mobile-linux.png`

Auth and component baselines have no application shell. Desktop baselines should
remain unchanged. Evidence screenshots are test output, not replacement baselines.

## Owner steps

Review the affected Linux screenshots and check the four pages on the original
phone in both themes: search, booking capture, final rows, profile menu and theme
switch. If the avatar still fails, record the page, browser and scroll position
for reproduction. No keys, consents, migrations or provider setup are required.

Local synthetic evidence: [desktop 1440](evidence/ux-mobile-shell-1005/desktop-1440.png)
and [phone 390](evidence/ux-mobile-shell-1005/phone-390.png).

## Local verification limitation

The full local check is not green. The unchanged format-hook fixture still fails
in isolation (33/34 tests pass): its internal 800/900 ms Prettier process limits
skip formatting under local load. A longer Vitest timeout does not change those
internal limits. This is outside the shell lane and remains a separate follow-up.
Three other full-suite timeout files pass in isolation with a longer test timeout
(80/80 tests). Type checking, lint, production/E2E builds, the new shell unit test
and the affected browser reruns pass. No green full-suite or Linux visual result
is claimed. Full-suite and owner/CI acceptance remain open.
