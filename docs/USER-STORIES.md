# User-Stories – Budget

Dieser Katalog beschreibt, was der Nutzer in der App tun können soll, wozu, in welchen Schritten, und woran er es prüft. Stand: 15.11.2026. 173 Stories in elf Bereichen.

## Aufbau jeder Story

- **Story:** „Als Nutzer möchte ich …, damit …“ – das „damit“ nennt den Nutzen.
- **Ausgangslage:** wann und warum der Nutzer dort hinkommt.
- **Ablauf:** nummerierte Schritte mit Bildschirm, Bedienelement und Reaktion der App.
- **Ergebnis:** was danach gilt.
- **Abnahmekriterien:** prüfbare Punkte, mindestens ein Rand- oder Fehlerfall.
- **Status und Verweis:** `live` = in der Produktions-App vorhanden (die Abnahme durch den Nutzer steht trotzdem aus), `teilweise` = nur ein Teil ist da, `offen` = beauftragt oder angefangen, `geplant` = bewusst später, `entfällt` = nach Entscheidung des Nutzers nicht mehr vorgesehen. Bei `teilweise` und `offen` steht „Fehlt noch: …“.

Die Status stammen aus `docs/FEATURES.md`, `docs/STATUS.md`, dem Code und dem Issue-Stand, nicht aus einer Prüfung in der laufenden App.

## Bereiche

| Bereich | Stories | live | teilweise | offen | geplant | entfällt |
| --- | --- | --- | --- | --- | --- | --- |
| [Heute](user-stories/01-heute.md) | 6 | 5 | 0 | 1 | 0 | 0 |
| [Plan (Budget)](user-stories/02-plan.md) | 14 | 9 | 2 | 3 | 0 | 0 |
| [Konten und Buchungen](user-stories/03-konten-buchungen.md) | 17 | 12 | 2 | 2 | 1 | 0 |
| [Kontakte](user-stories/04-kontakte.md) | 7 | 2 | 5 | 0 | 0 | 0 |
| [Vermögen und Portfolio](user-stories/05-vermoegen-portfolio.md) | 20 | 3 | 12 | 2 | 3 | 0 |
| [Reports](user-stories/06-reports.md) | 37 | 35 | 0 | 2 | 0 | 0 |
| [Prüfen und Dokument-Upload](user-stories/07-pruefen-upload.md) | 13 | 6 | 1 | 6 | 0 | 0 |
| [Monatsabschluss](user-stories/08-monatsabschluss.md) | 5 | 1 | 3 | 0 | 0 | 1 |
| [Regelwerk und Finanz-Check](user-stories/09-regelwerk.md) | 26 | 24 | 1 | 0 | 1 | 0 |
| [Einstellungen](user-stories/10-einstellungen.md) | 20 | 11 | 4 | 3 | 2 | 0 |
| [App allgemein](user-stories/11-app-allgemein.md) | 12 | 1 | 5 | 5 | 1 | 0 |
| **Summe** | **176** | **109** | **34** | **24** | **8** | **1** |

Eine Analyse aller Abläufe nach Aufwand für den Nutzer steht in [EFFIZIENZ.md](user-stories/EFFIZIENZ.md).

