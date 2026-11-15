# User-Stories – Konten und Buchungen

Bereich: Konten (`/konten`, `/konten/$id`), Alle Buchungen (`/konten/buchungen`), Prüfen (`/konten/pruefen`), Zuordnungsregeln (Einstellungen). Status und Verweise wie in `docs/USER-STORIES.md`.

### K-01 – Konten nach Gruppen sehen und sortieren
- **Story:** Als Nutzer möchte ich meine Konten nach Gruppen (Budget-Konten, Kreditkarten, Kredite, Investments) sehen und die Reihenfolge ziehen, damit die Übersicht und die Seitenleiste meine eigene Ordnung zeigen und Schulden nicht mit Guthaben vermischt werden.
- **Ausgangslage:** Ich öffne die App oder lege ein neues Konto an.
- **Ablauf:**
  1. Ich öffne „Konten“ (`/konten`). Die Gruppen stehen in fester Reihenfolge, je Konto Saldo und Prüfstand.
  2. Ich tippe „Konto anlegen“, fülle Name, Typ, Anfangssaldo mit Datum und speichere.
  3. Ich tippe „Reihenfolge ändern“ in den Kontenaktionen.
  4. Ich ziehe ein Konto an die neue Stelle (oder verschiebe es mit den Pfeiltasten) und beende die Bearbeitung.
  5. Die App meldet „Reihenfolge der Konten gespeichert.“ und zeigt sie auch in der Seitenleiste.
- **Ergebnis:** Die Reihenfolge ist gespeichert und gilt auf allen Geräten.
- **Abnahmekriterien:**
  1. Gruppen stehen in fester Reihenfolge; Konten sind innerhalb der Gruppe per Ziehen sortierbar.
  2. Schulden erscheinen als Schulden (Minus, eigene Gruppe).
  3. Ein geschlossenes Konto bleibt über „Geschlossene Konten“ erreichbar und verschwindet nicht.
  4. Schlägt das Speichern fehl, springt die Reihenfolge zurück und eine Meldung erscheint.
- **Status:** live — **Verweis:** Y01

### K-02 – Kontoregister direkt bearbeiten
- **Story:** Als Nutzer möchte ich im Kontoregister Datum und Betrag direkt in der Zeile ändern und Status und Markierungen sehen, damit ich Buchungen schnell pflege, ohne jedes Mal einen Dialog zu öffnen.
- **Ausgangslage:** Ich sehe in einem Konto einen falschen Betrag oder ein falsches Datum.
- **Ablauf:**
  1. Ich öffne ein Konto unter „Konten“ und scrolle zur Tabelle „Buchungen“.
  2. Ich tippe auf das Datum oder den Betrag einer Zeile; das Feld wird editierbar.
  3. Ich tippe den neuen Wert und bestätige mit Enter (Escape verwirft).
  4. Die App speichert und aktualisiert Saldo und Zeile; Status (vorgemerkt/bestätigt/geprüft) und Markierungen bleiben sichtbar.
  5. Über „Status“ filtere ich nach vorgemerkt oder bestätigt.
- **Ergebnis:** Die Buchung ist geändert; Saldo, Plan und Heute folgen.
- **Abnahmekriterien:**
  1. Die Inline-Änderung wirkt sofort in der Zeile und im Saldo.
  2. Statussymbole und Markierungen sind sichtbar.
  3. Eine geprüfte (gesperrte) Buchung lässt sich nicht still überschreiben; die App erklärt die Sperre.
  4. Ein ungültiger Betrag wird abgelehnt, der alte Wert bleibt.
  5. Auf dem Handy lässt sich die Zeile antippen und bearbeiten.
- **Status:** live — **Verweis:** Y02

