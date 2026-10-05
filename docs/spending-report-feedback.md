# Spending report feedback, 2026-10-04



Scope: reports 1.4, new 1.10, 2.3–2.6, 3.4–3.5 and Heute pace on `codex/spending-reports-1004`, based on `codex/portfolio-reports-1004`. No rebase, provider calls, dependencies or automatic ledger writes.



## Calculation choices



- Sankey shares use available money, including the existing funding pool. The parts list preserves its rounded shares adding to 100%; tooltip uses precise shares.

- Contracts with any end date are not ongoing contracts. Current stored terms determine the headline; historical linked occurrences have priority, otherwise the same payee/category split supplies prices. A change requires two successive matching charges, so one-off outliers do not become price changes. Native currency must be known; future bookings do not become historical prices.

- Inflation uses item price relatives and actual spending weights; January reweights on the previous December link. New items enter at relative one. A single unambiguous same-category/rhythm predecessor ending within two periods supplies the comparison price for its successor. Regular implicit payee/category contracts need at least six charges. A booking-derived item is inferred ended only after its next billing period is absent; annual/quarterly gaps do not establish a successor. Ended items retain their last price for the link rather than turning a cancellation into deflation. Contributions are the same chained twelve-month index increments, reconciled to the rounded headline. Basket price change compares its own first price with now; the labelled twelve-month contribution uses the headline window.

- A fixed category with parallel payees, or a payee switch and a settlement over three times the median debit, defaults to trailing twelve-month net category charges divided by twelve. Includes credits and settlements; mixes consumption and price. Nullable `category.inflation_trailing_mean` (migration 0036): null automatic, true trailing mean, false individual contracts. Stored history does not invent missing earlier prices. Calendar years compare December to December; the running year compares its latest month with the same month a year earlier.

- Bank costs treat Bank und Gebühren splits on loan accounts as the explicitly booked interest component, following the existing ledger convention; other fee-group splits remain bank fees. This assumption is visible on the page. Stored loan terms estimate missing monthly interest using the shared amortization engine and dated rate changes; without original principal the previous month-end debt supplies the balance. Principal is never a cost. Bank fees use the existing Bank und Gebühren group; named overdraft-interest categories are separate. Trade fees and stored FX fees use dated stored exchange rates. Interest/dividends are a separate line, outside household income, including signed corrections. Trade earnings subtract stored taxes before separately counted fees; linked bookings are not counted twice. Unstored spreads and fund TER cannot be recovered as booked costs.

- Income/expense uses actual booking dates and existing household/refund/capital classification. All own-account transfers and contact repayments are excluded. Categorized refunds reduce their category; unallocated refunds/capital remain memo rows outside the household subtotal and net. Displayed rows, sum and average export with exact cents; every value drills into its actual source splits.

- Annual preview consolidates independent savings executions and stored future transfers. A stored transfer replaces at most one execution with identical source/destination/date/currency/amount. Linked expected occurrences are counted through their expected source. Names never establish identity.

- Goal reserve reach reuses R02 and the last twelve closed Bedarf months. Reserve/Tagesgeld balances are as of today, goal bars keep their existing month-end boundary. Account goals use explicit links; shared funding cannot be allocated because the model stores no earmarked shares. Soll starts at zero in the goal creation month and ends at its target month; existing funds can start above it.

- Pace days 1–6: actual spend + unsettled fixed/recurring amounts + unspent variable plan. Available even for a zero plan, labelled provisional. Day 7 onward keeps the previous extrapolation of variable spending.



## Remaining source limits



Report 2.5 is complete for its [documented consumption scope](payee-analysis-report.md), not uncategorized/all-account cash outflows. Report 3.4 cannot identify an unlinked expected payment as the same savings execution when no source identity exists. Report 3.5 cannot allocate shared category/account funding or attribute category envelopes to Tagesgeld without stored earmarking; foreign reserves remain explicitly incomplete. Notice periods, unstored bank spreads and missing FX are not invented.



## Verification and owner steps

Final local verification: `npm ci`, all workspace typechecks, ESLint/Prettier, 312 test files / 2,991 unit/API/database tests, and production web/server build passed. The existing goal-query test now checks the fourth read-only source and literal reserve/account values. No dependencies changed.



Synthetic domain/API/database regression cases cover late entry, successor decrease and later increase, implicit contracts, utility overrides/undo, December verdict sign, contribution conservation, derived contract binding, loan interest/principal boundary, cost parts/source conservation, savings dedup and emergency reach. Existing browser specs updated for removed term/monthly tables, cost redesign and first-week pace; new income/expense CSV/expansion/drill test. Desktop 1440 and touch viewport 390 retain light/dark screenshots as [synthetic review evidence](evidence/spending-reports-1004/README.md); screenshot baselines are not regenerated locally. Affected browser cases cover 72 passing scenarios and three intentional viewport skips across the broad run and focused repeats; the final affected run has 16 passing cases, followed by five passing setup/empty-flow cases after explicitly awaiting the API response and seven passing setup/bank cases after final copy verification. No affected browser case remains failing.



Local tooling note: this Windows sandbox returns `uv_os_get_passwd ENOMEM` to Node’s `os.userInfo()`. An ignored temporary Node preload provides a synthetic fallback only for that host lookup; no application code or dependency changed. The final full check uses four workers and 60-second test/hook timeouts to avoid machine-load timeouts. CI scripts remain unchanged.

Owner: review German copy and synthetic visual evidence, then private reconciliation outside this public repository. Merge main later as requested, apply the standard migration/deploy workflow, and review Linux screenshot baselines for affected Today/shell/catalog views. These reports need no new keys, consents or provider configuration. Physical iPhone and private financial acceptance remain owner steps.



Integration note: the parent branch advanced after this worktree was created; PR #188 was subsequently merged, so the delivery PR targets main without changing this branch’s base. Its `0036_booking_weekly` and this branch’s `0036_organic_puck` require Drizzle journal/snapshot reconciliation when the owner merges main/parent: keep the weekly migration and regenerate the additive inflation column as the next migration, then rerun checks. No merge or rebase was performed here.



The protected common Git index could not be updated from this sandbox. Delivery commits are on the same branch in a writable temporary Git directory; after push, an ordinary owner shell can align the original worktree with `git fetch origin` and `git reset --mixed origin/codex/spending-reports-1004` (preserves working files).

