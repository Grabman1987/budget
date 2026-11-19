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
- **Story:** Als Nutzer möchte ich im Kontoregister und in „Alle Buchungen“ Datum, Betrag, Kategorie und Empfänger direkt in der Zeile ändern, damit ich Buchungen schnell pflege, ohne jedes Mal einen Dialog zu öffnen.
- **Ausgangslage:** Ich sehe in einem Konto oder in „Alle Buchungen“ einen falschen Betrag, ein falsches Datum, eine falsche Kategorie oder einen falschen Empfänger.
- **Ablauf:**
  1. Ich öffne ein Konto unter „Konten“ und scrolle zur Tabelle „Buchungen“.
  2. Ich tippe auf Datum, Betrag oder Kategorie einer Zeile oder auf den Stift neben dem Empfänger; das Feld wird editierbar. Der Empfängername öffnet weiterhin den vollständigen Buchungsdialog.
  3. Ich tippe den neuen Wert bzw. wähle einen vorhandenen Empfänger und bestätige mit Enter oder verlasse das Feld (Escape verwirft). Eine Kategorie wird bei der Auswahl sofort gespeichert.
  4. Die App speichert und aktualisiert Saldo und Zeile; Status (vorgemerkt/bestätigt/geprüft) und Markierungen bleiben sichtbar.
  5. Über „Status“ filtere ich nach vorgemerkt oder bestätigt.
  6. I recognize the same status glyph and colour when selecting, hovering or opening a booking.
- **Ergebnis:** Die Buchung ist geändert; Saldo, Plan und Heute folgen.
- **Abnahmekriterien:**
  1. Die Inline-Änderung wirkt sofort in der Zeile und im Saldo.
  2. Statussymbole und Markierungen sind sichtbar. The confirmed double tick always uses green `--good`; the reconciled lock uses `--ink` (dark blue in light mode, white in dark mode). These roles persist on hover, selected and tinted rows, in capture, review and phone lists. Icons and accessible labels supplement colour; icons reach WCAG AA non-text contrast (3:1). Pending stays unchanged.
  3. Eine geprüfte (gesperrte) Buchung lässt sich nicht still überschreiben; die App erklärt die Sperre.
  4. Ein ungültiger Betrag wird abgelehnt, der alte Wert bleibt.
  5. Auf dem Handy lässt sich die Zeile antippen und bearbeiten.
  6. Kategorie und Empfänger sind bei Splitbuchungen und Umbuchungen nicht inline änderbar; ein Hinweis erklärt den Dialogweg. Geprüfte Buchungen bleiben durch die bestehende Freigabe geschützt.
  7. Jede Änderung ist protokolliert und rückgängig machbar. Eine Empfängeränderung übernimmt keine Standardkategorie und ändert weder Betrag noch Saldo.
