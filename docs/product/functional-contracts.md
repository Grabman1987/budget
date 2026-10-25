# Functional contracts

Baseline: application source `01a10de8`, reviewed 2026-10-15. These requirements
consolidate existing scope; they do not certify implementation or replace SPEC.
`BUDxx.nn` refines the family in [requirements](requirements.md). New first-use
behavior stays under ONB01. Acceptance IDs refer to [acceptance-plan](acceptance-plan.md).
The linked feature contracts own detailed formulas, request fields and limits.

## Access, profile and daily overview

| ID | Required behavior and invariant | Failure / acceptance |
| --- | --- | --- |
| BUD01.01 | First passkey requires the one-time setup token while no active passkey exists; show recovery codes through the existing gate | Invalid/reused token grants no session; AC01 |
| BUD01.02 | Existing installations use login; adding a device does not recreate financial data | Expired session returns to login with a validated local continuation; AC02 |
| BUD01.03 | Fresh step-up protects export, passkey addition/removal and recovery-code regeneration | Recovery login cannot configure restricted data sources; AC02, security matrix |
| BUD01.04 | Privacy/theme/storage preferences follow their documented device/account scope | Masked values remain masked in newly introduced views; no claim that masking encrypts data; AC22 |
| BUD02.01 | Heute answers cash availability, month result and net worth from shared read models | One failed valuation must not hide independently usable budget work; AC12 |
| BUD02.02 | Monat/Bis Gehalt and the selected month remain explicit; current-only sections say Stand heute in other-month views | Never imply a forecast receipt actually arrived; AC08 |
| BUD02.03 | Zu tun contains at most four source rows; savings executions are not counted twice | Follow the latest Q3 directive, not older split next-step descriptions; AC21 |
| BUD02.04 | Fällig 14 Tage combines recurring payments and one-off events through day 14 | Preserve the underlying 35-day event horizon and existing write destinations; AC21 |
| BUD02.05 | Lead numbers expose their calculation chain and source links; warnings name a next action | Unknown/provisional inputs are explained rather than converted to apparent success; AC12 |

## Accounts, ledger and contacts

| ID | Required behavior and invariant | Failure / acceptance |
| --- | --- | --- |
| BUD05.01 | Account creation records name, type, currency, budget membership and dated opening balance | Reopening setup never repeats the opening; AC03, AC05 |
| BUD05.02 | Tracking-only types cannot become budget cash; loan/card limits never become opening assets | Incompatible changes fail without partial financial writes; AC04 |
| BUD05.03 | A separate depot settlement account is optional, active, eligible and same-currency | Release dependent links explicitly before incompatible edits; historical references remain; AC04 |
| BUD05.04 | Register distinguishes pending, confirmed and reconciled records and native/EUR amounts | Closed/invalid account and missing FX have typed, useful states; AC07, AC12 |
| BUD05.05 | Reconciliation uses an explicit external balance/date and creates a check through the chosen day | Protected records reject changes until the dependent check is undone; AC07 |
| BUD05.06 | Closing an account retains historical records; balances/pending/planned work receive the existing guard | Reopening/undo uses existing audit dependencies, never deletes history; AC07 |
| BUD06.01 | Capture order is amount/payee/account/status/date/repetition, then gross category/contact lines | Field validation preserves input; valid Enter saves, Escape respects dirty guard; AC06 |
| BUD06.02 | Integer-cent lines and contact shares sum exactly to the gross booking amount | Nonzero rest blocks save; largest-remainder distribution conserves cents; AC06 |
| BUD06.03 | New cash capture is confirmed; new bank capture retains pending/manual confirmation | Do not rewrite statuses of old records; AC06 |
| BUD06.04 | A transfer connects distinct eligible accounts with balanced paired legs | A failure rolls back both legs and audit; no income/expense duplication; AC09 |
| BUD06.05 | Manual income uses the booking month, with no Budgetmonat field or automatic next-month deferral | Existing stored deferred values and explicit API semantics are preserved; AC08 |
| BUD06.06 | Repeat capture can create the recurring schedule atomically with the booking | A retry/failed write never produces an orphan schedule; AC10 |
| BUD06.07 | Edit/delete/bulk/undo use the audited repositories and respect reconciled and trade dependencies | Never bypass a linked trade/settlement through a generic booking editor; AC07, AC14 |
| BUD08.01 | An outlay can contain category and contact shares without double-counting cash | Derived contact balance does not add to net worth; AC11 |
| BUD08.02 | A receipt defaults to oldest open outlays; owner can edit allocation; excess becomes contact credit | Cash, allocations and credit save/undo atomically; excess is not ordinary income; AC11 |
| BUD08.03 | Zero-balance contacts leave the normal overview but retain selectable history | New nonzero balance restores visibility; statement boundary needs a persisted complete repayment; AC11 |
| BUD08.04 | Cashless settlement follows the existing 0-cent/two-split contract and its allocation dependency guards | Preserve distinct reporting of cashless credit; do not present it as received cash; AC11 |

