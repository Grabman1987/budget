# User-Stories – Plan (Budget)

Bereich: Plan (`/plan/monat`, `/plan/jahr`, `/plan/erwartet`, `/plan/sparziele`, `/plan/prognose`) und Einstellungen › Kategorien. Status und Verweise wie in `docs/USER-STORIES.md`.

### P-01 – Vier Werte je Kategorie
- **Story:** Als Nutzer möchte ich je Kategorie Zugewiesen, Aktivität und Verfügbar sowie oben Zu verteilen sehen, damit ich jeden Euro einer Aufgabe zuordne und sofort erkenne, wo Geld fehlt.
- **Ausgangslage:** Ich plane einen Monat oder prüfe, wie viel in einer Kategorie noch übrig ist.
- **Ablauf:**
  1. Ich öffne „Plan › Monat“ (`/plan/monat`); der aktuelle Monat ist gewählt.
  2. Ich lese „Zu verteilen“ im Kopf und in jeder Kategoriezeile „Zugewiesen“, „Aktivität“, „Verfügbar“.
  3. Ich wechsle den Monat mit dem Monatswähler; Verfügbar enthält den Übertrag aus dem Vormonat.
  4. Ich tippe eine Kategorie an. Der Plan-Inspektor öffnet sich mit Zugewiesen, Aktivität, Übertrag und Ziel.
  5. Ich ändere „Zugewiesen“ und bestätige mit „Zuweisen“ (Enter). „Zu verteilen“ und „Verfügbar“ ändern sich sofort.
  6. Ich öffne die Einnahmen-Details und kehre über den Browser oder „Zurück zum Monat“ zum selben Monat zurück.
- **Ergebnis:** Die Zuweisung ist gespeichert; Summen im Kopf, in Gruppen und im Inspektor stimmen neu. „Rückgängig“ nimmt sie zurück.
- **Abnahmekriterien:**
  1. Jede Zeile zeigt Zugewiesen, Aktivität, Verfügbar; die Summe je Gruppe und im Kopf stimmt auf den Cent.
  2. Ein Übertrag in den Folgemonat ist sichtbar.
  3. Weise ich mehr zu, als zu verteilen ist, steht „Zu viel zugewiesen“ in Rot.
  4. Ein ungültiger Betrag wird mit „Das lässt sich nicht als Betrag lesen.“ abgelehnt.
  5. „Rückgängig“ stellt den alten Wert wieder her.
  6. Nach beiden Rückwegen bleiben Position, Größe, Hintergrund und Rahmen von „Zu verteilen“ und dem Einnahmenblock unverändert, hell und dunkel auf Desktop und Telefon. Auch die Einnahmen-Detailseite verwendet durchgehend den Redesign-Kopf und dessen Abstände. Der Einnahmenblock bleibt am Desktop rechtsbündig; am Telefon bleibt er ausgeblendet und über die Maßkette erreichbar.
- **Status:** live; Rückweg-Korrektur #1110 im PR #1114, visuelle Detailseiten-Erwartung migriert; CI und Live-Abnahme offen — **Verweis:** Y07, #1110

### P-02 – Kategorien, Gruppen und Klassen pflegen
- **Story:** Als Nutzer möchte ich Kategorien und Gruppen anlegen, ordnen und als Bedarf, Wunsch oder Zukunft einstufen, damit die 50/30/20-Sicht in Plan und Reports meine echte Ausgabenstruktur zeigt.
- **Ausgangslage:** Eine neue Ausgabenart kommt dazu oder eine Kategorie ist falsch eingestuft.
- **Ablauf:**
  1. Ich öffne „Einstellungen › Kategorien“ (`/einstellungen/kategorien`).
  2. Ich wähle „Gruppe anlegen“ und gebe den Namen ein, danach „Kategorie anlegen“ mit „Name“ und „Gruppe“.
  3. Im Feld „Klasse“ wähle ich Bedarf, Wunsch oder Zukunft.
  4. Ich verschiebe Kategorien mit den Pfeilen; „Reihenfolge gespeichert.“ erscheint.
  5. Ich öffne „Plan › Monat“ und sehe die Kategorie in der Gruppe; die Ansicht „Klassen“ gruppiert nach Klasse.