### K-03 – Saldenverlauf mit Vorschau
- **Story:** Als Nutzer möchte ich in einem Konto den Saldoverlauf mit Vorschau auf Geplantes sehen, damit ich künftige Kontostände abschätze und merke, wenn ein Limit berührt wird.
- **Ausgangslage:** Ich will wissen, wie sich ein Konto in den nächsten Wochen entwickelt.
- **Ablauf:**
  1. Ich öffne ein Konto unter „Konten“; oben steht „Saldoverlauf“.
  2. Ich wähle über „Saldoverlauf Zeitraum“ bzw. „Kontovorschau Zeitraum“ die Dauer (0 bis 365 Tage).
  3. Ich fahre mit dem Fadenkreuz über die Kurve und lese Datum und Saldo.
  4. Ich öffne „Werte als Tabelle“ für die Tageswerte.
- **Ergebnis:** Nur Anzeige. Geplante und wiederkehrende Beträge sind als Vorschau eingerechnet.
- **Abnahmekriterien:**
  1. Der Verlauf ist von 0 bis 365 Tagen wählbar.
  2. Limit (Dispolimit/Kreditrahmen) und Fadenkreuz sind sichtbar.
  3. Bei 0 Tagen gibt es keine Vorschau, nur den Ist-Verlauf.
  4. Fehlen Zuordnungen, steht „Teilprognose · fehlende Konto-Zuordnung“ statt einer scheinbar vollständigen Kurve.
- **Status:** live — **Verweis:** Y02

### K-04 – Einnahmen und Ausgaben erfassen
- **Story:** Als Nutzer möchte ich Einnahmen und Ausgaben schnell erfassen, damit Bargeld sofort als bestätigt gilt und Kontostände, Plan und Heute stimmen.
- **Ausgangslage:** Ich habe Bargeld ausgegeben oder eine Zahlung ist noch nicht auf dem Konto.
- **Ablauf:**
  1. Ich tippe in „Alle Buchungen“ auf „Buchung erfassen“ (oder den Plus-Knopf).
  2. Ich wähle „Art der Buchung“ (Ausgabe, Einnahme, Umbuchung), „Konto“, „Datum“ und „Betrag“.
  3. Ich wähle „Empfänger“ (Suchen oder neu anlegen) und Kategorie; optional „Projekt“, Notiz, „Belege“.
  4. Bei einem Bargeld-Konto steht „Bargeldbuchungen sind sofort bestätigt“, sonst startet die Buchung „Vorgemerkt“.
  5. Optional wähle ich bei „Wiederholen“ Wöchentlich, Monatlich, Vierteljährlich oder Jährlich; die App legt eine wiederkehrende Zahlung an.
  6. Ich tippe „Buchung speichern“.
- **Ergebnis:** Die Buchung steht im Konto und in „Alle Buchungen“; mit „Wiederholen“ zusätzlich in Plan › Wiederkehrende Zahlungen.
- **Abnahmekriterien:**
  1. Eine neue Bankbuchung startet „vorgemerkt“, eine Bargeldbuchung „bestätigt“.
  2. „Wiederholen“ legt Buchung und Plan gemeinsam an (alles oder nichts).
  3. Ohne Konto meldet das Formular „Bitte ein verfügbares Konto wählen.“
  4. Beim Schließen mit Eingaben fragt „Eingaben verwerfen?“.
  5. Die Buchung ist über „Rückgängig“ bzw. „Buchung löschen?“ wieder entfernbar.
- **Status:** live — **Verweis:** Y03

### K-05a – Splitbuchung
- **Story:** Als Nutzer möchte ich eine Buchung auf mehrere Kategorien aufteilen, damit ein Einkauf mit gemischtem Inhalt in den richtigen Envelopes landet.
- **Ausgangslage:** Ein Beleg enthält Lebensmittel und Haushaltswaren.
- **Ablauf:**
  1. Ich öffne „Buchung erfassen“ oder bearbeite eine Buchung.
  2. Ich tippe „Kategorie hinzufügen“ und erhalte eine zweite Zeile (Betrag · Kategorie · Teilen).
  3. Ich verteile den Betrag; „Zu verteilen“ zeigt den Rest.
  4. Optional markiere ich eine Zeile mit „Für Kontakt auslegen“ oder „Rückzahlung von Kontakt“.
  5. Ich speichere, sobald der Rest 0,00 € ist.
