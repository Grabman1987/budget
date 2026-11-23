# User-Stories – Prüfen/Posteingang und Dokument-Upload

Bereich 07. Gesamtkatalog, Status- und Verweis-Legende: `docs/USER-STORIES.md`. Stand: 16.11.2026.
Bildschirm Prüfen: `/konten/pruefen` (Konten › Prüfen). Zähler: „Umsätze“ und „Aufgaben“ oben, daneben „n offen“.

### I-01 – Bankumsatz bestätigen oder nicht übernehmen
- **Story:** Als Nutzer möchte ich jeden neuen Bankumsatz einzeln bestätigen oder nicht übernehmen, damit nur Umsätze im Budget landen, die ich selbst gesehen habe.
- **Ausgangslage:** Der Bankabruf hat neue Umsätze gebracht. Sie zählen noch nicht zum Kontostand, wenn die Verbindung „Erst nach Bestätigung zählen“ nutzt. Der Zähler „Umsätze“ ist größer als 0.
- **Ablauf:**
  1. Nutzer öffnet Konten › Prüfen und wählt den Teil „Umsätze“.
  2. Die App zeigt je Bankkandidat Empfänger, Konto · Quelle, Vorschlag, Kategorie (bei Umbuchungen Gegenkonto), Betrag und Aktionen. Detailprüfungen laden beim Fokussieren oder Berühren der Zeile.
  3. Nutzer wählt Empfänger, Regelvorschlag oder Kategorie direkt in der Zeile. Vorschläge stehen zuerst und sind gestrichelt; die ausdrückliche Auswahl macht sie durchgezogen. Eine gültige letzte Einzelkategorie des Empfängers dient als Vorschlag, wenn kein gespeicherter Standard besteht. Kategorien lassen sich getrennt neu anlegen.
  4. Erst das Hakerl „Übernehmen“ bucht. Doppelklick auf die Zeile, Enter auf der fokussierten Zeile oder der Stift „Prüfen“ öffnen weiterhin „Buchung übernehmen“ für Aufteilung, Notiz, Projekt und Beleg; Bankbetrag und Bankdatum bleiben nur lesbar. Am Handy bleibt zusätzlich „Auswählen“ im Menü.
  4a. Der geöffnete Dialog „Buchung übernehmen“ bleibt offen, auch wenn die Liste im Hintergrund neu geladen wird und die Zeile dabei neu aufgebaut wird (#1215).
  5. Die App legt die Buchung an, löst den Eintrag auf und senkt den Zähler um 1. Ein Hinweis bietet „Rückgängig“ an.
  6. Alternativ klickt der Nutzer das X „Nicht übernehmen“. Dann entsteht keine Buchung. Pfeil auf/ab wechseln die Zeile; Enter öffnet die fokussierte Zelle, Escape verlässt die Zellbearbeitung ohne Änderung.
- **Ergebnis:** Bestätigt: Buchung mit Status „Bestätigt“ in Konten › Alle Buchungen, Saldo aktualisiert. Nicht übernommen: Eintrag erledigt, keine Buchung, der Bankumsatz bleibt in der Quelle nachvollziehbar.
- **Abnahmekriterien:**
  1. Der Zähler sinkt um genau 1 je erledigtem Eintrag.
  2. Ein Vorschlag wird nur nach Klick übernommen, nie von selbst.
  3. „Rückgängig“ stellt den offenen Eintrag wieder her; der Zähler steigt wieder.
  4. Ohne offene Einträge steht „Alles geprüft“ mit dem Hinweis, dass neue Buchungen aus dem Bank-Sync hier erscheinen.
  5. Hakerl und X sind am Desktop und am Handy direkt sichtbar und mindestens 44 px hoch. Ein Menü mit nur „Nicht übernehmen“ entfällt.
  6. Das Hakerl bleibt ohne Konto, Empfänger und gültige Kategorie bzw. nachgewiesenes Regel-/Umbuchungsziel gesperrt. Tooltip und markierte Zelle benennen den fehlenden Wert. Laufende, fehlgeschlagene oder mehrdeutige Prüfungen blockieren; der Server prüft weiterhin vor jedem Schreiben.
  7. Eindeutige Gegenbuchungen sind ausdrücklich als Vorschlag wählbar. Mehrdeutige Treffer und bereits vorbereitete Gegenumsätze bleiben im vollständigen Formular; kein Vorschlag wird automatisch gebucht. Archivierte Kategorien werden nicht neu angeboten.
  8. Bestätigung und Ablehnung behalten ihr Rückgängig. Zellenauswahl allein verändert keine Buchung und keinen Kontostand.
  9. Rücklink, Ansichtsmenü, Umsätze/Aufgaben und Filter stehen am Desktop in einer Zeile und brechen bei 390 px ohne horizontalen Überlauf um.
- **Status:** teilweise — **Verweis:** Y16, #1187
  Zeilenbearbeitung, Kategorie-Spalte, Hakerl/X und Tastaturwege für offene Bankkandidaten sind implementiert; Review und Live-Abnahme offen. Bereits gebuchte ungeprüfte Zeilen behalten ihre bestehenden Zuordnungsdialoge. Die Kopfzeilenkorrektur aus #1188 ist enthalten; Rücklink und Ansichtsmenü teilen sich die Werkzeugleiste.

### I-01c – Review one list per account (#1191)

- **Flow:** Open Konten › Prüfen › Umsätze. Each account header contains its latest fetch date and result counts directly above the existing rows. Accounts with open rows start expanded; the device remembers explicit collapse choices. Accounts without open rows occupy one muted line. Multiple sources mapped to the same account share one group; identically named accounts remain separate.
- **Actions:** The toolbar contains “Dokument hochladen”, “Prüfen durchgehen” and Filter. The info control beside the tab counters explains their scope. In-row selection, tick/X, full review, server checks and Undo retain I-01 behavior. No recap block duplicates the rows or requires a filtering click.
- **Overspending:** A nonempty “Überzogene Kategorien” section below the rows lists category, group and the canonical current-month shortfall. “Decken” opens the existing envelope cover/move form with that category and its exact shortfall. Nothing is moved until the user submits. These categories do **not** enter the Aufgaben or Umsätze counters; existing task-count semantics stay unchanged.
- **Acceptance:** Two accounts are expanded on first load, each candidate appears exactly once, and a candidate can be edited and accepted immediately. Undo restores it. Collapse survives reload on the same device, while other groups keep their state. Desktop and 390 px phone use the same order. The cover dialog displays the original deficit and reuses the existing guarded writer.
- **Status:** implemented for review; focused model/browser evidence, independent review, CI and owner acceptance remain separate. Pagination remains explicit through “Weitere anzeigen”; account headers whose open rows are on a later page explain this. Already booked unchecked rows retain their existing assignment dialogs (remaining extension of #1187).

### I-01a – Mehrere Bankumsätze auf einmal bearbeiten
- **Story:** Als Nutzer möchte ich mehrere eindeutige Bankumsätze in einem Zug bestätigen oder nicht übernehmen, damit ein Abruf mit vielen Umsätzen nicht Klick für Klick abgearbeitet werden muss.
- **Ausgangslage:** Viele offene Umsätze, die meisten mit eindeutigem Vorschlag.
- **Ablauf:**
  1. Nutzer öffnet Konten › Prüfen › Umsätze und hakt Zeilen an („Bankzeile auswählen“).
  2. Die Sammelleiste bietet „bestätigen“ oder „nicht übernehmen“ für die Auswahl.
  3. Die App zeigt vorab eine Vorschau mit Anzahl und „übersprungen“. Umbuchungen, mögliche Duplikate, Zusammenführungen und mehrdeutige Treffer werden nicht automatisch bestätigt.
  4. Nutzer klickt „Auswahl jetzt ausführen“.
  5. Die App verarbeitet die sicheren Zeilen, meldet „n Bankzeilen bestätigt · m übersprungen“ und hält alle Änderungen als eine Gruppe.
- **Ergebnis:** Sichere Zeilen sind gebucht oder erledigt; übersprungene Zeilen bleiben offen.
- **Abnahmekriterien:**
  1. Übersprungene Zeilen bleiben offen und werden in der Vorschau gezählt.
  2. Ein einziges „Rückgängig“ nimmt die ganze Gruppe zurück.
  3. Ändern sich Quelldaten zwischen Vorschau und Ausführung, meldet die App „Quellendaten nicht mehr verfügbar – bitte neu prüfen“ und bucht nichts.
  4. Ohne Auswahl ist „Auswahl jetzt ausführen“ nicht bedienbar.
- **Status:** live — **Verweis:** Y16

### I-01b – Aufgaben und Warnungen erledigen
- **Story:** Als Nutzer möchte ich Datenwarnungen und andere Aufgaben erklären lassen und als erledigt markieren, damit Prüfen leer wird und ich sicher bin, dass nichts Wichtiges übersehen wurde.
- **Ausgangslage:** Unter „Aufgaben“ stehen Einträge wie Importwarnungen, Kontoprüfung, Sicherung oder Kurse nicht abrufbar.
- **Ablauf:**
  1. Nutzer öffnet Konten › Prüfen und wählt „Aufgaben“. Die Liste ist nach Quelle gruppiert („Aufgaben nach Quelle“).
  2. Bei einer Importwarnung klickt er „Warnung erklären“. Die App zeigt die Einzelpunkte unter „Einzelpunkte anzeigen“. Bei Kurswarnungen öffnet sich die Ursachenansicht mit einer schreibfreien Quellvorschau (V-14).
     Währungskonflikte nennen erwartete und belegte Währung je Quelle; eine Quellzuordnung wird nicht als Abrufantwort ausgegeben.
  3. Er behebt die Ursache an der Quelle (Link „Quelle“) oder entscheidet, dass nichts zu tun ist.
  4. Bei allgemein erledigbaren Aufgaben klickt er „Als erledigt markieren“. Die App löst den Eintrag auf und senkt den Zähler. Kurswarnungen bleiben bis zum erfolgreichen automatischen Abruf offen; eine Vorschau oder ein manueller Kurs schließt sie nicht.
  5. Warnungen zu einem fehlgeschlagenen Kurs- oder Wechselkursabruf („Kurse nicht abrufbar“, „Wechselkurs nicht abrufbar“) muss er nicht schließen: Der nächste erfolgreiche Abruf für dasselbe Instrument oder dieselbe Währung schließt sie. Unter „Automatisch geschlossene Warnungen“ steht je Eintrag der Verlauf (geöffnet am, Fehlerklasse, geschlossen am, Begründung mit Quelle und Stand), für die letzten 30 Tage, höchstens die 20 neuesten.
- **Ergebnis:** Eintrag ist erledigt, nichts wurde gelöscht. Die Warnung selbst repariert die Quelle nicht.
- **Abnahmekriterien:**
  1. Der Zähler „Aufgaben“ sinkt je erledigtem Eintrag.
  2. „Als erledigt markieren“ ändert keine Buchung und keinen Saldo.
  3. Filter „Zeitraum der Aufgaben“ (Alle, Aktueller Monat, Historische Nacharbeit) schränkt die Liste ein; ein Chip zeigt den aktiven Zeitraum.
  4. Lädt die Liste nicht, zeigt die App eine Fehlermeldung mit „Erneut versuchen“ statt einer leeren Liste.
  5. Eine Abrufwarnung schließt sich nach dem nächsten erfolgreichen Abruf selbst; die Begründung („Automatisch geschlossen: Kursabruf über … erfolgreich (Stand …).“) steht im Eintrag und im Verlauf. Das Schließen ist im Änderungsprotokoll erfasst (Rückgängig auf Protokollebene, noch ohne Schaltfläche) und ändert keine Finanzzahl.
  6. Warnungen zu echten Abweichungen (Bestand, fehlende Bewegung, abweichender Schlusskurs) schließen sich nie von selbst.
  7. Kurswarnungen bieten keinen pauschalen Abschluss; der allgemeine Erledigen-Endpunkt weist ihn ebenfalls zurück.
- **Status:** teilweise — **Verweis:** Y16, #1081, #1101
  Allgemeine Aufgaben sind live. Die Ursachenansicht und Quellvorschau für Kurswarnungen sind in PR #1112 umgesetzt; sichere Währungsbelege je Vorschauquelle sind im zweiten Schritt ergänzt. Gespeicherte historische Fehlerbelege, weitere verbleibende Kriterien und private Abnahme siehe V-14. Selbstschließende Abrufwarnungen mit Verlauf (#1101) sind umgesetzt, private Abnahme offen.

### I-02 – Prüfen geführt durchgehen
- **Story:** Als Nutzer möchte ich die offenen Umsätze der Reihe nach mit Fortschrittsanzeige durchgehen, damit ich in einer Sitzung fertig werde und sehe, wie viel noch fehlt.
- **Ausgangslage:** Viele offene Umsätze; der Nutzer will sie am Stück abarbeiten, am Handy oder mit der Tastatur.
- **Ablauf:**
  1. Nutzer klickt in Konten › Prüfen auf „Prüfen durchgehen“.
  2. Die App zeigt einen Umsatz pro Karte mit Datum, Konto und Vorschlag, dazu „n von m · k erledigt · j zurückgestellt“ und eine Fortschrittsleiste.
  3. Nutzer klickt „Bestätigen“ (oder Enter) oder „Bearbeiten“ für eine eigene Zuordnung.
  4. Für später wählt er „Zurückstellen“ und einen Grund (Rückfrage offen, Beleg fehlt, Betrag unklar, Später entscheiden).
  5. Mit Pfeiltasten oder J/K wechselt er den Umsatz, mit Esc oder „Zur Liste“ verlässt er den Ablauf.
  6. Am Ende zeigt die Zusammenfassung „Erledigt“, „Zurückgestellt“, „Noch offen“; „Fertig“ schließt.
- **Ergebnis:** Bestätigte Umsätze sind gebucht. Zurückgestellte bleiben unter Prüfen offen und sind nur in dieser Sitzung ausgeblendet.
- **Abnahmekriterien:**
  1. Fortschritt „n von m“ und die Leiste wachsen mit jedem erledigten Umsatz.
  2. Zurückgestellte Umsätze erscheinen in der Zusammenfassung mit ihrem Grund und bleiben danach offen.
  3. Ohne Vorschlag („Unbekannt“) fehlt „Bestätigen“ als Direktweg; der Grund steht auf der Karte („Wähle die Kategorie unter Bearbeiten“).
  4. Schlägt das Laden fehl, zeigt die App eine Fehlermeldung mit Wiederholen statt einer leeren Karte.
- **Status:** live — **Verweis:** #1054

### I-03 – Bankzeile mit „Alle Felder“ in einem Schritt vervollständigen
- **Story:** Als Nutzer möchte ich beim Übernehmen einer Bankzeile Notiz, Projekt, Aufteilung und Beleg gleich mitgeben, damit ich die Buchung nicht danach ein zweites Mal öffnen muss.
- **Ausgangslage:** A complete bank candidate is open in “Buchung übernehmen”; the owner needs a note, project, split or receipt before confirming.
- **Ablauf:**
  1. Nutzer öffnet in Konten › Prüfen bei einer Bankzeile „Prüfen“ und damit „Buchung übernehmen“.
  2. Er klappt die zugeklappte Einheit „Alle Felder“ auf; sie zeigt Betrag und Datum laut Bank nur lesend.
  3. Er trägt Notiz und Projekt ein, wählt „Aufteilen“ (bei aktiver Regel „Selbst aufteilen“) und hängt einen „Beleg“ an.
  4. Die Aufteilung muss auf den Cent aufgehen; sonst bleibt Speichern gesperrt.
  5. Er klickt „Als Buchung bestätigen“. Die App schreibt Buchung, Teilbeträge, Notiz, Projekt und Belegverknüpfung in einem Schritt.
- **Ergebnis:** Eine vollständige, bestätigte Buchung. Ein „Rückgängig“ nimmt alles zurück; der Eintrag ist wieder offen, der Beleg wieder unter Prüfen.
- **Abnahmekriterien:**
  1. „Alle Felder“ ist standardmäßig zugeklappt und liegt im bestehenden Dialog, kein zweiter Dialog.
  2. Bleibt bei „Aufteilen“ ein Rest ungleich 0,00 €, ist Speichern gesperrt.
  3. Eine Regel und eine eigene Aufteilung schließen sich aus; „Selbst aufteilen“ verwirft die Regel.
  4. Ein „Rückgängig“ stellt Eintrag und Beleg gemeinsam wieder her.
  5. Am Handy bleibt der aufgeklappte Bereich ohne seitliches Scrollen bedienbar.
- **Evidence:** `e2e/issue-1048-bank-all-fields.spec.ts` exercises real candidate reads, file/photo uploads, note/project persistence, the rule-to-manual switch, a one-cent remainder blocking confirmation, confirmed read-only bank facts and one grouped Undo restoring candidate and receipts. Keyboard operation and 390 px layout run in both themes; a synthetic USD candidate retains its native unit in facts, split fields and remainder. Server invariants remain covered by `bank-confirm-all-fields-1048.test.ts`.
- **Status:** offen — **Verweis:** #1048
  Remaining: independent review, exact-head CI and owner acceptance. Physical camera capture is an owner device check; browser evidence uploads a synthetic image through the camera input. #516 matching policy remains outside this story's implementation.

### I-04 – Dokument zentral hochladen
- **Story:** Als Nutzer möchte ich jedes Dokument an einer Stelle hochladen und von der App erkennen lassen, was es ist, damit ich nicht erst überlegen muss, welcher Import für Kontoauszug, Gehaltszettel oder Beleg zuständig ist.
- **Ausgangslage:** Der Nutzer hat ein PDF oder Foto (Kreditkartenabrechnung, Kontoauszug, Gehaltszettel, Bonus-/Pensionsmitteilung, Wertpapierabrechnung, Beleg). Der Knopf „Neues Dokument hochladen“ steht in der Kopfzeile, „Dokument hochladen“ in Prüfen, am Konto der Upload dieses Kontos. In „Buchung erfassen“ öffnet ausschließlich die Büroklammer „Datei anhängen“ im Blattkopf die Dateiauswahl; der zusätzliche Upload-Eintrag unten entfällt (#1238).
- **Ablauf:**
  1. Nutzer klickt „Neues Dokument hochladen“. Der Dialog zeigt „Dokument ablegen“ und „Datei auswählen“ (Foto oder PDF, höchstens 15 MB).
  2. Er legt mehrere Dateien ab oder wählt sie gemeinsam. Jede Datei erhält einen eigenen Eintrag mit Dateinamen, Typ und Prüfstatus. Ein Fehler hält die anderen Dateien nicht auf; „Erneut versuchen“ prüft nur die betroffene Datei.
  3. Bei einem geschützten PDF gibt er unter „PDF-Passwort“ das Passwort ein und klickt „Mit Passwort prüfen“.
  4. Er prüft oder ändert je Datei den „Dokumenttyp“ und bei Abrechnungen den Konto-Vorschlag: Konto-Kontext, letzte bestätigte Auswahl desselben Typs im geöffneten Dialog oder einziges passendes offenes Konto. Bei mehreren passenden Konten ohne Kontext bleibt die Auswahl leer. Die Auswahl lässt sich vor „Weiter“ ändern; eine maskierte Kartennummer bleibt ein Hinweis, keine bewiesene Zuordnung.
  5. Ein Hinweistext sagt, was „Weiter“ tut. Gespeichert wird erst nach „Weiter“. Danach öffnet sich der passende Ablauf (Abrechnungsprüfung, Gehaltszettel-Vorschau, Beleg).
  5a. Bei einer Wertpapierabrechnung zeigt der Eintrag „Gelesene Angaben“; „Weiter“ öffnet „Handel erfassen“ als Vorschlag, gespeichert wird erst dort (V-15). Die PDF selbst wird dabei nicht abgelegt. Nach dem Speichern zeigt der Eintrag „Handel aus der Abrechnung erfasst.“; schließt man das Formular ohne Speichern, bleibt der Eintrag zur Bestätigung stehen.
  6. Der Abschluss zeigt, was passiert ist („nichts gebucht“, „n Zeilen warten unter Prüfen“), mit „Fertig“ oder „Weiteres Dokument“. Nach einer Einzelprüfung bleibt die Liste mit den übrigen Dateien erhalten. Gehaltskonto und Belegzuordnung bleiben im bestehenden Einzelprüfablauf.
- **Ergebnis:** Das Dokument ist gespeichert und im passenden Ablauf; gebucht wird nur, was eindeutig belegt ist, alles andere wartet unter Prüfen.
- **Abnahmekriterien:**
  1. Der erkannte Typ wird genannt und lässt sich über „Dokumenttyp“ ändern.
  2. Mehrfachauswahl und Ablegen mehrerer Dateien erzeugen getrennte Ergebnisse; Wiederholung, Passwort und Kontoauswahl einer Datei verändern die anderen Einträge nicht.
  3. Eine Datei über 15 MB oder ein falsches Passwort ergibt eine Meldung („Bitte eine Datei bis 15 MB auswählen.“, „Passwort falsch. Bitte erneut eingeben.“) und es wird nichts gespeichert.
  4. Dasselbe Dokument ein zweites Mal ergibt „Diese Datei war schon vorhanden. Es wurde nichts wiederholt.“
  5. Ein nicht lesbares Dokument lässt sich als Beleg ablegen; „Andere Datei“ setzt zurück.
  6. Der Typ „Wertpapierabrechnung“ steht nur zur Wahl, wenn die App das Layout erkannt hat. Ist die Abrechnung schon als Handel erfasst, meldet der Eintrag das und „Weiter“ ist gesperrt (V-15).
- **Status:** teilweise — Mehrfachauswahl, getrennte Ergebnisse und Konto-Vorschläge für Abrechnungen implementiert; Review und Live-Abnahme offen. Konto-Vorschläge für Gehaltszettel stehen weiterhin in der Einzelprüfung; dauerhafte Vorschläge aus früheren Uploads und Kartennummern-Zuordnung bleiben offen. — **Verweis:** #1039, #1053 (zentral #1060), #1103, #1099

### I-05 – Bonus- und Pensionskassenmitteilung archivieren
- **Story:** Als Nutzer möchte ich Mitteilungen ohne Gehaltsbezug im Mitteilungsarchiv ablegen, damit sie weder als Gehaltszettel-Vorschlag offen bleiben noch verloren gehen.
- **Ausgangslage:** Das Dokument wurde als „Bonus-Mitteilung“ oder „Pensionskassen-Mitteilung“ erkannt.
- **Ablauf:**
  1. Nutzer lädt das PDF über „Neues Dokument hochladen“ hoch (siehe I-04).
  2. Die App nennt den Typ und zeigt als Knopf „Als Bonus-/Pensionsmitteilung archivieren; keinen Gehaltsimport erstellen“.
  3. Nutzer klickt den Knopf. Die App speichert das Original im Mitteilungsarchiv und verwirft einen vorhandenen Gehaltsimport-Vorschlag.
  4. Der Abschluss nennt „Original: im Mitteilungsarchiv gespeichert“ und „Gehaltsimport-Vorschlag: verworfen. Es wurde nichts gebucht.“
  5. Im Dialog zeigt „Mitteilungsarchiv und offene Importvorschläge“ die Liste mit Dateinamen und Status.
- **Ergebnis:** Mitteilung ist im Archiv auffindbar; kein offener Gehaltszettel-Eintrag, keine Buchung.
- **Abnahmekriterien:**
  1. Nach dem Archivieren steht kein offener Gehaltszettel-Eintrag in Prüfen.
  2. Das Original bleibt herunterladbar (Dateiname als Link).
  3. Bei leerem Archiv steht „Noch keine Mitteilungen gespeichert.“
  4. Das Archiv lässt sich nicht laden: „Mitteilungsarchiv konnte nicht geladen werden.“ statt leerer Liste.
- **Status:** live — **Verweis:** #1077 (Archiv #1089)

### I-05a – PDF als „Kein Gehaltszettel“ ausschließen
- **Story:** Als Nutzer möchte ich ein PDF im Gehaltszettel-Ordner, das gar kein Gehaltszettel ist, ausschließen können, damit die Aufgabe nicht ewig offen bleibt und das Dokument nie wieder vorgeschlagen wird.
- **Ausgangslage:** Eine Aufgabe in Prüfen nennt „Dokumenttyp nicht erkannt“.
- **Ablauf:**
  1. Nutzer öffnet die Aufgabe und trägt optional eine Notiz ein.
  2. Nutzer klickt „Kein Gehaltszettel“. Die Aufgabe ist erledigt („Kein Gehaltszettel: <Notiz>“); die Datei bleibt erhalten.
  3. Unter Einstellungen › Datenquellen › Gehaltszettel steht das Dokument in „Kein Gehaltszettel (ausgeschlossen)“ mit „Wieder einbeziehen“.
  4. „Wieder einbeziehen“ öffnet die Aufgabe wieder.
- **Ergebnis:** Kein Vorschlag, keine Buchung; der Ausschluss gilt über den Inhalts-Hash, auch für eine umbenannte Kopie.
- **Abnahmekriterien:**
  1. Der Knopf erscheint nur bei nicht erkanntem, offenem Dokument.
  2. Ein späterer Scan oder Upload derselben Datei legt keine neue Aufgabe an.
  3. „Rückgängig“ und „Wieder einbeziehen“ stellen die offene Aufgabe her.
- **Status:** in Arbeit (Entwurfs-PR) — **Verweis:** #1203 (Teil C)

### I-05b – Warum stimmt der Kontoabgleich nicht mehr?
- **Story:** Als Nutzer möchte ich bei „Kontoprüfung stimmt nicht mehr“ sehen, welche Buchungen nach dem Abgleich im geprüften Zeitraum angelegt, geändert oder gelöscht wurden, damit ich die Differenz auf den Cent erklären kann.
- **Ausgangslage:** Ein Konto wurde geprüft; danach änderte sich der gebuchte Saldo des Prüftags.
- **Ablauf:**
  1. Nutzer klickt in der Aufgabe auf „Was hat sich geändert?“.
  2. Die App zeigt „Bei Erstellung“ (Kontoauszug), „Aktuell gebucht“ und die Differenz.
  3. Darunter stehen die Änderungen mit Datum, Empfänger, Art (angelegt, geändert, gelöscht, wiederhergestellt), Betrag und Wirkung auf den Saldo.
  4. Zum Neu-Abgleichen öffnet „Kontostand prüfen“ den normalen Ablauf.
- **Ergebnis:** Die Differenz ist erklärt; es wird nichts automatisch gebucht oder angepasst.
- **Abnahmekriterien:**
  1. Die Summe der Wirkungen entspricht der Differenz; bleibt ein Rest, nennt die App ihn als „nicht durch Buchungsänderungen erklärt“.
  2. Buchungen nach dem Prüftag oder auf anderen Konten erscheinen nicht.
  3. Die Aufgabe verschwindet von selbst, sobald der Saldo wieder stimmt.
- **Status:** in Arbeit (Entwurfs-PR) — **Verweis:** #1203 (Teil B)

### I-05c – Kursquellen-Warnung nachvollziehen und bewusst abschalten
- **Story:** Als Nutzer möchte ich bei „Kurse nicht abrufbar“ sehen, was die Quelle liefert, sie jetzt testen und notfalls mit Grund auf „nur manuelle Kurse“ stellen, damit die Warnung nicht ohne Ursache offen bleibt oder wegen eines manuellen Kurses nur scheinbar erledigt ist.
- **Ausgangslage:** Eine Warnung nennt eine Fehlerklasse (`currency_mismatch`, `empty`, `http`).
- **Ablauf:**
  1. Nutzer öffnet „Warnung erklären“. Die Ansicht zeigt Symbol, Börse, erwartete und gelieferte Kurswährung, letzten gespeicherten Kurs und den letzten (erfolgreichen) automatischen Lauf.
  2. „Quelle erneut testen (Vorschau)“ ruft die Quellen jetzt ab und zeigt Ergebnis und Testzeit; es wird nichts gespeichert.
  3. Die Quelle lässt sich über „Instrument öffnen“ ändern (Symbol, Börse, Ariva-Link).
  4. Ist sie nicht reparierbar, trägt der Nutzer einen Grund ein und klickt „Nur manuelle Kurse“. Ohne aktuellen Bestand gibt es zusätzlich „Abruf abschalten (historischer Bestand)“.
  5. Der automatische Abruf ist aus, die Warnung ist mit dem Grund erledigt, „Rückgängig“ stellt beides wieder her.
  6. Liefert die Quelle in einer anderen Währung, bietet die Vorschau „Mit EZB-Kurs umrechnen (USD → EUR)“ an. Ab dem nächsten Abruf wird jeder Kurs mit dem EZB-Kurs seines Tages umgerechnet (fehlt der Tag, gilt der letzte frühere, höchstens 5 Tage zurück; sonst wird der Tag ausgelassen und gemeldet; ausgelassene Tage werden beim nächsten Abruf bis 10 Tage zurück erneut versucht). Eine Zahl ohne Währungsangabe der Quelle wird bei gewählter Umrechnung nicht als Instrumentenwährung gespeichert. Originalkurs, Währung und Wechselkurs bleiben beim Kurs gespeichert; „Umrechnung aufheben“ und „Rückgängig“ stellen den alten Zustand her.
  7. Die Ursachenansicht zeigt Zeit und Ergebnis des letzten Abrufversuchs (HTTP-Status oder „keine Zeilen“), den letzten Erfolg und die letzten Versuche (je Instrument die jüngsten 30 bleiben erhalten).
  8. Kurswarnungen von Instrumenten ohne aktuellen Bestand stehen in der Aufgabenliste in einer eigenen Gruppe „Historische Bestände“.
- **Ergebnis:** Ohne Entscheidung des Nutzers wird kein Fremdwährungskurs gespeichert; mit Entscheidung nur umgerechnet in die Instrumentwährung, nie unumgerechnet als EUR. Bewertungen lesen weiter den umgerechneten Kurs.
- **Abnahmekriterien:**
  1. Ein manueller Kurs schließt die Quellwarnung nicht.
  2. Ohne Grund sind die Knöpfe gesperrt.
  3. Der erste erfolgreiche automatische Abruf schließt Abruf-Warnungen weiter von selbst (#1101).
  4. „Abruf abschalten“ wird bei vorhandenem Bestand vom Server abgelehnt.
- **Status:** in Arbeit (Entwurfs-PR, enthält Migration 0055, vor Veröffentlichung Sicherung und Durchsicht); offen: End-to-End-Test je Teil. — **Verweis:** #1203 (Teil A), #1081, #1101

### I-06 – Gehaltszettel automatisch lesen und bestätigen
- **Story:** Als Nutzer möchte ich Gehaltszettel automatisch auslesen lassen und die Vorschläge nur noch bestätigen, damit ich Brutto, Abzüge und Auszahlung nicht abtippen muss.
- **Ausgangslage:** Ein neuer Gehaltszettel liegt als PDF vor (Upload oder nächtlicher Dropbox-Abruf, wenn eingerichtet).
- **Ablauf:**
  1. Nutzer lädt das PDF hoch (I-04) oder die App findet es nachts und legt unter Prüfen › Aufgaben einen Vorschlag an.
  2. Ist das PDF geschützt, gibt er unter „PDF-Passwort eingeben (optional)“ das Passwort ein; „merken“ speichert es verschlüsselt.
  3. Die App wertet aus und zeigt die Vorschau mit Bezüge, Abzüge, Steuerfreie Erstattungen, Kontrolle (Brutto, Abzüge, Auszahlung, Summendifferenz).
  4. Nutzer wählt „Gehaltsbuchung (±5 Tage)“ oder „Neue Auszahlung vormerken“ und prüft „Auszahlungsdatum“.
  5. Nutzer klickt „Bestätigen“. Die App legt die Zeilen an und erfasst die Auszahlung oder verknüpft sie mit der vorhandenen (rückgängig machbar).
  6. Unbekannte Lohnarten ordnet er zu und wertet mit „Zuordnen und neu auswerten“ erneut aus.
- **Ergebnis:** Gehaltszettel gespeichert, Zeilen und Auszahlung im Budget, Original in der App (und, wenn aktiv, in Dropbox abgelegt).
- **Abnahmekriterien:**
  1. Ein neues PDF wird zum Vorschlag; „Bestätigen“ legt die Zeilen an, vorher entsteht nichts.
  2. Dasselbe PDF zweimal ergibt keinen zweiten Gehaltszettel („schon vorhanden“).
  3. Ist Gehaltskonto oder Arbeitgeber nicht eingerichtet, bleibt die Auszahlung unter Prüfen („bitte einmal einrichten“).
  4. Passt die Summendifferenz nicht, ist sie in der Kontrolle sichtbar und der Nutzer kann Zeilen korrigieren.
  5. Ein falsches Passwort wird gemeldet und nicht gemerkt.
- **Status:** teilweise — **Verweis:** Y22
  Fehlt noch: Gehaltserhöhungen und Stundenlohn (laut FEATURES offen); Abnahme des vollen Ablaufs inkl. nächtlichem Abruf durch den Nutzer.

### I-07 – Prüfdialog für Gehaltszettel lesbar nutzen
- **Story:** Als Nutzer möchte ich den Prüfdialog für Gehaltszettel ohne leere Hälfte und ohne abgeschnittene Felder bedienen, damit ich Beträge und Zuordnung sicher kontrolliere und nicht falsch bestätige.
- **Ausgangslage:** Der Nutzer prüft einen Gehaltszettel am Desktop (ab ca. 1024 px) oder am Handy.
- **Ablauf:** (geplant, nach Issue #1068)
  1. Nutzer öffnet in Prüfen › Aufgaben einen Gehaltszettel-Vorschlag.
  2. Der Dialog zeigt Zusammenfassung oder Vorschau neben dem Formular und die Zeilen als ausgerichtete Liste (Beträge rechts, echtes Minus).
  3. Ein Block fasst erwartete Auszahlung, Auszahlung laut Zettel, Differenz und die Wirkung von „Bestätigen“ zusammen.
  4. Eine feste Leiste unten bietet „Bestätigen“ (primär, rechts) sowie „Ablehnen“, „Erneut auswerten“, „Original-PDF herunterladen“.
- **Ergebnis:** Dieselbe Prüfung wie heute, nur lesbar; Parsing, Buchung und Automatik bleiben unverändert.
- **Abnahmekriterien:**
  1. Keine leere linke Hälfte, auch beim Scrollen.
  2. Knopfbeschriftungen brechen nicht mitten im Wort um.
  3. Auswahlfelder zeigen ihren vollen Wert, soweit Platz ist.
  4. Am Handy (390 px) ist die untere Leiste erreichbar, Tippflächen mind. 44 px, hell und dunkel.
- **Status:** offen — **Verweis:** #1068
  Fehlt noch: Umbau des Dialogs (zweispaltiges Layout, feste Aktionsleiste, Zeilenliste, Zusammenfassungsblock).

### I-08 – Kartenabrechnung ohne Nummer und Zeitraum abschließen
- **Story:** Als Nutzer möchte ich eine Kartenabrechnung als geprüft schließen können, auch wenn Abrechnungsnummer und Zeitraum nicht gedruckt sind, damit ich nichts erfinden muss und die Abrechnung nicht ewig offen bleibt.
- **Ausgangslage:** Die Abrechnung der ausgegebenen Karte enthält Summe, Ausstellungsdatum und Einzugsdatum, aber weder Abrechnungsnummer noch Zeitraum. „Als geprüft speichern“ verlangt heute eines von beiden.
- **Ablauf:** (Verhalten laut Issue #1079; Bildschirm: Abrechnungsprüfung am Konto, „Abrechnung prüfen“)
  1. Nutzer wählt die Abrechnung einzeln oder zusammen mit anderen Dokumenten über „Neues Dokument hochladen“. Im eigenen Dateieintrag prüft oder ändert er den Konto-Vorschlag und bestätigt mit „Weiter“ (I-04, #1103).
  2. In der Prüfung stehen die Felder „Abrechnungsnummer“, „Ausstellungsdatum“, „Zeitraum von“, „Zeitraum bis“, „Einzugsdatum“, „Kartenhinweis (maskiert)“.
  3. Fehlen Nummer und Zeitraum im Original, setzt der Nutzer für beide „im Original nicht angegeben“. Eine Kartenreferenz wird separat eingetragen; die Dokument-ID erscheint als SHA-256.
  4. Er klickt „Als geprüft speichern“.
  5. Die App speichert den Dokumentstand; es wird keine Zahlung und keine Buchung erzeugt.
- **Ergebnis:** Abrechnung hat Status „Geprüft“, ohne erfundene Nummer oder geratenen Zeitraum.
- **Abnahmekriterien:**
  1. Speichern gelingt ohne Nummer und ohne Zeitraum, wenn beides als „im Original nicht angegeben“ vermerkt ist.
  2. Dokument-ID (Hash), Kartenreferenz und echte Abrechnungsnummer sind getrennte Felder; die gleichbleibende Kartenreferenz zählt nicht als Nummer.
  3. Ein Zeitraum wird nie geraten oder vorbelegt.
  4. Ohne Vermerk und ohne Angabe bleibt Speichern gesperrt und die App sagt, was fehlt.
  5. Im Mehrfach-Upload zeigt jede Abrechnung ihren eigenen änderbaren Konto-Vorschlag und Prüfstatus; ein Dateifehler blockiert keine andere Abrechnung (#1103).
- **Status:** implementiert, Abnahme ausständig — **Verweis:** #1079
  Beide Vermerke und die Kartenreferenz werden am Dokument gespeichert. Die bestehende Buchungsverknüpfung und der Abrechnungsausgleich bleiben verfügbar. Die Dokumentprüfung erzeugt keine Buchungen; eine Kartenreferenz allein erlaubt keinen Abschluss. Mehrfach-Upload und änderbarer Konto-Vorschlag im Dateieintrag sind implementiert (#1103); Live-Abnahme offen.

### I-09 – Kartenabrechnung mit versetzten Spalten lesen
- **Story:** Als Nutzer möchte ich, dass die Positionen einer Kartenabrechnung auch bei versetzten Spalten erkannt werden, damit ich sie nicht von Hand aus dem PDF übertragen muss.
- **Ausgangslage:** Die Abrechnung der ausgegebenen Karte wird als Kartenabrechnung erkannt, die Tabellenzeilen stimmen aber nicht mit der Kopfzeile überein. Ergebnis heute: 0 Zeilen, „closing_total_unverified“.
- **Ablauf:**
  1. Nutzer lädt die Abrechnung einzeln oder im Mehrfach-Upload hoch (I-04, #1103) und prüft oder ändert den Konto-Vorschlag in ihrem Dateieintrag. Fehler einer anderen Datei blockieren diese Prüfung nicht.
  2. Die App liest die Positionen nach Reihenfolge und Form der Angaben, nicht nach festen Spaltenabständen (geplant).
  3. In der Prüfung stehen die erkannten Positionen mit Summe; der Schlusssaldo wird gegen die Summe geprüft.
  4. Unlesbare Zeilen bleiben ohne Raten offen, mit dem Hinweis „Nicht alle Angaben wurden erkannt. Bitte anhand des Originals prüfen.“
- **Ergebnis:** Positionen sind als Vorschlag sichtbar; gebucht wird nichts ohne Bestätigung.
- **Abnahmekriterien:**
  1. Eine Abrechnung mit versetzten Spalten ergibt die erwarteten Zeilen und die erwartete Summe, nicht null Zeilen.
  2. Unbekannte Zeilenformen werden nie als geratene Buchung angelegt.
  3. Weicht der Schlusssaldo von der Positionssumme ab, bleibt das als „nicht verifiziert“ sichtbar.
  4. Fortsetzungszeilen und Seitenumbruch mit wiederholter Kopfzeile verfälschen die Summe nicht.
  5. Im Mehrfach-Upload bleibt die Kontoauswahl jeder Abrechnung vor „Weiter“ änderbar; „Erneut versuchen“ wiederholt nur die fehlgeschlagene Datei (#1103).
- **Status:** offen — **Verweis:** #1056
  Mehrfach-Upload und änderbarer Konto-Vorschlag im Dateieintrag implementiert (#1103); Review und Live-Abnahme offen. Die Parser-Kriterien bleiben bei #1056.
  Fehlt noch: Positionen nach Token-Reihenfolge lesen statt nach Kopfzeilen-Abständen.

### I-10 – Mehrdeutige Treffer bei Import-Zuordnungen nachvollziehen
- **Story:** Als Nutzer möchte ich sehen, warum ein Bankumsatz mehrere mögliche Gegenstücke hat, damit ich bewusst entscheide und nichts falsch zusammengeführt wird.
- **Ausgangslage:** Zu einem Bankumsatz passen mehrere vorhandene Buchungen oder Umbuchungen (gleicher Betrag, ähnliches Datum).
- **Ablauf:**
  1. Nutzer öffnet in Prüfen › Umsätze bei einem Umsatz „Prüfen“ und damit „Buchung übernehmen“.
  2. Der Dialog nennt „Passende Buchung (geringster Datumsabstand zuerst)“ bzw. „Passende Gegenbuchung“ mit Datum, Konto und Notiz.
  3. Nutzer wählt eine Buchung. Der Dialog erklärt, was übernommen wird (Kategorie, Anteile, Notiz bleiben; Bankreferenz kommt dazu).
  4. Nutzer klickt „Mit Buchung zusammenführen“ bzw. „Als Umbuchung verbinden“.
  5. Die App bestätigt „Bankumsatz mit Buchung zusammengeführt.“ oder „Als Umbuchung verbunden.“
- **Ergebnis:** Der Umsatz ist mit genau einer Buchung verbunden; es entsteht keine Doppelbuchung.
- **Abnahmekriterien:**
  1. Bei mehreren Treffern verbindet die App nie von selbst; Sammelaktionen überspringen solche Zeilen.
  2. Treffer liegen höchstens fünf Kalendertage auseinander und zeigen den Datumsabstand.
  3. „Rückgängig“ löst die Verbindung wieder.
  4. Ohne Treffer fehlt die Auswahl und der Nutzer kann normal kategorisieren.
- **Status:** offen — **Verweis:** #516
  Fehlt noch: Erklärung, warum und woher ein Treffer kommt (Herkunft und Versionen der Quelle) und fehlende Gründe bei Mehrdeutigkeit; die Auswahl selbst gibt es schon.

### Payment-provider funding (#1290)

As a household member reviewing bank activity, I can choose a suggested opposite booking and explicitly link the two funding legs as an internal transfer. When several eligible counterparts match, the most recently confirmed one is proposed. I can change the selection before confirming or undo both legs together afterwards.

The categorised purchase and its refunds are separate bookings. Their signed category amounts determine spending in reports, Heute and the forecast. Linked funding and return transfers between budget accounts contribute zero spending.
