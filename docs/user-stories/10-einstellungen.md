# User-Stories – Einstellungen

Bereich 10: Konten, Datenquellen, Sicherheit/Passkey, Sicherung, Warenkorb, Kontakte-Verwaltung. Gesamtkatalog, Status- und Verweis-Legende: `docs/USER-STORIES.md`. Stand: 15.11.2026.
Einstellungen erreicht der Nutzer über die Navigation „Einstellungen“. Die Seiten heißen Profil, Konten, Depots & Kryptos, Projekte, Warenkorb (Teuerung), Kategorien, Regelwerk, Zuordnungsregeln, Datenquellen, Anlageklassen, Kontakte, Empfänger, CSV-Export und Sicherheit. Neue Story-IDs ab E-11 sind Ergänzungen zum bisherigen Katalog (Konten, Kontakte, Warenkorb, Sitzungen). Das Regelwerk steht in `09-regelwerk.md`.

### E-01 – Dispo je Konto per Häkchen mit Limit
- **Story:** Als Nutzer möchte ich je Konto den Dispo per Häkchen mit Limit aktivieren, damit „Frei bis Gehalt“ den Überziehungsrahmen als verfügbares Geld einrechnet und die Prognose die Realität zeigt.
- **Ausgangslage:** Das Konto hat einen Überziehungsrahmen bei der Bank. Heute rechnet die App ihn nicht mit.
- **Ablauf:**
  1. Nutzer öffnet Einstellungen › Konten und klickt beim Konto auf Bearbeiten (oder „Konto anlegen“).
  2. Im Formular setzt er das Häkchen „Dispo“. Das Feld „Überziehungsrahmen“ erscheint.
  3. Er trägt das Limit ein (z. B. 1.000,00) und klickt „Speichern“.
  4. Nimmt er das Häkchen weg, wird das Limit geleert (kein Limit).
  5. Auf Heute zeigt „Frei bis Gehalt“ das Limit als zusätzlich verfügbar; R07 nutzt es für die Stufe Warnung.
- **Ergebnis:** Das Limit ist am Konto gespeichert und wirkt auf „Frei bis Gehalt“ (Heute) und die Dispo-Regel R07.
- **Abnahmekriterien:**
  1. Häkchen und Limit sind speicherbar und nach dem Neuladen noch da.
  2. Es wirkt auf Frei bis Gehalt (H-02).
  3. Ein negativer oder nicht lesbarer Betrag wird abgelehnt („Der Betrag darf nicht negativ sein.“), das alte Limit bleibt.
  4. Ohne Häkchen ist kein Limit gespeichert.
  5. Am Handy bleibt das Formular ohne seitliches Scrollen bedienbar.
- **Status:** live — **Verweis:** #1086

### E-02 – Konto-Zweck wählen und Dispo je Zweck
- **Story:** Als Nutzer möchte ich je Konto einen Zweck wählen (Bargeld, Gehaltskonto, Verrechnung, Investmentkonto, Sonstiges), damit die App nur sinnvolle Optionen anbietet (Dispo, bei Verrechnung als Lombardkredit) und „Frei bis Gehalt“ die richtigen Konten zählt.
- **Ausgangslage:** Der Nutzer legt ein Konto an oder ändert den Verwendungszweck eines Kontos. Kreditkarten und Kredite behalten ihr bisheriges Verhalten.
- **Ablauf:**
  1. Nutzer öffnet Einstellungen › Konten und klickt „Konto anlegen“ oder beim Konto auf Bearbeiten.
  2. Im Formular wählt er das Feld „Zweck“ (Bargeld, Gehaltskonto, Verrechnung, Investmentkonto, Sonstiges).
  3. Die App zeigt die Dispo-Option je Zweck: für Gehaltskonto, Investmentkonto und Sonstiges das Häkchen „Dispo“ mit Limit, für Verrechnung dieselbe Option als Lombardkredit beschriftet, für Bargeld keine. „Sonstiges“ bietet alle Optionen.
  4. Wechselt er auf einen Zweck ohne Dispo, wird ein gespeichertes Limit geleert.
  5. Er klickt „Speichern“. Nach erneutem Öffnen bleibt der gewählte Zweck sichtbar.
- **Ergebnis:** Zweck und passende Dispo-Optionen sind am Konto gespeichert. Salden, Gruppierung und Zahlen bleiben unverändert, bestehende Konten erhalten einen passenden Zweck aus Typ und Rolle.
- **Abnahmekriterien:**
  1. Alle fünf Zwecke sind wählbar und werden am Konto angezeigt.
  2. Bei Bargeld fehlt das Dispo-Häkchen; bei Verrechnung heißt es Lombardkredit.
  3. Beim Wechsel auf einen Zweck ohne Dispo ist das Limit danach leer, nicht nur ausgeblendet.
  4. „Frei bis Gehalt“ zählt dieselben Konten wie vorher, solange kein Limit hinzukommt oder wegfällt.
  5. Bestehende Konten behalten alle Salden und Auswertungen.
  6. Ohne gespeicherten Zweck berücksichtigt die Zuordnung Bargeldtyp, konfiguriertes Gehaltskonto, Depot-Verknüpfungen und bisherigen Typ bzw. Rolle. Es werden keine Bestandsdaten umgeschrieben.
  7. Eine reine Namensänderung erhält auch ein älteres Dispo-Limit; ein Wechsel auf einen Zweck ohne Dispo löscht es im selben rückgängig machbaren Speichervorgang.
  8. Die additive Zweck-Spalte bleibt bei Bestandskonten zunächst leer; die Anzeige leitet den Zweck ab. Historische Migrationen erhalten alle bisherigen Kontowerte und Audit-Daten.
