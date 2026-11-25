# User-Stories – Monatsabschluss

Bereich 08. Gesamtkatalog, Status- und Verweis-Legende: `docs/USER-STORIES.md`. Stand: 15.11.2026.
Bildschirm: `/monatsabschluss/<Monat>` (z. B. 2026-10). Einstieg: Plan › Kopfzeile „Monat abschließen“ oder Plan-Menü „Monatsabschluss starten oder fortsetzen“, außerdem die Suche („Monatsabschluss starten“). Der Abschluss sperrt keine Buchungen und bucht nichts von selbst.

### M-01 – Monat in fünf geführten Schritten prüfen
- **Story:** Als Nutzer möchte ich den Monat in fünf geführten Schritten abarbeiten, damit nach dem Monatsende Buchungen, Kontostände und Kategorien stimmen und ich nichts vergesse.
- **Ausgangslage:** Der Monat ist zu Ende (oder der Nutzer bereitet ihn vor). Es gibt offene Buchungen, Kontostände zum Prüfen oder überzogene Kategorien.
- **Ablauf:**
  1. Nutzer öffnet Plan und klickt „Monat abschließen“. Die App zeigt oben die Fortschrittsleiste „n von 5 Schritten mit Aufgaben bearbeitet“ und den Stichtag.
  2. Schritt 1: Er ordnet offene Buchungen zu und prüft Vorschläge im eingebetteten Prüfen-Block („n offene Aufgaben im Monat“).
  3. Schritt 2: Er vergleicht die Kontostände zum Stichtag. Liegt ein passender Bankstand vor, sieht er Datum, Betrag und Differenz; bei Übereinstimmung bestätigt er mit „Abgleich sperren bis heute“ in einem Klick. Bei Differenz öffnet „Kontostand prüfen“ die bestehende Prüfung mit vorbelegtem Bankstand. Ohne passenden Bankstand bleibt die manuelle Eingabe erhalten. Manuelle Anlagen nutzen „Wert aktualisieren“; unveränderte Konten lassen sich mit „Gemeinsam bestätigen“ prüfen.
  4. Schritt 3: Er öffnet „Überzogene decken“, prüft die gemeinsame Plan-Vorschau mit Quellen, Zielkategorien, Beträgen und offenem Rest und bestätigt „Deckung anwenden“. Alternativ klickt er je Kategorie „Geld verschieben“ oder wählt „Übertrag akzeptieren · Grund angeben“.
  5. Mit „Weiter“ geht er zum nächsten Schritt; „Verlassen“ geht zurück zum Plan. „Weiter“ bleibt gesperrt, solange der Schritt offen ist.
  6. Jeder Schritt zeigt „Warum“ und „Danach“; „nichts offen“ erscheint bei Schritten ohne Aufgaben.
- **Ergebnis:** Schritte 1–3 sind erledigt oder mit Grund übersprungen, der Fortschritt ist gespeichert. Buchungen, Kontoprüfungen und Verschiebungen sind echte, einzeln rückgängig machbare Änderungen.
- **Abnahmekriterien:**
  1. Alle Schritte sind abhakbar; Fortschritt und aktueller Schritt bleiben nach Neuladen erhalten.
  2. „Weiter“ ist gesperrt, solange der Schritt offen ist und kein Grund gespeichert wurde.
  3. Kommt nach dem Erledigen eine neue oder geänderte Aufgabe dazu, öffnet sich der Schritt wieder.
  4. Liegt der Stichtag noch in der Zukunft, steht „Der Monatsletzte steht noch bevor. Du kannst vorbereiten und später fortsetzen.“
  5. Lädt der Schritt nicht, zeigt die App eine Fehlermeldung mit Wiederholen statt eines leeren Schritts.
  6. Bankstände werden nur für den passenden Stichtag vorbelegt. Jede Bestätigung prüft die Abschlussrevision und bleibt gemeinsam rückgängig; Differenzen erzeugen keinen automatischen Ausgleich.
  7. Bei verbleibender Differenz zeigt Schritt 2 den Betrag neben „Ausgleich buchen und abschließen“. Ein ausdrücklicher Klick erstellt Ausgleich und Kontoprüfung gemeinsam. Unter dem anfangs zugeklappten „Mehr“ bleiben Grund (optional, leer ohne Platzhalter) und Ausgleichsdatum verfügbar. Bereits geprüfte Zeiträume verlangen weiterhin die ausdrückliche Freigabe. Einmal Rückgängig entfernt Ausgleich und Kontoprüfung gemeinsam.
  8. Schritt 3 verwendet dieselbe Sammeldeckung und Vorschau wie das Plan-Menü; erst die Bestätigung schreibt eine gemeinsam rückgängig machbare Audit-Gruppe. Eine geänderte Grundlage erfordert eine neue Vorschau. Ohne Überziehung erscheint „Keine Kategorie ist überzogen.“ ohne Sammelaktion.
