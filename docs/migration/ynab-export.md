# YNAB export: format and mapping

The owner migrates from **YNAB** (Actual Budget was only an interim tool and is not a migration source). YNAB's web export ("Export plan data") produces a ZIP with two TSV files. This document describes their structure as observed on a real export (29.09.2026). **All examples below are synthetic.** The real export never enters the repository, a cloud session, CI or logs; it is uploaded only into the deployed app (or a local dev instance on the owner's PC).

Observed size of the real export: ~12.800 register rows, ~5.750 plan rows, 27 accounts (several closed or off-budget), 15 category groups with 81 categories, ~1.200 payees, 71 months (Dec 2020 – Oct 2026). The importer must handle 10× that without trouble.

## File format (both files)

- File names: `<Budget name> as of <YYYY-MM-DD HH-MM> - Register.tsv` and `… - Plan.tsv`. Match on the suffix, not the name.
- UTF-8 **with BOM**, CRLF line endings, tab-separated, every field in double quotes (`"` doubled inside fields).
- **Emoji are CESU-8 encoded** in some rows: characters outside the BMP appear as two 3-byte UTF-16 surrogates (`ED A0..AF xx ED B0..BF xx`), which is invalid UTF-8. A strict UTF-8 decoder fails. The parser must repair surrogate pairs (decode bytes leniently, then join high/low surrogates) before CSV parsing. Test with a synthetic fixture containing e.g. `🛒` in CESU-8.
- Category and group names contain emoji, trailing spaces and bracketed notes (see below). Keep names byte-exact apart from the encoding repair; trim only for matching.
- Amounts: `€12,34` and `-€12,34` (euro sign first, minus before the sign, decimal comma, no thousands separator observed). Parse strictly into integer cents; accept an optional thousands dot defensively; reject anything else with the row number.
- Dates in the register: `DD.MM.YYYY`. Months in the plan: English short month + year, `Dec 2020`.

## Register.tsv

Columns: `Account, Flag, Date, Payee, Category Group/Category, Category Group, Category, Memo, Outflow, Inflow, Cleared`.

| Field | Meaning and mapping |
| --- | --- |
| Account | Account name. Accounts are not described anywhere else in the export → the owner maps each name to type, on-budget flag, currency, closed-at in the import wizard (proposals from heuristics below). |
| Flag | `''`, `Red`, `Orange`, `Yellow`, `Green`, `Blue`, `Purple`. Keep as a booking flag (colour) or tag; not required for balances. |
| Date | Booking date. Rows can be **in the future** (observed: 27 uncleared rows up to 5 months ahead) → import as `pending` bookings with future date; the UI shows them as scheduled. |
| Payee | Free text. Special values: `Transfer : <Account name>` (transfer leg), `Starting Balance` (opening balance, one per account), `Reconciliation Balance Adjustment` and `Manual Balance Adjustment` (balance corrections, keep as bookings with a system payee). |
| Category Group/Category | `<Group>: <Category>` convenience column; use the separate columns. |
| Category | Empty for uncategorised rows: transfers between two on-budget accounts, and every row on an off-budget (tracking) account. `Inflow: Ready to Assign` (group `Inflow`) marks income that goes to "Zu verteilen". |
| Memo | Free text. Split rows start with `Split (i/n) ` followed by the line memo. |
| Outflow / Inflow | Exactly one is non-zero (observed); amount = Inflow − Outflow. |
| Cleared | `Uncleared` → `pending`, `Cleared` → `confirmed`, `Reconciled` → `reconciled`. |

**Splits:** a split booking is exported as *n* consecutive rows with memo prefix `Split (1/n)` … `Split (n/n)`, same account and date; each row has its own payee, category and amount. Group consecutive rows into one booking with *n* splits; booking payee = the payee of row 1 unless all rows share one. Rows are consecutive in the observed export; still validate (same account, date, sequence complete) and reject the file with a clear error otherwise.

**Transfers:** both legs are exported, one per account, each with payee `Transfer : <other account>`. Pair legs by (unordered account pair, date, amount = −amount) in file order; unpaired legs are an error in the dry run. A leg **has a category** when it moves money between an on-budget and an off-budget account (observed: ~1.200 of ~5.300 transfer rows) — that category is the envelope effect (e.g. saving into a depot) and belongs on the on-budget leg (audit C2/C4).

**Account heuristics** for the wizard's proposals (owner confirms): an account whose non-transfer rows are all uncategorised is off-budget; `Starting Balance` gives the opening date and amount; a category in group `Credit Card Payments` with the account's name marks a credit card; accounts without rows after a date and with balance 0 are proposed as closed.

## Plan.tsv

Columns: `Month, Category Group/Category, Category Group, Category, Assigned, Activity, Available`. One row per category and month from the first budget month to the current month (plus future months with assignments).

- `Assigned` → `budget_month.assigned_cents` (Zugewiesen).
- `Activity` and `Available` are **check values only**: after import, the app's envelope computation must reproduce them for every category and month (Gate 2). `Available` can be negative (overspent at month end); YNAB then resets the carry to 0 and reduces next month's Ready to Assign — the same rule as concept §5.3 (audit C1).
- Group `Credit Card Payments`: one category per credit card account. YNAB moves the **funded** part of every categorised card spend from the spending category to this category; the part the category could not cover is credit overspending (new card debt, yellow) and does not reduce next month's Ready to Assign. Maps to category kind `card_payment` (concept: envelope "Kartenzahlung", rule R06) with the default `cardRule: 'ynab'` of `budgetMonths` (P1f-6). The importer must reproduce this movement, not import it as bookings.

