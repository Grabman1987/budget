# Heute / R07 period window — owner 05.10.2026

Supersedes the fixed Heute/R07 chart horizon of 04.10.2026. No dependency or migration.

- Both charts read the identical `heuteQuery` / `/api/heute` result; `heuteWindow` and `balanceForecast` resolve the window and low point once. R07 Kontoprognose is a section of the existing Finanz-Check-Verlauf report, because there was no dedicated R07 report route.
- From today minus fourteen days through next rule-based payday plus two days in Bis Gehalt; shown month end plus two in Monat. A future payday window shorter than seven days extends to the following payday plus two. The 15th uses the existing Austrian business-day rule shared with Plan/Decken.
- On 05.10.2026: 21.09.–17.10. (payday), 21.09.–02.11. (month). On 14.10.: 30.09.–15.11.; actual payday is Friday 13.11., since 15.11. is Sunday. The bracket names 13.11., the axis/footnote name 15.11.
- The low point includes actual history inside the window; earliest date wins ties. A shown month ending before the lookback has no balance window; its Pace/envelopes remain available.
- Explicit `period=month|payday` wins. Existing stored-flag infrastructure remembers month mode under `budget-balance-month`; absence means Bis Gehalt, including a direct R07 visit. Switching in either view updates the preference.
- Payment marker selection and all daily tooltip steps are unchanged. Salary receipts retain their stored schedule dates; the planning rule never invents an actual receipt or books anything.

Unchanged 35-day consumers: account chart preview default (configurable 0–365), background R07 rule evaluation/its stored `horizonDays` settings. The report's period-bound account chart is separate from the persisted rule-status timeline. Report 3.1 retains its 90-day/6-/12-month planning windows.

Affected Linux screenshot baselines: `e2e/shell.spec.ts-snapshots/shell-heute-{light,dark}-{desktop,mobile}-linux.png`. No baselines regenerated locally. Finanz-Check report screenshots are evidence captures, not golden files.

Owner steps: review both periods on desktop/mobile and the short-window bracket; review/approve the affected baselines with the pinned Linux browser. CI and visual/product acceptance remain the final gates. No keys, consent, provider access, migration or deployment steps are needed for this change.

## Synthetic browser evidence

Desktop 1440 and mobile 390 captures; these are review images, never regenerated golden files:

| View | Desktop | Mobile |
| --- | --- | --- |
| Heute | [Light](evidence/heute-horizon-1005/heute-light-desktop.png) | [Light](evidence/heute-horizon-1005/heute-light-mobile.png) |
| R07 payday | [Account forecast](evidence/heute-horizon-1005/r07-payday-desktop.png) | [Account forecast](evidence/heute-horizon-1005/r07-payday-mobile.png) |

Focused verification: 57 unit/API tests passed; the corrected period/fallback/Finanz-Check browser run passed 17 tests, and the final diagram/tooltip/motion run passed 11. The broader Heute run covered capture/undo/redo, retry, empty states, source navigation and mobile attention (29 passed, 2 intentional viewport skips; four new assertions then corrected and rerun above). Both themes passed the existing Finanz-Check accessibility/overflow checks. Initial browser setup hit Windows ENOMEM; the serial rerun used a 120-second server start timeout. Production and E2E builds exited 0. Full `npm run check` ran once with `VITEST_MAX_WORKERS=2`: typecheck/lint and all 336 files / 3,179 tests passed, exit 0.

Publication uses a separate local Git directory (`test-results/horizon-delivery.git`) because the original worktree cannot create `index.lock`. The original checkout retains its previous HEAD. After reviewing the pushed commits, the owner can refresh that checkout from a shell with Git metadata write access: `git fetch origin`, then `git reset --mixed origin/codex/heute-horizon-1005`. This preserves working files; do not use a hard reset.