- **Ergebnis:** Struktur und Klasse sind gespeichert und wirken in Plan, Buchungs-Kategorien und Reports (z. B. 50/30/20).
- **Abnahmekriterien:**
  1. Eine neue Kategorie erscheint in Plan und im Kategorie-Auswahlfeld.
  2. Eine Änderung der Klasse verschiebt die Kategorie in die richtige Klassenzeile.
  3. Ohne Gruppe meldet die Seite „Noch keine Gruppen. Lege zuerst eine Gruppe an.“
  4. Ungespeicherte Änderungen werden beim Schließen mit einer Rückfrage geschützt.
  5. Bestehende Buchungen bleiben der Kategorie zugeordnet.
- **Status:** live — **Verweis:** Y06

### P-03 – Kategoriestruktur wie im Vorsystem
- **Story:** Als Nutzer möchte ich Gruppen und Kategorien wie in meiner früheren YNAB-Struktur wiederfinden (Reihenfolge, Einzelkategorien statt Sammelkategorien, versteckte Kategorien), damit ich mich nicht neu einarbeiten muss und alte Gewohnheiten weiter gelten.
- **Ausgangslage:** Die Struktur wurde bei der Übernahme am 02.10. zusammengelegt und passt nicht zu meiner Denkweise.
- **Ablauf:** Ablauf aus dem Issue (geplant), nicht in der Oberfläche auslösbar:
  1. Die Zuordnung je Teilbuchung und Monatszuweisung wird privat vorbereitet.
  2. Ein Probelauf auf einer Datenbankkopie prüft Salden, „Zu verteilen“ und Vermögen.
  3. Ich gebe den Lauf frei; vorher wird gesichert.
  4. Das Betreiber-Werkzeug spielt die neue Struktur live ein.
  5. Ich öffne „Plan › Monat“ und prüfe Gruppen und Reihenfolge.
- **Ergebnis:** Kategorien und Buchungen sind neu zugeordnet; Summen sind unverändert.
- **Abnahmekriterien:**
  1. Gruppen und Reihenfolge entsprechen der vereinbarten Vorlage.
  2. Salden, „Zu verteilen“ und Vermögen sind vor und nach dem Lauf identisch.
  3. Keine Buchung geht verloren; jede ist weiter einer Kategorie zugeordnet.
  4. Versteckte Kategorien erscheinen nicht im Plan, ihre Buchungen bleiben in den Konten sichtbar.
- **Status:** offen — **Verweis:** #969
- Fehlt noch: Probelauf, Freigabe und Live-Lauf; fehlende Werkzeug-Funktionen (Sortieren, Umbenennen, Ausblenden) als kleine PRs.

### P-04 – Vorschläge und „Leere füllen“
- **Story:** Als Nutzer möchte ich blasse Vorschläge (Ziel, Median) und „Leere füllen“ nutzen, damit ich den Monat mit wenigen Klicks vorbelege, ohne jede Kategorie einzeln zu tippen.
- **Ausgangslage:** Ein neuer Monat beginnt und viele Kategorien sind noch leer.
- **Ablauf:**
  1. Ich öffne „Plan › Monat“ für einen einzelnen Monat; leere Kategorien zeigen blasse Vorschläge.
  2. Ich öffne „Automatisch zuweisen“ (bzw. „Verteilen ▾“) und wähle „Wie letzter Monat“, „Ø 3 Monate“ oder „Ziel“.
  3. Die App zeigt die Vorschau der Beträge.
  4. Ich tippe „Leere füllen“. Die App weist nur leere Kategorien zu, in angezeigter Reihenfolge, solange Geld da ist.
  5. Ich kann alles mit „Rückgängig“ in einem Schritt zurücknehmen.
