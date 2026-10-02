# YNAB export: format and mapping

The owner migrates from **YNAB** (Actual Budget was only an interim tool and is not a migration source). YNAB's web export ("Export plan data") produces a ZIP with two TSV files. This document describes their structure as observed on a real export (29.09.2026). **All examples below are synthetic.** The real export never enters the repository, a cloud session, CI or logs; it is uploaded only into the deployed app (or a local dev instance on the owner's PC).

Observed size of the real export: ~12.800 register rows, ~5.750 plan rows, 27 accounts (several closed or off-budget), 15 category groups with 81 categories, ~1.200 payees, 71 months (Dec 2020 – Oct 2026). The importer must handle 10× that without trouble.

## File format (both files)

- File names: `<Budget name> as of <YYYY-MM-DD HH-MM> - Register.tsv` and `… - Plan.tsv`. Match on the suffix, not the name.
- UTF-8 **with BOM**, CRLF line endings, tab-separated. Text fields are in double quotes (`"` doubled inside fields); **the amount columns are bare** (`€12,34`, register Outflow/Inflow, plan Assigned/Activity/Available). Verified against the real export on 30.09.2026.
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
| Date | Booking date. Rows can be **in the future** (observed: 27 uncleared rows up to 5 months ahead): the next occurrence of each YNAB scheduled transaction → imported as **expected payments**, not bookings (§Importer). |
| Payee | Free text. Special values: `Transfer : <Account name>` (transfer leg), `Starting Balance` (opening balance, one per account), `Reconciliation Balance Adjustment` and `Manual Balance Adjustment` (balance corrections, keep as bookings with a system payee). |
| Category Group/Category | `<Group>: <Category>` convenience column; use the separate columns. |
| Category | Empty for uncategorised rows: transfers between two on-budget accounts, and every row on an off-budget (tracking) account. `Inflow: Ready to Assign` (group `Inflow`) marks income that goes to "Zu verteilen". |
| Memo | Free text. Split rows start with `Split (i/n) ` followed by the line memo. |
| Outflow / Inflow | Exactly one is non-zero (observed); amount = Inflow − Outflow. |
| Cleared | `Uncleared` → `pending`, `Cleared` → `confirmed`, `Reconciled` → `reconciled`. |

**Row order:** newest date first, all accounts mixed; within a day by amount, largest outflow first (real export, 30.09.2026). YNAB's card rules follow this order within a day (see Plan.tsv).

**Splits:** a split booking is exported as *n* consecutive rows with memo prefix `Split (1/n)` … `Split (n/n)`, same account and date; each row has its own payee, category and amount. Group consecutive rows into one booking with *n* splits; booking payee = the payee of row 1 unless all rows share one. Rows are consecutive in the observed export; still validate (same account, date, sequence complete) and reject the file with a clear error otherwise.

**Transfers:** both legs are exported, one per account, each with payee `Transfer : <other account>`. Pair legs by (unordered account pair, date, amount = −amount) in file order; unpaired legs are an error in the dry run. A leg **has a category** when it moves money between an on-budget and an off-budget account (observed: ~1.200 of ~5.300 transfer rows) — that category is the envelope effect (e.g. saving into a depot) and belongs on the on-budget leg (audit C2/C4).

**Account heuristics** for the wizard's proposals (owner confirms): an account whose non-transfer rows are all uncategorised is off-budget; `Starting Balance` gives the opening date and amount; a category in group `Credit Card Payments` with the account's name marks a credit card; accounts without rows after a date and with balance 0 are proposed as closed.

## Plan.tsv

Columns: `Month, Category Group/Category, Category Group, Category, Assigned, Activity, Available`. One row per category and month from the first budget month to the current month (plus future months with assignments).

