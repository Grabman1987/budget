# UX-3e — Booking dialog polish

Scope: the booking dialog and its tests. Existing German copy, design tokens,
native date input, details disclosure and arithmetic parser are reused.

- Booking capture opts out of calculator buttons and describes typed arithmetic.
  The shared AmountInput has one optional prop, enabled by default everywhere else.
- The payee list opens above the input and is bounded to 132 px; this leaves
  Bezahlt von accessible and avoids click-target movement when the field blurs.
  Only an unambiguous suggestion is accepted by Enter without arrow-key selection.
- Mehr holds Aufteilen, Wiederholen, Notiz and the existing Projekt selector.
  A summary names set options; closing it preserves all entered values. Edits and
  drafts with optional content open it automatically. Mehr follows Kategorie; the
  phone sheet retains the shared 88dvh cap; the form body scrolls above its sticky footer.
  The existing repeat action
  still creates a schedule on save; this task does not add schedule editing.
- Today/yesterday use the existing Vienna date and addDays; Datum… focuses the
  native date field. Markieren and Schließen have tooltips and accessible names.
- A chosen payee uses its most recent live booking on/before today, via the existing
  filtered booking API (one row, newest booking date first). Closed/missing accounts
  fall back to the existing browser capture memory, then current account context.
  Explicit account selection, another typed payee or kind change rejects stale
  answers; leaving the same payee again retains a manual account choice. Edits and
  queued bookings keep their stored account.

## Tests and visuals

Synthetic unit cases cover account precedence/closed accounts, date actions at
2026-10-05, disclosure containment/summary, arithmetic hints and manual overrides.
Booking E2E covers 1440 px desktop and 390 px phone, arithmetic, payee acceptance,
list/account geometry and click focus, date actions, preserved disclosure content,
auto-open on edit, both themes, axe and horizontal overflow. Existing capture,
split, transfer and offline queue scenarios use the new disclosure/expense label.

Affected evidence captures: booking-ux.spec.ts capture.png, booking-compact-light.png,
booking-compact-dark.png, booking-polish-light.png and booking-polish-dark.png on
both projects. No existing versioned
screenshot baseline includes this dialog. Component baselines retain the default
AmountInput behavior. No baselines were regenerated locally.

[Desktop light](evidence/ux-booking-dialog-1005/desktop-light.png) ·
[Desktop dark](evidence/ux-booking-dialog-1005/desktop-dark.png) ·
[Phone light](evidence/ux-booking-dialog-1005/mobile-light.png) ·
[Phone dark](evidence/ux-booking-dialog-1005/mobile-dark.png)

## Local browser environment

The unused sample seed server fails here before application startup:
`tsx` calls `os.userInfo()` and receives `uv_os_get_passwd ENOMEM`.
Affected specs therefore ran with a temporary configuration excluding only that
server and its sample setup, using the normal main/auth servers, real API,
passkey setup and synthetic ledger fixtures. The final new scenario also ran
directly against its existing per-attempt isolated ledger, without unused shared
servers. Both viewports passed
(2 tests, 32.2 seconds). Temporary configurations are not part of the change.
Full configured E2E and pinned Linux visual checks remain CI gates.

## Verification

Production build passed (exit 0). The single full `npm run check` attempt found
three test-only TypeScript errors: Testing Library `getByRole` has no `exact`
option (string names already match exactly). The invalid options were removed;
only the affected web typecheck was repeated; lint and the full unit suite ran
as separate remaining stages.

- All other workspace typechecks passed; repeated web typecheck: exit 0.
- ESLint passed. Prettier found only the corrected capture-form test; that file
  was formatted and its standalone Prettier check passed (exit 0).
- Full unit attempt: 304 files passed, 38 failed; 3,111 tests passed,
  77 failed, 28 skipped (1,220.06 seconds). Capture model/form, Combobox,
  AmountInput and capture-link files passed. A budget UI worker also failed
  startup; its tests were not executed.
- Most failures are test/hook timeouts under the concurrent run. The existing
  owner-trades/source-rebuild CLI tests fail before application execution in
  tsx's os.userInfo(): uv_os_get_passwd ENOMEM. Existing import-worker tests
  also report SystemError and never reach the expected committing state.
- Only failed files plus the unstarted budget UI file were retried with one
  worker and 120-second default test/hook timeouts. The retry was interrupted
  at the bounded delivery cutoff without a completed report; it is not claimed
  green. No assertions, fixtures or committed timeouts were weakened.
- New booking E2E: both viewports passed, 2 tests in 32.2 seconds. The broader
  affected run had 42 passes; subsequent targeted regression checks confirmed
  the corrected capture/ledger cases and both-theme axe checks.
- Production build and git diff --check passed.

## Delivery limit

Local git add/commit fails because the shared worktree index.lock cannot be
created (Permission denied). Publication therefore uses GitHub's Git data API
with two logical commits on the requested branch, without changing the local
Git metadata. No PR is opened: the required full local check is not green.

## Owner steps

Align the local worktree Git metadata with the published remote branch;
working files remain in place. Run the full check outside this restricted runner,
then open a draft PR and wait for required CI/pinned Linux visual checks.
Review desktop/phone evidence and test dates, suggestion picking, account overrides
and Mehr on the physical phone in both themes.
No keys, consents, provider configuration, migration or deployment is required.

## CI repair follow-up — 2026-10-07

The earlier verification and delivery limits above describe the original authoring
run. A separate repair branch reproduces the CI date-display and phone-height
failures against commit `f6fc243a4bf2ccf223467ebcf52bacd97ec06821`.

- Date-action assertions now expect the shared date field's German display.
- The booking sheet uses the existing 88dvh cap, with compact phone spacing and
  unchanged 44px controls. Mehr is fully visible at 390 × 844 pixels.
- Exact-cent tests finish active route handlers before page teardown.
- The print test waits for the phone shell and ensures the optional context lines
  are selected after crossing the responsive breakpoint. The income-line and
  print-animation assertions remain in place.
- The complete affected Playwright run passes for desktop Chromium, phone Chromium
  and the configured iPhone WebKit panel cases; the last-run report has no failed
  tests. Full configured CI and pinned Linux snapshot checks remain merge gates.

Fresh [phone evidence](evidence/astra-ci-repairs-1007/README.md) records the repaired
layout. The temporary runner retains every configured server and setup and uses
`node --import tsx` only for sample seeding.

Fresh local validation: all workspace typechecks, CSS scale/ESLint/Prettier,
the production build, and 3,389 unit tests in 370 files pass. Unit tests run with one worker and
`BUDGET_REQUIRE_AGE=1`; no test timeouts or assertions are changed.
