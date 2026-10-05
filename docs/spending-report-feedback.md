# Spending report feedback, 2026-10-04



Scope: reports 1.4, new 1.10, 2.3–2.6, 3.4–3.5 and Heute pace on `codex/spending-reports-1004`, based on `codex/portfolio-reports-1004`. No rebase, provider calls, dependencies or automatic ledger writes.



## Calculation choices



- Sankey shares use available money, including the existing funding pool. The parts list preserves its rounded shares adding to 100%; tooltip uses precise shares.

- Contracts remain bound through their inclusive end date; only ended payments, same-month one-offs and finite schedules with at most one due date are excluded. The shared selection serves report 2.3, its historical months and R10. Current stored terms determine the headline; historical linked occurrences have priority, otherwise the same payee/category split supplies prices. A change requires two successive matching charges, so one-off outliers do not become price changes. Native currency must be known; future bookings do not become historical prices.

- Inflation uses item price relatives and actual spending weights attributed by matched booking ids, never the whole payee total. Linked occurrences win; ambiguous unlinked schedules do not each claim the same charge. Coverage uses those same weights; January reweights on the previous December link. New items enter at relative one. A single unambiguous same-category/rhythm predecessor ending in the same month or within two periods supplies the comparison price for its successor. Regular implicit payee/category contracts need at least six charges. A booking-derived item is inferred ended only after its next billing period is absent; annual/quarterly gaps do not establish a successor. Ended items retain their last price for the link rather than turning a cancellation into deflation. Contributions are the same chained twelve-month index increments, reconciled to the rounded headline. Basket price change compares its own first price with now; the labelled twelve-month contribution uses the headline window.

- A fixed category with parallel payees, or a payee switch and a settlement over three times the median debit, defaults to trailing twelve-month net category charges divided by twelve. Includes credits and settlements; mixes consumption and price. Nullable `category.inflation_trailing_mean` (migration 0037): null automatic, true trailing mean, false individual contracts. Stored history does not invent missing earlier prices. Calendar years compare December to December; the running year compares its latest month with the same month a year earlier.

- Bank costs treat Bank und Gebühren splits on loan accounts as the explicitly booked interest component, following the existing ledger convention; named credit interest on checking accounts also counts as booked interest and suppresses modelled loan interest in that month (no per-loan attribution is stored). Overdraft interest remains separate; other fee-group splits remain bank fees. This assumption is visible on the page. A separate labelled cost part (Kreditzinsen · aus Konditionen geschätzt), explicitly included in the header/total, estimates missing monthly interest from stored loan terms using the shared amortization engine and dated rate changes; without original principal the previous month-end debt supplies the balance. Principal is never a cost. Bank fees use the existing Bank und Gebühren group; named overdraft-interest categories are separate. Trade fees and stored FX fees use dated stored exchange rates. Interest/dividends are a separate line, outside household income, including signed corrections. Trade earnings subtract stored taxes before separately counted fees; linked bookings are not counted twice. Unlinked payouts match one-to-one by account, date and the shared trade settlement amount. Missing dated FX on bookings is disclosed by a distinct-booking counter alongside skipped foreign trades. Unstored spreads and fund TER cannot be recovered as booked costs.

- Income/expense uses the same monthly category facts and Zukunft set-aside as 1.6/1.8, including category-carrying off-budget transfers. Ausgaben = Bedarf + Wunsch + Zukunft + Ohne Kategorie. Because 1.8 already labels its rest as Übrig nach Zukunft, the exact identity is **1.10 Netto = 1.8 Übrig nach Zukunft − Ohne Kategorie** (equal when no uncategorised outflows exist). Contact repayments stay excluded. Categorized refunds reduce their category; unallocated refunds/capital remain memo rows outside the household subtotal and net. Displayed rows, sum and average export with exact cents; every value drills into its actual source splits.

- Annual preview consolidates independent savings executions and stored future transfers. A stored transfer replaces at most one execution with identical source/destination/date/currency/amount. Linked expected occurrences are counted through their expected source. Names never establish identity.

