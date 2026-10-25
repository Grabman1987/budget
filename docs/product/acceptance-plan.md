# Product acceptance plan

All amounts are synthetic integer cents. These are independent expected outcomes,
not a claim that this documentation change executed every scenario. Current source
tests are linked by [traceability](traceability.md); ONB01 evidence remains pending.

## Financial and first-use examples

| ID | Given and action | Literal expected result / proof |
| --- | --- | --- |
| AC01 | Empty auth store; invalid token, valid bootstrap, then attempt bootstrap again | Invalid grants no session; first valid passkey succeeds once; existing installation cannot create a second owner through bootstrap |
| AC02 | Existing financial ledger; expire session, use recovery, attempt restricted source/export/security action | Safe login continuation; no data recreation; server enforces passkey/step-up restrictions |
| AC03 | New EUR budget cash account opening 100000 on chosen date; assign 30000 to one category | Cash stays 100000, unassigned 70000, category available 30000; record exact baseline |
| AC04 | Add tracking debt 20000 or credit limit 50000; attempt incompatible depot/currency link | Neither adds spendable opening cash; invalid link rejected with no partial write |
| AC05 | Lose successful account-create response, reload/resume checklist twice; populated install opens checklist | One opening only; existing IDs/history retained; uncertain outcome resolved before another create |
| AC06 | From AC03, cash expense 1250 in that category, then undo; separately split 10001 cents into explicit gross lines 3334/3334/3333 | Expense: cash 98750, available 28750; undo restores 100000/30000. The three lines total 10001; nonzero rest blocks save |
| AC07 | Reconcile through an explicit day, then edit/delete/undo protected earlier booking or manual valuation | Typed dependency failure; no balance/audit partial mutation. Undo dependent check first, then repeat supported action |
| AC08 | Schedule salary 200000 without receipt; assign/move/partially cover existing money; undo | Scheduled income adds 0 to actual cash. Move 5000 between two envelopes changes them by -5000/+5000 and leaves cash unchanged; undo restores both |
| AC09 | Transfer 15000 between two EUR budget cash accounts initially 100000 and 0; fail second leg; test card overspending separately | Success gives 85000/15000, household income/expense 0; failure preserves 100000/0. Card/cash carry follows existing card tests, not one generic negative rule |
| AC10 | One EUR income due on days 5 and 20; pause inclusive days 5–19; compare a forecast event and booked ledger | Day 5 contributes 0 forecast cents, day 20 retains scheduled amount; no booking/cash changes. Overlapping pause rejected; due-date shifting happens before interval test |
| AC11 | Contact outlay 6000, actual repayment 8000 allocated to it, then undo | Outlay clears and 2000 becomes contact credit; cash receives 8000 once; no 2000 gift/income invented; undo restores original outlay/credit/cash |
| AC12 | Same as-of position across account/wealth/report; price missing but usable gross trade price exists; separately FX missing | Use shared documented fallback and quality label; same comparable value across surfaces. Missing FX never becomes zero/1; unaffected budget functions remain usable |
| AC13 | Allocate 10001 cents with 3333/3333/3334 bp complete weights; save target set totalling 9999 bp | Expected weighted amounts 3333/3333/3335, total 10001; reject the 9999 bp managed target. Explicitly incomplete exposures and unmanaged target omissions remain separate supported concepts |
| AC14 | Save savings rate; later confirm one real execution with explicit date/units/gross/fees; repeat request | Rate saves 0 trades and 0 orders. Execution creates one linked trade/settlement under existing identity guard; duplicate does not create a second buy; undo obeys dependencies |
| AC15 | Same bank BOOK fetched twice, PDNG candidate, deleted booking fetched again, connection expires | Exactly one unchecked booking for BOOK under default policy; PDNG unposted until confirmation; tombstone prevents recreation; last success/reconnect visible |
| AC16 | Upload payroll PDF, map unknown code, omit payout date, then confirm a valid explicit payout | Upload creates 0 payouts; missing required date blocks; confirm groups payroll/payout/receipt/inbox; existing matching payout not duplicated; rollback/undo complete |
| AC17 | Close before month end; stale exception fingerprint; valid month-end with next-month unassigned 1 then 0 | Early/stale/1-cent cases rejected. Valid close uses server date; no ledger lock; repeated close is idempotent; new work can reopen status |
| AC18 | Missing loan rate/installment; freedom with no expense history; then complete inputs | No fabricated payoff date or meaningful percentage from unknown/zero denominator; assumptions and insufficiency shown. Forecast edit does not book money |
| AC19 | Identical period/scope on report/lead/detail and generated CSV/print where supported; daily index with an unavailable return day | Same source totals; exact boundaries once; transfers neutral. Daily index preserves a gap and proportional date spacing; signed assets/debts share one zero axis |
| AC20 | Full CSV export without then with fresh step-up; inspect archive | Unauthorized attempt blocked. Valid ZIP matches documented account/depot scope, excludes secrets/auth/audit/raw staging/files, and is not described as restore backup |
| AC21 | Warning acknowledged but source still stale; same savings execution on Heute/inbox; filtered deficits 1250 and 3750 with page limit 1 | No false repair/double task count; current-only sections labeled. Overspent summary count 2/deficit 5000 before paging; individual work retained; summary writes no money |
| AC22 | Keyboard only and screen reader; privacy active; open palette, follow a detail and return | Predictable focus/order/labels, Escape returns context, status announced, masked dynamic values; physical-device timing measured separately |
| AC23 | Offline capture; lose response after server commit; reload, retry; expire session; block first FIFO item | Stable key/body returns one original booking; unknown send cannot be edited/rekeyed; retained queue on auth loss; FIFO pauses with useful reason |
| AC24 | Fresh financial checklist with explicit zero cash; skip sources; pause on phone and resume desktop | No invented salary/history/zero-as-unknown; saved choices resume; valid zero start possible; optional modules do not block base readiness |
| AC25 | Finish checklist, then undo/remove chosen basis; reopen with historical migrated data | Needs-review repair without access trap or destructive reset; old records unchanged; migration-pending path never repeats openings |
| AC26 | Open GAP01: same-period own cumulative return 10% and eligible benchmark price return 8%, both starting at 100; repeat with empty selection/missing start quote | Index endpoints 110/108 and difference +2 percentage points. Preserve current selection; no comparison when none selected; unavailable benchmark stays a gap, own valid series remains |
| AC27 | Open GAP02: portfolio value 100000 cents; add 20000 cents externally at unchanged prices with zero fees and correctly identified flows | Actual value becomes 120000 cents; flow-adjusted return remains 0% / index 100. EUR chart/table reconcile; no capital contribution reported as market gain |
| AC28 | Open GAP03: cash 40000, equities 60000, bonds 20000 and debt -10000 cents; transfer 10000 internally from cash to equities | Net total stays 110000; groups become 30000/70000/20000/-10000. No double cash count or household income. Unknown price/FX cannot become a zero group or a falsely complete total |
| AC29 | Open GAP04: existing net-worth graph with zero, one, two daily points; width initially zero then positive; query fails or data is partial | Explicit useful states and working resize; two valid points render the existing EUR chart. Record exact route/period/revision and diagnosis before changing code; no duplicate chart |
| AC30 | Open GAP05: follow the agreed Plan/settings/wealth labels from Figma and app, open saved deep links, change month and navigate back on phone/desktop | Same intended destination/quantity, preserved valid URL context/bookmarks and useful focus/back behavior; renamed controls do not silently perform another action |
| AC31 | Open GAP07/08 and GAP06: review V01/V02/V09 and O01–O08 by user outcome, including missing data and error/resume variants | Every row has requirement, scope/unit/date, source, design/version, expected result and evidence or explicit open reason. Missing benchmark/EUR/asset-history/onboarding cannot pass through ID-only checks |

