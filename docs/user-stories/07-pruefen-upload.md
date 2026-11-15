# User-Stories – Prüfen/Posteingang und Dokument-Upload

Bereich 07. Gesamtkatalog, Status- und Verweis-Legende: `docs/USER-STORIES.md`. Stand: 15.11.2026.
Bildschirm Prüfen: `/konten/pruefen` (Konten › Prüfen). Zähler: „Umsätze“ und „Aufgaben“ oben, daneben „n offen“.

### I-01 – Bankumsatz bestätigen oder nicht übernehmen
- **Story:** Als Nutzer möchte ich jeden neuen Bankumsatz einzeln bestätigen oder nicht übernehmen, damit nur Umsätze im Budget landen, die ich selbst gesehen habe.
- **Ausgangslage:** Der Bankabruf hat neue Umsätze gebracht. Sie zählen noch nicht zum Kontostand, wenn die Verbindung „Erst nach Bestätigung zählen“ nutzt. Der Zähler „Umsätze“ ist größer als 0.
- **Ablauf:**
  1. Nutzer öffnet Konten › Prüfen und wählt den Teil „Umsätze“.
  2. Die App zeigt je Umsatz Empfänger, Konto · Quelle, Vorschlag (oder „Unbekannt“) und Aktion.
  3. Nutzer klickt bei einem sicheren Vorschlag „Bestätigen“, sonst „Prüfen“. Der Dialog „Buchung übernehmen“ zeigt Empfänger, Kategorie und mögliche Treffer.
  4. Nutzer wählt Kategorie und Empfänger und klickt „Als Buchung bestätigen“ („Übernehmen“ bei einem gelernten Vorschlag).
  5. Die App legt die Buchung an, löst den Eintrag auf und senkt den Zähler um 1. Ein Hinweis bietet „Rückgängig“ an.
  6. Alternativ klickt der Nutzer „Nicht übernehmen“. Dann entsteht keine Buchung.
- **Ergebnis:** Bestätigt: Buchung mit Status „Bestätigt“ in Konten › Alle Buchungen, Saldo aktualisiert. Nicht übernommen: Eintrag erledigt, keine Buchung, der Bankumsatz bleibt in der Quelle nachvollziehbar.
- **Abnahmekriterien:**
  1. Der Zähler sinkt um genau 1 je erledigtem Eintrag.
  2. Ein Vorschlag wird nur nach Klick übernommen, nie von selbst.
  3. „Rückgängig“ stellt den offenen Eintrag wieder her; der Zähler steigt wieder.
  4. Ohne offene Einträge steht „Alles geprüft“ mit dem Hinweis, dass neue Buchungen aus dem Bank-Sync hier erscheinen.
  5. Am Handy sind „Bestätigen“ und „Nicht übernehmen“ mit dem Finger treffbar (mind. 44 px) und brechen nicht um.
- **Status:** live — **Verweis:** Y16

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
  2. Bei einer Importwarnung klickt er „Warnung erklären“. Die App zeigt die Einzelpunkte unter „Einzelpunkte anzeigen“.
  3. Er behebt die Ursache an der Quelle (Link „Quelle“) oder entscheidet, dass nichts zu tun ist.
  4. Er klickt „Als erledigt markieren“. Die App löst den Eintrag auf und senkt den Zähler.
  5. Warnungen zu einem fehlgeschlagenen Kurs- oder Wechselkursabruf („Kurse nicht abrufbar“, „Wechselkurs nicht abrufbar“) muss er nicht schließen: Der nächste erfolgreiche Abruf für dasselbe Instrument oder dieselbe Währung schließt sie. Unter „Automatisch geschlossene Warnungen“ steht je Eintrag der Verlauf (geöffnet am, Fehlerklasse, geschlossen am, Begründung mit Quelle und Stand), für die letzten 30 Tage, höchstens die 20 neuesten.
