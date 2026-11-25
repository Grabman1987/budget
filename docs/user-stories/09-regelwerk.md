# User-Stories – Regelwerk und Finanz-Check

Bereich 09. Gesamtkatalog, Status- und Verweis-Legende: `docs/USER-STORIES.md`. Stand: 15.11.2026.
Bildschirm: Einstellungen › Regelwerk (`/einstellungen/regelwerk`). Je Regel eine Zeile mit Code, Name, Erklärung, „Ist“-Wert mit Stand, „Schwelle“, Handlungstext und Link, dazu „Einstellen“ und ein Schalter. Die Gruppen heißen Verletzt, Noch offen, Eingehalten. Der Finanz-Check (Heute und Report Finanz-Check) zeigt dieselben Regeln. Quelle der Schwellen: `packages/domain/src/rules`.
Regelstatus: eingehalten, Warnung, verletzt. Fehlen Daten, steht „Nicht prüfbar: <Grund>“ statt eines erfundenen Ergebnisses. Die Regeln R01–R16 sind standardmäßig an, R17–R22 (Buchregeln) standardmäßig aus.
Gemeinsamer Weg je Regel: Einstellungen › Regelwerk öffnen, die Zeile der Regel lesen, bei Bedarf „Einstellen“ (Seite „Schwellen bearbeiten · <Code> <Name>“) und den Handlungslink der Zeile benutzen.

### F-01 – Regeln mit Status und Schwellen sehen und einstellen
- **Story:** Als Nutzer möchte ich alle Regeln mit Status, Ist-Wert und Schwelle auf einen Blick sehen und die Schwellen anpassen, damit ich weiß, wo mein Geld nicht zu meinen eigenen Grundsätzen passt, und die Grenzen auf mein Leben abstimmen kann.
- **Ausgangslage:** Der Nutzer will wissen, welche Regeln verletzt sind, oder eine Grenze ändern (z. B. Fixkostenquote).
- **Ablauf:**
  1. Nutzer öffnet Einstellungen › Regelwerk. Die App listet die Regeln nach den Gruppen Verletzt, Noch offen, Eingehalten.
  2. Er liest je Regel „Ist: …“, „Stand <Datum>“ und, wenn Handlungsbedarf besteht, „Schwelle: …“ und den Handlungstext.
  3. Er klickt „Einstellen“ und ändert die Schwelle (z. B. Prozent oder Monate) auf der Seite „Schwellen bearbeiten“.
  4. Er speichert; die App meldet „<Code> <Name>: Schwelle gespeichert.“
  5. Mit dem Schalter „<Code> <Name>“ schaltet er eine Regel an oder aus; die App meldet „<Code> <Name>: an/aus“.
- **Ergebnis:** Neue Schwellen und Schalter gelten sofort in Regelwerk, Heute und Finanz-Check. Jede Änderung ist protokolliert und rückgängig machbar.
- **Abnahmekriterien:**
  1. Je Regel gibt es einen Status (eingehalten, Warnung, verletzt oder nicht prüfbar mit Grund).
  2. Eine geänderte Schwelle ändert den Status nach dem Speichern.
  3. Ein ungültiger Wert (negativ, außerhalb des Bereichs) wird abgelehnt, die gespeicherte Schwelle bleibt.
  4. Ungespeicherte Änderungen beim Schließen: Nachfrage „Ungespeicherte Änderungen verwerfen?“
  5. Eine ausgeschaltete Regel zeigt keinen Ist-Wert und zählt nicht im Finanz-Check.
- **Status:** teilweise — **Verweis:** Y23
  Fehlt noch: Der Katalog führt die Story als teilweise. Zu klären: Welche Schwellen noch nicht einstellbar sind; die Bänder von R13 pflegt der Nutzer unter Einstellungen › Anlageklassen, nicht hier.

### F-01-R01 – R01 50/30/20: Einkommen auf Bedarf, Wunsch und Zukunft verteilen
- **Story:** Als Nutzer möchte ich prüfen, ob meine Ausgaben im Verhältnis 50/30/20 stehen, damit ich genug für die Zukunft zurücklege und nicht mehr für Wünsche ausgebe, als ich möchte.
- **Ausgangslage:** Der Nutzer hat in den letzten zwölf Monaten Einkommen gebucht.
- **Ablauf:**
  1. Nutzer öffnet Einstellungen › Regelwerk und sucht die Zeile „R01 50/30/20“.
  2. Die App zeigt „Ist“ als Anteile Bedarf / Wunsch / Zukunft der letzten zwölf Monate, z. B. „52 / 28 / 20 %“, dazu „aus Guthaben“ oder „übrig“.
  3. Ist eine Grenze verletzt, steht die Schwelle (Bedarf ≤ 50 %, Wunsch ≤ 30 %, Zukunft ≥ 20 %) und der Handlungstext mit dem Euro-Betrag pro Monat.
  4. Der Nutzer klickt „Im Plan verteilen“ und kürzt Wunsch-Kategorien oder stockt Zukunft auf.