- `Assigned` → `budget_month.assigned_cents` (Zugewiesen).
- `Activity` and `Available` are **check values only**: after import, the app's envelope computation must reproduce them for every category and month (Gate 2). `Available` can be negative (overspent at month end); YNAB then resets the carry to 0 and reduces next month's Ready to Assign — the same rule as concept §5.3 (audit C1).
- Group `Credit Card Payments`: one category per credit card account. YNAB moves the **funded** part of every categorised card spend from the spending category to this category; the part the category could not cover is credit overspending (new card debt, yellow) and does not reduce next month's Ready to Assign. Maps to category kind `card_payment` (concept: envelope "Kartenzahlung", rule R06) with the default `cardRule: 'ynab'` of `budgetMonths` (P1f-6). The importer must reproduce this movement, not import it as bookings.
- **Card rules verified on the real export** (30.09.2026; with them Activity and Available of every category and both cards match to the cent in all months from 10/2023):
  1. **Card first:** when a category is overspent by cash and card spending in one month, the card spending explains the overspending first: credit overspending = min(overspending, net card spending); only the rest is cash overspending. (YNAB's help reads the other way; the export shows this in every month.)
  2. **Latest spending is unfunded:** over several cards, the credit overspending is laid on the latest card spending of the month (not shared in proportion). Refunds on a card in an overspent category first meet the credit overspending: they stay in their card's payment category instead of moving back (that card's debt shrinks without cover).
  3. **Positive card balance:** while a card has a positive balance (paid in advance), categorised spending is paid from that balance first; that part moves nothing into the payment category and counts as cash spending. Symmetrically, the part of a refund that lifts the balance above 0 does not move back. The payment that overpaid the card takes the payment category below 0 like any payment (cash overspending).
  4. **Income on a card** (`Ready to Assign` on the card, e.g. a reconciliation balance adjustment) moves nothing in the payment category and does not reach Ready to Assign either (see §Importer).
  5. **Order within a day** is the register's: largest outflow first (a payment and a spend on the same day: the spend counts before the payment).

**Card cases the synthetic export of P2d must contain** (worked examples in `packages/domain/src/ledger/budget.test.ts`; each has an exact Plan.tsv expectation):

| Case | Register rows (one month) | Expected in Plan.tsv / Ready to Assign |
| --- | --- | --- |
| Credit overspending | category assigned 100 €, card spend 150 € | category Available −50 €, payment category +100 €, next month's Ready to Assign unchanged |
| Cash overspending | the same 150 € from the current account | Available −50 €, next month's Ready to Assign −50 € |
| Mixed, card first | assigned 100 €, cash 30 €, card 120 € | 50 € credit (yellow), no cash overspending, payment category +70 €, next month unchanged |
| Mixed, card first (2) | assigned 100 €, cash 80 €, card 70 € | 50 € credit overspending, payment category +20 € |
| Covered later | card 150 €, then 50 € more assigned in the same month | Available 0, payment category +150 € |
| Refund on the card | card −60 € in May, refund +20 € in June | payment category 60 € → 40 €, category +20 € |
| Card payment | transfer 60 € current account → card | payment category −60 €, Ready to Assign unchanged |
| Unfunded card spend | assigned 50 €, card 80 € (Sep 2024, card Grün) | category −30 €, payment category +50 € |
| Cash advance | transfer 40 € card → budget account (online wallet, Nov 2024) | payment category unchanged, Ready to Assign +40 €, card debt +40 € |
| Paying it all | transfer 120 € current account → card (Dec 2024) | payment category 50 € → −70 € (cash overspending), next month −70 € |
| Latest spending unfunded | assigned 100 €, card Blau 60 € (5th), card Grün 120 € (20th) (Apr 2025) | category −80 €, all credit on Grün: payment Grün +40 €, Blau +60 € |
| Refund meets credit | nothing assigned, Grün 35 € (12th), refund 30 € on Blau (22nd) (Apr 2025) | category −5 € credit; Grün +0 €, Blau's payment category keeps the 30 € |
| Positive card balance | debt 155 €, payment 205 € (+50 € balance), then 80 € spending (May 2025) | payment category −205 € + 30 € (50 € paid from the balance) |
| Same day | balance −30 €, payment 60 € and spend 20 € on the 17th (May 2025) | the spend counts first and moves 20 € |
| Income on the card | balance adjustment +5 € (Ready to Assign) on the card (May 2025) | payment category unchanged |

The rows for card Grün (May 2024 – Jan 2025, Apr – Jun 2025) are asserted with figures computed by hand in `packages/fixtures/src/ynab/ynab-export.test.ts`, not with `budgetMonths`, so the synthetic round trip is not circular there. The cash advance follows YNAB's help "Credit Card Cash Advances" ("funds will leave the credit card account …, move to the cash account, and increase the 'Ready To Assign' number") and the owner's real export (the card pays an online wallet; YNAB leaves the payment category alone).