- **Ergebnis:** Die Zuweisungen sind gespeichert; es gibt eine Rückgängig-Gruppe.
- **Abnahmekriterien:**
  1. Ohne Klick auf „Leere füllen“ wird nichts gespeichert.
  2. Ist nicht genug Geld da, wird in Reihenfolge teilweise gefüllt; die Lücke bleibt sichtbar.
  3. Bei mehreren Monaten ist die Funktion mit „Nur bei einem Monat“ gesperrt.
  4. Gibt es nichts zu füllen, steht „Keine leere Kategorie mit Vorschlag“.
  5. „Rückgängig“ und „Wiederholen“ stellen den Stand her.
- **Status:** live — **Verweis:** Y09a

### P-05 – Geld verteilen, geführt
- **Story:** Als Nutzer möchte ich am Gehaltstag Schritt für Schritt Geld verteilen, damit ich keine Kategorie vergesse und am Ende weiß, dass jeder Euro eine Aufgabe hat.
- **Ausgangslage:** Das Gehalt ist da, „Zu verteilen“ ist positiv (oder es ist zu viel zugewiesen).
- **Ablauf:**
  1. Ich tippe in Heute bei „Als Nächstes“ auf „Verteilen“ oder in Plan › Monat auf „Geld verteilen“ (Menü „Verteilen“ › „Schritt für Schritt verteilen“).
  2. Schritt „Eingang prüfen“: gebuchte Einnahmen im Budgetmonat und erwartete Zahlungen werden gezeigt; nur Gebuchtes ist verteilbar.
  3. Schritt „Lücken“: unterfinanzierte und überzogene Kategorien werden aufgelistet.
  4. Schritt „Zuweisen“: Ich weise je Kategorie zu; „Zu verteilen jetzt“ sinkt mit.
  5. Schritt „Rest und Zusammenfassung“: ich sehe „Änderungen in diesem Durchgang“ und kann mit „Rückgängig“ zurücknehmen oder „Zurück zum Plan“ gehen.
- **Ergebnis:** Zuweisungen sind gespeichert; bei null steht „Jeder Euro hat einen Job.“
- **Abnahmekriterien:**
  1. Ein Fortschritt ist sichtbar; ein abgebrochener Durchgang lässt sich fortsetzen.
  2. Am Ende ist „Zu verteilen“ null oder der Rest wird genannt.
  3. Ist nichts zu verteilen, steht „Nichts zu verteilen.“
  4. Schlägt ein Schreibvorgang fehl, steht „Das hat nicht geklappt. Versuch es noch einmal.“ und es wird nichts doppelt gebucht.
  5. Auf dem Handy (390 px) ist jeder Schritt bedienbar.
- **Status:** live — **Verweis:** #1055, #1071
- Hinweis: #1055 ist im GitHub-Stand noch offen; #1071 (drei Kleinpunkte) ist geschlossen. Status vor Abnahme prüfen.

### P-06 – Überziehungen decken
- **Story:** Als Nutzer möchte ich überzogene Kategorien mit dem größten ausreichenden Vorschlag decken und mehrere per Sammelaktion teilweise decken, damit ich schnell ausgleiche, ohne Geld auf den Konten zu bewegen.
- **Ausgangslage:** Eine Kategorie ist überzogen (rot); Heute zeigt „N Kategorien überzogen“ mit „Decken“.
- **Ablauf:**
  1. Ich tippe in Heute auf „Decken“ oder öffne Plan › Monat mit dem Filter „Überzogen“ (Triage).
  2. Ich tippe bei einer Zeile „Decken“. Der Vorschlag nennt die Quelle („Mit … decken“, „Zu verteilen“ oder die Kategorie mit dem größten ausreichenden Guthaben).
  3. Alternativ wähle ich im Panel „Decken oder verschieben“ und gebe Betrag, Richtung „Hierher“ oder „Von hier weg“ an.
  4. Für mehrere: „Überzogene decken“ (Menü „Verteilen ▾“) bzw. „Alle aus <Quelle> decken“.
  5. Die App meldet „… von <Quelle> zu <Kategorie> verschoben“, bei Rest „… bleiben offen“.