- **Ergebnis:** Nach neuer Verteilung im Plan ändert sich der Ist-Wert; die Regel wird neu bewertet.
- **Abnahmekriterien:**
  1. Warnung bis 10 Prozentpunkte über der Grenze, darüber verletzt.
  2. Der Handlungstext nennt die am stärksten verletzte der drei Grenzen (Bedarf prüfen, Wunsch kürzen oder Zukunft aufstocken).
  3. Ohne Einkommen in den zwölf Monaten steht „Nicht prüfbar“.
  4. Kapitalerträge und Erstattungen zählen nicht als Einkommen.
- **Status:** live — **Verweis:** Y23

### F-01-R02 – R02 Notgroschen: Rücklage für mehrere Monate
- **Story:** Als Nutzer möchte ich sehen, für wie viele Monate meine Rücklage reicht, damit ein Jobverlust oder eine Reparatur mich nicht in Schulden stürzt.
- **Ausgangslage:** Es gibt Rücklage-Kategorien und mindestens einen vollen Monat Bedarfs-Ausgaben.
- **Ablauf:**
  1. Nutzer öffnet Einstellungen › Regelwerk › „R02 Notgroschen“.
  2. Die App zeigt „Ist: x,y Monate“ (Rücklagen geteilt durch den durchschnittlichen Monats-Bedarf der letzten zwölf vollen Monate).
  3. Unter 3 Monaten ist die Regel verletzt, zwischen 3 und 6 Monaten Warnung, ab 6 Monaten eingehalten.
  4. Der Handlungstext nennt den Fehlbetrag („Notgroschen um … aufstocken, bis 3 Monate Bedarf gedeckt sind“).
  5. Der Nutzer klickt „Im Plan aufstocken“ und weist der Rücklage Geld zu.
- **Ergebnis:** Die Monatsanzahl steigt mit der Rücklage; der Fehlbetrag sinkt.
- **Abnahmekriterien:**
  1. Schwellen sind einstellbar (Minimum 3, Ziel 6 Monate).
  2. Der Fehlbetrag entspricht Monate mal Durchschnitts-Bedarf minus Rücklage.
  3. Ohne Bedarfs-Historie steht „Nicht prüfbar“.
  4. Ein negativer Rücklagensaldo senkt die Monatsanzahl nicht unter 0 und erhöht den Fehlbetrag nicht über das Ziel.
- **Status:** live — **Verweis:** Y23

### F-01-R03 – R03 Vom Vormonat leben: Geldalter
- **Story:** Als Nutzer möchte ich wissen, wie alt das Geld ist, das ich ausgebe, damit ich nicht von Gehalt zu Gehalt lebe.
- **Ausgangslage:** Es gibt Ausgaben und Einnahmen im Budget; das Geldalter wird nach „älteste Einnahme zuerst“ berechnet.
- **Ablauf:**
  1. Nutzer öffnet Einstellungen › Regelwerk › „R03 Vom Vormonat leben“.
  2. Die App zeigt „Ist: Geldalter n Tage“.
  3. Ab 30 Tagen ist die Regel eingehalten, ab 7 Tagen Warnung, darunter verletzt.
  4. Der Handlungstext verlangt einen Puffer im Budget-Konto.
  5. Der Nutzer klickt „Puffer im Plan aufbauen“ und lässt Überschüsse im Budget stehen.
- **Ergebnis:** Das Geldalter steigt, wenn Einnahmen länger liegen bleiben, als sie ausgegeben werden.
- **Abnahmekriterien:**
  1. Ziel und Grenze für verletzt sind einstellbar (Standard 30 und 7 Tage).
  2. „1 Tag“ wird im Singular geschrieben.
  3. Ohne Ausgaben steht „Nicht prüfbar“.
- **Status:** live — **Verweis:** Y23

### F-01-R04 – R04 Pay yourself first: Zukunft am Gehaltstag zuerst füllen
- **Story:** Als Nutzer möchte ich, dass die Zukunft-Kategorien direkt nach dem Gehalt gefüllt werden, damit Sparen nicht davon abhängt, was am Monatsende übrig ist.
- **Ausgangslage:** Gehalt ist gebucht, Zukunft-Kategorien haben einen Zielbetrag.
- **Ablauf:**
  1. Nutzer öffnet Einstellungen › Regelwerk › „R04 Pay yourself first“.
  2. Die App prüft die Gehälter der letzten drei Monate: Ist die Zukunft binnen 3 Tagen nach dem Gehalt gefüllt?
  3. „Ist“ zeigt „am Gehaltstag gefüllt“ oder „n von m Gehältern ohne gefüllte Zukunft“; der Handlungstext nennt den zuletzt fehlenden Betrag.
  4. Der Nutzer klickt „Zukunft im Plan füllen“ und weist am Gehaltstag zuerst Zukunft zu.
- **Ergebnis:** Spätere Gehälter gelten als eingehalten, sobald die Zukunft rechtzeitig gefüllt ist.
- **Abnahmekriterien:**
  1. Frist (Tage) und Monate sind einstellbar (Standard 3 Tage, 3 Monate).
  2. Ein Gehalt, dessen Frist noch läuft und das nicht gefüllt ist, wird noch nicht bewertet.
  3. Nichts gefüllt beim letzten Gehalt ist verletzt; teilweise gefüllt oder früher verpasst ist Warnung.
  4. Ohne Zielbetrag für Zukunft steht „Nicht prüfbar“.
