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