## Coverage dimensions

For each changed write: valid input, invalid boundary, conflict, dependent lock,
rollback and undo/redo. Exercise safe repeated requests wherever its contract
promises idempotency; never assume every POST already has the offline booking key.
For each changed read: empty, loading, failure, partial history, deleted/closed
sources, native/EUR scope, date boundaries and privacy mode.

UI evidence covers desktop 1440 and phone 390, light/dark, keyboard, reduced motion,
long German labels, zoom/reflow, and screen-reader form errors. Automated Axe and
screenshots supplement manual checks; neither proves full WCAG compliance. No real
payment is required to measure capture reachability on an owner device.

## Acceptance record template

Record requirement/AC ID, exact commit/deployed revision, environment and synthetic
fixture identity, steps, literal expected/actual result, screenshot/log reference,
reviewer, date and outcome. A failed or blocked case records the reason and next
action. Logs and screenshots must contain no real financial data or secrets.

## Gates and release readiness

| Gate / criterion | Required evidence | What does not establish it |
| --- | --- | --- |
| Gate 1 | Owner acceptance of spec/design/prototype and required device/accessibility checks | A new document, screenshot or passing unit suite alone |
| Gate 2 | Independent account/month/category equality to approved mapped private budget source | Parser support, sample-ledger equality or a migrated row count |
| Gate 3 | Holdings/basis and identical-method/period investment comparison against private reference | Current market value alone or approximate-looking return |
| Gate 4 | One actual parallel month close with differences resolved and owner sign-off | Close marker, prototype retirement or deploy success |
| Operations | Source/catch-up evidence, documented backup policy, restore/owner evidence per current status | A configured bucket, a scheduled job or a green unrelated CI job |
| ONB01 | AC03–05/24–25 plus auth, mobile/error/resume evidence | A checklist whose boxes were manually set to complete |

No gate is newly accepted by this planning work. Keep [STATUS](../STATUS.md) and
[ACCEPTANCE](../ACCEPTANCE.md) historical claims dated until fresh evidence exists.