- **Status:** live — **Verweis:** Y23

### F-01-R05 – R05 Sinking Funds: Rücklagen bei Fälligkeit gedeckt
- **Story:** Als Nutzer möchte ich sehen, ob für jährliche und seltene Ausgaben rechtzeitig genug zurückgelegt ist, damit eine fällige Rechnung kein Loch reißt.
- **Ausgangslage:** Es gibt Kategorien mit Ziel für periodische Ausgaben.
- **Ablauf:**
  1. Nutzer öffnet Einstellungen › Regelwerk › „R05 Sinking Funds“.
  2. „Ist“ zeigt „n von m gedeckt“.
  3. Der Handlungstext nennt, wie viel diesen Monat fehlt.
  4. Der Nutzer klickt „Rücklagen im Plan füllen“ und weist den fehlenden Betrag zu.
- **Ergebnis:** Die Zahl gedeckter Rücklagen steigt.
- **Abnahmekriterien:**
  1. Alle gedeckt ist eingehalten, sonst Warnung; ab 50 % ungedeckt (einstellbar) verletzt.
  2. Ohne periodische Kategorien steht „Nicht prüfbar“.
  3. Der Fehlbetrag stimmt mit der Summe der Fehlbeträge der Kategorien überein.
- **Status:** live — **Verweis:** Y23

### F-01-R06 – R06 Kreditkarte: Saldo immer gedeckt
- **Story:** Als Nutzer möchte ich, dass jeder Kartensaldo durch Geld in „Kartenzahlung“ gedeckt ist, damit die Abbuchung der Karte nie ungedecktes Geld braucht.
- **Ausgangslage:** Es gibt eine Kreditkarte mit Saldo und Kartenzahlungs-Kategorie.
- **Ablauf:**
  1. Nutzer öffnet Einstellungen › Regelwerk › „R06 Kreditkarte“.
  2. „Ist“ zeigt „Saldo gedeckt“ oder „n Karten nicht gedeckt“.
  3. Der Handlungstext nennt den Betrag, um den „Kartenzahlung“ aufzustocken ist.
  4. Der Nutzer klickt „Kartenzahlung im Plan decken“ und weist den Betrag zu.
- **Ergebnis:** Die Karte gilt als gedeckt; die Regel ist eingehalten.
- **Abnahmekriterien:**
  1. Es gibt keine Warnstufe: gedeckt oder verletzt.
  2. Ohne Kreditkarte steht „Nicht prüfbar“.
  3. Die Regel hat keine einstellbare Schwelle; „Einstellen“ zeigt nur Ein/Aus.
- **Status:** live — **Verweis:** Y23

### F-01-R07 – R07 Dispo: Tiefpunkt der nächsten 35 Tage
- **Story:** Als Nutzer möchte ich wissen, ob das Budget-Konto in den nächsten 35 Tagen unter null fällt, damit ich Zahlungen verschiebe, bevor ich in den Dispo rutsche.
- **Ausgangslage:** Es gibt Budget-Konten, wiederkehrende Zahlungen und erwartete Einnahmen.
- **Ablauf:**
  1. Nutzer öffnet Einstellungen › Regelwerk › „R07 Dispo“.
  2. „Ist“ zeigt „Tiefpunkt <Betrag>“ der Prognose.
  3. Der Handlungstext nennt das Datum und den Betrag, den er bis dahin auf das Budget-Konto übertragen müsste.
  4. Der Nutzer klickt „Zahlungen prüfen“ (Alle Buchungen) und verschiebt oder streicht Zahlungen oder überträgt Geld.
- **Ergebnis:** Der Tiefpunkt steigt; die Regel ist eingehalten, sobald er mindestens die Grenze (Standard 0 €) erreicht.
- **Abnahmekriterien:**
  1. Tiefpunkt unter der Grenze, aber nicht unter 0 €: Warnung; unter 0 € verletzt. Der Dispo zählt nie mit (Entscheidung 17.11.2026); „Letzte Reserve (Dispo)“ steht als eigene Angabe dabei.
  2. Horizont (1–35 Tage) und Mindestbetrag sind einstellbar.
  3. Das Dispo-Häkchen mit Limit am Konto (E-01) ändert den Status nicht, nur die Angabe „Letzte Reserve (Dispo)“.
  4. Ohne Prognosedaten steht „Nicht prüfbar“.
- **Status:** live — **Verweis:** Y23

### F-01-R08 – R08 Schuldenquote: Kreditraten im Verhältnis zum Netto
- **Story:** Als Nutzer möchte ich sehen, welcher Anteil des Nettoeinkommens in Kreditraten fließt, damit Schulden mein Budget nicht erdrücken.
- **Ausgangslage:** Es gibt Kreditkonten mit Monatsrate und ein Nettoeinkommen.
- **Ablauf:**
  1. Nutzer öffnet Einstellungen › Regelwerk › „R08 Schuldenquote“.
  2. „Ist“ zeigt die Quote in Prozent des Nettoeinkommens.
  3. Über 30 % ist Warnung, mehr als 10 Prozentpunkte darüber verletzt.
  4. Der Handlungstext nennt den Überschuss und rät zu Laufzeit oder Umschuldung.
  5. Der Nutzer klickt „Kreditraten prüfen“ und öffnet Vermögen › Schulden.