- **Ergebnis:** Geld ist zwischen Kategorien verschoben; die Kontosumme bleibt gleich. Als eine Gruppe rückgängig machbar.
- **Abnahmekriterien:**
  1. Die Quelle wird benannt.
  2. Die Sammeldeckung ist mit „Rückgängig“ vollständig zurücknehmbar.
  3. Ist kein freies Geld da, ist die Aktion mit „Kein freies Geld zum Decken“ gesperrt.
  4. Eine Teildeckung nennt den Rest, der offen bleibt.
  5. Verweigert der Server (Regelverstoß), erscheint die deutsche Meldung als Hinweis.
- **Status:** live — **Verweis:** Y10

### P-07 – Zahlungskategorien für Kreditkarten
- **Story:** Als Nutzer möchte ich Kreditkarten und Barvorschüssen eine Zahlungskategorie zuordnen, damit Kartenkäufe Geld in die Zahlungskategorie schieben und die Kartenschuld gedeckt ist.
- **Ausgangslage:** Ich lege eine Kreditkarte an oder sehe eine Kartenschuld im Plan.
- **Ablauf:**
  1. Ich öffne „Einstellungen › Kategorien“ und lege eine Kategorie mit dem Feld „Kreditkarte“ an (Karte wählen).
  2. Ohne Kartenkonto steht der Hinweis „Lege zuerst ein Kreditkartenkonto an.“
  3. Ich buche einen Kauf mit der Karte in einer Ausgabenkategorie.
  4. In „Plan › Monat“ wandert der Betrag in die Zahlungskategorie der Karte.
  5. Ist die Ausgabenkategorie leer, zeigt der Plan „neue Kartenschuld“ statt einer Überziehung.
- **Ergebnis:** Die Zahlungskategorie führt das Geld für die Kartenrechnung; ungedeckte Käufe bleiben als Kartenschuld stehen.
- **Abnahmekriterien:**
  1. Jede Karte hat eine Zahlungskategorie.
  2. Ein gedeckter Kauf bewegt Geld dorthin; Verfügbar der Ausgabenkategorie sinkt.
  3. Ein ungedeckter Kauf erscheint als „davon neue Kartenschuld“ im Panel.
  4. Ohne Karte lässt sich keine Zahlungskategorie anlegen.
- **Status:** teilweise — **Verweis:** Y08
- Fehlt noch: Abgleich mit echten Karten und Zahlungssalden (Gate 2). Barvorschuss siehe P-07b.

### P-07b – Barvorschuss mit Gebühr
- **Story:** Als Nutzer möchte ich einen Barvorschuss mit der Kreditkarte als Umbuchung auf die Geldbörse erfassen, damit die Gebühr als Bankkosten getrennt steht.
- **Ausgangslage:** Ich habe mit der Kreditkarte Bargeld abgehoben. Die Bank hat eine Gebühr berechnet.
- **Ablauf:**
  1. Ich lege auf der Kreditkarte eine Buchung an und teile sie auf.
  2. Teil 1: Umbuchung auf die Geldbörse (Zielkonto wählen).
  3. Teil 2: die Gebühr, Kategorie aus der Gruppe „Bank und Gebühren“.
  4. Ich speichere.
