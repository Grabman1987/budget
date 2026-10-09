# Debt scopes and full-width calculation — 2026-10-09

Refs #294 · Refs #296 · Refs #342 · Refs #343

The current debt read uses shared net account valuation. Strategy candidates use
negative native-currency cash balances. Neither source is changed. The UI explains
why a depot with positive net value and negative cash can appear only among the
strategy candidates, and why counts and sums differ. Synthetic browser inputs:
two EUR loans owing 100 and 200 EUR; a depot holding a 100 EUR security with
negative 50 EUR cash. Net debt remains 300 EUR (two accounts); cash strategy
start debt remains 350 EUR (three candidates).

The model links to the existing `/reports/liquiditaet` forecast. Its explanation
names budget accounts, recurring payments, events, low point and buffer. No model
amount is transferred, booked or represented as affordable or already configured.

For #342, the net-debt lead and model span the calculation disclosure's full width.
Numeric comparison columns remain intact. For #343, current `LoanPlanning` already
renders baseline/scenarios in `.debt-full.loan-scenarios` below the model and
`loan-planning.css` already spans these sections over `1 / -1`. No remaining side
summary exists; its two-column rules belong to form fields and mobile table rows.
Those rules and all write paths remain unchanged.

No detail surface or route is added by either layout issue. Existing account and
settings links remain; the selected loan is still encoded by `?kredit=`. Browser
verification covers the direct URL, forecast navigation/browser Back and reload,
comparison geometry, light/dark accessibility, 390px overflow, cancellation/focus
and the existing rate-change audit/undo/redo path. No additional return route is
introduced by these inline layout changes. Unsaved model amounts retain their
existing reset-on-navigation behavior.

Static checks passed: web TypeScript, ESLint and Prettier on changed files. The four affected API/domain files passed all 70 tests. The single `npm run build:e2e` passed. Full check and full E2E were deliberately not run under the package delivery override.

The first desktop attempt passed five cases and failed two: the old prototype comparison exceeded its 30-second timeout under load; the new test incorrectly assumed trigger focus restoration on loan-dialog cancellation. Source inspection confirmed the unchanged loan dialog immediately unmounts, bypassing the shared primitive's close/focus path. The scoped test now compares actual focus behavior under the previous and new geometry and checks focus inside both forms. Trigger focus restoration remains a pre-existing gap outside these layout changes. The affected specs were retried with a 180-second test timeout; no financial, geometry, accessibility or mutation assertion is relaxed.
No snapshot baseline is regenerated locally. `e2e/debts.spec.ts` keeps its prototype
reference captures while replacing the superseded desktop side-column assertion
with full-width/stacking assertions. Existing debt result, terms, loan sheet and
loan planning captures are affected by the added context text; there are no
committed debt pixel baselines to regenerate. CI is the final gate.

Owner steps: review the synthetic desktop and phone captures and required CI.
No migration, keys, provider consent or external setup is needed. Do not merge
until required checks and owner acceptance pass.

Final browser verification passed: desktop 1440, 7/7 (1.3 minutes); mobile 390,
7/7 (1.7 minutes). Each matrix includes four functional cases and three setup
cases. Both themes passed scoped Axe checks and horizontal overflow checks.
The new financing link measures at least 44px. The model and loan summary match
the lead width and follow it vertically; the numeric comparison cells retain a
single row. Cancellation does not write; rate-change save, undo, redo and reload
use the existing audited paths. The selected second loan survives direct loading,
forecast/browser Back and reload.

An intermediate retry did not reach the specs: auth setup hit `ECONNREFUSED ::1`
and port 4885 was then confirmed occupied by the parallel `budget-pkg-f` job.
That job was left running. Once the ports were free, both final runs used the
specified `E2E_PORT=4885`, `E2E_START_TIMEOUT=300000`, one worker, a 180-second test
timeout, and the local `NODE_OPTIONS=--dns-result-order=ipv4first` override.
No server, router or shared code change was made for the local test environment.

Reviewed synthetic screenshots:
[desktop light](desktop-light.png), [desktop dark](desktop-dark.png),
[phone light](mobile-light.png), [phone dark](mobile-dark.png).
Full-page captures retain the shell's fixed navigation at the captured scroll
position; the debt content itself is inline and full width.

Required CI and owner visual acceptance remain open.