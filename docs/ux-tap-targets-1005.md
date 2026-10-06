# UX-3b — Touch targets, 2026-10-05

Shared native controls have a 44 × 44 px minimum on coarse pointers and below
768 px. The existing `--touch` token sets both dimensions; the minimum wins over
compact page and utility styles. Inline links gain a box; page-specific block
and grid links retain their display. Fine-pointer desktop controls keep their
compact sizes.

Phone tabs and segmented controls use the existing body-scale token (15 px on
phones, 14 px on wider touch devices). Panel close buttons have a touch-visible
German label. The booking dialog's close and flag controls display their existing
accessible names as labels, including the selected flag colour. Existing keyboard,
focus-return and flag-menu behaviour is reused.

The only table spacing adjustment reserves 44 px for the shared booking-row
selection control, including the existing foreign-currency row variant. Its
default input margin is removed so the enlarged checkbox cannot overlap the
neighbouring flag. The table's columns, order and responsive structure remain.
No page component, financial logic, fixture or dependency changes.

## Regression coverage

- `details.test.tsx`: panel close has visible label content and its existing
  accessible name; label content is hidden from assistive technology to avoid
  repetition.
- `tap-targets.spec.ts`: actual bounding boxes for native controls, nav tabs,
  segmented controls, booking status, row flag/selection, booking dialog close,
  flag choices and FAB. Includes tab/segment typography, checkbox hit testing,
  touch selection, flag-menu focus return and dialog closing.
- The spec covers Chromium desktop with a coarse pointer, 390 px touch/fine
  pointers, and the existing WebKit iPhone project. A fine-pointer 1440 px
  check retains the 28 px desktop segment height.

The initial regression failed on a 42.48 px segment width, 11.5 px phone tabs,
and missing close-label content. A separate hit-test regression reproduced
checkbox/flag overlap before the selection-slot adjustment.

## Affected Linux baselines

No baseline was regenerated locally. Review these existing phone images in
the pinned Linux environment:

- `auth.spec.ts-snapshots/{login-page,setup-page}-auth-mobile-linux.png`
- `components.spec.ts-snapshots/bauteile-{light,dark}-mobile-linux.png`
- `shell.spec.ts-snapshots/shell-{heute-light,heute-dark,reports-light}-mobile-linux.png`
- `networth.spec.ts-snapshots/vermoegen-netto-{light,dark}-mobile-linux.png`
- `rules.spec.ts-snapshots/regelwerk-{light,dark}-mobile-linux.png`
- `goals.spec.ts-snapshots/sparziele-{light,dark}-mobile-linux.png`
- `expected.spec.ts-snapshots/expected-{light,dark,income-dark,panel-light}-mobile-linux.png`

Fine-pointer desktop baselines should retain their existing sizes. Local Windows
screenshots are evidence, not Linux replacement baselines.

Local synthetic evidence: [desktop 1440](evidence/ux-tap-targets-1005/desktop-1440.png),
[phone booking dialog](evidence/ux-tap-targets-1005/phone-390-dialog.png) and
[phone booking rows](evidence/ux-tap-targets-1005/phone-390-ledger.png).

## Local verification

The full `npm run check` was started once with two Vitest workers. It stopped
at the new unit test's unsupported Testing Library `exact` option. The test now
uses an anchored name expression; the UI typecheck passed on rerun. All other
workspace typechecks had passed. The remaining full lint/format and unit phases
were run separately, without restarting the full check.

The full unit run passed all 3,175 tests in 336 files (647.19 seconds, exit 0).
No unit rerun, assertion change or repository timeout change was needed.

Lint/formatting, the production build and E2E web build passed. The focused
panel unit file passed all 13 tests before the full run. The affected browser
matrix initially had 85 passed, 21 planned skips and four 30-second timeouts:
the existing desktop/mobile 65-route sweeps, the WebKit profile screenshot and
the new WebKit measurement flow. A single-worker, 120-second targeted rerun
passed all four failures (9 passed, 2 planned skips). No assertions changed.

The multi-control WebKit measurement needed more than 30 seconds, so its own
test has a bounded 60-second deadline. The final new-spec run, with regular
configuration, passed 11 tests with four viewport-related skips across desktop,
390 px Chromium and WebKit. Windows skips the Linux-only visual comparisons;
the baseline list above still requires pinned Linux review.

## Owner steps

Review the affected Linux images and check selection, status, flag, close, tabs
and booking capture on the original phone in both themes. No keys, consents,
migrations or provider setup are required. CI and owner acceptance remain gates.

Normal worktree HEAD writes were denied. Delivery commits use the ignored
`node_modules/.cache/ux3b-delivery.git` directory and the requested
`codex/ux-tap-targets-1005` branch. The original worktree HEAD still names
`codex/ux-touch-targets-1005`; synchronize that checkout with the delivered branch
when Git metadata is writable again. The source files remain in the worktree.