- **Beispiel:** 200 € abgehoben, 4 € Gebühr. Die Karte bucht 204 €. 200 € gehen als Umbuchung auf die Geldbörse, 4 € stehen unter „Bank und Gebühren“.
- **Ergebnis:** Die Kartenschuld steigt um 204 €, die Geldbörse um 200 €, die Gebühr zählt als Ausgabe.
- **Abnahmekriterien:**
  1. Die Kartenschuld steigt um die Summe (204 €).
  2. Die Geldbörse steigt um den Barbetrag (200 €).
  3. Die Gebühr (4 €) erscheint unter „Bank und Gebühren“.
  4. Ein „Rückgängig“ nimmt beide Teile zurück.
- **Status:** live
- Code: Aufteilungszeilen können ein Zielkonto tragen (Umbuchungsteil, `transferAccountId` in `apps/web/src/ledger/api.ts`) und neben Kategorie-Teilen stehen. Keine neue Funktion nötig.

### P-08 – Monat als Wasserfall mit Triage
- **Story:** Als Nutzer möchte ich den Monat als Wasserfall (neun Stufen) mit Triage sehen, damit ich erkenne, welche Stufe als Nächstes Geld braucht und was dringend ist.
- **Ausgangslage:** Ich will wissen, wohin das Geld des Monats fließt und wo es fehlt.
- **Ablauf:**
  1. Ich öffne „Plan › Monat“ und wähle im Segment „Ansicht“ den Wasserfall (bzw. „Wasserfall-Stufen“ im Monatsüberblick).
  2. Ich lese je Stufe Ziel und Deckung.
  3. Ich tippe „Stufe füllen“; die App weist die Stufe aus „Zu verteilen“ zu.
  4. Ich wähle den Filter „Braucht Aufmerksamkeit“ bzw. „Überzogen“ (Triage). Dringendes steht zuerst.
- **Ergebnis:** Eine gefüllte Stufe ist als Zuweisung gespeichert; „Rückgängig“ möglich.
- **Abnahmekriterien:**
  1. Die neun Stufen stehen in der vereinbarten Reihenfolge.
  2. Die Triage zeigt überzogene Kategorien vor unterfinanzierten.
  3. Ohne Einnahmen im Monat steht „Ohne Einnahmen im Monat gibt es keine Anteile.“
  4. „Stufe füllen“ ist bei „Nichts zu verteilen“ gesperrt.
- **Status:** live — **Verweis:** Y09

### P-09 – Wiederkehrende Zahlungen
- **Story:** Als Nutzer möchte ich wiederkehrende Zahlungen (wöchentlich bis jährlich) mit Versionen und Fälligkeiten pflegen, damit Abbuchungen und Eingänge erwartet werden und verpasste Zahlungen auffallen.
- **Ausgangslage:** Ein Abo, eine Miete oder ein Gehalt kommt regelmäßig.
- **Ablauf:**
  1. Ich öffne „Plan › Wiederkehrende Zahlungen“ (`/plan/erwartet`; Ansichten „Anstehend“, „Kalender“, „Verträge und Abos“).
  2. Ich wähle „Wiederkehrende Zahlung anlegen“, fülle „Art der Zahlung“ (Ausgabe/Einnahme), Betrag, Konto, Kategorie, „Rhythmus“ und „Start“ und speichere.
  3. Ich öffne eine Zahlung: „Nächste Termine“ und „Letzte Fälligkeiten“ erscheinen.
  4. Ich wähle „Neue Version“ (Betrag „Gilt ab“), „Zahlung pausieren“ oder „Zahlung beenden“.
  5. Bei Abbuchung ordne ich mit „Buchung verknüpfen“ eine Buchung zu.
- **Ergebnis:** Die Zahlung steht im Plan und in der Prognose; die Aktion ist als Ganzes „Rückgängig“ machbar.
- **Abnahmekriterien:**
  1. Anlegen, ändern, beenden funktionieren; „Zahlung löschen“ fragt nach.
  2. Eine zugeordnete Buchung und eine verpasste Zahlung sind sichtbar (Soll/Ist/Abweichung).
  3. Ein Betrag ≤ 0 wird mit „Bitte einen Betrag über 0 eintragen.“ abgelehnt.
  4. Fälligkeitstag 31 gilt als letzter Tag des Monats.
  5. Eine Version „Gilt ab“ ändert nur künftige Termine.