- **Ergebnis:** Die Buchung hat mehrere Teilbuchungen; jede wirkt auf ihren Envelope.
- **Abnahmekriterien:**
  1. Speichern ist gesperrt, bis die Summe aufgeht („Speichern geht erst, wenn der Rest 0,00 € ist.“).
  2. Eine Zeile lässt sich mit „Entfernen“ löschen.
  3. Negative Teilbeträge bei Ausgaben werden korrekt abgebildet.
  4. Plan zeigt die Aktivität je Kategorie.
- **Status:** live — **Verweis:** Y04

### K-05b – Kontoumbuchung
- **Story:** Als Nutzer möchte ich Geld zwischen eigenen Konten umbuchen, damit weder Einnahme noch Ausgabe entsteht und beide Salden stimmen.
- **Ausgangslage:** Ich überweise vom Girokonto aufs Sparkonto oder hebe Bargeld ab.
- **Ablauf:**
  1. Ich tippe „Buchung erfassen“ und wähle „Umbuchung“.
  2. Ich wähle „Von Konto“ und „Konto“ (Ziel), Datum und Betrag.
  3. Ich speichere. Die App legt beide Seiten als eine Umbuchung an.
  4. Beim Löschen warnt die App: „Diese Umbuchung wird mit allen verbundenen Seiten gelöscht.“
- **Ergebnis:** Beide Konten ändern sich um denselben Betrag; die Umbuchung hat keine Kategorie und zählt nicht als Ausgabe.
- **Abnahmekriterien:**
  1. Beide Salden ändern sich gleichzeitig.
  2. Gleiches Konto als Quelle und Ziel ist nicht möglich.
  3. Löschen entfernt beide Seiten.
  4. Der Plan zeigt keine Aktivität für die Umbuchung.
- **Status:** live — **Verweis:** Y04

### K-05c – Sammelaktion auf mehrere Buchungen
- **Story:** Als Nutzer möchte ich mehrere Buchungen auf einmal ändern, damit ich z. B. 20 Zeilen in einem Schritt kategorisiere statt einzeln.
- **Ausgangslage:** Mehrere Buchungen brauchen dieselbe Kategorie, denselben Status oder Empfänger.
- **Ablauf:**
  1. Ich öffne „Alle Buchungen“ und tippe „Auswählen“.
  2. Ich hake die Zeilen an (höchstens 500).
  3. In der Leiste „Sammeländerung“ wähle ich „Kategorie“, „Status“, „Projekt“, „Datum ändern“, „Empfänger ändern“ oder „Notiz ändern“.
  4. Die App wendet die Änderung an und zeigt „Ergebnis der Sammeländerung“.
  5. Ich tippe „Fertig“ bzw. „Auswahl beenden“.
- **Ergebnis:** Alle gewählten Buchungen sind geändert; die Aktion ist als Gruppe rückgängig machbar.
- **Abnahmekriterien:**
  1. Die Sammelaktion wirkt auf alle gewählten Zeilen.
  2. Über 500 Zeilen wird abgewiesen: „Höchstens 500 Buchungen pro Sammeländerung auswählen.“
  3. Gesperrte (geprüfte) Buchungen werden nicht stillschweigend geändert; das Ergebnis nennt sie.
  4. Ist eine Buchung inzwischen weg, steht „Buchung nicht mehr verfügbar“.
- **Status:** live — **Verweis:** Y04

