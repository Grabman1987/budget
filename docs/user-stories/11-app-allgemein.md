# User-Stories – App allgemein

Bereich 11: PWA und Offline, Suche, Design hell/dunkel, Handy. Gesamtkatalog, Status- und Verweis-Legende: `docs/USER-STORIES.md`. Stand: 15.11.2026.
Grundlage: `docs/pwa.md`. Die App ist eine PWA: Hülle und Programmdateien liegen offline bereit, Finanzdaten nie. Offline erfasste Buchungen liegen nur auf dem Gerät, bis sie gesendet sind, und zählen bis dahin nicht zu Salden und Budget.

### A-01 – App installieren und aktuell halten
- **Story:** Als Nutzer möchte ich die App wie eine App auf dem Handy oder Rechner installieren und neue Versionen bewusst laden, damit sie schnell startet und mich eine Aktualisierung nicht mitten in der Eingabe stört.
- **Ausgangslage:** Der Nutzer hat die Adresse der App im Browser geöffnet. Oder eine neue Version liegt bereit.
- **Ablauf:**
  1. Nutzer installiert die App über die Funktion seines Browsers („Zum Startbildschirm“ bzw. „Installieren“). Einen eigenen Installieren-Knopf hat die App nicht.
  2. Die App startet im eigenen Fenster mit Marke und Hülle.
  3. Ist eine neue Version bereit, zeigt die App „Eine neue Version ist bereit. Speichere offene Eingaben vor dem Neuladen.“ mit „Jetzt neu laden“.
  4. Der Nutzer speichert seine Eingaben und klickt „Jetzt neu laden“. Die neue Version startet.
  5. Läuft die Sitzung ab, zeigt die App „Sitzung beendet“ und „Zur Anmeldung“.
- **Ergebnis:** Die App ist installiert; eine neue Version wird erst nach Klick aktiv. Ungesendete Offline-Buchungen bleiben dabei erhalten.
- **Abnahmekriterien:**
  1. Die installierte App startet und zeigt die Anmeldung oder Heute.
  2. Die neue Version aktiviert sich nie von selbst; erst „Jetzt neu laden“ tut es.
  3. Nach Sitzungsende gehen ungesendete Offline-Buchungen nicht verloren.
  4. Ein Neustart ohne Netz zeigt die Hülle mit Verbindungshinweis, ohne Finanzzahlen.
- **Status:** teilweise — **Verweis:** Y26
  Fehlt noch: Abnahme auf einem echten iPhone (Installation und Passkey) durch den Nutzer.

### A-01a – Buchung offline erfassen und später senden
- **Story:** Als Nutzer möchte ich unterwegs ohne Netz eine Buchung erfassen und später senden, damit ich Ausgaben sofort festhalte und nichts vergesse.
- **Ausgangslage:** Der Nutzer hat kein oder schlechtes Netz und gibt gerade Geld aus. Er hat die Erfassungs-Auswahl (Konten, Kategorien) einmal online geladen.
- **Ablauf:**
  1. Nutzer öffnet die App offline. Sie zeigt „Budget ist offline“ mit „Buchung erfassen“.
  2. Er klickt „Buchung erfassen“ und füllt das Formular („Buchung erfassen“). Auf dem Handy nutzt er den Knopf „Buchung erfassen“ der Schnellerfassung.
  3. Die App speichert die Buchung zuerst auf dem Gerät. Unter „Wartet auf Verbindung (n)“ steht sie mit dem Hinweis „Auf diesem Gerät gespeichert. Erst nach dem Senden im Budget enthalten.“ In der Kopfzeile steht „n offline gespeichert“.
  4. Kommt das Netz zurück (oder beim Fokus der App), sendet die App der Reihe nach. Der Nutzer kann auch „Jetzt senden“ klicken.
  5. Gesendete Buchungen erscheinen im Budget mit „Buchung gesendet.“ und verschwinden aus der Warteschlange.
  6. Ziel für #1144 (noch offen): Eine abgelehnte Buchung wird als bearbeitbarer Entwurf mit „Buchung abgelehnt“, Servermeldung und gegebenenfalls Fehler-ID angezeigt. „Details kopieren“ übernimmt die Diagnose. Die übrigen Buchungen werden weitergesendet; der Nutzer kann den Entwurf korrigieren und ohne Dublette erneut senden.
