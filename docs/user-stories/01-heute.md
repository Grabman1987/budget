# User-Stories – Heute

Bereich: Startseite „Heute“ (Route `/`). Status und Verweise wie in `docs/USER-STORIES.md`. Alle Beträge in Cent, Anzeige in Euro.

### H-01 – Antwortkarten auf einen Blick
- **Story:** Als Nutzer möchte ich oben auf Heute die Antwortkarten „Frei bis Gehalt“, „Nettovermögen“ und „Monat im Blick“ sehen und unten in „Ziele finanzieren“ die noch nicht finanzierten Sparziele, damit ich in Sekunden weiß, ob ich ausgeben darf, wie mein Vermögen steht und welches Ziel als Nächstes Geld braucht.
- **Ausgangslage:** Ich öffne die App am Handy oder Desktop, ohne etwas Bestimmtes zu suchen.
- **Ablauf:**
  1. Ich öffne „Heute“. Die App lädt den Heute-Abruf und zeigt oben „Stand heute · <Datum>“.
  2. Ich lese die große Zahl der Karte „Frei bis Gehalt“ (mit „bis <Datum> · N Tage“).
  3. Ich lese die Karte „Nettovermögen“ mit Gesamtbetrag und „… in 12 Monaten“. Antippen öffnet die Aufschlüsselung nach Vermögensart. Die Karte beginnt oben bündig mit „Frei bis …“.
     Die Seite „Nettovermögen · Herleitung“ (`/heute/details/wealth`) steht in vier weißen Karten untereinander: Übersicht (Gesamtbetrag mit Herleitung), Vermögensaufteilung nach Maß, Verlauf über 12 Monate und „Ziele finanzieren“. „Zurück“ steht links oben; die Links in „Ziele finanzieren“ (Plan, Budgettreue) öffnen ihre Zielansicht (e2e `issue-1348-networth-detail`, Review 25.11.2026, #1348).
  4. Ich lese die Karte „Monat im Blick“ (Ausgegeben, Prognose Monatsende, Deckel).
  5. Ich lese „Letzte Buchungen“ als kompakte Tabelle mit den Spalten Datum · Buchung · Wert; Umbuchungen heißen „Umbuchung auf <Konto>“ (ausgehend) bzw. „Umbuchung von <Konto>“ (eingehend).
  6. Ich scrolle zu „Ziele finanzieren“. Dort steht „N Sparziele noch nicht finanziert“ mit Link nach Plan › Sparziele. Das nächste Sparziel (nach Datum) steht in diesem Block; eine eigene Karte oben gibt es nicht (Entscheidung 15.11.2026).
- **Ergebnis:** Nichts wird geändert. Jede Zahl führt per Antippen zur Herleitung bzw. zur Quellseite.
- **Abnahmekriterien:**
  1. Die Karten stehen oben, auf dem Handy untereinander.
  2. „Nettovermögen“ stimmt mit Vermögen › Nettovermögen überein.
  3. Sind alle Sparziele finanziert, erscheint kein Hinweis „noch nicht finanziert“.
  4. Fällt eine Teilabfrage aus, zeigt die Karte „… nicht verfügbar“ mit Wiederholen statt einer falschen Zahl.
  5. Fehlt die Bewertung, steht „Bewertung nicht verfügbar“ statt 0 €.
- **Status:** live — **Verweis:** Y13-C
- Hinweis: Das nächste Sparziel ist Teil des bestehenden Blocks „Ziele finanzieren“; keine eigene Karte (Entscheidung 15.11.2026).

### H-02 – Frei bis Gehalt / Frei bis Monatsende verstehen
- **Story:** Als Nutzer möchte ich „Frei bis Gehalt“ als Cashflow-Zahl sehen und in ihre Teile zerlegen können (Kontostand der Budget-Konten − offene Abflüsse bis zum Gehalt; weder Dispo noch erwartete Eingänge zählen mit, Entscheidung 17.11.2026), damit ich weiß, was ich bis zum Gehalt noch ausgeben kann, ohne ins Minus zu geraten. In der Ansicht „Monat“ zeigt die Karte stattdessen „Frei bis Monatsende“ (gleiche Definition, Grenze = letzter Tag des laufenden Monats).
- **Ausgangslage:** Ich will wissen, ob ich mir etwas leisten kann, oder ich verstehe die Zahl nicht.
- **Ablauf:**
  1. Ich öffne „Heute“ und lese „Frei bis Gehalt“ (rot mit Warnzeichen, wenn negativ).
  2. Ich tippe die Zahl an. Die App öffnet die Herleitung (`/heute/details/free`).
  3. Ich sehe die Kette „Kontostand“ − „Offen bis Gehalt“ = „frei verfügbar“, darunter getrennt die Zeile „Letzte Reserve (Dispo)“, und das Tagesbudget bis Gehalt.
  4. Ich öffne die Listen „Kontostand“ und „Offen bis Gehalt“ und sehe die einzelnen Konten und Zahlungen. Erwartete Eingänge stehen nur in der Prognose.
  5. Ich schalte in der Karte „Frei bis …“ selbst (Schalter „Zeitraum“ oben rechts in der Karte) zwischen „Monat“ und „Bis Gehalt“ um. „Bis Gehalt“ gilt nur im laufenden Monat. In „Monat“ heißt die Karte „Frei bis Monatsende“ mit „bis 30.11. · N Tage“ (heute und der letzte Tag zählen mit); Kette, Tagesbudget, Herleitung und Offline-Ansicht folgen dem gewählten Zeitraum. In „Bis Gehalt“ bleibt alles wie bisher.
- **Ergebnis:** Nichts wird geändert. Der gewählte Zeitraum bleibt auf dem Gerät gemerkt und gilt auch im Report R07.
- **Abnahmekriterien:**
  1. Die Zahl entspricht Kontostand minus offen bis Gehalt auf den Cent.
  2. Der Dispo fließt nie in die Zahl ein. Mit Dispo-Häkchen (Einstellungen › Konten) zeigt die Herleitung „Letzte Reserve (Dispo)“ als eigene Zeile (ungenutzter Rahmen), ohne: „Kein Dispo aktiviert“. Prognose und Heute nennen dieselbe Zahl.
  3. Ein negativer Wert wird rot mit Warnzeichen gezeigt; das Tagesbudget sagt „Ohne positiven Spielraum gibt es kein Tagesbudget.“
  4. In einem anderen Monat ist „Bis Gehalt“ nicht wählbar und nennt den Grund.
  5. Ein erwartetes Gehalt oder eine erwartete Erstattung ändert die Zahl nicht; erst die gebuchte Einnahme tut es (im Kontostand).
  6. „Frei bis Monatsende“ zieht alle bis einschließlich zum letzten Tag des Monats offenen Abflüsse (auch überfällige, je einmal) vom Kontostand ab; Abflüsse ab dem 1. des Folgemonats zählen nicht. Auch in der Ansicht eines anderen Monats bleibt die Karte „Stand heute“ (Monatsende des laufenden Monats).
- **Status:** live — **Verweis:** #1084, PR #1086, Y13

### H-03 – Pace unter der Kontoprognose
- **Story:** Als Nutzer möchte ich in „Monat im Blick“ sehen, wie viel ich bisher ausgegeben habe, was die Hochrechnung bis Monatsende ergibt und wo der Deckel liegt, damit ich früh merke, dass ich über Plan liege, und noch gegensteuern kann.
- **Ausgangslage:** Mitten im Monat will ich wissen, ob mein Ausgabentempo passt.
- **Ablauf:**
  1. Ich öffne „Heute“ und gehe zur Karte „Monat im Blick“.
  2. Ich lese die Zeile „Ausgegeben … · Prognose Monatsende … von … Deckel“.
  3. Ich betrachte das Diagramm: Ist durchgezogen, Hochrechnung gestrichelt, Plan bis heute als Punkt.
  4. Ich fahre über die Kurve (Tooltip) und sehe in der Karte auf Heute Ist, Plan bis heute und Vormonat; ohne Einnahmen, Differenz, Deckel und Hochrechnungs-Erklärung. Das Diagramm ist hoch genug zum Ablesen, die Deckel-Linie ist dicker gezeichnet.
  5. Mit „Pace →“ öffne ich die Detailseite (weiße Karte): Zahlen, Diagramm mit Einnahmen und Vormonat immer sichtbar (ohne „Mehr anzeigen“, ohne „Zwischenstand bis …“-Zeile und ohne Erklärzeile) und darunter die Buchungen, aus denen die Ist-Linie besteht, als kompakte Tabelle (Datum · Buchung · Kategorie · Betrag, neueste zuerst, Summe = „Ausgegeben“).
  6. Mit „Mehr zum Monat“ öffne ich die Einzelwerte.
- **Ergebnis:** Nur Anzeige. Keine Daten ändern sich.
- **Abnahmekriterien:**
  1. Ist ist durchgezogen, die Hochrechnung gestrichelt; liegt sie über dem Deckel, ist sie rot.
  2. Der Punkt „Plan bis heute“ ist sichtbar.
  3. Gibt es noch zu wenig Daten, steht „noch nicht verfügbar“ statt einer Zahl.
  4. Auf dem Handy bricht das Diagramm nicht aus der Karte.
- **Status:** live — **Verweis:** Y13-P

### H-04 – Kontoprognose im selben Zeitraum
- **Story:** Als Nutzer möchte ich die Kontoprognose im gleichen Zeitraum wie die Pace sehen, damit ich einen Engpass vor dem Gehalt erkenne, bevor er eintritt.
- **Ausgangslage:** Ich fürchte, dass vor dem Gehalt das Konto knapp wird.
- **Ablauf:**
  1. Ich öffne „Heute“ und gehe zur Karte „Kontoprognose“.
  2. Ich wähle in der Karte „Frei bis …“ „Monat“ oder „Bis Gehalt“; die Kurve folgt dem Zeitraum.
  3. Ich lese Tiefpunkt und Limit im Diagramm; der Tiefpunkt steht nur dort, nicht noch einmal als Text. Karte und Detailseite sind weiße Karten ohne doppelte Titel und Untertitel.
  4. Ich tippe „Details“. Die App öffnet direkt Plan › Prognose (`/plan/prognose`, 35 Tage); „Zurück“ (links, wie überall) führt zu Heute.
- **Ergebnis:** Nur Anzeige. Heute und Report R07 zeigen denselben Zeitraum.
- **Abnahmekriterien:**
  1. 14 Tage Rückblick sind sichtbar.
  2. Die Kurve endet am Gehalts- bzw. Monatsende plus zwei Tage.
  3. Ohne Budget-Konto steht „Ohne Budget-Konto gibt es keine Kontoprognose.“
  4. Fehlt die gespeicherte Prognose, steht „Die gespeicherte 35-Tage-Prognose ist nicht verfügbar.“
- **Status:** live — **Verweis:** Report R07 (FEATURES)

### H-05 – Heute am Telefon
- **Story:** Als Nutzer möchte ich Heute am Telefon bedienen können, ohne zu zoomen, damit ich die Zahlen auch unterwegs sofort lesen und die nächste Aufgabe antippen kann.
- **Ausgangslage:** Ich öffne die App am Handy (Breite 360–430 px).
- **Ablauf:**
  1. Ich öffne „Heute“ am Handy.
  2. Ich wechsle den Monat mit dem Monatswähler (Pfeile und Monatsname).
  3. Ich schalte in der Karte „Frei bis …“ „Monat“ / „Bis Gehalt“ um.
  4. Ich scrolle zu „Als Nächstes“ und tippe bei einer Aufgabe auf die Aktion (z. B. „Verteilen“).
  5. Die App öffnet die Zielseite, ohne dass der schwebende Plus-Knopf die Aktion verdeckt.
- **Ergebnis:** Nur Navigation.
- **Abnahmekriterien:**
  1. Monatswähler und Umschalter haben gleiche Höhe und Schriftgröße, Touchflächen mindestens 44 px.
  2. Aufgabennamen brechen nicht mitten im Satz um; Betrag und Aktion bleiben lesbar.
  3. Der Plus-Knopf verdeckt keine Zeile (Abstand unten, Safe Area).
  4. Hell und dunkel gleich bedienbar; Desktop bleibt unverändert.
- **Status:** live — **Verweis:** #1065

### H-06 – Heute lädt schnell
- **Story:** Als Nutzer möchte ich, dass Heute schnell lädt und bei Störungen klar „lädt“ oder „Fehler“ sagt, damit ich die App gern täglich öffne und keiner falschen Zahl vertraue.
- **Ausgangslage:** Ich öffne die App morgens; der Server ist kalt oder langsam.
- **Ablauf:**
  1. Ich öffne „Heute“.
  2. Die Karten zeigen „… wird geladen“, bis der Heute-Abruf antwortet.
  3. Die Zahlen erscheinen; beim Aktualisieren im Hintergrund bleiben die alten Werte stehen.
  4. Schlägt der Abruf fehl, zeigt die Karte einen Hinweis mit „Wiederholen“.
- **Ergebnis:** Nur Anzeige; keine Zahl ändert sich durch die Optimierung.
- **Abnahmekriterien:**
  1. Kaltes Laden von `GET /api/heute` unter 500 ms auf dem synthetischen Datenbestand.
  2. Während des Ladens steht „lädt“, nicht „Nicht verfügbar“.
  3. Bei Fehler erscheint ein klarer Hinweis, keine Null und keine alte Zahl als neue.
  4. Die Antworten bleiben byte-identisch zu den abgelegten Prüfsummen.
  5. Account-review reads preserve checkpoint ordering, financial-edit detection and Undo/redo; the audit projection uses one direct primitive-row query, including in transactions.
- **Status:** live (Stand 26.11.2026: alle verknüpften Issues erledigt; Nutzerabnahme offen) — **Verweis:** #1073, #956
- Read flow: after a cache miss, account-review chronology reads the same audit predicates directly from SQLite before the unchanged replay; loading/error UI and all financial figures remain unchanged.
- Remaining: incremental account-review replay, month-end valuation batching, the current-month whole-picture projection and finance-check fact reuse. Goal audit parsing is already cached by #1129.

### H-xx – Fälliges und letzte Buchungen antippen (#1323)
- **Story:** Als Nutzer möchte ich in „Letzte Buchungen“ und „Fällig 14 Tage“ eine Zeile antippen und direkt bearbeiten bzw. handeln, damit ich nicht erst über mehrere Seiten gehen muss.
- **Ablauf:**
  1. Ich tippe eine Zeile in „Letzte Buchungen“. Der Bearbeiten-Dialog öffnet genau diese Buchung; nach Speichern oder Schließen bin ich wieder auf Heute und die Zeile ist aktualisiert.
  2. Ich tippe eine offene Zeile in „Fällig 14 Tage“. Die wiederkehrende Zahlung öffnet sich mit Buchen, Verknüpfen und Überspringen; bei einer bereits zugeordneten Fälligkeit öffnet sich die verknüpfte Buchung im Bearbeiten-Dialog.
- **Abnahmekriterien:** Zeilen sind Schaltflächen mit Namen, 44 px hoch, per Tastatur bedienbar; „Alle →“ führt unverändert in die Listen.
- **Status:** live (Stand 26.11.2026: alle verknüpften Issues erledigt; Nutzerabnahme offen) — **Verweis:** #1323

### H-xx – Detailseiten „Fällig“ und „Als Nächstes“ kompakt (#1344)
- **Story:** Als Nutzer möchte ich unter „Fällig · alle Zahlungen“ eine Tabelle und unter „Als Nächstes · alle Aufgaben“ eine einzeilige Liste sehen, damit ich auf einen Blick erfasse, was wann ansteht, auch am Handy ohne seitliches Scrollen.
- **Ablauf:**
  1. Ich öffne auf Heute „Fällig“ › Details. Eine weiße Karte zeigt die Spalten Datum · Zahlung · Konto · Betrag · Deckung, ohne Erklärtexte; am Handy besteht jede Zeile aus zwei kompakten Zeilen.
  2. Ich tippe den Zahlungsnamen (Buchen, Verknüpfen, Überspringen), das Konto (Kontovorschau) oder den Betrag (Erwartet).
  3. Ich öffne „Als Nächstes“ › Details. Jede Aufgabe steht in einer Zeile: was, wann bzw. Betrag, Aktion; Dringendes steht oben und ist rot.
- **Abnahmekriterien:** keine Beschriftung-Wert-Stapel je Eintrag; kein horizontaler Scroll bei 390 px; Aktionen 44 px hoch; Verhalten nur mit Redesign-Schalter.
- **Status:** live (Stand 26.11.2026: alle verknüpften Issues erledigt; Nutzerabnahme offen) — **Verweis:** #1344

### H-xx – Prüfen-Warnung (#1320)
- **Story:** Als Nutzer möchte ich auf Heute sehen, wenn offene Buchungen ohne Kategorie zu alt werden oder zu viele sind, samt Summe, damit „Zu verteilen“ und die Monatsauswertung nicht verzerrt bleiben.
- **Abnahmekriterien:** Warnung genau ab Schwelle + 1 Tag bzw. + 1 Eintrag; Schwellen in Einstellungen änderbar und gespeichert; im Plan erscheint „Enthält … ohne Kategorie“ nur bei Summe ≠ 0.
- **Status:** live (Stand 26.11.2026: alle verknüpften Issues erledigt; Nutzerabnahme offen) — **Verweis:** #1320