- **Ergebnis:** Eintrag ist erledigt, nichts wurde gelöscht. Die Warnung selbst repariert die Quelle nicht.
- **Abnahmekriterien:**
  1. Der Zähler „Aufgaben“ sinkt je erledigtem Eintrag.
  2. „Als erledigt markieren“ ändert keine Buchung und keinen Saldo.
  3. Filter „Zeitraum der Aufgaben“ (Alle, Aktueller Monat, Historische Nacharbeit) schränkt die Liste ein; ein Chip zeigt den aktiven Zeitraum.
  4. Lädt die Liste nicht, zeigt die App eine Fehlermeldung mit „Erneut versuchen“ statt einer leeren Liste.
  5. Eine Abrufwarnung schließt sich nach dem nächsten erfolgreichen Abruf selbst; die Begründung („Automatisch geschlossen: Kursabruf über … erfolgreich (Stand …).“) steht im Eintrag und im Verlauf. Das Schließen ist im Änderungsprotokoll erfasst (Rückgängig auf Protokollebene, noch ohne Schaltfläche) und ändert keine Finanzzahl.
  6. Warnungen zu echten Abweichungen (Bestand, fehlende Bewegung, abweichender Schlusskurs) schließen sich nie von selbst.
- **Status:** live — **Verweis:** Y16, #1101
  Selbstschließende Abrufwarnungen mit Verlauf (#1101) sind umgesetzt, private Abnahme offen.

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
- **Ausgangslage:** Der Dialog „Buchung übernehmen“ bietet nur Empfänger, Kategorie, Regelvorschlag und Verknüpfung. Der Nutzer braucht aber eine Notiz, ein Projekt, eine Aufteilung oder einen Beleg.
- **Ablauf:** (Dialog nach Issue #1048; im Code ist der Bereich „Alle Felder“ im Dialog bereits eingebaut)
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
- **Status:** offen — **Verweis:** #1048
  Fehlt noch: Issue offen; zu klären ist, ob die erweiterte Bestätigung auf dem Server (Notiz, Projekt, cent-genaue Aufteilung, Beleg in einem Schritt) und die Abnahme durch den Nutzer fertig sind.

### I-04 – Dokument zentral hochladen
- **Story:** Als Nutzer möchte ich jedes Dokument an einer Stelle hochladen und von der App erkennen lassen, was es ist, damit ich nicht erst überlegen muss, welcher Import für Kontoauszug, Gehaltszettel oder Beleg zuständig ist.
- **Ausgangslage:** Der Nutzer hat ein PDF oder Foto (Kreditkartenabrechnung, Kontoauszug, Gehaltszettel, Bonus-/Pensionsmitteilung, Beleg). Der Knopf „Neues Dokument hochladen“ steht in der Kopfzeile, „Dokument hochladen“ in Prüfen und Buchung erfassen, am Konto der Upload dieses Kontos.
- **Ablauf:**
  1. Nutzer klickt „Neues Dokument hochladen“. Der Dialog zeigt „Dokument ablegen“ und „Datei auswählen“ (Foto oder PDF, höchstens 15 MB).
  2. Er legt genau eine Datei ab oder wählt sie. Die App meldet „Dokument wird geprüft …“ und dann „Erkannt: <Typ>“, bei Unsicherheit „(nicht ganz sicher)“.
  3. Bei einem geschützten PDF gibt er unter „PDF-Passwort“ das Passwort ein und klickt „Mit Passwort prüfen“.
  4. Er prüft oder ändert den „Dokumenttyp“ und wählt bei Abrechnungen das „Konto“.
  5. Ein Hinweistext sagt, was „Weiter“ tut. Gespeichert wird erst nach „Weiter“. Danach öffnet sich der passende Ablauf (Abrechnungsprüfung, Gehaltszettel-Vorschau, Beleg).
  6. Der Abschluss zeigt, was passiert ist („nichts gebucht“, „n Zeilen warten unter Prüfen“), mit „Fertig“ oder „Weiteres Dokument“.
- **Ergebnis:** Das Dokument ist gespeichert und im passenden Ablauf; gebucht wird nur, was eindeutig belegt ist, alles andere wartet unter Prüfen.
- **Abnahmekriterien:**
  1. Der erkannte Typ wird genannt und lässt sich über „Dokumenttyp“ ändern.
  2. Zwei Dateien auf einmal ergeben „Bitte genau eine Datei ablegen.“
  3. Eine Datei über 15 MB oder ein falsches Passwort ergibt eine Meldung („Bitte eine Datei bis 15 MB auswählen.“, „Passwort falsch. Bitte erneut eingeben.“) und es wird nichts gespeichert.
  4. Dasselbe Dokument ein zweites Mal ergibt „Diese Datei war schon vorhanden. Es wurde nichts wiederholt.“
  5. Ein nicht lesbares Dokument lässt sich als Beleg ablegen; „Andere Datei“ setzt zurück.
- **Status:** live — **Verweis:** #1039, #1053 (zentral #1060)

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
  1. Nutzer lädt die Abrechnung über „Neues Dokument hochladen“ als „Kreditkartenabrechnung“ hoch und wählt das „Konto“.
  2. In der Prüfung stehen die Felder „Abrechnungsnummer“, „Ausstellungsdatum“, „Zeitraum von“, „Zeitraum bis“, „Einzugsdatum“, „Kartenhinweis (maskiert)“.
  3. Fehlt eine Angabe im Original, vermerkt der Nutzer „im Original nicht angegeben“ (geplant, heute nicht vorhanden).
  4. Er klickt „Als geprüft speichern“.
  5. Die App speichert den Dokumentstand; es wird keine Zahlung und keine Buchung erzeugt.
- **Ergebnis:** Abrechnung hat Status „Geprüft“, ohne erfundene Nummer oder geratenen Zeitraum.
- **Abnahmekriterien:**
  1. Speichern gelingt ohne Nummer und ohne Zeitraum, wenn beides als „im Original nicht angegeben“ vermerkt ist.
  2. Dokument-ID (Hash), Kartenreferenz und echte Abrechnungsnummer sind getrennte Felder; die gleichbleibende Kartenreferenz zählt nicht als Nummer.
  3. Ein Zeitraum wird nie geraten oder vorbelegt.
  4. Ohne Vermerk und ohne Angabe bleibt Speichern gesperrt und die App sagt, was fehlt.
- **Status:** offen — **Verweis:** #1079
  Fehlt noch: Vermerk „im Original nicht angegeben“, getrennte Felder für Dokument-ID, Kartenreferenz und Abrechnungsnummer, Verknüpfung mit enthaltenen Buchungen und späterer Zahlung.

### I-09 – Kartenabrechnung mit versetzten Spalten lesen
- **Story:** Als Nutzer möchte ich, dass die Positionen einer Kartenabrechnung auch bei versetzten Spalten erkannt werden, damit ich sie nicht von Hand aus dem PDF übertragen muss.
- **Ausgangslage:** Die Abrechnung der ausgegebenen Karte wird als Kartenabrechnung erkannt, die Tabellenzeilen stimmen aber nicht mit der Kopfzeile überein. Ergebnis heute: 0 Zeilen, „closing_total_unverified“.
- **Ablauf:**
  1. Nutzer lädt die Abrechnung hoch (I-04) und wählt das „Konto“.
  2. Die App liest die Positionen nach Reihenfolge und Form der Angaben, nicht nach festen Spaltenabständen (geplant).
  3. In der Prüfung stehen die erkannten Positionen mit Summe; der Schlusssaldo wird gegen die Summe geprüft.
  4. Unlesbare Zeilen bleiben ohne Raten offen, mit dem Hinweis „Nicht alle Angaben wurden erkannt. Bitte anhand des Originals prüfen.“
- **Ergebnis:** Positionen sind als Vorschlag sichtbar; gebucht wird nichts ohne Bestätigung.
- **Abnahmekriterien:**
  1. Eine Abrechnung mit versetzten Spalten ergibt die erwarteten Zeilen und die erwartete Summe, nicht null Zeilen.
  2. Unbekannte Zeilenformen werden nie als geratene Buchung angelegt.
  3. Weicht der Schlusssaldo von der Positionssumme ab, bleibt das als „nicht verifiziert“ sichtbar.
  4. Fortsetzungszeilen und Seitenumbruch mit wiederholter Kopfzeile verfälschen die Summe nicht.
- **Status:** offen — **Verweis:** #1056
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