- **Ergebnis:** Die Buchung ist nach dem Senden im Budget; bis dahin zählt sie nicht zu Salden und Budget.
- **Abnahmekriterien:**
  1. Offline erfasst, später gesendet: die Buchung erscheint nach dem Senden einmal in Alle Buchungen.
  2. Vor dem Senden steht sie nur in „Wartet auf Verbindung“, nicht in Salden.
  3. Ist die Sitzung abgelaufen, verlangt die App „Erneut anmelden“ und löscht die Warteschlange nicht.
  4. Ein geschlossenes Konto oder eine gelöschte Kategorie ergibt einen verständlichen Grund statt eines stillen Verlusts.
  5. Am Handy sind „Jetzt senden“ und „Buchung erfassen“ mit dem Finger treffbar.
  6. Von drei wartenden Buchungen werden die erste und dritte gespeichert, wenn die mittlere abgelehnt wird. Die mittlere steht als „Buchung abgelehnt“ mit Grund und Fehler-ID („Details kopieren“) in der Warteschlange und bleibt korrigierbar; nach Korrektur wird sie mit demselben Idempotenz-Schlüssel genau einmal gespeichert.
  7. Netzwerkfehler, Sitzungsablauf und HTTP 502–504 bleiben wiederholbar (die Reihenfolge wartet); fachliche Ablehnungen (4xx) und HTTP 500 mit `server_error` werden nicht endlos wiederholt und blockieren nichts.
- **Status:** live (Stand 26.11.2026: alle verknüpften Issues erledigt; Nutzerabnahme offen) — **Verweis:** Y26, #1144
  Serverdiagnose als erster Teil von #1144: Unerwartete Ledger-API-Fehler liefern eine kurze Fehler-ID. Das Serverprotokoll verknüpft sie mit Methode, Routenmuster und bereinigten Stackpositionen. Nur bekannte, datenfreie Fehlermeldungen werden protokolliert; unbekannte Meldungen bleiben redigiert.
  Kontakt-Replay-Fix in #1154: Rückdatierte Auslagen lassen gespeicherte automatische und ausdrückliche Verrechnungen unverändert. Neue Auslagen nutzen nur tatsächlich freies Kontaktguthaben; widersprüchliche Kontaktverrechnungen liefern eine deutsche 422-Antwort. Bereits gebundene Auslagen bleiben gegen wirtschaftliche Änderungen und Löschen geschützt. Der Fix ist durch DB- und API-Regressionstests geprüft; die Veröffentlichung ist damit noch nicht bestätigt.

Queue acceptance for #1144 is covered by `e2e/issue-1144-queue.spec.ts`.
Three offline captures exercise a middle HTTP 500, ordered delivery of both
neighbours, safe server message/error-ID copying, delivery-absence checking,
correction with the original key, and discard. Raw technical messages stay
redacted. Booking POST/PATCH tests cover German 422 responses to invalid splits
and contact references, rollback of all changes, and a correlated German 500
for inconsistent stored contact data. Physical-device acceptance remains open.

### A-01b – Offline den letzten Stand lesen
- **Story:** Als Nutzer möchte ich ohne Netz den zuletzt geladenen Stand von Heute und den Konten ansehen, damit ich unterwegs wenigstens grob weiß, wo ich stehe.
- **Ausgangslage:** Der Nutzer ist offline; die App war zuvor online geöffnet.
- **Ablauf:**
  1. Nutzer öffnet die App ohne Netz. Sie zeigt „Budget ist offline“.
  2. Mit „Heute“, „Kontensalden“ oder „Letzte Buchungen“ wählt er die Ansicht.
  3. Die App zeigt „Gespeicherter letzter Abruf · nur lesend. Für aktuelle Daten brauchst du eine Verbindung.“
  4. „Erneut verbinden“ lädt die Seite neu.
- **Ergebnis:** Nur lesender Zugriff auf den zuletzt gespeicherten Stand; es wird nichts geändert.
- **Abnahmekriterien:**
  1. Der Stand ist als nur lesend und nicht aktuell gekennzeichnet.
  2. Fehlt ein gespeicherter Stand, steht „Für diese Seite ist offline kein letzter Stand gespeichert.“
  3. Beim Abmelden werden die gespeicherten Finanzdaten vom Gerät entfernt.
- **Status:** teilweise — **Verweis:** Y26
  Fehlt noch: Der Katalog führt den Lesestand nicht einzeln; Abnahme der Anzeige auf einem echten Gerät offen. Zu klären: Welche Ansichten genau offline lesbar sind.