### K-06 – Kontostand prüfen und sperren
- **Story:** Als Nutzer möchte ich den App-Saldo mit dem Kontostand meiner Bank vergleichen und bestätigte Buchungen sperren, damit ein geprüfter Stand fix bleibt und nicht versehentlich verändert wird.
- **Ausgangslage:** Ich habe den Kontoauszug oder Bankstand vor mir, oder die App meldet „Konten prüfen“.
- **Ablauf:**
  1. Ich öffne ein Konto und tippe „Kontostand prüfen“ (oder in Heute „Konten prüfen“ › „Abgleichen“).
  2. Im Dialog „Kontostand prüfen · <Konto>“ gebe ich „Saldo laut Bank“ und „Stichtag“ ein (Schuld als Minus).
  3. Die App zeigt „App-Saldo gebucht“ und „Differenz“; Vorgemerktes wird nicht gezählt.
  4. Bei Differenz prüfe ich „Kandidaten zuerst prüfen“ (mögliche doppelte Buchung, fehlende Buchung) oder gebe „Grund für den Ausgleich“ und „Kategorie für den Ausgleich“ an.
  5. Ich tippe „Bestätigen“. Passt der Stand, sperrt die App die bestätigten Buchungen bis zum Stichtag („bis heute“ ist die Obergrenze).
- **Ergebnis:** Prüfstand und Sperre sind gespeichert; die Kontoübersicht zeigt „Prüfstand“ mit Datum; Änderung nur mit Entsperrung, rückgängig machbar.
- **Abnahmekriterien:**
  1. Bankstand, Datum und Abrufzeit sind sichtbar.
  2. Passt der Stand, sperrt „Bestätigen“ bis heute.
  3. Ein Stichtag in der Zukunft wird abgewiesen („Geprüft wird höchstens bis heute.“).
  4. Ein ungültiger Betrag meldet „Bitte einen gültigen Betrag eingeben.“
  5. Bei Differenz ohne Ausgleichsgrund wird nicht gesperrt.
- **Status:** live — **Verweis:** Y05

### K-07 – Zuordnungsregeln („Immer so zuordnen“)
- **Story:** Als Nutzer möchte ich Zuordnungsregeln pflegen, damit wiederkehrende Bankbuchungen automatisch dem richtigen Empfänger und der richtigen Kategorie zugeordnet werden und ich sie nicht jeden Monat neu zuordne.
- **Ausgangslage:** Dieselbe Abbuchung taucht jeden Monat unter „Prüfen“ auf.
- **Ablauf:**
  1. Unter „Prüfen“ wähle ich bei einem Vorschlag „Immer so zuordnen“; oder ich öffne „Einstellungen › Zuordnungsregeln“ und wähle „Regel erstellen“.
  2. Ich lege Bedingungen fest („Alle Bedingungen“ oder „Beliebige Bedingung“): „Banktext enthält“, „Gegenpart genau“, Richtung, Betragsbereich.
  3. Ich lege Aktionen fest: Empfänger, Kategorie („Ohne Kategorie / Zu verteilen“) oder „Als Umbuchung auf Konto markieren“.
  4. Die Vorschau zeigt, welche bisherigen Buchungen die Regel getroffen hätte.
  5. Ich speichere („Zuordnungsregel gespeichert.“) und ordne die Reihenfolge; „Deaktivieren“, „Aktivieren“ und Entfernen sind möglich.
- **Ergebnis:** Neue Bankzeilen werden als Vorschlag zugeordnet; die App bucht nie ohne meine Bestätigung.
- **Abnahmekriterien:**
  1. Regel mit Bedingungen anlegen; Vorschau auf die Historie.
  2. Ändern, Deaktivieren und Entfernen sind per „Rückgängig“ rücknehmbar.
  3. Ein ungültiger Betrag meldet „Betrag prüfen. Beispiel: −12,50 oder 25,00.“
  4. Eine Regel ohne Aktion lässt sich nicht speichern.
  5. Eine höher stehende Regel hat Vorrang; die Reihenfolge ist änderbar.
- **Status:** live — **Verweis:** Y18

### K-08 – Belege fotografieren, hochladen und verknüpfen
- **Story:** Als Nutzer möchte ich Belege fotografieren oder hochladen und mit Buchungen verknüpfen, damit ich Nachweise (Steuer, Garantie) bei der Buchung habe.
- **Ausgangslage:** Ich habe einen Kassenbon oder eine Rechnung als Foto oder PDF.
- **Ablauf:**
  1. Ich öffne eine Buchung und gehe zum Abschnitt „Belege“.
  2. Ich tippe „Foto aufnehmen“ oder „Datei anhängen“ (höchstens 15 MB).
  3. Die App speichert und meldet „Beleg angehängt.“
  4. Ohne Buchung speichere ich über „Beleg unter Prüfen speichern“; später wähle ich „Buchung“ und ordne zu („Beleg zugeordnet.“).
  5. Ich öffne Vorschau oder lade herunter; „Verknüpfung entfernen“ löst den Beleg.