- **Status:** implementiert; CI-Nachprüfung der Zweck-Spalte und historischen Migrations-Fixtures in PR #1107, Owner-Abnahme ausstehend — **Verweis:** #1093

### E-03 – Verbindungen und Datenquellen im Überblick
- **Story:** Als Nutzer möchte ich meine Datenquellen (Bank, Gehaltszettel, Kurse, VPI) mit Status an einer Stelle sehen und verwalten, damit ich weiß, ob die Daten aktuell sind, und Probleme sofort finde.
- **Ausgangslage:** Der Nutzer will prüfen, ob der Bankabruf läuft, oder eine Quelle einrichten.
- **Ablauf:**
  1. Nutzer öffnet Einstellungen › Datenquellen („Verbindungen“).
  2. The redesign shows one register for Bank, Krypto, Spritmonitor, Gehaltszettel, Kurse and VPI. The summary links to sources needing attention, and those rows appear first.
  3. Use the row action to refresh, review or focus the relevant control in the existing details. Use the chevron to toggle setup and details separately.
  4. A refresh updates the available status and dates.
- **Result:** Each row shows its scope, state, affected data when applicable, and the last successful retrieval if known. New bank transactions still appear under Prüfen.
- **Acceptance:**
  1. Loading is neutral. An unavailable service offers a retry, and an unsuccessful document scan retains its attempt date in the details.
  2. The next scheduled retrieval appears only when the endpoint supplies a real date.
  3. The status column aligns on desktop. At 320 px, details and the 44 px action fit without horizontal scrolling.
  4. Amounts and names follow the existing privacy mode.
- **Status:** live (Stand 26.11.2026: alle verknüpften Issues erledigt; Nutzerabnahme offen) — **Verweis:** #859

### E-03a – Anlageklassen und Sollquoten verwalten
- **Story:** Als Nutzer möchte ich Anlageklassen, Gruppen und Sollquoten pflegen, damit Portfolio, Rebalancing und die Regeln R13 bis R15 mit meinen Zielen rechnen.
- **Ausgangslage:** Der Nutzer will eine Anlageklasse anlegen oder die Zielverteilung ändern.
- **Ablauf:**
  1. Nutzer öffnet Einstellungen › Anlageklassen. Die Tabelle zeigt Anlageklasse, Gruppe, Instrumente, Soll, Abweichung, Band und Status.
  2. Er klickt „Gruppe anlegen“ oder „Anlageklasse anlegen“ und füllt das Formular.
  3. Er klickt „Sollquoten bearbeiten“ und verteilt Sollanteile (Summe 100 %).
  4. Er speichert; die App meldet das Ergebnis und aktualisiert Soll und Abweichung.
- **Ergebnis:** Klassen und Sollquoten sind gespeichert (mit Gültigkeitsdatum); Portfolio und R13 verwenden sie.
- **Abnahmekriterien:**
  1. Ohne Klassen steht „Noch keine Anlageklassen. Die erste Klasse erhält zunächst keine Sollquote.“
  2. Sind nicht alle Klassen mit Soll versehen, steht „teilweise“ (Hinweis „Nicht alle Klassen haben ein Soll“) und „Soll nicht ermittelbar“.
  3. Eine Klasse lässt sich archivieren und wieder herstellen; ihr Verlauf bleibt.
  4. Änderungen sind rückgängig machbar.
- **Status:** teilweise — **Verweis:** FEATURES KPIs (PR4)
  Fehlt noch: Abnahme durch den Nutzer; Editor und Betriebsstatus sind laut Katalog nur teilweise belegt.

### E-04 – Bankverbindung mit klaren Fehler- und Wiederaufnahme-Zuständen
- **Story:** Als Nutzer möchte ich bei einer Bankverbindung genau sehen, was schiefging und wie es weitergeht, damit ich den Abruf mit einem Klick wieder zum Laufen bringe, statt zu raten.
- **Ausgangslage:** Der Bankabruf ist abgelaufen, fehlgeschlagen, pausiert oder nur teilweise gelungen.
- **Ablauf:**
  1. Nutzer öffnet Einstellungen › Datenquellen › „Bank-Sync (PSD2)“.
  2. Die App zeigt je Verbindung den Status (Aktiv, Einwilligung abgelaufen, Freigabe offen, Abruf fehlgeschlagen, Verbindung fehlgeschlagen, Pausiert), „Letzter Versuch“, „Letzter erfolgreicher Abruf“, „Einwilligung bis“ und „Nächster automatischer Abruf“.
  3. Bei abgelaufener Einwilligung startet er „Bank verbinden“ neu (Bank suchen, „Weiter zur Freigabe bei <Bank>“). Bei Fehlschlag klickt er „Jetzt abrufen“. Zum Stoppen nutzt er „Pausieren“.
  4. Fehlt die Kontozuordnung, wählt er „Konto in Budget“, „Umsätze ab“ und klickt „Konto zuordnen“ bzw. „Zuordnung speichern“.
  5. Neue Umsätze landen unter Prüfen; der Abruf meldet „Abgerufen“, „Verknüpft“, „Neu vorgemerkt“, „Offen zur Prüfung“.
