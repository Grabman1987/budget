# Heute answer cards — 05.10.2026

Synthetic data only. Existing Präzisionsschicht tokens; no new dependency.

The three cards always answer today's/current-month questions, including when another month is selected. Pace and the balance chart retain their selected-period contract. Savings goals retain Sparziele's month read and nearest-date ordering; reached goals are skipped and the line is absent without an unfinished goal.

Source contract:

- Nettovermögen: `netWorthAsOf`; assets/liabilities partition those same signed account valuations. Current-month delta, net investment deposits and market effect are the existing Gesamtübersicht 5.6 read (`YYYY-MM..YYYY-MM`). “Davon” does not claim deposits plus market explain the entire delta: the report retains savings and other movements.
- Dieser Monat: One-Pager `earnedCents`, `consumptionCents`, `savedCents`; capital income, refunds and transfers are not household earnings.
- Budget: existing `lead.freeCents`; spending/planned cents and elapsed days use current-month Pace. Übrig is plan less spent, distinct from the Leitmaß after open bills.
- Goal: existing `listGoals` progress and ordering, first unfinished goal.

Minimal shared changes: expose the existing One-Pager result read without duplicating its income/spending logic; add a pure signed-valuation partition in the existing Heute domain module. `BalanceChart.showLead` lets Heute display its number once while retaining the R07 chart and forecast.

Replaced/redundant zones: large top Leitmaß figure and its question header; current wealth figure and monthly delta in the compact Gesamtvermögen line. The remaining 12-month chart/year comparison stays below; detailed wealth composition is named Vermögensaufteilung. Pace is visible above the remembered further-details fold. The daily allowance and derivation stay by Kontoprognose.

Verification: focused domain/API/component run, 4 files / 54 tests passed. Six desktop/mobile browser tests passed (new cards, existing source links, UX-2 ordering/fold), including both themes, no card accessibility violations and card heights at most 120 px on the phone. Browser captures use the existing synthetic sample at desktop 1440 and mobile 390, light/dark. They are evidence, not regenerated screenshot baselines.

Production and E2E builds passed. All workspace typechecks were run; initial server/web type errors were corrected and those two workspace checks passed on rerun. Lint passed after removing the temporary browser-run configuration. The full unit suite ran once with one worker and a 30-second default timeout: 340 files passed, 3 failed; 3,226 tests passed, 6 failed, 2 existing skips. Unchanged import worker/CLI tests failed in this Windows session (`imports/jobs.test.ts`, four failures; `imports/source-rebuild-cli.test.ts` and `imports/owner-trades-cli.test.ts`, one each). CLI stderr identifies `uv_os_get_passwd returned ENOMEM`; workers report SystemError and two 120-second timeouts. This is not a green full check; complete the gate before PR creation. No test was weakened or skipped to hide these errors.

Git delivery uses a temporary Git directory under ignored `test-results`, retaining the same branch and history: the original worktree Git administration refuses writes to index.lock and COMMIT_EDITMSG. Push could not authenticate; the GitHub connector requires approval unavailable in this session. A verified Git bundle retains the commits locally. The owner must refresh the original worktree metadata from the bundle when its Git directory is writable, finish the check, then push and create the draft PR.

Affected baselines: `e2e/shell.spec.ts-snapshots/shell-heute-{light,dark}-{desktop,mobile}-linux.png`. Existing baselines must be reviewed on pinned Linux CI before merge. No local baseline regeneration for this task. The checked-out branch already contained daily-budget/Pace prerequisite commits and their Linux baseline commit; this task retains that history.

Owner steps: complete the full local check in a working environment and refresh the original worktree metadata; review the three cards, phone layout and meaning of Einzahlung versus the report's other movements; complete Linux visual/CI acceptance before merge. No financial-provider credentials, consents, migration, provider setup or deployment are required by this change.