- **Ergebnis:** Der Beleg hängt an der Buchung; gelöst landet er wieder unter „Prüfen“.
- **Abnahmekriterien:**
  1. Der Beleg hängt an der Buchung; Vorschau und Download funktionieren.
  2. Die Verknüpfung ist rückgängig machbar.
  3. Eine Datei über 15 MB wird mit „Ein Beleg darf höchstens 15 MB groß sein.“ abgelehnt.
  4. Ohne Verbindung bleibt der Beleg „Wartet auf Senden“ und wird nicht doppelt gesendet.
  5. Im Datenschutzmodus ist die PDF-Vorschau ausgeblendet.
- **Status:** live — **Verweis:** Y21

### K-09 – Keine veraltete Tabelle bearbeiten
- **Story:** Als Nutzer möchte ich beim Wechsel von Konto oder Filter nie eine veraltete Tabelle bearbeiten, damit ich nichts auf das falsche Konto oder in die falsche Zeile buche.
- **Ausgangslage:** Ich wechsle in „Alle Buchungen“ das Konto oder einen Filter, während die Daten noch laden.
- **Ablauf:**
  1. Ich öffne „Alle Buchungen“ und wähle im „Buchungsfilter“ ein anderes „Konto“.
  2. Die Adresse ändert sich, die alte Tabelle wird sofort gesperrt.
  3. Die App lädt die neue Liste („Anzahl wird aktualisiert …“).
  4. Erst die neue Liste ist bearbeitbar.
- **Ergebnis:** Es wird nur die Tabelle bearbeitet, die zur Adresse passt.
- **Abnahmekriterien:**
  1. Nach dem Wechsel ist die alte Tabelle nicht bearbeitbar.
  2. Adresse (Filter in der URL) und Inhalt passen zusammen.
  3. Zurück-Taste stellt Filter und Tabelle gemeinsam wieder her.
  4. Auf langsamer Verbindung bleibt der Ladezustand sichtbar statt der alten Zeilen.
- **Status:** live — **Verweis:** #1074

### K-10 – Eindeutiger Speicherstatus und Wiederholungsschutz
- **Story:** Als Nutzer möchte ich bei jeder Änderung sehen, ob sie lokal, gesendet, gespeichert oder fehlgeschlagen ist, und sicher sein, dass Wiederholen nichts doppelt bucht, damit ich bei schlechter Verbindung nicht raten muss und keine Buchung doppelt entsteht.
- **Ausgangslage:** Ich speichere am Handy bei schlechtem Netz; die Schaltfläche bleibt lange gesperrt oder der Dialog zeigt „Wartet auf Verbindung“.
- **Ablauf:** (geplant)
  1. Ich speichere eine Buchung („Buchung speichern“).
  2. Die App zeigt „lokal gespeichert“, dann „wird gesendet“.
  3. Nach Antwort steht „auf dem Server gespeichert“ mit Buchungs-ID und Uhrzeit; sonst „fehlgeschlagen“.
  4. Bei unklarem Empfang prüft die App zuerst den Serverstand, bevor sie erneut sendet; „Jetzt senden“ bleibt als Ausweg mit Warnung.
  5. Ich muss nicht neu laden, um den Stand zu erfahren.
- **Ergebnis:** Jede Änderung hat genau einen Zustand; derselbe Versuch erzeugt höchstens eine Buchung.
- **Abnahmekriterien:**
  1. Vier Zustände sind sichtbar: lokal, wird gesendet, gespeichert, fehlgeschlagen.
  2. Doppeltes Senden (Doppelklick, Wiederholen) erzeugt genau eine Buchung.
  3. Verbindungsabbruch vor oder nach dem Speichern verliert und verdoppelt nichts.
  4. Der Warnhinweis bei unklarem Empfang bleibt erhalten.
  5. Eine bestätigte Änderung braucht kein Neuladen.