- **Ergebnis:** Verbindung ist wieder aktiv oder bewusst pausiert; es ist klar, wie viele Umsätze neu sind.
- **Abnahmekriterien:**
  1. Jeder Fehlerzustand ist benannt und zeigt den letzten erfolgreichen Abruf und den betroffenen Umfang.
  2. Jeder Zustand bietet eine Handlung zur Wiederaufnahme.
  3. Eine abgebrochene Freigabe meldet „Die Bankfreigabe wurde abgebrochen. Bitte erneut verbinden.“
  4. Während eines Abrufs oder bei Pause ist die Zuordnung gesperrt und die App sagt warum.
  5. Es wird kein grüner Erfolgsstempel ohne echten Lauf angezeigt.
- **Status:** live (Stand 26.11.2026: alle verknüpften Issues erledigt; Nutzerabnahme offen) — **Verweis:** #859
  The redesign register distinguishes connected, expired consent, failed retrieval, partial retrieval, unmapped account and unavailable service, plus pending approval, paused, unconfigured and loading. Synthetic browser cases exercise recovery focus or retry. Owner acceptance and live provider verification remain open.

### E-05 – Mit Passkey anmelden und Passkeys verwalten
- **Story:** Als Nutzer möchte ich mich nur mit einem Passkey anmelden und weitere Geräte hinzufügen oder entfernen, damit niemand ohne mein Gerät an meine Finanzdaten kommt und ich bei Gerätewechsel nicht ausgesperrt bin.
- **Ausgangslage:** Der Nutzer öffnet die App oder will ein neues Gerät einrichten.
- **Ablauf:**
  1. Nutzer öffnet die App und klickt auf der Anmeldeseite „Mit Passkey anmelden“. Das Gerät zeigt den Passkey-Dialog.
  2. Für ein weiteres Gerät öffnet er Einstellungen › Sicherheit und klickt „Passkey hinzufügen“, gibt den „Gerätename“ ein und klickt „Passkey anlegen“.
  3. Zum Entfernen klickt er bei einem Passkey „Entfernen“. Die App meldet „Passkey entfernt.“
  4. Der Abschnitt „Dieses Gerät“ erklärt: Lokale Finanzdaten werden beim Abmelden entfernt.
- **Ergebnis:** Anmeldung nur mit Passkey; die Liste der Passkeys ist aktuell.
- **Abnahmekriterien:**
  1. Anmeldung gelingt nur mit Passkey oder mit Wiederherstellungscode (siehe E-05a).
  2. Bleibt der Passkey-Dialog aus, kann der Nutzer nach 60 Sekunden erneut versuchen.
  3. Ein entfernter Passkey verschwindet aus der Liste und die App meldet „Passkey entfernt.“
  4. Ohne Gerätename lehnt die App ab („Bitte einen Gerätenamen eingeben.“).
  5. „Abmelden“ beendet die Sitzung und löscht lokale Daten.
- **Status:** live — **Verweis:** FEATURES KPIs

### E-05a – Wiederherstellungscodes nutzen und neu erzeugen
- **Story:** Als Nutzer möchte ich mit einem Wiederherstellungscode zurück in die App kommen, wenn ich den Passkey verliere, damit ich nicht für immer ausgesperrt bin und trotzdem keine Gesamtdaten herausgegeben werden.
- **Ausgangslage:** Der Passkey ist nicht verfügbar. Oder der Nutzer will die Codes erneuern.
- **Ablauf:**
  1. Nutzer klickt auf der Anmeldeseite „Wiederherstellungscode verwenden“, gibt den „Wiederherstellungscode“ ein und klickt „Mit Code anmelden“.
  2. Die App meldet an und lässt einen neuen Passkey anlegen.
  3. Für neue Codes öffnet er Einstellungen › Sicherheit › „Wiederherstellungscodes neu erzeugen“. Die App zeigt „n von m Codes noch gültig“ und nach dem Klick die neuen Codes; die alten werden ungültig.
  4. Er bestätigt mit „Fertig“, nachdem er die Codes gesichert hat.
- **Ergebnis:** Zugriff wiederhergestellt; neue Codes gelten, alte nicht mehr.
- **Abnahmekriterien:**
  1. Ein leerer Code ergibt „Bitte den Wiederherstellungscode eingeben.“
  2. Ein benutzter oder falscher Code wird abgelehnt.
  3. Die Wiederherstellung gibt den Gesamt-Export nicht frei (siehe E-06).
  4. „Neu erzeugen“ macht die bisherigen Codes ungültig.
- **Status:** live — **Verweis:** FEATURES KPIs

### E-05b – Sitzungen beenden
- **Story:** Als Nutzer möchte ich alle anderen angemeldeten Geräte abmelden können, damit ein verlorenes oder fremdes Gerät keinen Zugang mehr hat.
- **Ausgangslage:** Der Nutzer vermutet fremden Zugang oder hat ein Gerät verloren.
- **Ablauf:**
  1. Nutzer öffnet Einstellungen › Sicherheit, Abschnitt „Sitzungen“.
  2. „Angemeldete Geräte“ zeigt „n weitere Sitzungen aktiv“ oder „Keine anderen Sitzungen aktiv.“
  3. Er klickt „Alle anderen Sitzungen beenden“.
  4. Die App beendet diese Sitzungen; die eigene bleibt.
- **Ergebnis:** Nur noch das aktuelle Gerät ist angemeldet.
- **Abnahmekriterien:**
  1. Die Zahl der aktiven Sitzungen sinkt auf 0 weitere.
  2. Das aktuelle Gerät bleibt angemeldet.
  3. Ohne andere Sitzungen steht „Keine anderen Sitzungen aktiv.“
