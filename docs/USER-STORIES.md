# User-Stories – Budget

Dieser Katalog beschreibt, was der Nutzer in der App tun können soll, wozu, in welchen Schritten, und woran er es prüft. Stand: 15.11.2026. 172 Stories in elf Bereichen.

## Aufbau jeder Story

- **Story:** „Als Nutzer möchte ich …, damit …“ – das „damit“ nennt den Nutzen.
- **Ausgangslage:** wann und warum der Nutzer dort hinkommt.
- **Ablauf:** nummerierte Schritte mit Bildschirm, Bedienelement und Reaktion der App.
- **Ergebnis:** was danach gilt.
- **Abnahmekriterien:** prüfbare Punkte, mindestens ein Rand- oder Fehlerfall.
- **Status und Verweis:** `live` = in der Produktions-App vorhanden (die Abnahme durch den Nutzer steht trotzdem aus), `teilweise` = nur ein Teil ist da, `offen` = beauftragt oder angefangen, `geplant` = bewusst später. Bei `teilweise` und `offen` steht „Fehlt noch: …“.

Die Status stammen aus `docs/FEATURES.md`, `docs/STATUS.md`, dem Code und dem Issue-Stand, nicht aus einer Prüfung in der laufenden App.

## Bereiche

| Bereich | Stories | live | teilweise | offen | geplant |
| --- | --- | --- | --- | --- | --- |
| [Heute](user-stories/01-heute.md) | 6 | 5 | 0 | 1 | 0 |
| [Plan (Budget)](user-stories/02-plan.md) | 12 | 8 | 2 | 2 | 0 |
| [Konten und Buchungen](user-stories/03-konten-buchungen.md) | 17 | 11 | 2 | 2 | 2 |
| [Kontakte](user-stories/04-kontakte.md) | 6 | 2 | 1 | 3 | 0 |
| [Vermögen und Portfolio](user-stories/05-vermoegen-portfolio.md) | 20 | 2 | 11 | 3 | 4 |
| [Reports](user-stories/06-reports.md) | 37 | 35 | 0 | 2 | 0 |
| [Prüfen und Dokument-Upload](user-stories/07-pruefen-upload.md) | 12 | 6 | 1 | 5 | 0 |
| [Monatsabschluss](user-stories/08-monatsabschluss.md) | 5 | 1 | 3 | 1 | 0 |
| [Regelwerk und Finanz-Check](user-stories/09-regelwerk.md) | 26 | 24 | 1 | 0 | 1 |
| [Einstellungen](user-stories/10-einstellungen.md) | 19 | 11 | 4 | 2 | 2 |
| [App allgemein](user-stories/11-app-allgemein.md) | 12 | 1 | 5 | 5 | 1 |
| **Summe** | **172** | **106** | **30** | **26** | **10** |

## Offene Fragen an den Nutzer

Bei diesen Stories ließ sich der Ablauf weder aus dem Code noch aus dem Issue ableiten:

- **H-01** (Antwortkarten auf einen Blick): soll das nächste Sparziel (nach Datum) als eigene Karte oben stehen oder reicht der Block?
- **P-07** (Zahlungskategorien für Kreditkarten): wo genau wird ein Barvorschuss erfasst?
- **K-12** (Umbuchung und Wertpapierkauf als ein Vorgang): von welcher Seite (Konten oder Vermögen) wird der Vorgang geöffnet?
- **K-13** (Wertpapierüberträge mit Kostenbasis): Das Issue beschreibt nur die Prüfung (Stufe A: Erhaltung von Stückzahl und Basis, FIFO/Durchschnitt); eine Oberfläche ist nicht festgelegt.
- **K-14** (Fremdwährungsüberträge): Das Issue legt Buchungs-Fixtures fest, aber keine Oberfläche. Vorgesehen: Quell- und Zielbetrag samt Währung, Kurs mit Herkunft und eine getrennte Gebühr erfassen.
- **V-14** (Kurs- und Kryptoabweichungen mit Ursache (geplant)): Ort der Ursachenansicht (Konten › Prüfen oder Einstellungen › Datenquellen)?
- **V-17** (Wertpapierüberträge mit belegter Kostenbasis (neu, geplant)): In welchem Formular wird ein Übertrag erfasst (Handelsart „Einlieferung“/„Auslieferung“ oder neue Art)?
- **V-18** (Fremdwährungsüberträge begrenzt erfassen (neu, geplant)): Wo wird der Fremdwährungsübertrag erfasst (Konten › Buchungen oder Konto-Detail)?
- **M-03** (Wochen-, Quartals- und Jahresroutinen): Welche Schritte hat je Routine (Woche, Quartal, Jahr) und wo erscheint sie (eigener Bildschirm, Heute oder Plan › Jahr)? Weder Code noch Issue beschreiben einen Ablauf.
- **E-10** (Bei Veröffentlichung: Login, Onboarding und Glossar): Wie und wo das Glossar erscheint; das Issue nennt es nur im Titel.

## Abnahme

1. Bereich öffnen und die Story suchen (ID, z. B. H-02).
2. Den Ablauf in der App nachgehen.
3. Jedes Abnahmekriterium prüfen.
4. Ergebnis mit der ID melden: „H-02 passt“ oder „H-02 fehlt: …“.
5. Eine Story gilt erst als abgenommen, wenn der Nutzer sie bestätigt hat.

## Pflege

Jede neue Funktion und jede Entscheidung des Nutzers bekommt im selben Pull Request ihre Story oder eine Aktualisierung von Status und Kriterien.