- **Status:** offen — **Verweis:** #1075
- Fehlt noch: Idempotenzschlüssel, durchgängige Zustandsanzeige, Tests für Verbindungsabbruch. Belege zeigen schon „Wartet auf Senden“/„Unsicher“.

### K-11 – Fremdwährungsbuchungen mit Originalbetrag
- **Story:** Als Nutzer möchte ich Fremdwährungsbuchungen mit Originalbetrag und EUR-Betrag sehen, damit ich Kurse nachvollziehe und Salden in Fremdwährung stimmen.
- **Ausgangslage:** Ich habe mit einer Karte in einer Fremdwährung gezahlt oder ein Konto in Fremdwährung.
- **Ablauf:**
  1. Ich öffne ein Fremdwährungskonto unter „Konten“.
  2. Die Tabelle zeigt Originalbetrag in der Währung und den EUR-Betrag; im Saldoverlauf wähle ich „Saldoverlauf Währung“.
  3. Fehlt ein Kurs, steht „Kurs fehlt“.
  4. Ich sehe die EUR-Bewertung mit Tageswerten und Kursen.
- **Ergebnis:** Nur Anzeige; EUR-Werte nutzen die gespeicherten EZB-Kurse.
- **Abnahmekriterien:**
  1. Originalbetrag und EUR-Betrag sind sichtbar.
  2. Ein fehlender Kurs wird gemeldet („Kurs fehlt“), es wird keine Parität angenommen.
  3. Währungskennzeichen stehen durchgängig in Tabellen, Diagrammen und Abgleich.
- **Status:** teilweise — **Verweis:** I13
- Fehlt noch: durchgängige Währungskennzeichnung in allen Tabellen, Diagrammen und im Abgleich; vollständige historische Kurse.

### K-12 – Umbuchung und Wertpapierkauf als ein Vorgang
- **Story:** Als Nutzer möchte ich Umbuchungen und Wertpapierkäufe als einen zusammengehörigen Vorgang mit Zustand „unterwegs“ sehen, damit nichts doppelt oder fehlend wirkt, wenn die zwei Banken zu verschiedenen Zeiten buchen.
- **Ausgangslage:** Ich überweise Geld aufs Depot und kaufe ein Wertpapier; Abgang und Eingang erscheinen an verschiedenen Tagen.
- **Ablauf:** (geplant, laut Issue)
  1. Ich öffne den Vorgang aus Konten oder Vermögen.
  2. Eine Vorschau zeigt Bankabgang, Bankeingang, Gebühren, Kauf und Stückzahl, je Seite mit eigenem Datum und Status.
  3. Ist nur der Abgang bestätigt, steht der Vorgang auf „unterwegs“; das Empfängerkonto ändert sich noch nicht und es braucht keine Ausgleichsbuchung.
  4. Trifft der Eingang ein, verknüpft die App die vorhandene Buchung, statt eine neue anzulegen.
- **Ergebnis:** Ein Vorgang mit mehreren Seiten statt getrennter Buchungen.
- **Abnahmekriterien:**
  1. Ein Vorgang zeigt beide Seiten, Gebühren und Kauf.
  2. „Unterwegs“ endet mit dem Eingang.
  3. Nur dokumentierte Seiten werden bestätigt; vorhandene Buchungen werden bevorzugt verknüpft.
  4. Ein Abgang ohne Gegenseite hebt den bestätigten Saldo des Empfängers nicht an.
- **Status:** offen — **Verweis:** #1080
- Fehlt noch: gesamter Vorgang (Vorschau, Zustand „unterwegs“, Verknüpfung). Ablauf unklar – zu klären: von welcher Seite (Konten oder Vermögen) wird der Vorgang geöffnet?

