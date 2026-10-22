# PR755 test adapter — staged payslip review locator

**Changed file:** `e2e/payslip-intake.spec.ts`.

CI run `39771059532` reported three phone-project failures while waiting for status text `PDF ausgewertet` at the upload staging waits. That text is obsolete. The current successful upload renders `PayslipIntakeDetail` inline in the existing upload dialog, where the original-PDF download link appears only after the staged intake record has loaded.

Both waits now locate `Original-PDF herunterladen` inside the already-scoped upload dialog. This covers the initial encrypted upload plus the chooser and drop variants (desktop and mobile project runs share these selectors). It does not change a product file, finance expectation, booking/Undo assertion, rejection or duplicate assertion. Both existing 25-second timeouts remain unchanged.

The change is a technical locator adaptation under the existing test-adapter authorization. No E2E test was run locally; rerun on the revised head is pending. Independent review is pending.

## Independent review and native verification

Independent Sol review cleared the exact adapter at
`364d924a8a385c929f77b8dc3e8d120d342a1e0f`: staged-record download link, scoped
to the existing upload dialog, retains both 25-second deadlines and all financial,
confirmation, Undo, rejection, duplicate and accessibility assertions.

At that revision ESLint, Prettier and a fresh e2e build passed. Real WebKit iPhone
ran the existing payslip-intake suite: setup plus encrypted confirm/Undo/reject and
chooser flow passed (5 total); the final drop case could not create its disposable
fixture because the shared disk was full (ENOSPC), before any product action.
After removing only ignored dependency installs in inactive worktrees, the isolated
drop case and setup passed 4/4 in 33.1s, without changing source, assertions, or
timeouts. All three existing feature cases therefore passed at the same revision
across these two runs; this is not a claim of a single complete-suite pass.

Chromium and complete required checks remain for CI on the final head.