- **Ergebnis:** Nach Änderung der Rate oder einer Umschuldung sinkt die Quote.
- **Abnahmekriterien:**
  1. Grenze (Standard 30 %) und Abstand sind einstellbar.
  2. Ohne Kredite oder ohne Nettoeinkommen steht „Nicht prüfbar“.
  3. Die Rate zählt inklusive Zinsen.
- **Status:** live — **Verweis:** Y23

### F-01-R09 – R09 Tilgungsreihenfolge: Teure Kredite zuerst
- **Story:** Als Nutzer möchte ich, dass Kredite mit hohem Zins getilgt werden, bevor ich investiere, damit ich nicht mehr Zinsen zahle, als eine Anlage bringt.
- **Ausgangslage:** Es gibt mindestens einen Kredit mit Zins über 5 %.
- **Ablauf:**
  1. Nutzer öffnet Einstellungen › Regelwerk › „R09 Tilgungsreihenfolge“.
  2. „Ist“ zeigt „Sondertilgung aktiv“, „Sondertilgung fehlt“ oder „keine Kredite über 5 %“.
  3. Der Handlungstext nennt den Kredit mit Vorrang (höchster Zins zuerst oder kleinster Saldo zuerst).
  4. Der Nutzer klickt „Tilgung planen“ und bucht eine Sondertilgung in Vermögen › Schulden.
- **Ergebnis:** Eine Sondertilgung in den letzten drei Monaten macht die Regel eingehalten.
- **Abnahmekriterien:**
  1. Zinsgrenze (Standard 5 %), Strategie und Rückblick (3 Monate) sind einstellbar.
  2. Keine Sondertilgung und Geld für Investieren zugewiesen: verletzt; ohne diese Zuweisung: Warnung.
  3. Ohne Kredite steht „Nicht prüfbar“ oder „keine Kredite über 5 %“.
- **Status:** live — **Verweis:** Y23

### F-01-R10 – R10 Fixkostenquote
- **Story:** Als Nutzer möchte ich wissen, welcher Anteil des Nettoeinkommens durch Fixkosten gebunden ist, damit ich genug Spielraum behalte.
- **Ausgangslage:** Es gibt wiederkehrende Zahlungen und ein Nettoeinkommen.
- **Ablauf:**
  1. Nutzer öffnet Einstellungen › Regelwerk › „R10 Fixkostenquote“.
  2. „Ist“ zeigt die Quote (monatliche Fixkosten plus periodische Kosten als Zwölftel, geteilt durch Netto).
  3. Über 55 % ist Warnung, mehr als 10 Punkte darüber verletzt.
  4. Der Nutzer klickt „Feste Zahlungen prüfen“ (Plan › Wiederkehrende Zahlungen) und kündigt oder wechselt Verträge.
- **Ergebnis:** Die Quote sinkt mit den Fixkosten.
- **Abnahmekriterien:**
  1. Grenze (Standard 55 %) und Abstand sind einstellbar.
  2. Ohne Fixkosten oder ohne Netto steht „Nicht prüfbar“.
  3. Der Handlungstext verlangt Prüfen der Verträge und, wo die Frist es erlaubt, Wechsel oder Kündigung.
- **Status:** live — **Verweis:** Y23

### F-01-R11 – R11 Lifestyle-Inflation
- **Story:** Als Nutzer möchte ich sehen, ob meine Ausgaben schneller wachsen als mein Einkommen, damit eine Gehaltserhöhung nicht in höheren Ausgaben verschwindet.
- **Ausgangslage:** Es gibt Daten für zweimal zwölf Monate (die letzten zwölf gegen die zwölf davor).
- **Ablauf:**
  1. Nutzer öffnet Einstellungen › Regelwerk › „R11 Lifestyle-Inflation“.
  2. „Ist“ zeigt „Ausgaben +x % · Einkommen +y %“.
  3. Wachsen die Ausgaben stärker als das Einkommen (plus Toleranz, Standard 0), ist es Warnung, ab 5 Punkten darüber verletzt.
  4. Der Nutzer klickt „Ausgaben im Plan prüfen“ und prüft Wunsch-Kategorien.
- **Ergebnis:** Wächst das Einkommen wieder mindestens so stark wie die Ausgaben, ist die Regel eingehalten.
- **Abnahmekriterien:**
  1. Toleranz und Abstand zu verletzt sind einstellbar.
  2. Ohne zwei Zwölf-Monats-Fenster steht „Nicht prüfbar“.
  3. Fallende Ausgaben bei steigendem Einkommen sind eingehalten.
- **Status:** live — **Verweis:** Y23

