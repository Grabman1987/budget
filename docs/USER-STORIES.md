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
| [Plan (Budget)](user-stories/02-plan.md) | 12 | 8 | 2 | 2 | 0 | 0 |
| [Konten und Buchungen](user-stories/03-konten-buchungen.md) | 17 | 11 | 2 | 3 | 1 | 0 |
| [Kontakte](user-stories/04-kontakte.md) | 6 | 2 | 1 | 3 | 0 | 0 |
| [Vermögen und Portfolio](user-stories/05-vermoegen-portfolio.md) | 20 | 2 | 11 | 4 | 3 | 0 |
| [Reports](user-stories/06-reports.md) | 37 | 35 | 0 | 2 | 0 | 0 |
| [Prüfen und Dokument-Upload](user-stories/07-pruefen-upload.md) | 12 | 6 | 1 | 5 | 0 | 0 |
| [Monatsabschluss](user-stories/08-monatsabschluss.md) | 5 | 1 | 3 | 0 | 0 | 1 |
| [Regelwerk und Finanz-Check](user-stories/09-regelwerk.md) | 26 | 24 | 1 | 0 | 1 | 0 |
| [Einstellungen](user-stories/10-einstellungen.md) | 19 | 11 | 4 | 2 | 2 | 0 |
| [App allgemein](user-stories/11-app-allgemein.md) | 12 | 1 | 5 | 5 | 1 | 0 |
| **Summe** | **172** | **106** | **30** | **27** | **8** | **1** |

Eine Analyse aller Abläufe nach Aufwand für den Nutzer steht in [EFFIZIENZ.md](user-stories/EFFIZIENZ.md).

## Offene Fragen an den Nutzer

Stand nach den Entscheidungen vom 15.11.2026. Bei diesen Stories ist noch etwas offen:

- **P-07** (Zahlungskategorien für Kreditkarten): Barvorschuss = Bargeld mit der Kreditkarte abheben. Nutzt der Nutzer das? Wenn nein, entfällt der Begriff.
- **K-14 / V-18** (Fremdwährungsüberträge): Wo wird der Übertrag erfasst (Konten › Buchungen oder Konto-Detail)? Die Funktion wird realisiert.
- **V-14** (Kurs- und Kryptoabweichungen mit Ursache): Soll die Ursachenansicht unter Konten › Prüfen oder unter Einstellungen › Datenquellen stehen?
- **E-07** (Verschlüsselte Sicherung): Soll es in der App eine Wiederherstellungsprobe geben?

Entschieden am 15.11.2026: H-01 (nächstes Sparziel im Block „Ziele finanzieren“), K-12 (Vorgang beim Konto öffnen), K-13 / V-17 (ein Übertrag, bleibt `geplant`, wird noch nicht gebaut), M-03 (entfällt), E-10 (Glossar bewusst offen).

## Abnahme

1. Bereich öffnen und die Story suchen (ID, z. B. H-02).
2. Den Ablauf in der App nachgehen.
3. Jedes Abnahmekriterium prüfen.
4. Ergebnis mit der ID melden: „H-02 passt“ oder „H-02 fehlt: …“.
5. Eine Story gilt erst als abgenommen, wenn der Nutzer sie bestätigt hat.

## Pflege

Jede neue Funktion und jede Entscheidung des Nutzers bekommt im selben Pull Request ihre Story oder eine Aktualisierung von Status und Kriterien.