The mixed cases decide the attribution. The first implementation counted cash first, as YNAB's help describes; the real export shows card first (in months where a category had more cash than card spending and was overspent by less than the cash part, YNAB still left the card part unfunded), so `budgetMonths` and these rows changed together.
- Group `Hidden Categories`: categories hidden in YNAB → import with `hidden_at` set; keep their original group if the owner assigns one in the wizard, otherwise a group "Ausgeblendet".
- Bracketed notes in category names encode amount and due day/date of a recurring payment. Forms in the real export (examples synthetic): `[€ 350,-]` (monthly target, no day), `[€ 30,- am 01.]`, `[€ 122- am 01.]`, `[€ 1.809,61 am 01.]` (monthly), `[€ 42,30 am 30./31.]` (last day of the month), `[€ 42,- am 10.01.]`, `[€ 1.500 - am 01.12.]` (yearly), `[€ 400,- am 01.02. & 01.08.]` (twice a year), `[€ ??,- am 01.]` (amount unknown), `[9,99 am ?]` (no € sign, day unknown). `parseNote` reads them into amount (or unknown), schedule (monthly day, last day, yearly dates, unknown) or "target only". The wizard offers to strip them from the name and propose expected payments (P3) and targets from them; the owner confirms each.

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
5. **Investment accounts** (depot, crypto, P2P): cash flows and YNAB's balance adjustments are imported (owner decision 02.10.2026: the balances equal YNAB's until the Portfolio Performance part brings holdings × daily price, P5, Gate 3). A rule naming the account can turn an adjustment into an ordinary booking (`set.payee`, e.g. a P2P return with income type Kapitalerträge). Balance changes YNAB shows but does not export (the interest YNAB adds to a loan account) are declared per account in the mapping (`adjustments`) and imported as balance adjustments.

## Import run and checks