Detailed contracts: [ledger API](../api-ledger.md), [account properties](../evidence/account-properties/README.md),
[capture](../ux-booking-dialog-1005.md), [contact history](../evidence/contact-history/README.md).

## Budget, expectations and plans

| ID | Required behavior and invariant | Failure / acceptance |
| --- | --- | --- |
| BUD03.01 | Zu verteilen, Zugewiesen, Aktivität, Verfügbar and rollover use the shared envelope engine | Account cash and category allocation remain distinct quantities; AC03, AC08 |
| BUD03.02 | Positive category funds carry; cash and credit overspending use their distinct existing rules | A card debt cannot silently become next-month cash overspending; AC09 |
| BUD03.03 | Assign/move/cover/distribute retain source limits, explicit negative-pool confirmation and grouped undo | Partial coverage is visible; insufficient source never claims full funding; AC08 |
| BUD03.04 | Quick assignment uses shared target/history values, displayed order and exact partial funding | A preview does not save; grouped apply/undo restores the whole action; AC08 |
| BUD03.05 | Category/group creation, hide, merge, split and targets preserve existing history and warnings | Merge can change rollover; income/category-kind restrictions remain enforced; AC08 |
| BUD03.06 | Nine-stage waterfall and class proportions use the agreed assignment/twelfths methodology | No second page-specific ratio or personal default is introduced; AC13 |
| BUD04.01 | Recurring schedules have dated versions, rhythm, due/date-shift rules and matching tolerance | Invalid/overlapping versions cannot create ambiguous current values; AC10 |
| BUD04.02 | An expected occurrence remains planned until its actual matching/confirmation policy resolves it | Forecast changes never directly change booked cash; AC10 |
| BUD04.03 | Savings goals identify category or account backing, progress, target and missing amount | Do not treat an unbacked target as available savings; AC08 |
| BUD04.04 | Plan Jahr previews supported dated event deltas and scenarios without creating bookings | Unapplied drafts remain distinguishable from saved events and allocations; AC10 |
| BUD04.05 | First income pause supports one native-EUR recurring inflow and an inclusive zero-income interval | Reject overlaps; preserve schedule identity/payday boundary; no inferred replacement income; AC10 |
| BUD14.01 | Month close has five derived steps with saved progress and fingerprinted reasoned exceptions | Changed work reopens a step; stale decisions fail with conflict; AC17 |
| BUD14.02 | Next-month planning uses existing assignments and one reusable audit group across applies | Closing requires live next-month Zu verteilen = 0; no forecast income added; AC17 |
| BUD14.03 | Close marker is server-dated, undoable and permitted only at/after month end with valid steps | Marker is not a booking lock and not Gate 4 acceptance; AC17 |

Detailed contracts: [month close](../month-close.md), [quick assignment](../plan-ghost-1005.md),
[annual events](../plan-year-events.md), [income pause](../income-pause.md).

## Review, sources and documents

| ID | Required behavior and invariant | Failure / acceptance |
| --- | --- | --- |
| BUD07.01 | Inbox groups actionable source work and links each item to the existing resolution | Acknowledging a warning does not repair its underlying source; AC21 |
| BUD07.02 | Bank BOOK posts unchecked/pending without category under default policy; PDNG remains a candidate | Preserve per-connection confirmation-first override and tombstone dedupe; AC15 |
| BUD07.03 | Owner can review candidate/booking matches, merge or link paired transfers within existing limits | Ambiguity requires a decision; no invented mirrored transaction; AC15 |
| BUD07.04 | Assignment rules prepare ordered suggestions and learning from reviewed bookings | Suggestions do not override active bank posting policy; bounded regex/transfer limits remain; AC15 |
| BUD07.05 | Receipt upload is bounded/authenticated, content-addressed and linked through audited metadata | Retain blobs through booking undo and include them in encrypted backup, not CSV export; AC16 |
| BUD07.06 | Payslip upload opens review and never books by itself; map unknown numeric codes into existing sections | Parsing errors/duplicates remain reviewable; do not invent formulas or payday; AC16 |
| BUD07.07 | Confirm payslip with active EUR payout account, explicit date, sender and eligible expectation | Linking/creation, receipt and inbox decision are atomic; preserve matched records; AC16 |
| BUD07.08 | Inbox overview aggregates urgent overspent categories with exact count/deficit before pagination and a secondary Plan-triage link | Retain individual tasks, raw counts and detail; summary is read-only and never covers an envelope; AC21 |
| BUD12.01 | Source settings show connection, last success, coverage and required owner action | Consent/parse/network/partial failures are distinct; manual budgeting remains usable; AC15 |
| BUD12.02 | Rules expose enabled state, parameters, evaluability, status and useful action | Disabled/unknown rules never masquerade as fulfilled; [metric catalog](metric-catalog.md) |
| BUD12.03 | Projects, basket and source-specific settings keep their own validated ownership | No blanket “configured” badge conceals a missing rule input or mapping; AC12 |

