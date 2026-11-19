# User-Stories – Budget

Dieser Katalog beschreibt, was der Nutzer in der App tun können soll, wozu, in welchen Schritten, und woran er es prüft. Stand: 15.11.2026. 172 Stories in elf Bereichen.

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
| [Plan (Budget)](user-stories/02-plan.md) | 13 | 9 | 2 | 2 | 0 | 0 |
| [Konten und Buchungen](user-stories/03-konten-buchungen.md) | 17 | 12 | 2 | 2 | 1 | 0 |
| [Kontakte](user-stories/04-kontakte.md) | 6 | 2 | 4 | 0 | 0 | 0 |
| [Vermögen und Portfolio](user-stories/05-vermoegen-portfolio.md) | 20 | 3 | 12 | 2 | 3 | 0 |
| [Reports](user-stories/06-reports.md) | 37 | 35 | 0 | 2 | 0 | 0 |
| [Prüfen und Dokument-Upload](user-stories/07-pruefen-upload.md) | 12 | 6 | 1 | 5 | 0 | 0 |
| [Monatsabschluss](user-stories/08-monatsabschluss.md) | 5 | 1 | 3 | 0 | 0 | 1 |
| [Regelwerk und Finanz-Check](user-stories/09-regelwerk.md) | 26 | 24 | 1 | 0 | 1 | 0 |
| [Einstellungen](user-stories/10-einstellungen.md) | 20 | 11 | 4 | 3 | 2 | 0 |
| [App allgemein](user-stories/11-app-allgemein.md) | 12 | 1 | 5 | 5 | 1 | 0 |
| **Summe** | **174** | **109** | **34** | **22** | **8** | **1** |

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
explicitly unavailable. Amount privacy also hides the trace amounts and raw JSON.
Correct the mapping/source evidence through the existing data-source controls and
run **Abgleich neu ausführen**; an unsuccessful retry retains the warning and a
successful balance check resolves it. Manual acknowledgement is not source repair.
This slice creates no bookings, valuations, cost basis or tax values. Owner-approved
local-copy analysis and money acceptance for #1205 remain pending.

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