- **Status:** teilweise — bestehendes Register live; Inline-Erweiterung lokal implementiert (#1098). Fehlt noch: Integration, Veröffentlichung und Nutzerabnahme. Status colours #1190 implemented locally; review, CI, publication and owner acceptance pending. — **Verweis:** Y02, #1098, #1190

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
     Das Datum bleibt vollständig als TT.MM.JJJJ lesbar; bei schmalem Dialog stehen Datum und Konto untereinander.
  3. Ich wähle „Empfänger“ (Suchen oder neu anlegen) und Kategorie; optional „Projekt“, Notiz, „Belege“.
     Fehlt die Kategorie, wähle ich „Neue Kategorie …“, fülle Name und Gruppe im bestehenden Formular aus und speichere. Die Kategorie wird ausgewählt; der Buchungsentwurf bleibt erhalten.
     A category can be clicked, selected with the keyboard, or entered as a unique full label. Blur and save accept a unique case-insensitive match. Typing clears the stored selection; unmatched or ambiguous text stays visible, is marked invalid after blur and blocks saving. Leaving the field empty clears the selection. Without a valid selection, unresolved search text blocks saving. A newly created category replaces the search text with its selected label.
     Under “Bezahlt für”, I add a contact share. First use starts in “Betrag” mode with an empty amount; subsequent new shares use the last unit (% or Betrag) chosen on this device.
  4. Bei einem Bargeld-Konto steht „Bargeldbuchungen sind sofort bestätigt“, sonst startet die Buchung „Vorgemerkt“.
  5. Optional wähle ich bei „Wiederholen“ Wöchentlich, Monatlich, Vierteljährlich oder Jährlich; die App legt eine wiederkehrende Zahlung an.
  6. Ich tippe „Buchung speichern“.
     After "Speichern und neu", the next booking keeps only the date, booking mode and explicit register account context. Payee, category, project, income type, transfer destination and all other booking details are cleared; outside a register the account is empty too. Changing the payee replaces both from the latest booking, or clears both without history; while history is pending both automatic fields are empty. Automatic category suggestions follow the new payee's latest booking; no history or a latest split booking leaves an untouched category empty. The register account and explicit choices made in this form remain authoritative.
- **Ergebnis:** Die Buchung steht im Konto und in „Alle Buchungen“; mit „Wiederholen“ zusätzlich in Plan › Wiederkehrende Zahlungen.
- **Abnahmekriterien:**
  1. Eine neue Bankbuchung startet „vorgemerkt“, eine Bargeldbuchung „bestätigt“.
  2. „Wiederholen“ legt Buchung und Plan gemeinsam an (alles oder nichts).
  3. Ohne Konto meldet das Formular „Bitte ein verfügbares Konto wählen.“
  4. Beim Schließen mit Eingaben fragt „Eingaben verwerfen?“.
  5. Die Buchung ist über „Rückgängig“ bzw. „Buchung löschen?“ wieder entfernbar.
  6. Neue Kategorien lassen sich auch bei der Inline-Kategorieänderung und beim Bearbeiten unter Prüfen anlegen und auswählen. Doppelte Namen zeigen „Dieser Name wird schon verwendet.“; Abbrechen erhält den Entwurf und gibt den Fokus zurück.
  7. Die Kategorieanlage ist separat rückgängig machbar, solange die Kategorie unbenutzt ist. Erst das explizite Speichern der Buchung ordnet ihr Geld zu.
  8. Displayed and saved categories agree for typed, clicked and keyboard selection, including after "Speichern und neu". Unmatched or ambiguous search text stays visible, is marked invalid and blocks saving; deliberate clearing removes it. A unique full label is accepted on blur and save.
  9. A payee change preserves the register account and explicit choices made in this form. Automatic account/category defaults are replaced together or cleared without history. Explicit category choices remain intact. Delayed responses from the previous draft are ignored.
  10. Fehlermeldungen zur Buchung erscheinen nach einem Speicherversuch; ungültiger Kategoriesuchtext wird nach Verlassen des Feldes erklärt. Ein frisches Formular zeigt keine Kategoriepflicht-Meldung während der Eingabe.
  11. Das Datum wird beim Erfassen und Bearbeiten von Ausgabe, Einnahme und Umbuchung in beiden Themes vollständig angezeigt, auch bei 390 px. Der Dialog hat keinen horizontalen Überlauf; Datumswert und Tastaturreihenfolge bleiben erhalten.
  12. The share unit survives closing and reloading on this device. Only the unit is remembered: new percentage shares start at 50 %, amount shares empty. Existing shares and saved bookings remain unchanged. Editing still works when device storage is blocked.
- **Status:** Grundfunktion live; Kategorieanlage #1104 und Konsistenzkorrekturen #1145 implementiert, PR-/CI-Prüfung und Live-Abnahme offen — **Verweis:** Y03, #1104, #1145; Layout #1142 (Kategorie-Vorschlagschips entfernt, Kategorie nur über das Suchfeld bzw. Empfänger-Vorbelegung)

  Share-mode slice and layout slices of #1146 implemented; PR review/CI and live acceptance pending. The desktop dialog has a fixed height, so Abbrechen, Speichern und neu and Speichern keep their position while shares or splits expand and only the body scrolls. Save and new and adding a split keep the body's scroll position. The list „Gespeicherte Änderungen“ no longer exists (#1200); a short confirmation never shifts the register.

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
  5. Ich tippe „Fertig“ bzw. „Auswahl beenden“. Danach kann ich Kategorie und Empfänger wieder einzeln direkt in der Zeile korrigieren.
- **Ergebnis:** Alle gewählten Buchungen sind geändert; die Aktion ist als Gruppe rückgängig machbar.
- **Abnahmekriterien:**
  1. Die Sammelaktion wirkt auf alle gewählten Zeilen.
  2. Über 500 Zeilen wird abgewiesen: „Höchstens 500 Buchungen pro Sammeländerung auswählen.“
  3. Gesperrte (geprüfte) Buchungen werden nicht stillschweigend geändert; das Ergebnis nennt sie.
  4. Ist eine Buchung inzwischen weg, steht „Buchung nicht mehr verfügbar“.
  5. Eine Inline-Korrektur wirkt nur auf ihre Zeile und erhält angehakte Zeilen. Im ausdrücklichen Auswahlmodus bleiben die Inline-Felder geschlossen; die Sammelaktion bleibt der Schreibweg.
- **Status:** live (Sammelaktion); Zusammenspiel mit Inline-Empfänger lokal implementiert (#1098), Veröffentlichung und Nutzerabnahme ausständig. — **Verweis:** Y04, #1098

### K-06 – Kontostand prüfen und sperren
- **Story:** Als Nutzer möchte ich den App-Saldo mit dem Kontostand meiner Bank vergleichen und bestätigte Buchungen sperren, damit ein geprüfter Stand fix bleibt und nicht versehentlich verändert wird.
- **Ausgangslage:** Ich habe den Kontoauszug oder Bankstand vor mir, oder die App meldet „Konten prüfen“.
- **Ablauf:**
  1. Ich öffne ein Konto und tippe „Kontostand prüfen“ (oder in Heute „Konten prüfen“ › „Abgleichen“).
  2. Im Dialog „Kontostand prüfen · <Konto>“ ist „Saldo laut Bank“ mit dem bekannten Bankstand von heute vorbelegt, mit sichtbarem Datum. Ohne passenden Bankstand gebe ich den Betrag ein (Schuld als Minus); geprüft wird heute.
  3. Die App zeigt „App-Saldo gebucht“ und „Differenz“; Vorgemerktes wird nicht gezählt.
  4. Bei Differenz prüfe ich zuerst angebotene Kandidaten. Bleibt eine Differenz, sehe ich den Betrag neben „Ausgleich buchen und abschließen“. Unter „Mehr“ kann ich optional einen Grund und ein früheres Ausgleichsdatum angeben; die Kategorie bleibt wählbar.
  5. Ein Klick auf „Ausgleich buchen und abschließen“ erstellt den Ausgleich und sperrt die bestätigten Buchungen bis zum Stichtag. Ohne Differenz bestätige ich den passenden Stand wie bisher.
- **Ergebnis:** Prüfstand und Sperre sind gespeichert; die Kontoübersicht zeigt „Prüfstand“ mit Datum; Änderung nur mit Entsperrung, rückgängig machbar.
- **Abnahmekriterien:**
  1. Bankstand, Datum und Abrufzeit sind sichtbar.
  2. Passt der bekannte Bankstand von heute, bestätigt „Abgleich sperren bis heute“ mit einem Klick über die bestehende Bank-Sperraktion. Ohne passenden Bankstand bleibt die manuelle Prüfung erhalten.
  3. Ein Stichtag in der Zukunft wird abgewiesen („Geprüft wird höchstens bis heute.“).
  4. Ein ungültiger Betrag meldet „Bitte einen gültigen Betrag eingeben.“
  5. Der Ausgleichsgrund ist optional; leer bleibt er ohne Platzhalter gespeichert. „Mehr“ ist anfangs zugeklappt. Ein Ausgleich in einem bereits geprüften Zeitraum erfordert weiterhin die ausdrückliche Freigabe.
  6. Die Differenz wird vor der Bestätigung angezeigt; Vorbelegen allein bucht und sperrt nichts. Rückgängig stellt Prüfstand und Buchungsstatus gemeinsam wieder her.
  7. „Bestätigen“ bei einer vorgemerkten Bankbuchung wendet dieselbe Regel an wie die Statusänderung in der Buchungsliste (Zeile für Zeile). Die Meldung nennt die Anzahl bestätigter Buchungen; scheitert eine, bleiben die übrigen bestätigt und die fehlgeschlagene wird mit Grund aufgeführt (#1204).
- **Status:** live (bisherige Prüfung); Bankstand-Vorbelegung (#1095) und Ein-Klick-Ausgleich mit optionalem Grund (#1163) lokal implementiert, Veröffentlichung und Nutzerabnahme ausständig. — **Verweis:** Y05, #1095, #1163

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
  3. Nach Antwort erscheint kurz eine Bestätigung („Buchung gesendet.“), die von selbst verschwindet; es bleibt keine Liste „Gespeicherte Änderungen“ und keine Buchungs-ID sichtbar (#1200). Sonst bleibt „Fehlgeschlagen“ bzw. „Wartet auf Verbindung“ mit „Jetzt senden“ stehen. Alte, auf dem Gerät gespeicherte Bestätigungen werden beim Start entfernt.
  4. Bei unklarem Empfang prüft die App zuerst den Serverstand, bevor sie erneut sendet; „Jetzt senden“ bleibt als Ausweg mit Warnung.
  5. Ich muss nicht neu laden, um den Stand zu erfahren.
- **Ergebnis:** Jede Änderung hat genau einen Zustand; derselbe Versuch erzeugt höchstens eine Buchung.
- **Abnahmekriterien:**
  1. Drei Zustände bleiben sichtbar (lokal, wird gesendet, fehlgeschlagen); „gespeichert“ zeigt nur die kurze Bestätigung, keine Liste (#1200).
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
  1. Ich öffne den Vorgang beim Konto: Umbuchung vom Girokonto auf das Verrechnungskonto, dort anschließend der Kauf.
  2. Eine Vorschau zeigt Bankabgang, Bankeingang, Gebühren, Kauf und Stückzahl, je Seite mit eigenem Datum und Status.
  3. Ist nur der Abgang bestätigt, steht der Vorgang auf „unterwegs“; das Empfängerkonto ändert sich noch nicht und es braucht keine Ausgleichsbuchung.
  4. Trifft der Eingang ein, verknüpft die App die vorhandene Buchung, statt eine neue anzulegen.
- **Beispiel:** Am Montag überweise ich 500 € vom Girokonto aufs Verrechnungskonto. Das Girokonto zeigt den Abgang sofort, der Vorgang steht auf „unterwegs“. Am Mittwoch kommt das Geld an; die App verknüpft die Bankbuchung und der Vorgang gilt als angekommen. Am selben Tag kaufe ich 10 Stück zu je 45 € (450 €) plus 5 € Gebühr; 45 € bleiben auf dem Verrechnungskonto. Alles hängt an einem Vorgang.
- **Ergebnis:** Ein Vorgang mit mehreren Seiten statt getrennter Buchungen.
- **Abnahmekriterien:**
  1. Ein Vorgang zeigt beide Seiten, Gebühren und Kauf.
  2. „Unterwegs“ endet mit dem Eingang.
  3. Nur dokumentierte Seiten werden bestätigt; vorhandene Buchungen werden bevorzugt verknüpft.
  4. Ein Abgang ohne Gegenseite hebt den bestätigten Saldo des Empfängers nicht an.
- **Status:** offen — **Verweis:** #1080
- Fehlt noch: gesamter Vorgang (Vorschau, Zustand „unterwegs“, Verknüpfung). Der Vorgang wird beim Konto geöffnet (Entscheidung 15.11.2026).

### K-13 – Wertpapierüberträge mit Kostenbasis
- **Story:** Als Nutzer möchte ich Wertpapierüberträge mit belegter Kostenbasis erfassen, damit Gewinne und Verluste nach einem Depotwechsel stimmen.
- **Ausgangslage:** Ich übertrage Stücke desselben Wertpapiers von einem Depot in ein anderes.
- **Ablauf:** (geplant; das Issue beschreibt zunächst nur die Prüfung, Stufe A)
  1. Ich öffne unter „Vermögen“ eine einfache Maske für den Übertrag, z. B. „von Broker A zu Broker B“.
  2. Ich wähle Wertpapier, Stückzahl, Quell- und Zieldepot und nenne Kostenbasis und Beleg.
  3. Die App prüft, dass Stückzahl und Basis erhalten bleiben (FIFO oder Durchschnitt), und bucht beide Seiten gemeinsam ohne realisierten Gewinn.
  4. Bei unbekannter Basis bleibt der Fall zur manuellen Prüfung.
- **Ergebnis:** (geplant) Stücke, Einstandswerte und Kaufdaten bleiben erhalten; es entsteht kein realisierter Gewinn.
- **Abnahmekriterien:**
  1. Der Übertrag nennt Kostenbasis und Beleg.
  2. Eine unbekannte Basis bleibt unbekannt und geht in die manuelle Prüfung.
  3. Scheitert die zweite Seite, bleibt keine Hälfte stehen.
  4. Rückgängig stellt beide Seiten her.
- **Status:** geplant — **Verweis:** #520
- Wird noch nicht gebaut; bleibt offener Punkt (Entscheidung 15.11.2026). Gleiche Funktion wie V-17.
- Fehlt noch: Nachweis der Erhaltung (Stufe A), danach Speicherung, Schnittstelle und Oberfläche.

### K-14 – Fremdwährungsüberträge
- **Story:** Als Nutzer möchte ich einen Währungstausch als normale Euro-Buchung erfassen, damit Betrag und Gebühr in Euro stimmen und der Fremdwährungsbetrag nachlesbar bleibt.
- **Ausgangslage:** Ich habe Geld in oder aus einer Fremdwährung getauscht. Alles wird in Euro geführt.
- **Ablauf:**
  1. Ich buche den erhaltenen Euro-Betrag auf das Zielkonto.
  2. Ich schreibe den Fremdwährungsbetrag in die Notiz der Buchung.
  3. Ich buche die Gebühr getrennt als Bankgebühr (Kategoriegruppe „Bank und Gebühren“).
  4. Es gibt keine eigenen Fremdwährungsteile und keinen gespeicherten Kurs.
- **Beispiel:** 1.000 USD werden zu 920 € mit 5 € Gebühr. Das Zielkonto erhält 920 €, die Notiz lautet „1.000 USD“. Die Gebühr von 5 € steht getrennt unter „Bank und Gebühren“.
- **Ergebnis:** Nur Euro-Beträge sind gespeichert; der Fremdwährungsbetrag steht in der Notiz.
- **Abnahmekriterien:**
  1. Alle Beträge sind in Euro.
  2. Der Fremdwährungsbetrag steht in der Notiz und ist über die Suche auffindbar.
  3. Die Gebühr steht getrennt unter „Bank und Gebühren“.
  4. „Rückgängig“ nimmt alle Teile zurück.
- **Status:** live — keine neue Funktion nötig; Vorgehen dokumentiert. **Verweis:** #519
- Entschieden 15.11.2026. Gleiche Funktion wie V-18.

### K-15 – Bankzeilen automatisch lesen
- **Story:** Als Nutzer möchte ich Bankzeilen automatisch lesen lassen, damit ich weniger abtippe und neue Umsätze zur Prüfung bereitstehen.
- **Ausgangslage:** Bankumsätze sollen ohne Tippen in die App kommen.
- **Ablauf:**
  1. Ich verbinde die Bank unter „Einstellungen › Datenquellen“ (Zustimmung bei der Bank).
  2. Nachts liest die App neue Umsätze.
  3. Neue Zeilen erscheinen unter „Prüfen“ (`/konten/pruefen`) ungeprüft und ohne Kategorie.
  4. Ich bestätige, ordne zu (Vorschlag übernehmen) oder verwerfe. Gehört eine Zeile eindeutig zu einer wiederkehrenden Ausgabe, wird deren Fälligkeit automatisch verknüpft (siehe P-09); bei Mehrdeutigkeit oder abweichendem Betrag erscheint der Vorschlag „Abbuchung zuordnen“.
  5. Läuft die Zustimmung ab, erneuere ich sie in „Datenquellen“.
- **Ergebnis:** Bestätigte Zeilen werden Buchungen; nichts wird ohne meine Bestätigung gebucht.
- **Abnahmekriterien:**
  1. Der Abruf läuft nachts; neue Zeilen landen ungeprüft im Posteingang.
  2. Ein Doppel einer vorhandenen Buchung wird erkannt und nicht zweimal gebucht.
  3. Fällt die Bank aus, zeigt „Prüfen“ „Bank: nicht verbunden“ bzw. eine Datenwarnung, keine stille Lücke.
  4. Abgelaufene Zustimmung wird gemeldet.
  5. Eine eindeutig passende Abbuchung mit passendem Empfänger, Kontakt oder gelerntem Banknamen verknüpft die Fälligkeit der wiederkehrenden Zahlung automatisch und rückgängig-fähig; ohne Gegenpart-Treffer bleibt es ein Vorschlag in „Prüfen“, ebenso bei Unklarheit (#1102). Der automatische Lauf verändert weder Einnahmen noch bestehende Verknüpfungen und markiert überfällige offene Fälligkeiten nicht als „ausgefallen“.
- **Status:** teilweise — **Verweis:** Y19, Y20
- Fehlt noch: vollständiger nächtlicher Abruf mit Nachholen (Y20) und die Abnahme mit echten Bankdaten.

### K-06a – Geprüfte Buchung ausdrücklich zur Bearbeitung freigeben

- **Story:** Als Nutzer möchte ich eine bereits abgeglichene Buchung nach einer Rückfrage korrigieren können.
- **Ablauf:** Ich wähle eine abgeglichene Buchung zur Bearbeitung. Im Redesign erscheint vor dem Formular „Geprüfte Buchung wirklich bearbeiten?“ und erklärt den Abgleichschutz sowie mögliche Auswirkungen auf Kontostand und Kontaktanteile. „Abbrechen“ oder Escape schließt die Rückfrage ohne Formular; „Bearbeitung freigeben“ öffnet das Formular mit aktivierter Freigabe für die anschließende Änderung oder Löschung. Ich kann „Trotzdem ändern“ wieder ausschalten; erneutes Einschalten fragt nochmals nach.
- **Abnahmekriterien:** Die Rückfrage speichert nichts und vor Bestätigung ist kein Formular eingebunden. Tab und Umschalt+Tab bleiben bei den Antworten. Nach Abbruch kehrt der Fokus zur auslösenden Bearbeiten-Aktion zurück. Erst die bestätigte Freigabe setzt beim Speichern das bestehende API-Flag `unlockReconciled`; die Änderung bleibt rückgängig machbar. Erneutes Öffnen derselben oder einer anderen abgeglichenen Buchung fragt neu; eine Freigabe wird nicht übertragen. Ohne Redesign bleibt die bestehende Freigabe im Formular erhalten.
- **Weiterer Ablauf:** Weicht nach einer Änderung oder Löschung der gebuchte Saldo vom letzten nachweislich bestätigten Abgleich ab, erscheint unter „Prüfen › Aufgaben › Weitere Aufgaben“ eine dringende Aufgabe mit Konto, Abgleichdatum, bestätigtem und aktuellem Saldo sowie Differenz. „Kontostand prüfen“ öffnet den bestehenden Abgleich. Die Aufgabe lässt sich nicht als erledigt wegklicken; ein passender neuer Abgleich oder Rückgängig entfernt sie automatisch.
- **Weitere Abnahmekriterien:** Der Hinweis vergleicht nur den neuesten Abgleich bis heute und verwendet dessen unveränderten bestätigten Saldo. Vorgemerkte und spätere Buchungen zählen wie bisher nicht zum gebuchten Stichtagssaldo. Reines Lesen schreibt nichts; Rückgängig stellt auch die abgeleitete Aufgabe wieder her. „Kontostand prüfen“ öffnet den Abgleich genau des betroffenen Kontos; das Öffnen bestätigt keinen neuen Stand. Historische Checkpoints ohne protokollierte Bestätigung werden in diesem Teil nicht nachträglich als belegter Abgleich interpretiert.
- **Status:** teilweise — **Verweis:** #1108. Dritter Teil: Rückfrage vor Öffnen des Formulars für abgeglichene Buchungen; die ersten beiden Teile (#1111, #1120) ergänzen Freigabe und Prüfen-Hinweis. Noch offen: genaue Schutzdaten im Dialog, eigener protokollierter Freigabegrund und weitere Schutzarten einschließlich Kontaktverknüpfungen und historischer Checkpoints ohne Bestätigungsnachweis. CI und Live-Abnahme des dritten Teils ausständig.

### K-05d – Transfer in transit before a securities purchase (#1080)

- **Story:** As a user, I want to record a documented bank debit while the settlement account has not yet received the money.
- **Flow (first API slice):** A caller explicitly submits `bankLegs.from` and `bankLegs.to`, each with its own date and pending/confirmed status, to `POST /api/bookings` with `type: transfer`. The recipient stays pending until its receipt is documented; the existing booking PATCH can then confirm that side independently.
- **Acceptance criteria:**
  1. Checking/savings transfers retain both supplied dates and statuses. A confirmed debit with a pending receipt reduces only the source's confirmed balance, including after the pending receipt's date.
  2. Exactly two opposite integer-cent bookings are created, without an extra balancing booking or category activity between budget accounts. Creation, audit, delivery receipt and grouped undo/redo remain atomic.
  3. Retrying the same idempotency key replays the result; changing either side's intent conflicts without writes. Invalid dates, reconciled status, incomplete side intent, non-bank accounts, a debit before the recipient account opens and competing `bankStatus` are rejected. The existing five-day date window remains enforced.
  4. Requests without `bankLegs` preserve their canonical idempotency representation and the separate cash/bank status policy. Equal-date transfers move both legs together on date edits. For independently dated bank pairs only the edited leg moves; a debit after receipt or before either account opens is refused with a typed German error. The existing reconciled-pair lock and five-day window remain enforced. Other transfer kinds retain paired-date editing.
  5. All household net-worth totals (Heute, Vermögen and reports) and their daily histories use the shared `bankTransferTransitCents` domain function through the central portfolio valuation. They count each whole same-currency bank transfer exactly once across its two dates, including existing independently dated pairs. Account balances stay bank-true per leg date. Between debit and receipt, the amount sits in the recipient's pending-inclusive valuation, not its confirmed balance; no booking or balance correction is created. After the receipt date, the ordinary pending booking replaces that valuation correction. Account previews include the pending receipt once on its date; household forecasts retain its value once in the starting valuation.
- **Status:** Partial, prepared for review; API creation, confirmation, guarded date edits and cross-view valuation/preview regression coverage. No migration or UI change. The account entry point, German “unterwegs” presentation, combined transfer/fees/purchase/quantity preview and preferred linking of existing bookings remain open. Unknown receipt dates remain follow-up work. No live acceptance claimed.