Detailed contracts: [bank source](../DATA_SOURCES.md), [assignment rules](../assignment-rules.md),
[receipts](../receipts.md), [payslips](../payslip-intake.md), [projects/payroll](../payroll-projects.md).

## Wealth, analysis and portability

| ID | Required behavior and invariant | Failure / acceptance |
| --- | --- | --- |
| BUD09.01 | Instrument ownership, trades, settlement cash and cost basis remain distinct linked facts | Atomic trade/settlement writes and generic-edit guards; AC14 |
| BUD09.02 | Historical values use shared as-of quotes/trade-price fallback, FX and manual valuation policy | Do not use the obsolete quote-only guard; incomplete quality stays visible; AC12 |
| BUD09.03 | Moving-average default/FIFO changes analytical basis without rewriting broker source values | Unknown basis remains unknown; already withheld taxes never booked twice; AC14 |
| BUD09.04 | Dated exposure weights conserve value; complete sets and managed target versions total 10000 bp | Null unmanaged differs from explicit zero; safe archive/replacement is atomic; AC13 |
| BUD09.05 | Allocation/risk/proposals share one scope, signed cash and leverage policy | Missing quality suppresses proposals per policy; risk shares can exceed 100%; AC13 |
| BUD09.06 | Savings schedules retain native currency, versions and next planned date | Saving a rate neither places an order nor creates a trade; AC14 |
| BUD09.07 | Actual savings execution needs date, units, gross amount and fees before creating buy/settlement | Duplicate execution guard and undo remain; funding transfer is separate; AC14 |
| BUD09.08 | Open GAP01: compact benchmark comparison in Vermögen using explicit common scope/date, persisted existing choices and shared normalized series | No manufactured benchmark start/history or misleading return convention; AC26 |
| BUD10.01 | Net worth, own contribution and market movement reconcile across surfaces | Derived contact receivables are excluded; manual/product valuation precedence retained; AC12 |
| BUD10.02 | Debt starts with actual balance/history; payoff scenarios need complete calculable terms | No fabricated payoff date; scenario is not a bank instruction; AC18 |
| BUD10.03 | Freedom projection labels expense history, saving assumption and return assumptions | Default saving basis is up to six closed Zukunft months; no promise of future return; AC18 |
| BUD10.04 | Signed account composition uses one proportional zero axis; portfolio daily base-100 index uses shared TTWROR dates with explicit gaps | Assets right/debts left; no interpolation or implication of fresh daily quotes; actions follow chart; AC19 |
| BUD10.05 | Open GAP02: actual portfolio-value EUR history directly in Vermögen, distinct from flow-adjusted return and total household net worth | Match historical endpoint/table/lead scope; contributions affect value without inventing return; AC27 |
| BUD10.06 | Open GAP03: current composition plus asset-group/instrument time development with explicit EUR/percentage scopes | Reconcile groups with shared aggregate; keep debt/unknown coverage explicit and prevent cash double count; AC28 |
| BUD11.01 | All 34 reports have a named question, period, source drill-down and missing-data contract | See [report contracts](report-contracts.md); a body alone is not acceptance; AC19 |
| BUD11.02 | Shared figures agree across Heute/Plan/Vermögen/Reports for identical scope and date | Keep rounding at presentation; displayed chains reconcile; AC13, AC19 |
| BUD11.03 | Print/CSV output uses the active documented report scope and labels | Different export and full backup purposes are explicit; AC19, AC20 |
| BUD13.01 | Global palette preserves source context; `/suche` exposes linkable grouped/filterable results | Validated session recents, keyboard navigation and safe deep links; AC22 |
| BUD13.02 | Full account/depot CSV ZIP requires recent step-up and excludes security/raw migration data | Export fails explicitly; no partial archive advertised as complete backup; AC20 |
| BUD13.03 | Offline capture is durable device-local FIFO with stable key/body and uncertain-result handling | Failed/auth-expired items persist; do not edit/rekey an uncertain send; AC23 |
| BUD13.04 | Installation caches the static shell, not authenticated API responses | Site-data deletion can lose unsent local work; physical-device acceptance remains; AC23 |

Detailed contracts: [trade execution](../trades-execution.md), [valuation/scope](../allocation-quality-scope.md),
[target versions](../asset-classes-settings.md), [risk](../portfolio-risk-policy.md),
[export](../export.md), [PWA](../pwa.md), [report correctness](../report-correctness.md).