### F-01-R12 – R12 Windfall: Sonderzahlung verteilen
- **Story:** Als Nutzer möchte ich bei einer Sonderzahlung 10 % für Genuss nehmen und den Rest nach Plan verteilen, damit sie nicht im Alltag versickert.
- **Ausgangslage:** In den letzten drei Monaten ging eine Sonderzahlung (z. B. 13. Gehalt, Bonus) ein.
- **Ablauf:**
  1. Nutzer öffnet Einstellungen › Regelwerk › „R12 Windfall“.
  2. Ohne Sonderzahlung zeigt „Ist“ „keine Sonderzahlung“ (eingehalten).
  3. Mit Sonderzahlung zeigt „Ist“ „Sonderzahlung verteilt“, „n € der Sonderzahlung noch zu verteilen“ oder „mehr als der Genuss-Anteil“.
  4. Der Handlungstext nennt den Genuss-Anteil (Standard 10 %) und den Wasserfall für den Rest.
  5. Der Nutzer klickt „Sonderzahlung verteilen“ und weist im Plan zu.
- **Ergebnis:** Nach vollständiger Verteilung ist die Regel eingehalten.
- **Abnahmekriterien:**
  1. Genuss-Anteil, Toleranz (5 %) und Rückblick (3 Monate) sind einstellbar.
  2. Zu viel Genuss ist Warnung, nicht verletzt.
  3. Ist keine Genuss-Kategorie festgelegt, darf der Genuss-Anteil in „Zu verteilen“ bleiben.
- **Status:** live — **Verweis:** Y23

### F-01-R13 – R13 Asset Allocation: Anlageklassen im Band
- **Story:** Als Nutzer möchte ich sehen, ob meine Anlageklassen von ihrem Zielanteil abweichen, damit ich die nächste Sparrate gezielt in die untergewichtete Klasse lenke.
- **Ausgangslage:** Es gibt Anlageklassen mit Zielanteilen (Einstellungen › Anlageklassen) und bewertete Positionen.
- **Ablauf:**
  1. Nutzer öffnet Einstellungen › Regelwerk › „R13 Asset Allocation“.
  2. „Ist“ nennt die Klasse mit der größten Abweichung in Prozentpunkten.
  3. Außerhalb des Bands (der kleinere Wert aus ±5 Punkten und ±25 % des Sollgewichts; gespeicherte Klassenbänder haben Vorrang) ist es Warnung, ab doppeltem Band verletzt.
  4. Der Handlungstext nennt die Klasse und den Fehl- oder Überbetrag in Euro.
  5. Der Nutzer klickt „Aufteilung prüfen“ (Portfolio › Allokation) und lenkt die nächste Sparrate um.
- **Ergebnis:** Die Abweichung schrumpft; die Regel ist eingehalten, wenn alle Klassen im Band sind.
- **Abnahmekriterien:**
  1. Ohne Sollquoten oder Positionen steht „Nicht prüfbar“.
  2. Sind Klassifikation oder Bewertung unvollständig, steht „Vorläufig: Datenbasis prüfen“ statt einer Umschichtung.
  3. Eine spekulative Klasse über Soll fällt unter R15, nicht unter R13.
  4. Das Standardband steht in der Schwelle als Text.
- **Status:** live — **Verweis:** Y23

### F-01-R14 – R14 Klumpenrisiko
- **Story:** Als Nutzer möchte ich sehen, ob ein einzelnes Wertpapier oder eine Plattform zu viel meines Portfolios ausmacht, damit ein Ausfall nicht mein Vermögen gefährdet.
- **Ausgangslage:** Es gibt bewertete Positionen in mindestens einem Depot.
- **Ablauf:**
  1. Nutzer öffnet Einstellungen › Regelwerk › „R14 Klumpenrisiko“.
  2. „Ist“ nennt die überschrittene Position oder Plattform mit Anteil, sonst „größte Position x %“.
  3. Einzeltitel über 10 % oder Plattform über 20 % ist Warnung, mehr als 5 Punkte darüber verletzt.
  4. Der Handlungstext nennt das Brutto-Exposure über dem Limit in Euro.
  5. Der Nutzer klickt „Große Positionen prüfen“ (Portfolio › Positionen) und stockt die Position nicht weiter auf.
- **Ergebnis:** Der Anteil sinkt durch Käufe in anderen Positionen.
- **Abnahmekriterien:**
  1. Grenzen für Einzeltitel und Plattform sind einstellbar.
  2. Gehebelte Produkte zählen mit ihrem Brutto-Exposure.
  3. Ohne Portfoliowert steht „Nicht prüfbar“; bei vorläufiger Datenbasis „Vorläufig: Datenbasis prüfen“.
- **Status:** live — **Verweis:** Y23

### F-01-R15 – R15 Spekulativer Anteil
- **Story:** Als Nutzer möchte ich sehen, wie groß der Anteil spekulativer Produkte ist, damit riskante Wetten nicht über meine Sicherheit entscheiden.
- **Ausgangslage:** Es gibt Positionen, die als spekulativ oder gehebelt gelten.
- **Ablauf:**
  1. Nutzer öffnet Einstellungen › Regelwerk › „R15 Spekulativer Anteil“.
  2. „Ist“ zeigt den Anteil in Prozent des Portfolios.
  3. Über 10 % ist Warnung, mehr als 3 Punkte darüber verletzt.
  4. Der Handlungstext nennt das Brutto-Exposure über dem Limit.
  5. Der Nutzer klickt „Riskante Anlagen prüfen“ (Portfolio › Allokation) und stockt nicht weiter auf.