**Card cases the synthetic export of P2d must contain** (worked examples in `packages/domain/src/ledger/budget.test.ts`; each has an exact Plan.tsv expectation):

| Case | Register rows (one month) | Expected in Plan.tsv / Ready to Assign |
| --- | --- | --- |
| Credit overspending | category assigned 100 €, card spend 150 € | category Available −50 €, payment category +100 €, next month's Ready to Assign unchanged |
| Cash overspending | the same 150 € from the current account | Available −50 €, next month's Ready to Assign −50 € |
| Mixed, cash first | assigned 100 €, cash 30 €, card 120 € | 30 € cash (red), 20 € credit (yellow), payment category +100 €, next month −30 € |
| Mixed, all cash | assigned 100 €, cash 80 €, card 70 € | 50 € cash overspending, payment category +70 € |
| Covered later | card 150 €, then 50 € more assigned in the same month | Available 0, payment category +150 € |
| Refund on the card | card −60 € in May, refund +20 € in June | payment category 60 € → 40 €, category +20 € |
| Card payment | transfer 60 € current account → card | payment category −60 €, Ready to Assign unchanged |

The mixed cases decide the attribution: the implementation counts cash spending first, as YNAB's help describes. If the real export shows otherwise, change `budgetMonths` and these rows together.
- Group `Hidden Categories`: categories hidden in YNAB → import with `hidden_at` set; keep their original group if the owner assigns one in the wizard, otherwise a group "Ausgeblendet".
- Bracketed notes in category names such as `Streaming - [€ 7,49 am 03.]` or `Kfz-Versicherung - [€ 980 - am 01.11.]` encode amount and due day/date of a recurring payment. The wizard offers to strip them from the name and propose expected payments (P3) and targets from them; parsing is best-effort, the owner confirms each.

## Restructure, do not copy

YNAB's categories, groups and booking habits are **evaluated and adapted**, not copied: the target structure follows the concept (classes Bedarf/Wunsch/Zukunft, kinds, stages 1–9, income types, contacts, projects, expected payments). The importer therefore works in three layers:

1. **Raw layer** — the export is parsed 1:1 into import tables (`ynab_*` staging rows tied to the import run). Nothing is interpreted yet; it can be re-mapped any number of times without re-uploading.
2. **Mapping** — an owner-made mapping document (JSON, validated by a zod schema, kept outside the repo, uploaded or edited in the wizard, versioned per import run):
   - accounts: YNAB name → target account with type, on-budget, closed-at;
   - categories: YNAB category → target category (**n:1** merges allowed), or `drop` for categories that only existed as YNAB workarounds (e.g. card payment, hidden one-offs → project);
   - optional **re-categorisation rules** (match on payee, memo, category, amount, date range) → target category, contact share, project, income type; applied from the global `rules_from` month, or from an earlier `from` on the rule itself — needed when a YNAB category is dissolved completely (its bookings are distributed by rules from the start);
   - payees: merge/rename, link to contacts;
   - name cleanup (strip bracketed notes, emoji on/off) and derived expected payments.
3. **Target layer** — bookings, splits, transfers, budget months in the app's model, produced from 1 + 2 in one transaction.

A dry run shows the target structure side by side with YNAB (per target category: which YNAB categories flow in, how many bookings, sums per year) so the owner can iterate on the mapping before committing.

## Mapping decisions (owner confirms in the wizard, stored with the import run)

1. **Start (owner decision 29.09.2026): 01.10.2023.** Accounts closed before the start are skipped. Opening balance per account = sum of its register rows before the start. Opening Available per target category = Σ Available of the mapped YNAB categories in the month before the start; Available of dropped categories flows into "Zu verteilen". The start date stays configurable (earlier or later month) for re-runs.
2. **Accounts:** type (Giro, Bargeld, Tagesgeld, Kreditkarte, Kredit, Depot, Krypto, P2P, Forderung, Sonstiges), on-budget, currency (all EUR in YNAB), closed-at.
3. **Categories:** class (Bedarf / Wunsch / Zukunft), kind, stage (1–9), new group assignment; income categories where the owner wants them instead of `Ready to Assign`.
4. **Payees:** kept as payees; real names stay in the database only.
5. **Investment accounts** (depot, crypto, P2P): only the cash flows are imported (transfers in and out, fees). YNAB's balance adjustments on these accounts are value estimates and are dropped; the value is holdings × daily price from the Portfolio Performance part (P5, Gate 3). Until P5 the account shows the last YNAB value as a manual valuation.

## Import run and checks

- Two steps: **dry run** (parse, map, compute, report — writes nothing) and **commit** (one transaction, one import run id, reversible as a whole).
- Idempotency: import key per row = hash of (file kind, account, date, payee, category, memo, amount, occurrence index among identical rows). A second commit of the same export changes nothing; a newer export only adds/updates rows whose key changed, and reports deletions for the owner to confirm.
- Reconciliation report (Gate 2), all must be 0,00 €:
  - per budget account and loan the balance at every month end and today versus the register sums (independent of any mapping); investment accounts are checked by Gate 3;
  - per **target** category and month Activity and Available versus the sum of the mapped YNAB categories in Plan.tsv, for all months before `rules_from` and for categories not touched by an earlier rule (n:1 merges keep this exact);
  - Ready to Assign per month versus YNAB (derived: Σ on-budget balances − Σ Available);
  - from `rules_from` on, re-categorised bookings move money between target categories by design: the report lists the moved amounts per rule and month, and checks that the **totals** (Σ Available + Ready to Assign) still match.
  Every difference is listed with category/account, month and amount.
- Never log row contents; logs show counts and row numbers only.