- Two steps: **dry run** (parse, map, compute, report — writes nothing) and **commit** (one transaction, one import run id, reversible as a whole).
- Idempotency: import key per row = hash of (file kind, account, date, payee, category, memo, amount, occurrence index among identical rows). A second commit of the same export changes nothing; a newer export only adds/updates rows whose key changed, and reports deletions for the owner to confirm.
- Reconciliation report (Gate 2), all must be 0,00 €, in **every** month:
  - every account (budget, card, loan, tracking) at every month end and today versus the register sums plus the adjustments the mapping declares;
  - per **target** category Available versus the sum of the mapped YNAB categories in Plan.tsv (a card payment envelope plus the change of its card's credit overspending, `creditShift`), and Activity of spending categories versus their sources plus what rules moved in;
  - Zu verteilen versus YNAB's Ready to Assign (derived: Σ on-budget balances without cards − Σ Available − credit overspending of the month; see §Importer); a dropped category that still holds money is a difference;
  - the total Σ Available + Zu verteilen + credit overspending.
  The importer re-derives the assigned amounts so that all of these hold (§Importer, "Envelopes"); the report lists those changes (`shifts`) and the moved amounts per rule and month. Every difference is listed with category/account, month and amount.
- Never log row contents; logs show counts and row numbers only.

## Importer (P2d, `packages/import-ynab`)

Pure code, no database: `parseRegister` / `parsePlan` (bytes → rows, `ParseError` with file, line and code, never the value) → `buildModel` (raw layer: bookings with splits, transfer pairs, accounts with proposals, categories, plan cells, problems) → `mappingSchema` (zod) and `applyMapping` (target model) → `reconcile` (Gate 2 as data, through the domain's `budgetMonths` with `cardRule: 'ynab'`). The wizard PR stores the raw rows, the mapping versions and the target rows.

Choices made (technical, within this document):

- **Decoding** is a strict UTF-8 decoder that joins CESU-8 surrogate pairs itself; any other invalid byte (lone surrogates included) is an error with its line. The BOM is optional.
- **Account proposals:** on budget = some non-transfer row has a category (`Ready to Assign` counts); credit card = a `Credit Card Payments` category with the account's name; closed = balance 0 and no row in the 90 days before the export date (rows after it ignored; closed-at = last row); type: credit card, else checking (on budget), loan (off budget with a negative starting balance whose balance never gets above 0, also when paid off; a depot that starts in debit and turns positive is no loan), other asset (off budget: depot, crypto, P2P platform, receivable). Account names are trimmed everywhere, also in `Transfer : <account>`. The owner sets the real type in the mapping.
- **Problems** (unpaired transfer legs, incomplete or out-of-order splits, plan gaps and duplicates, categories missing in Plan.tsv, card categories without an account) are collected with their line numbers instead of stopping at the first one; format errors in the files stop the parse at the first bad line. A problem about an account or category names it by its index in the raw model and an 8-digit hash of its name (`subject`), never by the name.
- **Hidden categories** may appear in the register under their original group while the plan lists them in `Hidden Categories`: when exactly one plan category has that name and one side is hidden, the rows go to the plan's category and its `originalGroup` is kept for the wizard.
- **Splits** keep a payee per line (`TargetSplit.payee`); the booking's payee is the first line's.
- **Start month:** an account opened before the start gets `openingDate` = the day before the start and the sum of its earlier rows as opening balance, so the start month's income is income only; an account opened later keeps its first row's date and its `Starting Balance` row stays a booking (system payee `opening_balance`). The opening Available per target category is Σ `max(0, Available)` of its YNAB categories in the month before the start: YNAB resets overspending before carrying, so each YNAB category is clamped **before** summing.
- **YNAB's Ready to Assign** is not in the export. It is derived per month as Σ month-end balances of the on-budget accounts without cards − Σ Available of all plan categories − credit overspending, where a card's credit overspending is what its payment category did not receive: −(Σ rows on the card in the month, without cash advances, income on the card and the part paid from a positive card balance) − Activity of the payment category. This uses only exported figures and the export's own budget status of the accounts (the account proposals), never the mapping. On the real export this stock figure is exactly 0 in fully assigned months; adding back the card rows that move no payment category (a flow view) would not be. So income on a card and spending from a positive card balance do not reach Ready to Assign; `budgetMonths` reports them per month as `cardOffEnvelopeCents` for the flow formula.
- **Mapping validation:** every on-budget credit card has exactly one `card_payment` target; a `card_payment` target for an off-budget or non-card account, or two for one card, is an error.
- **Envelopes (owner decision 02.10.2026: the app matches YNAB).** Rules move bookings between categories and n:1 merges join categories whose overspending YNAB resets one by one; left alone, both change Available and, through uncovered overspending, Zu verteilen (the first live import showed a Zu verteilen lower than YNAB's Ready to Assign). `balanceEnvelopes` therefore re-derives the assigned amount of every target category and month: Available = Σ Available of its sources (a target without sources, e.g. a new category a rule fills, gets the money with the booking: Available 0); a card payment envelope additionally holds the change of its card's credit overspending (a rule that moves card spending changes how much of it is funded). Activity does not depend on assigned amounts, so one pass for the spending categories and one for the card envelopes suffice. Zu verteilen = cash − Σ Available − credit overspending is then YNAB's Ready to Assign in every month. The changes are reported as `shifts` (assigned in the app − Σ assigned of the sources); the synthetic tests show a rule into a new category and an overspent n:1 merge (Möbel + Kultur, May 2024).
- **Rules:** rules never match transfer legs; on a tracking account only a rule naming the account applies, and it cannot set a category. The first matching rule applies to a split from `from ?? rules_from` on; it may set the target category (`null` = Zu verteilen), a contact, a project, an income type and a new payee name (which also makes a balance adjustment an ordinary booking). Moved amounts are reported per rule, month and category pair.
- **Future-dated rows** (real export: ~27 uncleared rows up to 5 months after the export date): the next occurrence of each YNAB scheduled transaction; YNAB counts them nowhere yet. Rows dated after the export's "as of" day (`exportAsOf(fileName)`) become **expected payments** (`expectedFromScheduled`), never bookings: one per scheduled transaction (of a transfer pair the outflow leg, named `Umbuchung an <account>`; later monthly occurrences of the same row collapse into one), with account, amount, category, payee and contact after mapping and rules, the row's due day (and month), first due day = the row's date. Rhythm: a yearly bracket note of the row's YNAB category → yearly (two dates six months apart → half-yearly); a monthly note (`am 01.`, `30./31.`, `am ?`) → monthly; else bookings of the same payee or transfer partner on the account in two of the three months before the export month, or one with the same amount → monthly; otherwise a one-time payment (start = end). Declared recurring payments (`expectedPayments.recurring`, e.g. the salary: income type, due day, `dateShift: 'before'`) take account, amount and direction from the latest booked row of the payee and start the month after it. The commit keeps a live expected payment with the same name, kind, account and due day.
- **Card starting balances** are 0 in the synthetic export. A card that starts with debt in YNAB has an unfunded balance; whether YNAB's payment category shows it cannot be checked without the real export.

Synthetic export: `packages/fixtures/src/ynab/generate.ts` (deterministic by seed, 58 months Jan 2022 – Oct 2026, 14 accounts incl. two closed before and after the start month and a paid-off loan, 45 categories, all cases above) writes both files byte-exact to `packages/fixtures/ynab-export/` with `npm run fixtures:ynab`; a test checks that the committed files match the generator. Its Plan.tsv figures come from `budgetMonths` (`cardRule: 'ynab'`); the card cases of the table above are fixed events in May 2024 – June 2025.