- **Ergebnis:** Der Anteil sinkt, wenn andere Positionen wachsen.
- **Abnahmekriterien:**
  1. Grenze und Abstand sind einstellbar.
  2. Gehebelte ETF zählen als spekulativ.
  3. Ohne Portfoliowert steht „Nicht prüfbar“.
- **Status:** live — **Verweis:** Y23

### F-01-R16 – R16 Freiheitszahl: Fortschritt steigt
- **Story:** Als Nutzer möchte ich sehen, ob mein Fortschritt zur Freiheitszahl steigt, damit ich merke, wenn meine Sparrate dafür nicht reicht.
- **Ausgangslage:** Es gibt Jahresausgaben und investiertes Vermögen; die Freiheitszahl ist Jahresausgaben mal 25.
- **Ablauf:**
  1. Nutzer öffnet Einstellungen › Regelwerk › „R16 Freiheitszahl“.
  2. „Ist“ zeigt den Fortschritt in Prozent.
  3. Ist der Fortschritt gegenüber dem Vergleichsstand gesunken, steht Warnung, sonst eingehalten.
  4. Der Handlungstext nennt alten und neuen Prozentwert.
  5. Der Nutzer klickt „Sparrate prüfen“ (Vermögen › Freiheitszahl).
- **Ergebnis:** Steigt der Fortschritt wieder, ist die Regel eingehalten.
- **Abnahmekriterien:**
  1. Der Faktor (Standard 25, 4-%-Regel) ist einstellbar.
  2. Es gibt keine Stufe verletzt, nur Warnung.
  3. Ohne Jahresausgaben steht „Nicht prüfbar“.
- **Status:** live — **Verweis:** Y23

### F-01-R17 – R17 Investitionsquote vom Brutto
- **Story:** Als Nutzer möchte ich wissen, welchen Anteil meines Bruttoeinkommens ich investiere, damit ich das Ziel von 25 % erreiche.
- **Ausgangslage:** Gehaltszettel der letzten zwölf Monate liegen vor, die Regel ist eingeschaltet (standardmäßig aus), Arbeitgeberbeiträge zur Pensionskasse sind erfasst (auch 0 ausdrücklich).
- **Ablauf:**
  1. Nutzer schaltet in Einstellungen › Regelwerk den Schalter „R17 Investitionsquote vom Brutto“ ein.
  2. Er erfasst unter „Daten für die Buchregeln“ den Arbeitgeberbeitrag Pensionskasse je Beitragsmonat.
  3. „Ist“ zeigt „x % (eigene y %)“; unter 15 % ist verletzt, 15–25 % Warnung, ab 25 % eingehalten.
  4. Der Handlungstext nennt, um wie viel der Sparplan im Monat steigen muss.
  5. Der Nutzer klickt „Sparpläne prüfen“ (Portfolio › Sparpläne).
- **Ergebnis:** Die Quote steigt mit höherem Sparplan.
- **Abnahmekriterien:**
  1. Fehlt ein Gehaltszettel im Fenster, steht „Nicht prüfbar: Gehaltszettel fehlen im Fenster …“.
  2. Fehlt ein Arbeitgeberbeitrag, steht „Arbeitgeberbeitrag fehlt …; auch 0 bitte ausdrücklich erfassen.“
  3. „Arbeitgeberbeitrag mitzählen“ und „Höchste Schwere“ (Verletzt möglich / Nur Warnung) sind einstellbar.
  4. Das Minimum darf das Ziel nicht übersteigen.
- **Status:** live — **Verweis:** Y23 (Stufen-Punkt S2-1)

### F-01-R18 – R18 Vermögensindex
- **Story:** Als Nutzer möchte ich mein Vermögen mit einem Richtwert aus Alter und Einkommen vergleichen, damit ich einen groben Maßstab habe, ohne dass ein Rot mich verunsichert.
- **Ausgangslage:** Geburtsmonat und -jahr sind erfasst, Gehaltszettel liegen vor, der Nutzer ist mindestens 25 Jahre alt (einstellbar).
- **Ablauf:**
  1. Nutzer schaltet „R18 Vermögensindex“ ein.
  2. Er trägt Geburtsmonat und Jahr ein (Einstellungen › Profil; die Regel verweist über „Angaben zum Alter prüfen“ dorthin).
  3. „Ist“ zeigt „Index x,yy (Soll …, Ist …)“; ab 1,00 eingehalten, darunter Warnung.
  4. Die Regel nennt ihre Einschränkungen: Richtwert aus US-Daten der 1990er, ohne Erbschaften, ohne Pensionsansprüche.
- **Ergebnis:** Ein Orientierungswert; er löst nur Warnungen aus.
- **Abnahmekriterien:**
  1. Die Regel wird nie verletzt, höchstens Warnung.
  2. Ohne Geburtsdatum oder unter Mindestalter steht „Nicht prüfbar“ mit Grund.
  3. „Kapitalerträge mitzählen“ ist einstellbar.
- **Status:** live — **Verweis:** Y23

