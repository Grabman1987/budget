# UX-4b: plain wording and calmer controls

Scope: German controls and presentation only. Existing money, allocation,
forecast and event calculations are unchanged. No dependencies, migrations,
provider calls or automatic bookings were added. All fixtures are synthetic.

Changed control labels:

| Place | Before | After |
| --- | --- | --- |
| Plan month view | Wasserfall | Nach Stufen |
| Plan month view | Triage | Überziehungen prüfen |
| Annual planning action | Ereignis einplanen | Ereignis planen |
| Component demonstration toggle | Maßkette zeigen / ausblenden | Herleitung zeigen / ausblenden |

Heute already uses plain derivation controls. Graphic labels including Maßkette,
Stückliste, Revision and Wasserstand remain. Inbox resolution is now a neutral
secondary action even for urgent findings; cover actions retain their signal.

The balance chart labels actual history as `bisher` before today. Payment numbers
occupy a separate row above the date axis, away from the low-point annotation.
The running One-Pager shows the existing allocation amounts and their twelfths
basis with `Monat läuft noch`; percentages, allocation chart and percentage
inspection appear after month end.

Annual planning without events shows only the baseline `Zu verteilen`, the empty
state and `Ereignis planen`. With events, the three scenario rows have plain names
and short hover/focus/tap explanations; Escape dismisses an explanation.

## Minimal shared change

`TextInput type="date"` delegates to one `DateInput`. All 26 existing date fields
therefore display `TT.MM.JJJJ`, regardless of the browser locale. Controlled form
state remains ISO; ISO paste remains accepted. Partial typing stays editable;
calendar validity, required and min/max checks remain. This uses a numeric text
field instead of a locale-dependent native date field, without a picker library.
Month inputs are unchanged.

## Verification and visual review

Component regressions cover German display/ISO form values, leap dates, invalid
calendar days, bounds, empty/partial input, annual empty/populated presentation,
keyboard explanations and chart-label separation. Affected browser specs cover
event create/edit/undo, German date capture, One-Pager current/completed/print,
Heute/R07 geometry, neutral inbox resolution/undo and changed controls.

No screenshot baseline was regenerated locally. The four tracked component baselines
`bauteile-{light,dark}-{desktop,mobile}-linux.png` need Linux review. Review desktop 1440/mobile 390,
light/dark: Heute and R07, Plan month/year, running One-Pager and its print layout,
inbox and component demonstration. German date display also affects existing
form screenshots: booking/reconciliation, account/category/goal/event settings,
contacts, read/data sources, profile, instruments/trades/targets/savings/loans
and liquidity-event forms. Linux CI is the final visual gate. Synthetic capture
evidence is in [the evidence directory](evidence/ux-clarify-1005/).

Local results on 2026-10-06:

- `npm ci` completed. The single full `npm run check` passed all workspace
  typechecks and ESLint, then stopped at Prettier in two changed files. Both were
  formatted and the affected-file formatting check passed. The full check was
  not repeated, as requested; its missing unit phase was run separately.
- `npm run test -- --maxWorkers=2 --pool=threads`: 352 files and 3,257 tests
  passed, exit 0 (851.29 seconds).
- `npm run build`: web and server passed, exit 0.
- Affected Chromium desktop/mobile cases passed after corrected empty-state
  assertions. The mobile dirty-close case timed out during initial loading under
  memory pressure; its isolated rerun with a 90-second timeout passed. One mobile
  A4 print case was intentionally skipped. The final annual create/edit/undo and
  focus/click explanation rerun passed on both viewports (5 passed including setup).
  Running One-Pager capture with light/dark accessibility and overflow inspection
  also passed on both viewports (5 passed including setup).
- Windows did not compare the pinned Linux pixel baselines. No baseline changed.
  The two date-only expectation updates in portfolio/read-source specs remain
  for CI; shared date behavior was exercised through the annual event form.

## Owner steps

- Review German wording, chart labels, form dates and scenario explanations in
  the running app on desktop and phone after CI review.
- No new keys, consents, configuration or data migration are required.
- The protected original worktree cannot write `HEAD.lock`. Delivery uses the
  separate Git directory `node_modules/.cache/ux4b-delivery.git` on `codex/ux-clarify-1005`.
  After delivery, from an unrestricted owner shell in this worktree, fetch origin,
  switch to `codex/ux-clarify-1005` and run
  `git reset --mixed origin/codex/ux-clarify-1005` to align the original index with
  the delivered files. Avoid discarding later uncommitted owner edits.