### A-02 – Wiederholtes Senden erzeugt keine Doppelbuchung
- **Story:** Als Nutzer möchte ich, dass ein erneutes Senden nach einem Verbindungsabbruch keine zweite Buchung oder zweiten Beleg erzeugt, damit meine Salden stimmen, auch wenn ich zweimal klicke oder die Antwort verloren geht.
- **Ausgangslage:** Das Netz bricht während des Sendens ab oder die Antwort kommt nicht an. Die App zeigt „Serverempfang unklar“.
- **Ablauf:**
  1. Nutzer klickt „Jetzt senden“ bei einer wartenden Buchung.
  2. Geht die Antwort verloren, bleibt die Buchung unverändert in der Liste mit „Serverempfang unklar. Mit „Jetzt senden“ prüfen, bevor du änderst oder löschst.“
  3. Beim nächsten „Jetzt senden“ erkennt der Server dieselbe Buchung am gleichen Schlüssel und liefert das alte Ergebnis, ohne neu zu buchen.
  4. Die App zeigt „Buchung gesendet.“ und räumt die Liste auf.
  5. Ein stabiler Status je Änderung (lokal gespeichert, wird gesendet, auf dem Server gespeichert mit Buchungsnummer und Zeit, fehlgeschlagen) ist geplant (#1075).
- **Ergebnis:** Genau eine Buchung und, wenn vorhanden, genau ein Beleg.
- **Abnahmekriterien:**
  1. Zweimal dieselbe wartende Buchung senden ergibt genau eine Buchung.
  2. Ein Fehler im zweiten Schritt hinterlässt keine halbe Buchung.
  3. Bei unklarem Empfang prüft die App erst den Serverstand, bevor sie erneut sendet.
  4. Der Status einer gespeicherten Änderung ist ohne Neuladen sichtbar.
  5. Wiederholtes Klicken auf Speichern erzeugt keine Dublette.
- **Status:** live (Stand 26.11.2026: alle verknüpften Issues erledigt; Nutzerabnahme offen) — **Verweis:** #559, #1075
  Fehlt noch: Idempotenz-Schlüssel für alle schreibenden Änderungen und Belege sowie der stabile Status je Änderung (#1075); für Buchungen aus der Warteschlange gibt es den Schlüssel schon.

### A-03 – Belege offline erfassen, Upload getrennt wiederholen
- **Story:** Als Nutzer möchte ich einen Beleg offline fotografieren und den Upload später getrennt wiederholen können, damit die Buchung nicht davon abhängt, ob die Datei schon angekommen ist.
- **Ausgangslage:** Der Nutzer hat eine Buchung mit Beleg erfasst, aber kein Netz oder der Upload schlug fehl.
- **Ablauf:** (geplant, nach #699 und #700)
  1. Nutzer erfasst eine Buchung und wählt unter „Beleg“ ein Foto oder eine Datei.
  2. Die App speichert die Buchung und legt die Datei als wartenden Upload auf dem Gerät ab.
  3. Die Liste zeigt den Upload als wartend, unklar oder blockiert mit „Erneut senden“ und „Abbrechen“.
  4. Nach dem Senden verknüpft die App die Datei als einen Beleg mit der Buchung.
  5. Beim bewussten Abmelden löscht die App wartende Dateien und erklärt das vorher; ein Sitzungsablauf behält sie bis zur erneuten Anmeldung.
- **Ergebnis:** Die Buchung ist gespeichert; die Datei kommt unabhängig nach.
- **Abnahmekriterien:**
  1. Der Beleg bleibt lokal erhalten, auch wenn der Upload scheitert; die Buchung bleibt gültig.
  2. Der Upload ist einzeln wiederholbar; ein verlorenes Antwort-Senden erzeugt genau einen Beleg.
  3. Ist der Speicher voll, sagt die App, dass die Datei nicht gespeichert wurde, und behält sie im Arbeitsspeicher.
  4. Beim Abmelden warnt die App vor dem Löschen wartender Dateien.
- **Status:** zurückgestellt (Issue nicht geplant geschlossen; Stand 26.11.2026) — **Verweis:** #699, #700
  Fehlt noch: Speicherung der Belegdateien auf dem Gerät, Wiederholungsablauf und Oberfläche; die Buchungs-Warteschlange ist unabhängig davon vorhanden.

### A-04 – Mit Strg+K / ⌘K suchen
- **Story:** Als Nutzer möchte ich mit einer Tastenkombination Seiten, Reports, Konten, Kategorien, Kontakte und Buchungen finden und Aktionen starten, damit ich nicht durch Menüs klicken muss.
- **Ausgangslage:** Der Nutzer will schnell zu einer Seite, einer Buchung oder einer Aktion.
- **Ablauf:**
  1. Nutzer drückt Strg+K (Mac: ⌘K) oder klickt „Suchen: Seiten, Reports, Buchungen, Aktionen“. Am Handy steht das Suchfeld in der Kopfzeile („Suchen“).
  2. Ohne Eingabe zeigt die Suche „Aktionen“ (Neue Buchung, Prüfen öffnen, Monatsabschluss starten, Datenschutz-Modus umschalten) und „Zuletzt verwendet“.
  3. Er tippt einen Begriff. Die Treffer sind nach Art gruppiert (Seite, Report, Konto, Kategorie, Empfänger, Kontakt, Buchung).
  4. Er wählt mit Pfeil auf/ab und Enter. Esc schließt die Suche.
  5. Die App öffnet das Ziel.
- **Ergebnis:** Das gewählte Ziel ist geöffnet; die Suche ändert keine Daten.
- **Abnahmekriterien:**
  1. Seiten, Reports, Konten, Kategorien und Kontakte sind auffindbar; Buchungen nach Empfänger, Notiz und Betrag (jüngste 200).
  2. Ohne Treffer steht „Keine Treffer.“
  3. Lädt die Suche nicht, steht „Die Suche ist nicht verfügbar.“ statt einer leeren Liste.
  4. Die Bedienung ist mit der Tastatur allein möglich.
  5. Am Handy erreicht der Nutzer die Suche über die Kopfzeile.
- **Status:** teilweise — **Verweis:** Y17
  Fehlt noch: Abnahme durch den Nutzer und die vollständige Prüfung (laut FEATURES „full verification pending“).

### A-05 – App hell und dunkel nutzen
- **Story:** Als Nutzer möchte ich zwischen hellem und dunklem Design wählen, damit die App bei Tag und Nacht gut lesbar ist und meine Augen schont.
- **Ausgangslage:** Der Nutzer arbeitet abends oder in heller Umgebung. Bis zur ersten Wahl folgt die App der Systemeinstellung.
- **Ablauf:**
  1. Nutzer klickt in der Seitenleiste auf „Dunkle Blaupause“ (im hellen Modus) bzw. „Heller Zeichenfilm“ (im dunklen Modus). Am Handy nutzt er den Knopf „Hell/Dunkel umschalten“ in der Kopfzeile.
  2. Die App wechselt sofort das Design.
  3. Die Wahl bleibt beim nächsten Start erhalten.
- **Ergebnis:** Alle Seiten erscheinen im gewählten Design; Daten ändern sich nicht.
- **Abnahmekriterien:**
  1. Beide Modi sind lesbar (Text auf Fläche mit ausreichendem Kontrast).
  2. Ohne bisherige Wahl folgt die App der Systemeinstellung.
  3. Die gewählte Einstellung bleibt nach Neuladen bestehen; fällt der Speicher aus, funktioniert die App weiter mit der Systemeinstellung.
  4. Karten, Dialoge und Tabellen sind in beiden Modi deckend lesbar.
- **Status:** live — **Verweis:** Y25

### A-06 – Sichtbares Zeichenbrett-Raster als Hintergrund
- **Story:** Als Nutzer möchte ich ein sichtbares Raster hinter den Inhalten, damit die App den gewünschten Zeichenbrett-Charakter hat und ich die Struktur erkenne, ohne dass Text auf dem Raster steht.
- **Ausgangslage:** Im Redesign bedeckt das Raster seit #1049 die Arbeitsfläche. Seit #1063 wird es als normaler Hintergrund gezeichnet; der ausgeschaltete Redesign-Pfad behält den Eckakzent.
- **Ablauf:** (nach Issue #1047)
  1. Nutzer öffnet eine beliebige Seite.
  2. Das Raster bedeckt die gesamte Arbeitsfläche, auch bei langen Seiten, ohne Naht.
  3. Karten, Dialoge, Tabellen bleiben deckend, sodass Text nie direkt auf dem Raster steht.
  4. Beim Drucken (Einseiter, Jahresbericht, Reporttabellen) fehlt das Raster.
- **Ergebnis:** Das Raster ist in beiden Designs sichtbar.
- **Abnahmekriterien:**
  1. Das Raster ist im hellen und im dunklen Modus auf normalem Betrachtungsabstand sichtbar, aber weit unter Text-Kontrast.
  2. Es deckt die ganze Fläche auf Desktop und Handy ohne Naht.
  3. Der Druck ist rasterfrei.
  4. Auf dem Handy bleibt die Seite flüssig (siehe A-08).
- **Status:** teilweise — **Verweis:** #1047, #1063, #1064
  Raster und Darstellungsregel sind umgesetzt. Fehlt noch: belastbare Leistungsprüfung gemäß A-08 und Abnahme auf einem echten Handy.

### A-07 – App am Handy sicher bedienen
- **Story:** Als Nutzer möchte ich die App am Handy mit dem Daumen sicher bedienen, damit ich Buchungen unterwegs erfasse und nichts Falsches antippe.
- **Ausgangslage:** Der Nutzer nutzt die App am Handy (ab 320 px Breite).
- **Ablauf:**
  1. Nutzer öffnet die App am Handy. Unten steht die „Hauptnavigation“ als Tab-Leiste, daneben die „Schnellerfassung“ mit „Buchung erfassen“.
  2. Er öffnet Seiten, Dialoge und Formulare; Panels erscheinen als Blätter von unten.
  3. Tabellen schalten auf Kartenansicht um; Beträge und Aktionen bleiben erreichbar.
  4. Der Datenschutz-Modus lässt sich mit einem Knopf umschalten.
- **Ergebnis:** Alle Hauptabläufe sind am Handy ohne Zoomen bedienbar.
- **Abnahmekriterien:**
  1. Tippflächen sind mindestens 44 px groß.
  2. Es gibt kein seitliches Scrollen der Seite (ab 320 px Breite).
  3. Der Knopf „Buchung erfassen“ ist jederzeit erreichbar und verdeckt keine Eingabe.
  4. Tastatur und Dialog überlappen keine Pflichtfelder.
  5. Hell und dunkel sind beide lesbar.
- **Status:** teilweise — **Verweis:** Y25
  Fehlt noch: Prüfung auf einem echten iPhone und vollständige Zustands- und Barrierefreiheits-Abnahme (A-10).

### A-08 – iPhone-Tests stabil
- **Story:** Als Nutzer möchte ich, dass die automatischen iPhone-Tests (WebKit) stabil laufen, damit Fehler am iPhone auffallen, bevor sie bei mir ankommen, und ein Raster die Seite nicht verlangsamt.
- **Ausgangslage:** Seit dem vollflächigen Raster brechen WebKit-Tests (Shard webkit-3-6) mit Zeitüberschreitung ab. Der Nutzer sieht das nicht direkt, aber es verdeckt echte Fehler.
- **Ablauf:** (technische Story, Ablauf nach Issue #1064)
  1. Die Diagnose vergleicht in WebKit denselben Plan-Ablauf mit heutigem Hintergrund, früherer Raster-Ebene und ohne Raster, jeweils hell und dunkel. Messprotokoll und Bilder bleiben als Testanhänge verfügbar.
  2. Bestätigt die Messung einen Raster-Engpass, wird die Darstellung bei gleichem Aussehen verbessert. Der normale Hintergrund aus #1063 und die Theme-Wartefunktion aus #1067 sind bereits vorhanden.
  3. Der Testlauf `webkit-3-6` läuft dreimal hintereinander grün.
- **Ergebnis:** Stabile Tests; das Raster bleibt, die Seite bleibt flüssig.
- **Abnahmekriterien:**
  1. Der WebKit-Lauf ist dreimal in Folge grün.
  2. Kein Test wird gelockert oder wiederholt, um grün zu werden.
  3. Die Ursache ist durch Messung belegt, nicht vermutet.
  4. Die Messung belegt durch berechnete Stile, welche Rastervariante aktiv war; Laufzeiten allein ersetzen keine Prüfung auf einem echten iPhone.
- **Status:** teilweise — **Verweis:** #1064, #1067
  Diagnoseprobe und bisherige Befunde: [Messprotokoll](../evidence/issue-1064-grid-timing.md). Fehlt noch: belastbare Vergleichsmessung, gegebenenfalls eine daraus begründete Darstellungsänderung und drei aufeinanderfolgende grüne `webkit-3-6`-Läufe auf dem endgültigen Stand.

### A-09 – Freigegebene Veröffentlichung mit Rollback
- **Story:** Als Nutzer möchte ich, dass eine neue Version erst nach meiner Freigabe live geht und ich sicher zurück kann, damit ein Fehler im Update nicht meine Daten oder meinen Alltag trifft.
- **Ausgangslage:** Eine überarbeitete Oberfläche soll live gehen. Sie ist hinter einem Schalter („Flag“) ausgeschaltet.
- **Ablauf:** (geplant, nach Issue #874)
  1. Der Kandidat wird auf einer Vorschau vom Nutzer geprüft und mit seiner Versionsnummer freigegeben.
  2. Die Veröffentlichung läuft nacheinander, mit dem Schalter zunächst aus.
  3. Eine eigene, vom Nutzer freigegebene Änderung schaltet ihn ein.
  4. Der Rückweg wird geprobt: eine geprüfte Änderung schaltet den Schalter wieder aus und wird neu veröffentlicht; nie wird eine alte Version einfach darübergelegt.
  5. Der Nutzer prüft nach dem Wechsel, dass die App läuft (Kontrolle des Zustands der Live-Version).
- **Ergebnis:** Eine bekannte, geprobte Rückkehr zum letzten guten Stand.
- **Abnahmekriterien:**
  1. Der Rollback ist geprobt und dokumentiert.
  2. Ohne ausdrückliche Freigabe des Nutzers wird nichts live geschaltet.
  3. Nach dem Rollback laufen ältere Lesezeichen und die installierte App.
  4. Die Datenbank bleibt mit dem ausgeschalteten Zustand kompatibel.
- **Status:** geplant — **Verweis:** #874
  Fehlt noch: Abhängig von #872 und #873; Ablauf ist ein Betreiber-Ablauf, keine Bildschirmfunktion der App.

### A-10 – Vollständige Zustands- und Barrierefreiheits-Abnahme
- **Story:** Als Nutzer möchte ich, dass alle Seiten Lade-, Leer-, Offline-, Konflikt- und Fehlerzustände sauber unterscheiden und mit Tastatur, Screenreader und großem Text nutzbar sind, damit ich mich auf die Anzeige verlassen kann.
- **Ausgangslage:** Alle Bereiche sind einzeln umgesetzt; eine Gesamtprüfung steht aus.
- **Ablauf:** (nach Issue #872)
  1. Alle Seiten, Panels und Dialoge werden gegen eine Prüfmatrix durchgegangen.
  2. Je Zustand wird geprüft: Laden gegen Aktualisieren, leer gegen fehlend, offline gegen veraltet, Konflikt gegen Fehler, verbotene Schreibzugriffe.
  3. Dazu kommen Fokus, Tippflächen von 44 px, 320 px Breite, beide Designs und reduzierte Bewegung.
  4. Der Nutzer führt Wochen-, Zahltag-, Monatsabschluss- und Quartalsroutinen mit Testdaten durch und meldet Lücken je Story-ID.
- **Ergebnis:** Eine Matrix mit belegten Ergebnissen; offene Lücken bleiben als offen stehen.
- **Abnahmekriterien:**
  1. Fehler, Leere und Laden sehen unterschiedlich aus und lügen nicht (kein „0“ für fehlende Daten).
  2. Alles ist per Tastatur bedienbar; Fokus bleibt sichtbar.
  3. Bei 320 px gibt es keine Überlappung und kein seitliches Scrollen.
  4. Echte Geräteprüfungen sind getrennt als Nutzerergebnis dokumentiert.
- **Status:** offen — **Verweis:** #872
  Fehlt noch: Alle abhängigen Bereiche der Neugestaltung sind abzuschließen, danach die Matrix; echte Geräteprüfung durch den Nutzer.

- **Ergänzung Seitenkopf und Sprache (#1354, #1356):** live mit Train 23 (Nutzerabnahme offen). Die Statuszeile (zu prüfen · überzogen) erscheint nur auf Heute und Plan, steht in einer Zeile ohne verwaisten Trenner; sonst bleibt nur das Prüfen-Zeichen. Konten-Übersicht und Alle Buchungen beschriften ihr Aktionsmenü am Desktop sichtbar und am Telefon per Tooltip und Namen. Vermögen: „Investment“ ist am Telefon beschriftet, der schwebende Plus-Knopf bleibt die Buchung. Einstellungen nutzen denselben Seitenkopf wie die anderen Bereiche; die Gruppenzeile wiederholt den Titel nicht. Texte: „Tage/Tsd.“ statt „T“, „Kategorien“ statt „Envelopes“, „ohne Deckung auf dem Konto“, Datumsangaben als TT.MM. bzw. TT.MM.JJJJ, Anteile unter 1 % als „< 1 %“.