### F-01-R19 – R19 Grenz-Sparquote
- **Story:** Als Nutzer möchte ich bei Einkommenserhöhungen mindestens die Hälfte des Zuwachses zusätzlich sparen, damit ich mit höherem Einkommen auch mehr Vermögen aufbaue.
- **Ausgangslage:** Es gibt 24 abgeschlossene Budgetmonate; das Einkommen ist gegenüber dem Vorjahr um mindestens 3 % gestiegen.
- **Ablauf:**
  1. Nutzer schaltet „R19 Grenz-Sparquote“ ein.
  2. „Ist“ zeigt den Anteil des Zuwachses, der in Zukunft floss; ohne Zuwachs „kein Einkommenszuwachs“ (eingehalten).
  3. Ab 50 % eingehalten, ab 25 % Warnung, darunter verletzt.
  4. Der Handlungstext nennt den Betrag pro Monat, der von der Erhöhung mehr in Zukunft gehen sollte.
  5. Der Nutzer klickt „Zukunft im Plan erhöhen“.
- **Ergebnis:** Der Sparanteil am Zuwachs steigt.
- **Abnahmekriterien:**
  1. Fehlen 24 Budgetmonate: „Nicht prüfbar: Für den Vergleich fehlen 24 abgeschlossene Budgetmonate.“
  2. Mindestzuwachs, Ziel und Minimum sind einstellbar.
  3. Ohne positive Einkommensbasis im Vorjahr steht „Nicht prüfbar“.
- **Status:** live — **Verweis:** Y23

### F-01-R20 – R20 Regelmäßig investieren
- **Story:** Als Nutzer möchte ich sehen, in wie vielen der letzten zwölf Monate ich investiert habe, damit ich dranbleibe und nicht nur gelegentlich kaufe.
- **Ausgangslage:** Zwölf abgeschlossene Monate Anlagehistorie mit vollständigen Trades und Einzahlungen.
- **Ablauf:**
  1. Nutzer schaltet „R20 Regelmäßig investieren“ ein.
  2. „Ist“ zeigt „n von 12 Monaten“ mit Monatsstreifen.
  3. Ab 11 Monaten eingehalten, ab 9 Warnung, darunter verletzt.
  4. Der Handlungstext verlangt, den Sparplan und fehlende Monate zu prüfen.
  5. Der Nutzer klickt „Sparpläne prüfen“.
- **Ergebnis:** Fehlende Monate mit nachgetragenen Käufen zählen wieder.
- **Abnahmekriterien:**
  1. Eine Sondertilgung bei R09-Vorrang zählt als erfüllt, wenn der Schalter gesetzt ist.
  2. Fehlt Historie, steht „Nicht prüfbar: Es fehlen zwölf abgeschlossene Monate der Anlagehistorie.“
  3. Hinweis auf der Regel: Unvollständige Trade-Historie kann einen falschen Status erzeugen.
- **Status:** live — **Verweis:** Y23

### F-01-R21 – R21 Hebel und Fremdkapital
- **Story:** Als Nutzer möchte ich gehebelte Produkte und Minus auf Verrechnungskonten begrenzen, damit ich nicht mit geliehenem Geld spekuliere.
- **Ausgangslage:** Positionen mit Hebel und Plattform-Verrechnungskonten sind erfasst, der Investmentwert ist positiv.
- **Ablauf:**
  1. Nutzer schaltet „R21 Hebel und Fremdkapital“ ein.
  2. „Ist“ zeigt „Hebel x % · Plattform-Minus y %“.
  3. Hebelanteil über 10 % oder ein Minus (ab 0,01 %) ist Warnung; mehr als 5 Punkte darüber verletzt.
  4. Der Nutzer klickt „Hebel und Konten prüfen“ und gleicht negative Verrechnungskonten aus.
- **Ergebnis:** Anteil und Minus sinken.
- **Abnahmekriterien:**
  1. Kleine technische Minusstände bis 100 € sind einstellbar ignorierbar.
  2. Ohne positiven Investmentwert steht „Nicht prüfbar: Positiver Investmentwert fehlt.“
  3. Die Regel prüft Depot-Verrechnungskonten, R09 nur Kreditkonten.
- **Status:** live — **Verweis:** Y23

### F-01-R22 – R22 Fondskosten
- **Story:** Als Nutzer möchte ich die gewichtete Kostenquote meiner ETF und Fonds kennen, damit hohe Kosten meine Rendite nicht still auffressen.
- **Ausgangslage:** ETF und Fonds haben bewertete Positionen; die laufenden Kosten (TER) sind erfasst.
- **Ablauf:**
  1. Nutzer schaltet „R22 Fondskosten“ ein.
  2. „Ist“ zeigt „x,xx % · Handel …“ als nach Wert gewichtete TER.
  3. Über 0,30 % ist Warnung, mehr als 0,30 Punkte darüber verletzt.
  4. Der Handlungstext rät, bei neuen Einzahlungen günstigere Fonds derselben Klasse zu wählen.
  5. Der Nutzer klickt „Fondskosten prüfen“ (Portfolio › Positionen) und ergänzt fehlende TER.
- **Ergebnis:** Die Kostenquote sinkt mit günstigeren Fonds; fehlende TER werden nicht als kostenlos angenommen.
- **Abnahmekriterien:**
  1. Fehlt bei mehr als 20 % des Fondswerts die TER, steht „Nicht prüfbar: TER fehlt bei … Wertpapieren“.
  2. „Hebelfonds getrennt anzeigen“ ist einstellbar.
  3. Handelskosten werden nur angezeigt, nicht bewertet.