- **Status:** live — **Verweis:** FEATURES KPIs

### E-06 – Alle Daten als CSV-ZIP exportieren
- **Story:** Als Nutzer möchte ich alle Konten, Depots, Buchungen und Quellenverläufe als CSV-ZIP herunterladen, damit meine Daten mir gehören und ich sie auch ohne die App lesen kann.
- **Ausgangslage:** Der Nutzer will eine Kopie seiner Daten (z. B. für das Archiv oder die Steuer).
- **Ablauf:**
  1. Nutzer öffnet Einstellungen › CSV-Export und klickt „ZIP-Export herunterladen“.
  2. Die App verlangt die erneute Bestätigung mit dem Passkey.
  3. Nach der Bestätigung meldet die App „Export wird erstellt …“ und lädt die Datei `budget-export-<Datum>.zip`.
- **Ergebnis:** Eine ZIP-Datei mit CSV-Dateien liegt auf dem Gerät; in der App ändert sich nichts.
- **Abnahmekriterien:**
  1. Der Export startet nur nach der Passkey-Bestätigung; ohne sie gibt es keinen Download.
  2. Ein Wiederherstellungscode-Login schaltet den Export nicht frei.
  3. Während eines laufenden Downloads ist der Knopf gesperrt („Ein Download läuft bereits.“).
  4. Schlägt der Export fehl, bleibt die Seite benutzbar und zeigt einen festen Fehlertext ohne Serverdetails.
- **Status:** live — **Verweis:** FEATURES KPIs

### E-07 – Verschlüsselte Sicherung herunterladen und wiederherstellen
- **Story:** Als Nutzer möchte ich eine verschlüsselte Sicherung meiner Datenbank haben und im Notfall wiederherstellen können, damit ein Serverausfall nicht meine Daten kostet.
- **Ausgangslage:** Nachts entsteht eine verschlüsselte Kopie. Der Nutzer will sie sehen oder lokal sichern.
- **Ablauf:**
  1. Nutzer öffnet Einstellungen › CSV-Export, Abschnitt „Verschlüsselte Sicherung“.
  2. „Letzte abgeschlossene Nachtsicherung“ nennt Stand und Datei.
  3. Er klickt „Verschlüsselte Sicherung herunterladen“ und bestätigt mit dem Passkey.
  4. Die App lädt `budget-<Datum>.tar.age`.
  5. Einmal im Monat prüft die App nachts selbst: Sie liest die letzte verschlüsselte Nachtkopie vollständig zurück, stellt den Stand des Sicherungsspeichers in eine Prüfkopie wieder her, prüft sie (SQLite-Integritätsprüfung, Zeilenzahlen aller Tabellen, Kontostände) gegen die laufende Datenbank und löscht die Kopie sofort. Die Live-Datenbank wird nie verändert.
  6. Unter „Verschlüsselte Sicherung“ steht „Wiederherstellung zuletzt geprüft am …, in Ordnung“ (oder „fehlgeschlagen“ / „nicht durchgeführt“ mit Grund, z. B. zu wenig freier Speicher).
  7. Eine fehlgeschlagene oder überfällige Probe (letzte erfolgreiche älter als 40 Tage) erscheint unter Konten › Prüfen.
  8. Die echte Wiederherstellung im Ernstfall läuft über den Betreiber-Ablauf (Runbook `docs/ops.md`), nicht in der App. Die App kann die Nachtkopien nicht entschlüsseln (nur der öffentliche Schlüssel liegt auf dem Server); das Entschlüsseln prüft der Nutzer halbjährlich selbst.
- **Ergebnis:** Eine verschlüsselte Sicherungsdatei liegt lokal; nachts entsteht automatisch eine neue.
- **Abnahmekriterien:**
  1. Die Nachtkopie ist vorhanden und mit Datum sichtbar.
  2. Ist noch keine Sicherung fertig, steht „Es ist noch keine abgeschlossene verschlüsselte Sicherung verfügbar. Bitte nach dem nächsten Nachtlauf erneut versuchen.“
  3. Der Download erfordert Passkey-Bestätigung.
  4. Die App stellt monatlich automatisch eine Probe-Wiederherstellung her und zeigt Datum, Sicherungsname und Ergebnis (in Ordnung / fehlgeschlagen / nicht durchgeführt mit Grund).
  5. Eine fehlgeschlagene oder mehr als 40 Tage überfällige Probe erzeugt einen Eintrag unter Konten › Prüfen.
  6. Die Prüfkopie wird nach jeder Probe gelöscht, auch bei Fehlern; reicht der freie Speicher nicht, wird die Probe mit Begründung ausgelassen.