### K-13 – Wertpapierüberträge mit Kostenbasis
- **Story:** Als Nutzer möchte ich Wertpapierüberträge mit belegter Kostenbasis erfassen, damit Gewinne und Verluste nach einem Depotwechsel stimmen.
- **Ausgangslage:** Ich übertrage Stücke desselben Wertpapiers von einem Depot in ein anderes.
- **Ablauf:** Ablauf unklar – zu klären: Das Issue beschreibt nur die Prüfung (Stufe A: Erhaltung von Stückzahl und Basis, FIFO/Durchschnitt); eine Oberfläche ist nicht festgelegt.
- **Ergebnis:** (geplant) Stücke, Einstandswerte und Kaufdaten bleiben erhalten; es entsteht kein realisierter Gewinn.
- **Abnahmekriterien:**
  1. Der Übertrag nennt Kostenbasis und Beleg.
  2. Eine unbekannte Basis bleibt unbekannt und geht in die manuelle Prüfung.
  3. Scheitert die zweite Seite, bleibt keine Hälfte stehen.
  4. Rückgängig stellt beide Seiten her.
- **Status:** geplant — **Verweis:** #520
- Fehlt noch: Nachweis der Erhaltung (Stufe A), danach Speicherung, Schnittstelle und Oberfläche.

### K-14 – Fremdwährungsüberträge
- **Story:** Als Nutzer möchte ich Überträge in Fremdwährung begrenzt vorbereiten, damit Kurs, Betrag und Gebühr nachvollziehbar gebucht sind und nichts erraten wird.
- **Ausgangslage:** Ich überweise Geld in oder aus einer Fremdwährung.
- **Ablauf:** Ablauf unklar – zu klären: Das Issue legt Buchungs-Fixtures fest, aber keine Oberfläche. Vorgesehen: Quell- und Zielbetrag samt Währung, Kurs mit Herkunft und eine getrennte Gebühr erfassen.
- **Ergebnis:** (geplant) Beide Seiten und die Gebühr werden gemeinsam gespeichert.
- **Abnahmekriterien:**
  1. Übertrag mit Währung, Kurs und Gebühr, im Umfang des Issues.
  2. Fehlende Beträge oder Kurse werden nicht erraten.
  3. Beide Seiten und Gebühr lassen sich gemeinsam rückgängig machen.
  4. Nicht unterstützte Fälle bleiben manuell.
- **Status:** geplant — **Verweis:** #519
- Fehlt noch: Fixtures, Speicherung und Oberfläche.

### K-15 – Bankzeilen automatisch lesen
- **Story:** Als Nutzer möchte ich Bankzeilen automatisch lesen lassen, damit ich weniger abtippe und neue Umsätze zur Prüfung bereitstehen.
- **Ausgangslage:** Bankumsätze sollen ohne Tippen in die App kommen.
- **Ablauf:**
  1. Ich verbinde die Bank unter „Einstellungen › Datenquellen“ (Zustimmung bei der Bank).
  2. Nachts liest die App neue Umsätze.
  3. Neue Zeilen erscheinen unter „Prüfen“ (`/konten/pruefen`) ungeprüft und ohne Kategorie.
  4. Ich bestätige, ordne zu (Vorschlag übernehmen) oder verwerfe.
  5. Läuft die Zustimmung ab, erneuere ich sie in „Datenquellen“.
- **Ergebnis:** Bestätigte Zeilen werden Buchungen; nichts wird ohne meine Bestätigung gebucht.
- **Abnahmekriterien:**
  1. Der Abruf läuft nachts; neue Zeilen landen ungeprüft im Posteingang.
  2. Ein Doppel einer vorhandenen Buchung wird erkannt und nicht zweimal gebucht.
  3. Fällt die Bank aus, zeigt „Prüfen“ „Bank: nicht verbunden“ bzw. eine Datenwarnung, keine stille Lücke.
  4. Abgelaufene Zustimmung wird gemeldet.
- **Status:** teilweise — **Verweis:** Y19, Y20
- Fehlt noch: vollständiger nächtlicher Abruf mit Nachholen (Y20) und die Abnahme mit echten Bankdaten.