- **Status:** live — **Verweis:** Y23 (Stufen-Punkt S3-2)

### F-02 – Finanz-Check-Scores von 0 bis 100
- **Story:** Als Nutzer möchte ich einen verständlichen Gesamtscore von 0 bis 100 mit Teil-Scores und Begründung sehen, damit ich auf einen Blick weiß, wie es um Rücklage, Schulden und Portfolio steht, und nachvollziehe, warum.
- **Ausgangslage:** Der Nutzer öffnet den Finanz-Check und will mehr als einzelne Regeln.
- **Ablauf:** (geplant, nach Issue #814)
  1. Nutzer öffnet den Finanz-Check (Report Finanz-Check).
  2. Die App zeigt Gesamtscore und drei Teil-Scores (Cashflow und Rücklagen, Schulden und Schuldendienst, Portfolio-Struktur und Klumpenrisiko).
  3. Je Teil-Score stehen eine kurze Erklärung, die Rechenbasis und ein Link zur passenden Ansicht.
  4. Daten-Vollständigkeit steht getrennt vom Score.
- **Ergebnis:** Ein nachvollziehbarer Wert; es wird nichts gebucht und keine Sparrate geändert.
- **Abnahmekriterien:**
  1. Fehlende Daten verbessern den Score nie; sie sind als „fehlt“ gekennzeichnet, nicht als 0 oder gut.
  2. Kein Kredit oder kein Portfolio wird ausdrücklich behandelt, nicht still als 100.
  3. Derselbe Stand liefert denselben Score.
  4. Beträge folgen dem Datenschutz-Modus.
- **Status:** live (Stand 26.11.2026: alle verknüpften Issues erledigt; Nutzerabnahme offen) — **Verweis:** #814
  Fehlt noch: Bewertungsmethode, Gewichte, Anzeige.

### F-03 – Risikotoleranz und Risikotragfähigkeit freiwillig erfassen
- **Story:** Als Nutzer möchte ich freiwillig angeben, wie viel Schwankung ich aushalten will und kann, damit die App mein Risiko erklärt, statt etwas anzunehmen.
- **Ausgangslage:** Der Nutzer möchte sein Risikoprofil hinterlegen.
- **Ablauf:**
  1. Nutzer öffnet Einstellungen › Profil. Der Abschnitt „Risikoprofil (freiwillig)“ ist sichtbar.
  2. Er beantwortet Fragen: Anlagehorizont, Bedarf an verfügbarem Geld, Rücklage, Stabilität des Einkommens, Reaktion auf Kursverluste, Akzeptabler vorübergehender Verlust. Jede Frage hat „Keine Angabe“.
  3. Die App fasst das Ergebnis in einem Satz zusammen („Du möchtest Wertschwankungen eher vermeiden.“). Ohne vollständige Antworten: „Ohne vollständige Antworten wird nichts angenommen.“
  4. Er speichert das Profil.
- **Ergebnis:** Antworten sind im Profil gespeichert; Zielanteile, Sparpläne und Regeln ändern sich dadurch nicht.
- **Abnahmekriterien:**
  1. Jede Angabe ist freiwillig; Unvollständiges bleibt „unbekannt“, nie „mittel“.
  2. Das Speichern ist rückgängig machbar.
  3. Eine gleichzeitige Änderung wird gemeldet und nicht überschrieben.
- **Status:** live — **Verweis:** #812, PR #1044
  Fehlt noch: Sichtabnahme durch den Nutzer.

### F-04 – Familiensituation und Verpflichtungen angeben
- **Story:** Als Nutzer möchte ich meine Familiensituation freiwillig hinterlegen, damit Hinweise zu Rücklage und Risiko zu meiner Lage passen.
- **Ausgangslage:** Der Nutzer hat Partner, Kinder oder Unterhaltspflichten.
- **Ablauf:**
  1. Nutzer öffnet Einstellungen › Profil und scrollt zu den Angaben zur Familiensituation.
  2. Er wählt „Partnerschaft“, „Einkommen der Partnerschaft“, „Laufende Unterstützungszahlungen“, „Finanziell abhängige Personen“ und „Davon Kinder“; überall gibt es „Keine Angabe“.
  3. Die App zeigt, wie das mit Rücklage und Risikotragfähigkeit zusammenhängt („Bezug zu Rücklage und Risikotragfähigkeit“).
  4. Er speichert.
- **Ergebnis:** Angaben sind im Profil gespeichert; die Haushaltsgröße wird nicht doppelt erfasst, es entstehen keine Ausgaben und keine Strafpunkte.
- **Abnahmekriterien:**
  1. „Keine Angabe“, „Keine“ und 0 bleiben unterscheidbar.
  2. Es werden keine Namen oder Geburtsdaten von Angehörigen abgefragt.
  3. Familienstatus allein ändert keine Rücklage oder Zielanteile.
  4. Speichern ist rückgängig machbar.
- **Status:** live — **Verweis:** #813, PR #1044
  Fehlt noch: Sichtabnahme durch den Nutzer.