- Goal reserve reach reuses R02 and the last twelve closed Bedarf months. Reserve/Tagesgeld balances are as of today, goal bars keep their existing month-end boundary. Account goals use explicit links; shared funding cannot be allocated because the model stores no earmarked shares. Soll starts at zero in the goal creation month and ends at its target month; existing funds can start above it.

- One shared household-income function serves overview/table reports, One-Pager, Sankey and allocation/rules. Typeless inflows remain visible in 1.8/1.10 as “Zuflüsse ohne Einkommensart (nicht gezählt)”; they are never mapped to typed Sonstiges. Existing cash-date versus budget-month and annual special-payment normalization remain deliberate.

- Table and trailing-price monetary monthly averages use the existing integer half-away-from-zero helper: −0.5 cents rounds to −1 cent. Existing display estimates and index/percentage floating-point rounding using Math.round retain ties towards positive infinity (−0.5 rounds to zero); the index helper documents that policy.

- Pace days 1–6: actual spend + unsettled fixed/recurring amounts + unspent variable plan. Available only with a positive plan/limit, labelled provisional; otherwise the UI shows “–”. Day 7 onward keeps the previous extrapolation of variable spending.



## Remaining source limits



Report 2.5 is complete for its [documented consumption scope](payee-analysis-report.md), not uncategorized/all-account cash outflows. Report 3.4 cannot identify an unlinked expected payment as the same savings execution when no source identity exists. Report 3.5 cannot allocate shared category/account funding or attribute category envelopes to Tagesgeld without stored earmarking; foreign reserves remain explicitly incomplete. Notice periods, unstored bank spreads and missing FX are not invented.



## Verification and owner steps

Final local verification for the 05 October PR #190 review: `npm run check` passed all workspace typechecks, ESLint/Prettier and 322 test files / 3,081 unit/API/database tests. Production web/server build and E2E build passed. Dependencies and lockfile are unchanged; the existing installation was reused.



Synthetic regressions cover shared household income across tables/One-Pager/Sankey/rules, off-budget Zukunft transfers and source drilldown, uncategorised spending and the exact Netto identity, inclusive binding/R10/history, one-offs, future-ended loan payments, booking-id inflation weights/coverage, same-month successors, missing booking FX, labelled modelled interest and checking-interest suppression, dividend settlement deduplication, planless early pace, signed half-cent rounding and foreign-payment refunds. The pre-existing calendar-year/undo and typeless-income tests now follow the owner rule. Affected desktop/mobile browser checks cover income/expense, bank costs, contracts, inflation, monthly reports/tables and Heute: 94 passed, three intentional viewport skips and two timeout-only failures; the focused repeat passed all seven setup/desktop/mobile cases. No affected browser case remains failing. Light/dark layout captures were inspected; the [original synthetic review evidence](evidence/spending-reports-1004/README.md) remains available, and screenshot baselines were not regenerated.



Local tooling note: this Windows sandbox returns `uv_os_get_passwd ENOMEM` to Node’s `os.userInfo()`. An ignored temporary Node preload provides a synthetic fallback only for that host lookup; no application code or dependency changed. The final full check uses four workers and 60-second test/hook timeouts to avoid machine-load timeouts. CI scripts remain unchanged.

Owner: review German copy and synthetic visual evidence, then reconcile privately outside this public repository. Main is already merged. Review PR CI and Linux screenshot baselines, then use the standard migration/deploy workflow after approval. These reports need no new keys, consents or provider configuration. Physical iPhone and private financial acceptance remain owner steps.



Integration note: the parent branch advanced after this worktree was created; PR #188 was subsequently merged, so the delivery PR targets main without changing this branch’s base. Main is now merged on this branch and the additive inflation column has been reconciled as migration 0037. This review adds no migration and performs no rebase.



The worktree Git index is read-only in this sandbox. This review commits on the existing branch using an ignored temporary index and the normal shared Git directory. After push, an ordinary owner shell can refresh the original index with `git reset --mixed HEAD` (preserves working files).