- **Status:** live — **Verweis:** Y11

### P-09a – Close an unpaid income occurrence (#1109)

- **Story:** As a user, I want to mark an expected income occurrence as “Kommt nicht mehr” so that an inflow that will not arrive stops inflating my forecast.
- **Flow:** Open Plan › Monat › Einnahmen (also reachable from Plan › Zahlungen), choose “Kommt nicht mehr” on an unlinked occurrence, and inspect its retained “Fehlbetrag”. “Rückgängig” restores the expectation through the existing audited action.
- **Acceptance:** The closed occurrence is excluded from expected totals, Heute's free-until-payday inflows and the liquidity forecast. Its original expected cents remain visible as a shortfall, including amount privacy. Other occurrences, bookings, balances, net worth and “Zu verteilen” are unchanged. A linked booking cannot be cancelled through this action.
- **Summary continuation (#1109):** The monthly expected total and income-type totals show received household income plus unresolved occurrence remainders. Closing an unpaid occurrence removes only its open amount; received income remains counted, and Undo restores the open amount. Overpayments cannot produce a negative remainder; unresolved partial payments retain their shortfall. Original occurrence amounts and deviation labels remain visible. Bookings outside the month/as-of scope retain the existing comparison behavior.
- **Status:** First slice merged in #1113; summary continuation for review; not live-accepted. Uses the existing single-occurrence cancellation within its supported window (previous month through twelve months ahead); no migration.
- **Remaining #1109:** Combined-payment proposal and confirmation, automatic regular/special payslip settlement, closing a linked partial payment, explained-deviation settlement/labels, and outstanding monthly contact compensation claims. These are not delivered by this slice.

### P-10 – Sparziele und Rücklagen
- **Story:** Als Nutzer möchte ich Sparziele und Rücklagen führen und Kategorieziele übernehmen, damit ich sehe, wie weit ich bin und wie viel ich monatlich zurücklegen muss.
- **Ausgangslage:** Ich spare auf etwas mit Betrag und Datum.
- **Ablauf:**
  1. Ich öffne „Plan › Sparziele“ (`/plan/sparziele`) und tippe „Neues Sparziel“.
  2. Ich fülle „Name“, „Ziel“ (Betrag), „Zieldatum“, „Kategorie“ und „Verknüpft mit“ (Konto) und tippe „Anlegen“.
  3. Die Liste zeigt „Gespart“, „Fehlt“, „Nötige künftige Rate“ und Fortschritt.
  4. Mit „Ziel abstimmen“ gleiche ich einen Stand mit der Kategorie ab.
  5. In Plan › Monat sehe ich die Rate im Monat; „Ziele finanzieren“ in Heute führt hierher.
- **Ergebnis:** Das Ziel ist gespeichert und erscheint in Heute, Plan und Reports.
- **Abnahmekriterien:**
  1. Ziel mit Betrag und Datum anlegen; der Fortschritt wird angezeigt.
  2. Ohne Name, Ziel über 0 oder Kategorie meldet das Formular „Bitte … eintragen/wählen.“
  3. Ohne Sparziele steht „Noch keine Sparziele“.
  4. Ein Ziel ohne Datum zeigt „ohne Datum“ und keine Rate.
  5. Ein erreichtes Ziel steht als „Erreicht“.
- **Status:** live — **Verweis:** Y12

### P-11 – Jahresplanung mit Ereignissen
- **Story:** Als Nutzer möchte ich in Plan › Jahr geplante Ereignisse pflegen und im Szenario durchrechnen, damit ich große Ausgaben (Urlaub, Reparatur) vorausplane und sehe, ob das Geld bis Jahresende reicht.
- **Ausgangslage:** Eine große Ausgabe oder Einnahme steht im Jahr an.
- **Ablauf:**
  1. Ich öffne „Plan › Jahr“ (`/plan/jahr`); zwölf Monate und Kennzahlen stehen in der Tabelle.
  2. Ich wähle „Ereignis planen“ und fülle „Art“ (Ausgabe/Einnahme), „Betrag je Termin“, „Datum / Beginn“, „Budget-Konto“, Kategorie und Wiederholung (Einmalig, Monatlich, Quartalsweise, Jährlich, Bestimmte Monate).
  3. Ich tippe „Ereignis speichern“; „Ereignis gespeichert.“ erscheint.
  4. Im Szenario („Plan“ / „Plan ohne Auswahl“) wähle ich Ereignisse ab; die Zeile „Geld bis Jahresende“ zeigt die Wirkung.
  5. Ich kann ein Ereignis „Ereignis bearbeiten“ oder entfernen („Ereignis samt Wiederholungen entfernen?“) und mit „Rückgängig“ zurückholen.
- **Ergebnis:** Das Ereignis ist gespeichert; das Szenario ändert nichts am Plan und bucht kein Geld.
- **Abnahmekriterien:**
  1. Anlegen, bearbeiten, entfernen und rückgängig machen funktionieren.
  2. Zwölf Monate sind sichtbar; ein Jahreswechsel ist über „Vorjahr“/„Nächstes Jahr“ möglich.
  3. Ein ungültiger Betrag meldet „Ungültiger Betrag“.
  4. Das Szenario überschreibt gespeicherte Werte nicht; ohne Auswahl gilt der gespeicherte Plan.
  5. Ungespeicherte Angaben werden mit Rückfrage geschützt.
- **Status:** teilweise — **Verweis:** Y14
- Fehlt noch: Abnahme durch den Nutzer (Gerät und Optik); keine Hochrechnung zusätzlicher Einnahmen.

### P-12 – Ruhigerer Plan und Buchungsliste
- **Story:** Als Nutzer möchte ich Plan und Buchungen ruhiger und fokussierter, damit mich Farben und Details nicht ablenken und ich Probleme schneller sehe.
- **Ausgangslage:** Ich arbeite länger im Plan oder in der Buchungsliste und werde von vollen Kategorien und unruhigen Zeilen abgelenkt.
- **Ablauf:** (geplant, fünf kleine Verbesserungen laut Issue)
  1. In „Plan › Monat“ zeigen voll gedeckte Kategorien nur eine leere, farblose Spur; Farbe nur bei fehlendem oder überzogenem Geld.
  2. Am Desktop färbt sich die Zeile beim Darüberfahren dezent ein.
  3. Der Filter „Braucht Aufmerksamkeit“ zeigt nur überzogene und unter Ziel liegende Kategorien; Gruppen mit Treffern bleiben sichtbar.
  4. Beim Abwärtsscrollen klappt die Monatsleiste ein, beim Hochscrollen kommt sie wieder.
  5. In „Alle Buchungen“ sind geprüfte Buchungen leicht gedimmt, unkategorisierte deutlich markiert.
- **Ergebnis:** Nur Darstellung; keine Logikänderung.
- **Abnahmekriterien:**
  1. Voll gedeckte Kategorien tragen keine Farbe, überzogene bleiben rot.
  2. Der Filter „Braucht Aufmerksamkeit“ lässt sich mit „Filter entfernen“ wieder aufheben.
  3. Die Monatsleiste ist nach Hochscrollen wieder sichtbar.
  4. Hell/dunkel, Desktop und iPhone gleich lesbar.
- **Status:** offen — **Verweis:** #992
- Fehlt noch: Punkt 3 (Filter „Braucht Aufmerksamkeit“) existiert im Plan bereits; Punkte 1, 2, 4, 5 sind laut Issue offen und im Code zu prüfen.