- **Ergänzter Ablauf (#1163):** Nach dem Vergleich in Schritt 2 kann der Nutzer die sichtbare Differenz direkt mit „Ausgleich buchen und abschließen“ bestätigen oder zuvor „Mehr“ öffnen.
- **Status:** live (Stand 26.11.2026: alle verknüpften Issues erledigt; Nutzerabnahme offen) — **Verweis:** Y24, #1095, #1163, #1096 (Sammeldeckung implementiert; Live-Abnahme offen)
  Fehlt noch: Einbindung der Hintergrundaufgabe „Job E“ und die Abnahme im Parallelbetrieb durch den Nutzer (Gate 4); die anderen Routinen siehe M-03.

### M-01a – Offene Arbeit mit Grund aufschieben
- **Story:** Als Nutzer möchte ich einen offenen Punkt bewusst mit Begründung stehen lassen, damit ich den Monat trotzdem weiterführen kann und später nachvollziehe, warum etwas offen blieb.
- **Ausgangslage:** Ein Schritt hat offene Einträge, die jetzt nicht lösbar sind (z. B. Beleg fehlt, Überziehung wird übertragen).
- **Ablauf:**
  1. Nutzer klickt im Schritt auf „Rest ausdrücklich aufschieben“ (Schritt 1), „Nicht nötig · Grund angeben“ (Schritt 2, je Konto) oder „Übertrag akzeptieren · Grund angeben“ (Schritt 3).
  2. Die App zeigt das Feld „Grund“ und nennt, wie viele offene Einträge unverändert bleiben.
  3. Er trägt den Grund ein und klickt „Grund speichern“. Ohne Text ist der Knopf gesperrt.
  4. Der Schritt steht auf „übersprungen mit Grund“ und der Grund ist sichtbar.
- **Ergebnis:** Die Ausnahme ist gespeichert (rückgängig machbar). Die Einträge bleiben offen und sichtbar; es wurde nichts gebucht oder verschoben.
- **Abnahmekriterien:**
  1. „Grund speichern“ ist ohne Text gesperrt.
  2. Der gespeicherte Grund steht beim Schritt („übersprungen mit Grund: …“).
  3. Ändert sich die Arbeit danach, wird die Ausnahme ungültig und der Schritt öffnet sich wieder.
  4. „Rückgängig“ entfernt die Ausnahme.
- **Status:** live — **Verweis:** Y24

### M-01b – Monat abschließen und Stand merken
- **Story:** Als Nutzer möchte ich nach der Prüfung den Monat als abgeschlossen markieren, damit klar ist, bis wann alles geprüft ist, ohne dass ich danach gesperrt bin.
- **Ausgangslage:** Schritte 1–3 sind erledigt oder mit Grund übersprungen, Schritt 4 ist verteilt (Zu verteilen im Folgemonat = 0). Der Nutzer ist in Schritt 5.
- **Ablauf:**
  1. Nutzer klickt in Schritt 4 auf „Weiter“ und landet in Schritt 5. Die App zeigt „Aktuelles Ergebnis“ des Monats: geprüfte Konten, verteiltes Einkommen, offene Überziehungen, Sparquote, Ausgaben vs. Plan.
  2. Er prüft „Verteilung 50/30/20“, „Die drei größten Abweichungen“ und „Diese Regelbefunde bleiben offen“.
  3. Er klickt „Monat abschließen“ (bei schon abgeschlossenem Monat „Geprüften Stand erneut speichern“).
  4. Die App speichert das Datum des Abschlusses und meldet „Monat abgeschlossen. Der geprüfte Stand ist gespeichert.“
- **Ergebnis:** Ein Abschlussdatum ist gespeichert. Buchungen bleiben bearbeitbar; spätere Änderungen öffnen Schritte wieder, das Datum bleibt als Historie.
- **Abnahmekriterien:**
  1. Abschluss ist nur möglich, wenn Schritte 1–3 erledigt oder mit Grund aufgeschoben sind und Schritt 4 auf Zu verteilen = 0 steht; sonst lehnt die App ab.
  2. Vor dem Monatsende ist der Abschluss nicht möglich.
  3. Zweimal klicken ergibt keinen zweiten Eintrag; es steht „Dieser Abschlussstand ist bereits gespeichert.“
  4. „Rückgängig“ nimmt das Abschlussdatum zurück.
  5. Ohne Einkommen zeigt die Sparquote „Ohne Einkommen nicht berechenbar“ statt 0 %.
- **Status:** teilweise — **Verweis:** Y24
  Fehlt noch: Abnahme im Parallelbetrieb mit einem echten Monat durch den Nutzer (Gate 4).

### M-02 – Entwurf für den Folgemonat und 50/30/20 übernehmen
- **Story:** Als Nutzer möchte ich nach der Prüfung einen Plan-Entwurf für den nächsten Monat mit 50/30/20-Verteilung bekommen, damit ich den Folgemonat in Minuten statt bei null verteile.
- **Ausgangslage:** Schritte 1–3 sind durch. Im Folgemonat ist Geld zu verteilen oder es steht ein erwartetes Einkommen an.
- **Ablauf:**
  1. Nutzer öffnet Schritt 4. Die App zeigt „Bedarf, Wunsch und Zukunft“ als 50/30/20-Balken, „Wiederkehrende Zahlungen im nächsten Monat“ und „Plan je Kategorie“ mit Plan Vormonat, Ist Vormonat, Ø 12 Monate, Nächster Plan.
  2. Er klickt je Gruppe oder für alle auf „wie Vormonat“ oder „Durchschnitt“. Das ändert nur den Entwurf.
  3. Er passt Beträge im Feld „Nächster Plan“ an. Für die separate Gehaltstag-Verteilung bietet Plan › Geld verteilen „Wie letzter Monat“ und „Ø 3 Monate“ als bearbeitbare Vorschau für Kategorien ohne Ziel (#1097).
  4. Er klickt „Plan übernehmen“ (oder „· alle“). Die App schreibt die Zuweisungen in den Folgemonat.
  5. Mit „Entwurf verwerfen“ verwirft er den Entwurf. Beim Verlassen mit offenem Entwurf fragt „Entwurf behalten?“ nach.
- **Ergebnis:** Die Zuweisungen stehen im nächsten Monat und sind als eine Gruppe rückgängig machbar. Erwartetes Einkommen wird nicht gebucht und nicht zugewiesen.
- **Abnahmekriterien:**
  1. Der Entwurf ist nach „Plan übernehmen“ im Plan des Folgemonats sichtbar.
  2. Verteilt der Entwurf mehr Geld als vorhanden ist, steht „Der Entwurf verteilt mehr Geld, als vorhanden ist. Nimm Zuweisungen zurück.“ und „Plan übernehmen“ ist gesperrt.
  3. Negative oder ungültige Beträge werden mit „Bitte gültige Beträge eingeben. Neue Pläne dürfen nicht negativ sein.“ abgelehnt.
  4. Ein „Rückgängig“ nimmt alle Zuweisungen der Gruppe gemeinsam zurück.
  5. Ohne Kategorien steht „Lege zuerst Kategorien im Plan an.“
- **Status:** teilweise — **Verweis:** Y24
  Ergänzung #1097: Assistenten-Vorlagen implementiert, Abnahme offen. Sie speichern erst mit „Vorlage zuweisen“, gemeinsam rückgängig machbar; fehlende historische Werte werden begründet. Die Monatsabschluss-Vorlagen behalten ihren bisherigen Ablauf.
  Fehlt noch: Abnahme durch den Nutzer; Hintergrundaufgabe „Job E“ noch nicht eingebunden.

### M-03 – Wochen-, Quartals- und Jahresroutinen
- **Story:** Als Nutzer möchte ich neben dem Monatsabschluss feste Routinen für Woche, Quartal und Jahr haben, damit regelmäßige Prüfungen nicht an meinem Gedächtnis hängen.
- **Ausgangslage:** Heute gibt es nur den Monatsabschluss; Wochen-Prüfen, Gehaltstag-Verteilung, Quartals- und Jahresabschluss sind laut FEATURES nicht gebaut.
- **Ablauf:** Entfällt. Es gibt keine eigenen Wochen-, Quartals- oder Jahresroutinen. Quartals- und Jahresberichte ergeben sich aus den Monatsabschlüssen (Monatsabschluss unter Reports).
- **Ergebnis:** Keines; die Story entfällt.
- **Abnahmekriterien:**
  1. Jede Routine ist über einen sichtbaren Einstieg abrufbar.
  2. Eine Routine ohne offene Punkte zeigt „nichts offen“ statt einer leeren Seite.
  3. Der Abschluss einer Routine ist wie beim Monat rückgängig machbar.
- **Status:** entfällt — **Verweis:** Y24
  Grund: Keine eigenen Routinen; Quartal und Jahr folgen aus den Monatsabschlüssen (Entscheidung 15.11.2026).