- **Status:** teilweise live (Stand 26.11.2026: Wiederherstellungsprobe #1106 erledigt, Download-Teil #522 nicht geplant) — **Verweis:** FEATURES KPIs, #522, #1106
  Umgesetzt mit #1106 (Abnahme durch den Nutzer steht aus): automatische Monatsprobe des Litestream-Stands samt Lesbarkeitsprüfung der Nachtkopie. Bewusste Abweichung: Die App entschlüsselt die Nachtkopie nicht (kein privater Schlüssel auf dem Server); Entschlüsselung und belegfähige Offline-Absicherung (#522) bleiben beim Nutzer.

### E-08 – Änderungen rückgängig machen und wiederholen
- **Story:** Als Nutzer möchte ich jede Änderung mit „Rückgängig“ zurücknehmen und mit „Wiederholen“ erneut anwenden, damit ich ohne Angst ändern kann und Fehlklicks nichts zerstören.
- **Ausgangslage:** Der Nutzer hat gerade etwas gespeichert (Buchung, Zuweisung, Regel, Einstellung) und möchte es zurücknehmen.
- **Ablauf:**
  1. Nutzer speichert eine Änderung. Die App zeigt einen Hinweis mit „Rückgängig“.
  2. Er klickt „Rückgängig“. Die App stellt den vorherigen Stand wieder her (Gruppen von Änderungen gemeinsam).
  3. Er klickt „Wiederholen“, wenn er es sich anders überlegt.
- **Ergebnis:** Der alte Stand ist zurück oder die Änderung ist wieder da; beides ist protokolliert.
- **Abnahmekriterien:**
  1. Jede schreibende Änderung bietet „Rückgängig“.
  2. Eine zusammengehörige Gruppe (z. B. Sammelaktion) wird mit einem Klick komplett zurückgenommen.
  3. Hat sich der Stand inzwischen geändert, sagt die App „Wiederholen nicht möglich. Bitte prüfe den aktuellen Stand.“
  4. Eine Änderung, auf die andere aufbauen, lässt sich nicht einzeln zurücknehmen und die App erklärt warum.
- **Status:** live — **Verweis:** FEATURES KPIs
  Hinweis: Eine eigene Seite „Änderungsprotokoll“ gibt es im Code nicht; das Protokoll erreicht der Nutzer über „Rückgängig“ und „Wiederholen“. Zu klären: Reicht das für die ursprüngliche Story?

### E-09 – Privater Einrichtungsassistent in sechs Schritten
- **Story:** Als Nutzer möchte ich beim ersten Mal durch Willkommen, Konten, Einnahmen, Kategorien, Geld verteilen und Fertig geführt werden, damit ich ohne Vorwissen eine brauchbare Startkonfiguration bekomme.
- **Ausgangslage:** Ein neuer Nutzer ist angemeldet und hat noch keine Konten.
- **Ablauf:** (geplant, nach Issue #873; Route `/einrichtung`, getrennt von `/setup` für den Passkey)
  1. Nutzer öffnet `/einrichtung`. Schritt 1 „Willkommen“.
  2. Schritte 2 bis 5 (Konten, Einnahmen, Kategorien, Geld verteilen) lassen sich überspringen oder ausfüllen; „Zurück“ ist immer möglich.
  3. Jede echte Aktion (Konto anlegen usw.) nutzt die bestehenden Formulare mit Vorschau und „Rückgängig“.
  4. Schritt 6 „Fertig“ fasst zusammen. Der Fortschritt wird gespeichert und lässt sich später fortsetzen.
- **Ergebnis:** Eine Startkonfiguration oder ein gespeicherter Zwischenstand; Bestandsnutzer werden nie gezwungen.
- **Abnahmekriterien:**
  1. Ein Bestandsnutzer sieht den Assistenten nicht von selbst.
  2. Neuladen mitten im Ablauf setzt beim letzten unfertigen Schritt fort.
  3. Doppeltes Absenden legt kein Konto doppelt an.
  4. Die Passkey-Einrichtung bleibt unabhängig davon.
- **Status:** zurückgestellt (Issue nicht geplant geschlossen; Stand 26.11.2026) — **Verweis:** #873

### E-10 – Bei Veröffentlichung: Login, Onboarding und Glossar
- **Story:** Als Betreiber einer veröffentlichten App möchte ich einen vertrauenswürdigen Login, einen geführten Einstieg und ein Glossar, damit fremde Nutzer die App ohne Hilfe verstehen.
- **Ausgangslage:** Nur relevant, falls die App veröffentlicht wird. Heute ist sie ein privates Einzelnutzer-Werkzeug.
- **Ablauf:** (geplant, nach Issue #490)
  1. Der Login zeigt Marke und bei Fehler eine Zeile mit Hilfe; der Anmeldeknopf ist mindestens 48 px hoch.
  2. Der Einstieg zeigt eine Checkliste Konto, Startsaldo, erste Buchung.
  3. Das Glossar bleibt bewusst offen gelassen (Entscheidung 15.11.2026).
- **Ergebnis:** Login und Einstieg wie beschrieben; das Glossar ist bewusst offen gelassen.
- **Abnahmekriterien:**
  1. Ein neuer Nutzer kommt ohne Hilfe bis zur ersten Buchung.
  2. Ein Login-Fehler nennt, was zu tun ist.
  3. Am Handy ist alles ohne seitliches Scrollen bedienbar.
- **Status:** zurückgestellt (Issue nicht geplant geschlossen; Stand 26.11.2026) — **Verweis:** #490
  Bewusst offen gelassen (Glossar). Fehlt noch: Bewusst nach der Veröffentlichung; nicht vor den anderen Paketen bauen.

### E-11 – Konto anlegen und bearbeiten
- **Story:** Als Nutzer möchte ich Konten mit Typ, Startsaldo, Limits und Konditionen anlegen und ändern, damit Salden, Gruppen und Prognosen zur Wirklichkeit passen.
- **Ausgangslage:** Der Nutzer hat ein neues Konto bei einer Bank oder ein Konto ändert seine Konditionen.
- **Ablauf:**
  1. Nutzer öffnet Einstellungen › Konten und klickt „Konto anlegen“ oder beim Konto auf Bearbeiten.
  2. Er trägt „Name“ ein und wählt den „Kontotyp“ (Giro, Bargeld, Tagesgeld, Kreditkarte, Kredit, Depot, Krypto, P2P, Forderung, Sonstiges Vermögen, Sonstige Verbindlichkeit). Die App nennt die Gruppe in Seitenleiste und Übersicht.
  3. Je nach Typ erscheinen „Kartenlimit“, „Dispo“, „Zinssatz in Prozent“, „Monatsrate“, „Laufzeit ab/bis“, „Monatliche Gebühr“, für Depot oder Krypto „Verrechnungskonto“ und „Anlageklasse“.
  4. Er klickt „Speichern“. Die App meldet das Ergebnis; ein Hinweis bietet „Rückgängig“.
- **Ergebnis:** Das Konto steht in der passenden Gruppe; Salden und Kontoübersicht sind aktuell.
- **Abnahmekriterien:**
  1. Ohne Name: „Bitte einen Namen eintragen.“
  2. Ein Laufzeitende vor dem Beginn wird abgelehnt.
  3. Wurde das Konto inzwischen anderswo geändert, bleibt der Entwurf erhalten und die App bittet, den aktuellen Stand zu öffnen.
  4. Ungespeicherte Änderungen beim Schließen: Nachfrage „Ungespeicherte Änderungen verwerfen?“
  5. Der Typ bestimmt, ob der Saldo zu „Zu verteilen“ zählt oder nur zum Vermögen.
- **Status:** live — **Verweis:** FEATURES (Konten), E-01

### E-11a – Konto archivieren und wieder öffnen
- **Story:** Als Nutzer möchte ich ein nicht mehr benutztes Konto archivieren, damit es aus den Listen verschwindet, aber Buchungen und Verlauf erhalten bleiben.
- **Ausgangslage:** Ein Konto ist aufgelöst oder wird nicht mehr genutzt.
- **Ablauf:**
  1. Nutzer öffnet Einstellungen › Konten, bearbeitet das Konto und klickt „Archivieren“.
  2. Hat das Konto noch Saldo oder offene Buchungen, fragt die App nach und bietet „Trotzdem archivieren“.
  3. Das Konto erscheint unter „Geschlossene Konten“ („Buchungen und Verlauf bleiben erhalten“) und lässt sich wieder öffnen.
- **Ergebnis:** Konto ist aus den Listen und der Summe der aktiven Konten genommen; nichts wird gelöscht.
- **Abnahmekriterien:**
  1. Buchungen und Verlauf bleiben nach dem Archivieren abrufbar.
  2. Ein Konto mit Saldo fragt vor dem Archivieren nach.
  3. „Rückgängig“ holt das Konto zurück.
- **Status:** live — **Verweis:** FEATURES (Konten)

### E-12 – Warenkorb für die persönliche Inflation festlegen
- **Story:** Als Nutzer möchte ich festlegen, welche Ausgabenkategorien in meine persönliche Teuerung einfließen, damit der Wert meine echte Preisentwicklung zeigt und nicht Zinsen oder Einmaleffekte.
- **Ausgangslage:** Der Nutzer will den Warenkorb prüfen oder eine Kategorie ausschließen.
- **Ablauf:**
  1. Nutzer öffnet Einstellungen › Warenkorb. Kategorien stehen gruppiert, je mit „Zählt mit“ (Automatisch, Immer, Nie) und einer Erklärung, warum sie zählt oder nicht.
  2. Bei „Immer“ kann er unter „Preis aus der offiziellen Statistik“ eine „Preisgruppe 1“ (und optional „Preisgruppe 2“ mit Anteil) wählen.
  3. Unter „Ausnahmen“ wählt er einzelne Empfänger ab, die nicht als Preis zählen sollen (z. B. Zinsen).
  4. Die App meldet „Warenkorb gespeichert.“ und „Zur persönlichen Inflation“ öffnet den Report.
- **Ergebnis:** Die persönliche Inflation (Report) rechnet mit der neuen Auswahl; die Änderung ist rückgängig machbar.
- **Abnahmekriterien:**
  1. Jede Kategorie zeigt Status und Grund („Zählt mit“, „Zählt noch nicht mit: …“, „Ausgeschlossen“).
  2. Ein Anteil außerhalb 0,01 bis 99,99 % wird abgelehnt.
  3. Ohne Ausgabenkategorien steht „Noch keine Ausgabenkategorien angelegt.“
  4. Zählt eine Kategorie ohne Preisgrundlage nicht mit, wird sie nicht still als 0 gerechnet.
- **Status:** live — **Verweis:** Warenkorb (`docs/inflation-basket.md`)

### E-13 – Kontakte anlegen und umbenennen
- **Story:** Als Nutzer möchte ich Kontakte (Personen mit Auslagen oder Forderungen) in den Stammdaten anlegen und umbenennen, damit Salden und Verlauf der richtigen Person zugeordnet sind.
- **Ausgangslage:** Ein neuer Kontakt kommt dazu oder ein Name ist falsch.
- **Ablauf:**
  1. Nutzer öffnet Einstellungen › Kontakte und klickt „Neuer Kontakt“.
  2. Er trägt den Namen ein und speichert.
  3. Zum Umbenennen klickt er bei „<Name> umbenennen“, ändert den Namen und speichert.
  4. „Verlauf öffnen“ führt zum Kontoblatt des Kontakts.
- **Ergebnis:** Kontakt in Stammdaten; ID und Verlauf bleiben beim Umbenennen erhalten.
- **Abnahmekriterien:**
  1. Ohne Kontakte steht „Noch keine Kontakte angelegt.“
  2. Beim Umbenennen bleiben alle Buchungen und Salden dieselben.
  3. „Verlauf öffnen“ führt weiter zum Kontoblatt des Kontakts.
- **Status:** live — **Verweis:** FEATURES (Kontakte)

### E-13a – Aliase und Archivieren von Kontakten
- **Story:** Als Nutzer möchte ich einem Kontakt Aliase geben und ihn archivieren, damit ein Kontakt unter mehreren Schreibweisen erkannt wird und alte Kontakte die Liste nicht füllen.
- **Ausgangslage:** Banken schreiben denselben Menschen unterschiedlich. Ein Kontakt wird nicht mehr gebraucht.
- **Ablauf:**
  1. Nutzer öffnet Einstellungen › Kontakte und klickt beim Kontakt auf „Aliase“.
  2. Er trägt unter „Neuer Alias“ eine Schreibweise ein; „Alias <Name> entfernen“ löscht sie.
  3. Zum Archivieren klickt er „Archivieren“. Gibt es noch offene Auslagen, ein Guthaben, verknüpfte Empfänger oder ein Forderungskonto, steht „Archivieren geht noch nicht:“ mit den Gründen.
  4. Archivierte Kontakte stehen unter „Archiviert“ und lassen sich mit „Wieder öffnen“ zurückholen.
- **Ergebnis:** Aliase werden beim Zuordnen genutzt; archivierte Kontakte sind aus der aktiven Liste, ihr Verlauf bleibt.
- **Abnahmekriterien:**
  1. Ein Alias, der schon als Name oder Alias vergeben ist, wird abgelehnt.
  2. Ein Kontakt mit offenem Saldo lässt sich nicht archivieren und die App nennt die Gründe.
  3. Archivieren löscht nichts; „Wieder öffnen“ stellt den Kontakt her.
- **Status:** live — **Verweis:** #869
  Hinweis: Issue #869 (Vertrag für Aliase, Archiv, Zusammenführen) ist noch offen; der Code bietet die Aktionen bereits. Status zu klären.

### E-13b – Kontakte zusammenführen
- **Story:** Als Nutzer möchte ich zwei Kontakte zu einem zusammenführen, damit Doppelte verschwinden, ohne dass Salden verrechnet werden.
- **Ausgangslage:** Dieselbe Person ist zweimal als Kontakt angelegt.
- **Ablauf:**
  1. Nutzer öffnet Einstellungen › Kontakte und klickt beim Quell-Kontakt auf „Zusammenführen“.
  2. Er wählt unter „Zusammenführen mit“ den Ziel-Kontakt („Kontakt wählen“).
  3. Die App zeigt die „Vorschau der Zusammenführung“ oder „Zusammenführen geht so nicht:“ mit Gründen (z. B. beide haben ein Forderungskonto; ein Guthaben würde mit Auslagen verrechnet).
  4. Nutzer bestätigt. Die App meldet „Kontakte zusammengeführt.“
- **Ergebnis:** Ein Kontakt bleibt bestehen, der andere ist zusammengeführt; Buchungs-IDs, Beträge und Status bleiben unverändert, nichts wird stillschweigend verrechnet.
- **Abnahmekriterien:**
  1. Ohne Vorschau lässt sich nicht bestätigen („Zuerst die Vorschau prüfen, dann bestätigen.“).
  2. Ein Guthaben wird nie automatisch mit offenen Auslagen des anderen verrechnet.
  3. Haben sich die Daten geändert, verlangt die App die Vorschau neu.
  4. Nach erfassten Zahlungen lässt sich die Zusammenführung nicht mehr rückgängig machen; die App warnt davor.
- **Status:** live (Stand 26.11.2026: alle verknüpften Issues erledigt; Nutzerabnahme offen) — **Verweis:** #871, #869 (siehe auch C-04)
  Fehlt noch: Vertrag und Freigabe (#869, #871) sind offen; der Dialog mit Vorschau ist im Code vorhanden. Abgleich mit C-04 (dort „geplant“).

### E-14 – Empfänger zusammenführen, Hauptempfänger und Alias
- **Story:** Als Nutzer möchte ich ähnliche Empfänger (Tippfehler, „Payment for Bäckerei Muster“ neben „Bäckerei Muster“) zu einem Hauptempfänger zusammenführen und die alten Namen als Alias behalten, damit Auswertungen einen Händler nicht mehrfach zeigen und spätere Bankzeilen mit dem alten Text gleich den Hauptempfänger vorschlagen.
- **Ausgangslage:** Durch Bankzeilen, Wallets und Tippfehler gibt es mehrere Empfänger für denselben Händler.
- **Ablauf:**
  1. Nutzer öffnet Einstellungen › Empfänger. Oben steht „Mögliche Dubletten“ mit Gruppen ähnlicher Namen (gleich nach Groß-/Kleinschreibung, Umlauten, Leerzeichen, Präfixen wie „Payment for“ oder „Zahlung an“, angehängter Ortsangabe oder Nummer, kleiner Tippfehler). Darunter steht die Liste aller Empfänger mit Anzahl der Buchungen und letzter Verwendung; Suche und Umbenennen sind dort möglich.
  2. Er klickt bei einer Gruppe auf „Zusammenführen …“ oder wählt in der Liste mindestens zwei Empfänger aus und klickt „Ausgewählte zusammenführen“.
  3. Im Dialog wählt er den Hauptempfänger (vorgeschlagen ist der mit den meisten Buchungen). Die Vorschau nennt „n Buchungen, m Regeln wechseln zu <Hauptempfänger>“ und die Namen, die Alias werden. Geprüfte (gesperrte) Buchungen bleiben, bis er das Häkchen zum Entsperren setzt.
  4. Er klickt „Zusammenführen bestätigen“. Die App meldet „Empfänger zusammengeführt.“ mit „Rückgängig“.
  5. Unter dem Hauptempfänger stehen die Aliase; „Entfernen“ löscht einen Alias (ebenfalls rückgängig machbar).
- **Ergebnis:** Buchungen und Zuordnungsregeln der anderen Empfänger gehören dem Hauptempfänger; die alten Namen sind Alias, sodass spätere Bankzeilen mit diesem Text (in jeder Datenquelle) den Hauptempfänger als Vorschlag bekommen. Kein Betrag und kein Saldo ändert sich.
- **Abnahmekriterien:**
  1. Es wird nie von selbst zusammengeführt; Dubletten sind nur Vorschläge.
  2. „Rückgängig“ stellt Buchungen, Regeln, Empfänger und Aliase in einem Schritt wieder her.
  3. Systemempfänger (z. B. Eröffnungssaldo) erscheinen nicht und lassen sich nicht zusammenführen.
  4. Ohne Auswahl von mindestens zwei Empfängern ist „Ausgewählte zusammenführen“ gesperrt.
  5. Am Handy bleibt die Seite ohne seitliches Scrollen bedienbar.
- **Status:** live (Stand 26.11.2026: alle verknüpften Issues erledigt; Nutzerabnahme offen) — **Verweis:** #1202 (Kontakte siehe E-13b, #871)

### E-15 – Krypto-Quellbewegungen als Vorgang abgleichen
- **Story:** Als Nutzer möchte ich, dass die App zusammengehörige Bewegungen der Krypto-Quelle (Kauf mit Gebühr, Staking-Belohnung, Sparplan) als einen Vorgang gegen meine Trades und Buchungen abgleicht, damit nur echte Lücken offen bleiben und nichts doppelt erfasst wird.
- **Ausgangslage:** Die Krypto-Lesequelle ist verbunden, Konten und Instrumente sind zugeordnet, „Bewegungen ab“ ist gesetzt.
- **Ablauf:**
  1. Nutzer öffnet Einstellungen › Datenquellen › Krypto-Lesequelle und klickt „Abgleich neu ausführen“.
  2. Bewegungen, deren Kennung in einem aus der Quelle aufgebauten Trade steht, gelten als erfasst, egal an welchem Tag oder mit welchem Betrag der Trade steht. Monatliche Sammelbuchungen von Belohnungen decken alle enthaltenen Bewegungen ab.
  3. Sparplan-Bewegungen finden ihre Bankbuchung bis zu zehn Tage daneben; nähere Treffer haben Vorrang.
  4. Kauf, Verkauf, Gebühr im Plattform-Token und Staking-Umbuchungen gehören zu einem Vorgang. Die App bucht nie selbst eine Einzahlung oder Ausgleichsbuchung.
  5. Was keine Gegenbuchung hat, bleibt offen und nennt, was fehlt. Der Abgleich ist ein Schritt mit „Rückgängig“.
  6. Die Bestandsabweichung je Wert wird danach neu berechnet und nennt die Ursache: Zuordnung fehlt, Bewegung fehlt (offene Bewegungen ergeben genau die Differenz) oder echte Differenz.
- **Ergebnis:** Erfasste Bewegungen sind erledigt, die Abweichung nennt ihre Ursache, und ein zweiter Lauf ändert nichts.
- **Abnahmekriterien:**
  1. Ein zweiter Lauf ändert keinen Eintrag und legt keine Buchung oder keinen Trade an.
  2. Eine über die Kennung verbundene Zeile steht keiner anderen Bewegung zur Verfügung.
  3. „Rückgängig“ stellt die vorherigen Zustände der Einträge und Warnungen wieder her.
  4. Nicht lesbare Bewegungen nennen das fehlerhafte Feld (nie einen Wert).
  5. Eine Sparplan-Bewegung ohne Bankbuchung innerhalb von zehn Tagen bleibt offen.
- **Status:** live (Stand 26.11.2026: alle verknüpften Issues erledigt; Nutzerabnahme offen) — **Verweis:** #1205, #1081

- **Einstellungen aufgeräumt (Audit 27.11, #1380):** Empfänger: Dubletten zuerst, Suche, zunächst 50 Empfänger mit „Weitere anzeigen“, kompakte Zeilen. Kontakte: keine technischen Kennungen, je Kontakt eine Zeile mit Status und Aktionsmenü (⋯: Aliase, Zusammenführen, Archivieren, Umbenennen, Verlauf öffnen). Regelwerk am Telefon: Name volle Breite, Schwellen darunter, Aktionen in einer Zeile. Profil: Beschriftungen mit Abstand zum Feld. Vermögensstufen am Telefon: eine Karte je Stufe statt breiter Tabelle. Zuordnungsregeln: Titel und eine Zeile, Bedingungen aufklappbar. — **Status:** live mit Train 25 (Nutzerabnahme offen) — **Verweis:** #1380