I-03 (#1048): the bank confirmation's collapsed “Alle Felder” section retains native
bank currency and read-only facts. Browser coverage uses a complete synthetic
candidate, note, project, manual cent splits replacing a rule, file/photo uploads
and one grouped Undo returning both candidate and receipts to Prüfen. Desktop and
390 px checks cover keyboard operation and both themes; owner acceptance remains
separate. See [the review story](user-stories/07-pruefen-upload.md#i-03--bankzeile-mit-alle-felder-in-einem-schritt-vervollständigen).

## Connections register (E-03 and E-04, #859)

In the redesign, open **Einstellungen › Verbindungen** to see all six data sources, with sources needing attention first in severity order. Indented source parts remain visible without expanding setup: bank connections and account mappings, account-specific review counts and fetch commands, crypto movements and full-history checks, document scan counts and upload, quote run counts and instrument links, and the latest available inflation month. Routine commands reuse the existing handlers. A new PDF upload immediately opens its existing result/review dialog; the crypto review link opens its source-specific movement list.

Each source has at most one **Einrichtung** disclosure for credentials, consent setup, policy and other rare settings. Changing an account mapping exposes its start date so validation cannot block an invisible control. Acceptance covers unchanged request payloads, consent and booking policy, a neutral loading state, light and dark layouts, 44 px controls and reflow down to 320 px. Source dates remain distinct from attempts and missing values. Owner acceptance is pending.

## Crypto warning evidence (#1081, read-only part of #1205)

Under **Konten › Prüfen**, each crypto balance warning shows its stored cause,
source and app units, open net effect, source fetch date and app comparison day.
Related operations expose source movement/trade references and gross, fee and net
units through the existing shared calculation. Missing funding names the unmatched
cash leg and any known ledger counterparts; absent historic diagnostics remain
explicitly unavailable. Amount privacy hides the comparison and trace amounts.
Correct the mapping/source evidence through the existing data-source controls and
run **Abgleich neu ausführen**; an unsuccessful retry retains the warning and a
successful balance check resolves it. Manual acknowledgement is not source repair.
This slice creates no bookings, valuations, cost basis or tax values. Owner-approved
local-copy analysis and money acceptance for #1205 remain pending.

Unreadable movements identify the source reference and failing schema field when available.
The quote warning separates its stored reason and unavailable historic evidence
from the current mapping, recorded attempts and read-only preview. A preview or
manual price leaves the warning open. A successful automatic quote check or an
explicit source policy that disables the fetch closes it.

## Disabled quote warnings (#1259)

Switching automatic prices off in the instrument form or operator configuration
closes that instrument's open fetch-failure warnings with “Kursabruf abgeschaltet”.
The setting and warning decisions share one audit/Undo group. Other instruments,
holdings differences and stored financial rows remain unchanged. The nightly market
run also closes legacy fetch warnings for disabled instruments; successful fetches
retain their existing source/date resolution. Synthetic route, operator and market
regressions cover these paths. Delivery and owner acceptance remain separate.

## Payslip review geometry (#1068)

The existing grouped lines, single confirmation summary, sticky document preview
and full-width action bar are retained. The review keeps 44 px controls even under
desktop density rules, and selected account, expectation, sender and booking values
have complete titles. Browser checks exercise the scrolled review at 1440/1024 and
390 px in both themes. Parsing, booking and automation retain their existing paths;
owner acceptance remains pending.

## Offene Fragen an den Nutzer

Stand nach den Entscheidungen vom 15.11.2026. Bei diesen Stories ist noch etwas offen:

- **E-07** (Verschlüsselte Sicherung): Soll die App selbst prüfen und anzeigen, dass sich die Sicherung zurückspielen lässt (z. B. monatlicher Test mit Datum und Ergebnis unter Einstellungen › Sicherung), oder bleibt das ein Handgriff des Betreibers?

Entschieden am 15.11.2026: H-01 (nächstes Sparziel im Block „Ziele finanzieren“), K-12 (Vorgang beim Konto öffnen), K-13 / V-17 (ein Übertrag, bleibt `geplant`, wird noch nicht gebaut), M-03 (entfällt), E-10 (Glossar bewusst offen).

## Abnahme

1. Bereich öffnen und die Story suchen (ID, z. B. H-02).
2. Den Ablauf in der App nachgehen.
3. Jedes Abnahmekriterium prüfen.
4. Ergebnis mit der ID melden: „H-02 passt“ oder „H-02 fehlt: …“.
5. Eine Story gilt erst als abgenommen, wenn der Nutzer sie bestätigt hat.

## Pflege

Jede neue Funktion und jede Entscheidung des Nutzers bekommt im selben Pull Request ihre Story oder eine Aktualisierung von Status und Kriterien.

RP-02 continuation (#1207, connected #1066 proof): the monthly salary curve labels whole
regular/combined documents explicitly and keeps all special payments in their payout
month. Literal synthetic browser cases cover separate specials, an unsplit combined slip
without wage reading, allowances/travel, missing slips, shared frame/inspection and privacy.
See [the salary story](user-stories/06-reports.md#rp-02--gehaltsreport-mit-bruttonetto-und-jahresvergleich).

RP-03 Fortsetzung (#1066): Im Gehaltsreport sehe ich das letzte belegte Grundgehalt mit
Stufenverlauf, Jahres- und Vorjahresmonatsvergleiche je Komponente sowie Bonus und
zuordenbare Abzüge. Fehlende Gehaltszettel, nicht zugeordnete Lohnarten und nicht
vergleichbare Monate sind benannt. Der Vergleich mit gespeichertem VPI und persönlichem
Preisindex zeigt Basis, Indexwerte je Monat, reale Änderung und Preisabstand in Euro je Jahr.
Die Zuordnungsoberfläche, Ereignismarker, Arbeitgeberbeiträge und die Abnahme durch den
Nutzer sind offen. [Gehaltsentwicklung](user-stories/06-reports.md#rp-03--echte-gehaltsentwicklung)

## Per-account liquidity (#1228, #1225)

As the owner, I can see whether each payment account can cover its dated payments,
even when household cash is positive. Heute names the account, first shortfall date
and signed balance. The path excludes expected income and unused overdraft. The
alert window ends the day before the next open recurring expected receipt into
that account; without one, it ends at next household payday plus 30 days. One-off
expected receipts do not end the window. Later shortfalls remain forecast only.
Preparing a transfer opens the existing capture with source, destination and missing
cents for review; nothing is booked until I explicitly save.

The liquidity report shows current cash, the lowest projected balance and date,
and the first shortfall for each account through next payday plus 30 days. Expanding
an account shows its contributing payments. Expected income is a separate forecast
variant. Payments without an account stay in their own editable list and affect
only the household path. Unallocated variable spending is explicitly identified.
Privacy mode masks financial amounts, including amounts embedded in labels; phone rows stack.
Status: implementation for review; owner acceptance and production proof pending.

## Position inspection and quote-source repair (#1248)

As the owner, I can read every chart inspection row on desktop and phone, including
long account names and stored-price provenance. Labels and values share a line when
they fit; otherwise the value moves below the label. Rows stay inside the viewport-bound
tooltip, wrap at word boundaries, and keep numeric values right aligned with tabular
figures. Position source, FX and cost-basis dates use `dd.MM.yyyy`.

When automatic prices fail, the inbox detail and instrument editor explain a missing
Ariva link, an empty response, an unreachable source or a currency mismatch (including
both currencies when known). I can save a validated HTTPS Ariva historical-prices link
through the existing instrument update and test the source with the existing preview.
The preview does not save prices or close the warning. No schedule or valuation changes.
Status: implemented for review; owner acceptance pending.


## Operator project attribution (#1243 / #1245)

As the household operator, I can create a project for a project-like category and attribute
its eligible existing bookings through `owner-config`, keeping the category for budgeting.

Acceptance: an optional `projects` section creates or reuses live projects, resolves exact live
category names (optionally narrowed by group), exact case-insensitive payees (optionally narrowed
by exact income type and inflow/outflow), or individual account/date/integer-cent tuples.
Each tuple resolves uniquely to a live booking or is skipped as `not_found` / `ambiguous`.
Several selectors can reuse one project. Whole bookings are assigned through the app writer;
amounts, splits, accounts, dates and reconciliation status remain unchanged, including with
explicit `unlock`. Missing/ambiguous payees and income types are counted as skips before creation.
Mixed category splits, transfers, other projects and reconciled locks are counted as skips.
A dry run writes nothing; a successful repeat is unchanged; one operator audit group supports
`undo-group`. The default 25-booking mutation limit is shared across all selectors; a repeat
continues deferred candidates without consuming the limit for unchanged bookings. Each
invocation has its own group, undone in reverse order. Selection avoids loading unrelated
booking payloads or all splits into JavaScript. Default output is aggregate-only, with booking date/cent amounts on skips only
under `--details`. Report 1.9 reads the attributed splits through its existing P&L rules.
Status: implemented for review; owner acceptance pending. See [operator contract](ops.md#126-owner-configuration-operator-task).


## Project booking breakdown (#1245)

As a report reader, I can open a project's booking breakdown in report 1.9 to see what
makes up the result for the selected period.

- The disclosure shows the booking count. Its table shows the most recent booking first,
  with the date, payee (then memo or a dash), category or income type, and signed amount.
- Each booking opens in the ledger. For split bookings, the row lists the classifications
  and sums the splits that contribute to the project result. The rows reconcile to that result.
- Privacy mode masks amounts. At widths of 430 px or less, each row shows date and payee
  above classification and amount without horizontal page scrolling.

Status for this change is implemented for review.

## Consecutive capture (K-04, #1145)

Save and new retains only the date, booking mode and explicit register account context;
all booking details are cleared, including the account outside a register. A chosen payee
fills account/category together from its latest booking or leaves them empty without history.
The register account and choices made in the current form remain authoritative;
late history cannot overwrite them. Typed category text clears the stored selection.
Only a unique full label or a clicked/keyboard option selects an ID; other text
stays visible, becomes invalid on blur and blocks saving. Fresh forms remain free
of premature validation. See [K-04](user-stories/03-konten-buchungen.md).
Status: implementation for review; owner acceptance and production proof pending.
## Reports: retained total-template proof (#1156)

RP-09 now explicitly covers the full-history disclosure lifetime: closed on entry,
only read on opening, reset after template changes/source refresh/reload, and no
stale export. The existing Explorer spec checks exact CSV bytes and privacy in
light/dark at the configured desktop/390 widths. See [RP-09](user-stories/06-reports.md#rp-09--gesamttabelle-explorer-template); CI and owner acceptance remain open.

## Spending report bookmarks (#1158)

As a household member, I can open an old category overview or period comparison bookmark in Ausgaben with its reporting period and anchor intact. I can choose Vorperiode or Vorjahr and reopen the report with the same comparison. Earlier custom comparison bookmarks open with Vorperiode. Saved Explorer views and templates remain reachable.

## Queue rejection and dialog completion (#1144, #1201)

A server-rejected capture stays on the device as a draft with its safe error message
and error ID. A rejected middle item does not stop its neighbours. Before editing
or discarding an uncertain HTTP 500, use **Jetzt senden** to check whether the
server committed it. A proven absent delivery can be corrected with the original
idempotency key or discarded; a committed delivery is acknowledged without another write.
Unknown technical error text remains redacted. The browser regression exercises
three offline captures, ordered delivery of the first and third, copying details,
correction/resend and discard without duplicate bookings.

After a successful write, capture/transfer closes locally while its URL navigation
and session reads finish. Plan's **Alle Ziele füllen** and envelope **Decken**
dialogs also close without awaiting refreshed reads. Inline Plan actions retain
their awaited refresh. A refused edit keeps the draft and error visible. Tests
hold follow-up reads until after checking that each dialog has closed; writes are
confirmed first. Production write latency and physical-device acceptance remain
owner checks. Booking amounts, balances, allocations and trade data are unchanged.
Status: implementation and regression coverage for review; publication is pending.

Booking creation and editing now return German 422 messages for invalid splits
and contact references. A contact movement uses signed whole cents, with a
negative outlay and a positive receipt. A newly entered contact amount cannot
be zero. The API accepts cent amounts on every split and rejects missing amounts.
The client converts percentage and fixed shares to cents before submission. Existing
account and idempotency conflicts retain their delivery codes. A persisted
booking or contact inconsistency that prevents saving returns a German HTTP 500
with a correlation ID. Contact and split validation tests verify rejection
without partial bookings, allocations, audit entries or delivery records.
Reports continuation (#1149, contacts slice of #1161): RP-21b's open and historical
booking tables use the shared report register shell. Enabling settled history keeps
fully settled contacts inside its closed disclosure, outside the open-contact list.
Four columns, gross open shares, separate credit, unchanged domain balances and
20-row history pages remain. Category purchases carry the gross expense until
repayment returns it to the original category; no extra advance or net-worth charge.
See [RP-21b](user-stories/06-reports.md#rp-21b--kontakte-abrechnung).
Status: implemented for review; owner acceptance pending. No other report is migrated.

## Integrated income and cashflow (#1159)

Einnahmen und Cashflow in redesign shows income by type, open monthly expectations and the Cashflow section in one report. Cashflow includes all spending, including Zukunft, unlike the former consumption-only development report. Old links carry the selected period, month, project and bookmark into the integrated report. The running month is marked and included. The chart compares monthly cashflow with the corresponding prior-year months where available. Expectations compare the same month of the prior year in a disclosure.
## Transit reconciliation (#1195, audit rests 1 and 2)

Allocation, portfolio summary, depot comparison and whole picture show a read-only
**Geld unterwegs** cash bridge: raw bank cash, the signed transit difference, and
cash including transit, with the as-of day and explicit account count.
The rendered line appears for nonzero transit or unavailable valuation; an exact
zero keeps the existing compact page. The reader still returns the full bridge.
Allocation uses its selected universe; summary uses requested reference accounts (otherwise
investment accounts), depot comparison uses investment accounts, and whole picture
uses all live household accounts at the selected period end. A subset never claims
to be household net worth. PP comparison and book inputs expose the same labelled
bridge for their target/reference universe. Missing FX withholds the bridge.
Security values, manual valuations and decision denominators keep their existing
definitions; the line reconciles cash only. Bookings, allocations, trades, raw
balances, performance and net worth remain unchanged.

Independent-date transit supports whole equal-amount, same-currency transfers
between **checking/savings** accounts, with existing opening-date and five-day
guards. Cash/bank transfers retain their separate contract. Deleting through either
single leg deletes the connected pair; Undo restores both original legs and redo
deletes both.

Evidence: `transit-readers-1195.test.ts` covers days 0–4, reversed dates, selected
scope, missing FX, unchanged snapshots and single-leg delete/Undo/redo.
`invest.test.ts` pins literal German update/delete/restore refusal messages.
`issue-1195-transit.spec.ts` covers four rendered readers, raw cash versus net
worth, privacy, themes and responsive layout. Already-delivered items 3/4 remain
unchanged. The account-type decision is recorded below.

## Bank posting and observed balance (#1267)

New bank connections follow SPEC decision 41: fetched BOOK lines without a match
become unchecked, uncategorized register bookings and count in the existing account
balance. PDNG stays in review. An explicit confirmation-first connection policy
remains supported. Matching, source identity, tombstones and grouped Undo remain.
The account register head shows the stored bank observation and fetch time; a
nonzero difference to the current app balance links to Prüfen. Privacy mode masks
both amounts. This information never creates an adjustment or changes a balance
formula. The operator-only recovery of older BOOK candidates is documented in
`docs/ops.md`; it defaults to dry-run and is not a migration.
Status: implementation for review; production recovery and owner acceptance pending.
## Reports: calendar-year costs (#1160)

In Reports › Portfolio › Kosten und Steuern › Kosten gesamt, select a calendar year to see the shared reporting dates, full cost breakdown, closing-value cost ratio and estimate labels. The year stays in the URL, and the report lists all years newest first with partial coverage marked. Turning on amount privacy hides all amounts and ratios.
## Reports: investment return in the Jahresreport (#1118)

The Investments section displays the same annualised XIRR as the securities performance report for the included months. If the dated cash flows do not yield a rate, the report explains why the figure is unavailable. The existing amount privacy toggle hides the rate.
The trading section shows realised gains and signed losses from the shared sale results, including fees and taxes. A position counts as closed when its account position returns to zero through a sale. The hit rate is the share of those closed positions that produced a positive result, including earlier partial sales. Results compare the same calendar months of the previous year. Figures without a documented basis are marked unavailable.
## Heute: direct guided distribution (#1055)

When „Zu verteilen“ is positive or over-assigned, „Verteilen“ under „Als Nächstes“ opens the same guided flow as Plan for the selected month. At zero the action is absent. The link opens the flow without writing an assignment.
## Prüfen: recurring bank transfers (#1266)

A matching transfer rule or two consecutive confirmed bank occurrences to the same own account prefill the destination. The row displays a single transfer choice. The owner confirms it explicitly, and the existing transfer path uses an eligible counterpart and records the action as one Undo group.
## Prüfen: ambiguous bank matches (#516)

A bank line only links automatically if it has one eligible booking and is that booking’s only bank-line claim. All other matches stay open for manual review. The default suggestion uses the latest known confirmation, then closest booking date and stable identity. The owner sees the number of alternatives and confirms or changes the selection.

## Reports: Explorer tables (#1161)

In Explorer, the pivot, template tables and original chart rows share a
register-style layout. I can scroll wide tables from the keyboard or on a phone,
read figures under sticky headers and open the same booking details.
## Reviewing protected bookings (#1108)

The edit form opens after a separate confirmation for bookings accepted in Prüfen,
bookings protected by account reconciliation (including month close), and outlays
with eligible repayment allocations. The dialog shows recorded review,
reconciliation or repayment dates. The explicit override is audited with the
booking change. Repayments keep their bank amounts and any released allocation
becomes contact credit. A changed reconciliation balance remains visible in
Prüfen. One Undo restores the booking and its affected links.

F4/F9 (#1294): The operator can compare fixed expected values with a read-only database snapshot
and get a pass or fail for each figure. The synthetic twin runs in CI. Private parallel-run
evidence and owner sign-off remain open. See the [reference check](acceptance-tolerances.md#4-reference-check-operator-command-1294).
## Bank feed at month boundaries (#1293)

When a bank authorization becomes booked under the same source reference, its
final date and amount stay available for review if the feed later repeats the
pending authorization. If both versions arrive together, Budget uses the
booked version when it can match the pair to a recorded source identity.
If I already recorded the booking,
I review any reported change and correct the existing booking explicitly.
One Undo restores its previous date, amount and allocations.
## Bank-only transit reconciliation (#1195)

When money is between two bank accounts, I see the signed difference on its own
**Geld unterwegs** line. The cash reconciliation covers the selected checking and
savings accounts. Brokerage, crypto and P2P cash keeps its own valuation, outside
the bank cash shown on that line. The display creates no bookings or adjustments.
## Plan: repayment versus investment (#1291)

In Plan › Prognose, I can start with the investable amount, select a payment account
and an open EUR loan or overdraft, and edit the amount and return assumptions. I
see each option's lowest payment-account balance, account and date, and whether
committed reserves stay covered through payday plus 30 days. A negative low or
reserve shortfall marks the option as inadvisable. First-year interest saved and
the assumed investment return range are shown separately from the cash forecast.
The comparison leaves bookings and Undo history untouched.
## Crypto operation matching (#1205)

After fetching or running **Abgleich neu ausführen**, movements with the same
provider transaction or trade reference are checked together, even if they
arrived on different pages. An existing savings-plan trade can be shown beside
an open funding leg. The funding check compares exact cents with the existing
cash booking in the savings-plan date window. A token fee is included once in
that token's unit effect, and balanced staking transfers are informational.
Repeat runs preserve the result. Undo restores the operation and balance-review
decisions together. The comparison reads the existing ledger and holdings.

## Crypto staking reconciliation (#1309)

When I run **Abgleich neu ausführen**, a readable stake or unstake stays
informational even if the source sent only one wallet leg. Any purchase in the
same operation is still checked against the ledger. Reconciliation leaves my
bookings, trades and balances intact, and one Undo restores the review decisions
changed by that run.

## Krypto-Wallet bewusst nicht abbilden (#1205)

Als ich eine Wallet der Lesequelle sehe, für die es in der App kein Konto in
ihrer Währung gibt (zum Beispiel ein USD-Guthaben), zeigt mir
Einstellungen › Datenquellen den Hinweis „Kein Konto in USD. Diese Wallet kann
nicht abgebildet werden.“ und die Schaltfläche **Nicht abbilden**. Die Wahl
steht bei jeder Wallet zur Verfügung. Danach steht dort „Bewusst nicht
abgebildet“, die Wallet zählt nicht als „Zuordnung fehlt“, und es gibt keine
Meldung „Quellsaldo weicht ab“. Beim nächsten **Abgleich neu ausführen** werden
Bewegungen, die nur diese Wallet betreffen, als informativ geschlossen; Legs auf
zugeordneten Wallets derselben Bewegung werden weiter geprüft. Mit **Wieder
abbilden** nehme ich die Wahl zurück. Buchungen, Trades, Bestände und Salden
bleiben unverändert, und Rückgängig stellt die Prüfliste wieder her.

## Heute: Fälliges und letzte Buchungen antippen (#1323)

Auf Heute öffnet ein Tipp auf eine Zeile in „Letzte Buchungen“ genau diese Buchung im Bearbeiten-Dialog. Nach Speichern oder Schließen bleibe ich auf Heute und die Karte aktualisiert sich. Ein Tipp auf eine Zeile in „Fällig 14 Tage“ öffnet die wiederkehrende Zahlung mit Buchen, Verknüpfen und Überspringen; ist die Fälligkeit schon zugeordnet, öffnet sie die verknüpfte Buchung zum Bearbeiten. „Alle →“ führt wie bisher in die Listen.

## Prüfen: Alter und Summe offener Buchungen (#1320)

Prüfen zeigt neben der Anzahl, wie alt die offenen Buchungen ohne Kategorie sind und wie viel Geld daran hängt. Ab einer Buchung, die älter ist als die eingestellte Zahl an Tagen (Standard 7), oder ab mehr offenen Einträgen als eingestellt (Standard 10) wird der Zähler im Kopf und auf Heute zur ruhigen Warnung, etwa „8 Buchungen älter als 7 Tage · −1.234,56 € ohne Kategorie“. Beide Schwellen ändere ich unter Einstellungen › Profil › Prüfen · Warnung. Im laufenden Plan-Monat steht unter „Zu verteilen“ „Enthält −1.234,56 € ohne Kategorie“ mit Link nach Prüfen, solange dieser Betrag nicht 0 ist.
