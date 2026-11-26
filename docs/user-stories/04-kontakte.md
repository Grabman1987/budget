# User-Stories – Kontakte

Bereich: „Konten › Kontakte“ (`/konten/kontakte`, Kontoblatt je Person unter `/konten/kontakte/$id`) und „Einstellungen › Kontakte“ (Stammdaten). Status und Verweise wie in `docs/USER-STORIES.md`. Story-IDs: C-*.

### C-01 – Forderungen und Guthaben je Kontakt führen
- **Story:** Als Nutzer möchte ich Kontakte mit Forderungen (Auslagen) und Guthaben führen, damit ich jederzeit weiß, wer mir wie viel schuldet, und mein Vermögen nicht um Geld überhöht ist, das ich nur vorgestreckt habe.
- **Ausgangslage:** Ich habe für jemanden bezahlt oder jemand hat mir Geld zurückgegeben.
- **Ablauf:**
  1. Ich erfasse in „Buchung erfassen“ eine Ausgabe und tippe in der Teilzeile auf „Für Kontakt auslegen“; ich wähle „Kontakt wählen“ oder „Kontakt neu anlegen“. Alternativ lege ich in „Konten › Kontakte“ mit „Kontakt anlegen“ einen „Neuer Kontakt“ an („Kontakt angelegt.“).
  2. Ich öffne „Konten › Kontakte“; die „Kontaktübersicht“ zeigt je Kontakt den „Saldo“.
     Widerspricht die gespeicherte Verrechnung eines Kontakts seinen Buchungen, bleibt die Liste benutzbar: dieser Kontakt zeigt seinen einfachen Saldo (Summe der Bewegungen) und den Hinweis „Verrechnung prüfen“ mit Link zur Detailseite; der Kontakt bleibt aus den Summen „Forderungen/Guthaben“ heraus und steht darüber separat („n Kontakte mit unklarer Verrechnung · Saldo … nicht in den Summen enthalten“, mit Sprung zur Zeile); Heute und das Vermögen werfen dadurch keinen Fehler, die Fälligkeitserinnerungen zählen ihn als nicht verfügbar (#1174).
  3. Ich öffne einen Kontakt; der „Verlauf“ zeigt Auslagen, Rückzahlungen und Ausgleiche.
  4. Kommt Geld zurück, erfasse ich eine Buchung mit „Rückzahlung von Kontakt“ oder tippe im Kontakt auf „Rückzahlung buchen“.
  5. Ohne Rückzahlung bleibt die Auslage offen und mindert mein Vermögen.
- **Ergebnis:** Der Kontaktsaldo ist gebucht; Vermögen und Heute berücksichtigen die offene Forderung.
- **Abnahmekriterien:**
  1. Der Kontakt zeigt Saldo und Verlauf.
  2. Eine Auslage mindert das Vermögen bis zur Rückzahlung.
  3. Ohne Kontaktbuchungen steht „In diesem Monat gibt es noch keine Kontaktbuchungen.“
  4. Ausgeglichene Kontakte stehen am Ende der Liste hinter dem Aufklapper „› Ausgeglichene Kontakte (n)“ und klappen nach unten auf (#1347). Der frühere Umschalter „Salden / Offene Posten“ hatte keine Wirkung auf die Daten und ist entfernt; „Bericht wechseln“ steht am Seitenanfang in der Kopfzeile (am Telefon im Berichtskopf).
  5. Ein Rückgängig („Rückgängig gemacht.“) stellt den vorherigen Saldo her.
- **Status:** live — **Verweis:** Y15

### C-02 – Abrechnung je Kontakt
- **Story:** Als Nutzer möchte ich je Kontakt eine Abrechnung mit laufendem Saldo abrufen, damit ich sie der Person vorlegen oder verschicken kann und beide denselben Stand sehen.
- **Ausgangslage:** Jemand fragt, was er mir noch schuldet, oder ich will Auslagen einfordern.
- **Ablauf:**
  1. Ich öffne „Konten › Kontakte“ und wähle den Kontakt.
  2. Der „Kontaktkontoauszug“ ist eine Tabelle mit „Datum“, „Empfänger“, „Betrag“ (mit Vorzeichen: Auslage plus, Rückzahlung minus) und „Verrechnen“ (Häkchen). Bei teilweise gedeckten Auslagen steht unter dem Betrag „Rest …“. Im Bericht „Kontakte“ sind die Zeilen nach Monaten gruppiert; nach jedem Monat steht „Stand Ende <Monat>: <Kontakt> schuldet dir …“ / „Guthaben …“ / „ausgeglichen“. Sichtbar ist alles seit dem letzten Stand 0; Älteres liegt unter „Vergangene Buchungen“. Die Fußzeile zeigt „Offen:“ und ggf. „Guthaben:“ mit „Guthaben ändern“.
  3. Ich blättere zu älteren oder späteren Bewegungen.
  4. Ich tippe „Text zum Kopieren“ und füge den Abschnitt in eine Nachricht ein; die App meldet „Abschnitt kopiert.“
- **Ergebnis:** Nur Anzeige und Zwischenablage; nichts wird gebucht oder versendet.
- **Abnahmekriterien:**
  1. Die Abrechnung zeigt Auslagen, Rückzahlungen und Ausgleiche mit laufendem Saldo.
  2. Der letzte Saldo stimmt mit der Kontaktübersicht überein.
  3. Ist Kopieren nicht möglich, steht „Kopieren nicht möglich. Text bitte manuell kopieren.“
  4. Ältere, nicht protokollierte Zuordnungen sind mit „Zuordnung nicht protokolliert“ gekennzeichnet.
  5. Die Spalte „Empfänger“ zeigt nur den Empfänger (kein „Auslage“, keine Notiz, kein zweites Datum); ein Klick öffnet die Ursprungsbuchung.
  6. Das Häkchen markiert nur die Zeile (nichts wird gespeichert, kein Dialog). Bei einer abgewählten offenen Auslage erscheint daneben die eigene Schaltfläche „Als Geschenk …“, die „Auslage als Geschenk übernehmen“ öffnet (#1347). Ohne Häkchen-Feld steht „–“: Rückzahlungen werden nicht verrechnet, sie gleichen Auslagen aus. Ein ausgegrautes Häkchen hat einen Hover-Hinweis mit dem Grund (bereits ausgeglichen, aus Guthaben entstanden, in dieser Ansicht nicht änderbar). Bei einer Auslage, die ein Kontakt zurückgezahlt hat, steht unter dem Empfänger „Ausgeglichen am TT.MM.JJJJ · Rückzahlung öffnen“ (bei Teilzahlung „Teilweise ausgeglichen am …“). Eine als Geschenk übernommene Auslage zeigt kein Häkchen, ist gedämpft und trägt die Marke „Geschenk“. Zahlt der Kontakt mehr oder weniger als offen, bleibt die Zuordnung (älteste zuerst) wie bisher; „Rest“ und der Monatsstand machen die Differenz sichtbar.
- **Status:** live (Tabelle mit Verrechnen-Häkchen und Monatsstand: Entwurf, private Abnahme offen) — **Verweis:** Y15

### C-03a – Rückzahlung gezielt einer Auslage zuordnen
- **Story:** Als Nutzer möchte ich beim Buchen einer Rückzahlung und später wählen, welche Auslagen sie begleicht, damit eine spätere Auslage (z. B. Miete) beglichen wird und nicht automatisch die älteste.
- **Ausgangslage:** Ein Kontakt hat mehrere offene Auslagen und überweist einen Betrag, der nicht zur ältesten passt.
- **Ablauf:**
  1. Ich öffne den Kontakt und tippe „Rückzahlung buchen“.
  2. Das Formular schlägt vor: „älteste offene Auslage zuerst“; „Anteile“ vor dem Speichern lassen sich ändern.
  3. Ich verteile den Betrag auf die gewünschten Auslagen; beim nachträglichen Zuordnen kann ich einen Rest ausdrücklich als Guthaben behalten.
  4. Ich tippe „Speichern“ („Rückzahlung gebucht.“).
  5. Nachträglich wähle ich „Rückzahlung neu zuordnen“ und ändere die Anteile („Rückzahlung neu zugeordnet.“).
  6. Bei einer älteren Rückzahlung übernehme ich zuerst ausdrücklich die bisherige Zuordnung. Bei abgeglichenen Buchungen bestätige ich die reine Zuordnungsänderung.
- **Ergebnis:** Die gewählten Auslagen sind beglichen; Saldo des Kontakts ändert sich nur durch den Betrag, nicht durch die Zuordnung.
- **Abnahmekriterien:**
  1. Zuordnung zu einer einzelnen Auslage ist wählbar, auch zu einer jüngeren.
  2. Die Anteile dürfen die Rückzahlung nicht übersteigen; beim Neuzuordnen bleibt der angezeigte Rest als Kontaktguthaben, auch wenn andere Auslagen offen sind.
  3. Eine Zuordnung über die offene Auslage hinaus wird abgelehnt.
  4. Nachträgliches Neuzuordnen ist rückgängig machbar.
- **Status:** live (Stand 26.11.2026: alle verknüpften Issues erledigt; Nutzerabnahme offen) — **Verweis:** #978
- Fehlt noch: private Abnahme. Die Zuordnungswahl der ursprünglichen Rückzahlung kann auch bereits automatisch verbrauchtes freies Guthaben einer anderen Auslage zuweisen.

### C-03b – Guthaben-Wahl auch nach automatischer Verrechnung
- **Story:** Als Nutzer möchte ich das Guthaben eines Kontakts als zweckgebunden oder Geschenk wählen können, auch wenn es schon automatisch mit einer später angelegten Auslage verrechnet wurde, damit meine Wahl nicht an „nicht mehr verfügbar“ scheitert.
- **Ausgangslage:** Eine Rückzahlung mit Überschuss wurde als freies Guthaben automatisch verrechnet; der Rest ist 0, und die Wahl wird abgelehnt.
- **Ablauf:**
  1. Ich öffne den Kontakt; im Abschnitt „Guthaben verwenden“ steht das Guthaben mit „automatisch verrechnet: …“.
  2. Ich tippe „Guthaben ändern“ (Dialog „Kontaktguthaben verwenden“).
  3. Ich wähle „Als freies Kontaktguthaben behalten“, „Für Kategorie vormerken“ (mit „Kategorie wählen“) oder „Geschenk erhalten (Einnahme)“.
  4. Hat die automatische Verrechnung den Rest aufgebraucht, nimmt die App die benötigten automatisch verrechneten Cent zurück; betroffene Auslagen werden wieder offen. Abgeglichene Buchungen erfordern eine ausdrückliche Bestätigung.
  5. Ich speichere („Guthaben geändert.“).
- **Ergebnis:** Das Guthaben hat die gewählte Verwendung; Kontostände und Vermögen bleiben unverändert, „Zu verteilen“ ändert sich nur bei Geschenk oder Zweckbindung.
- **Abnahmekriterien:**
  1. Die Wahl bleibt nachträglich änderbar, auch bei Rest 0.
  2. Betroffene Auslagen bleiben nach dem Zurücknehmen der Verrechnung korrekt offen oder beglichen.
  3. Ohne Budgetkonto (oder bei Vormerkung ohne Kategorie) meldet das Formular „Bitte ein Budgetkonto und bei Vormerkung eine Kategorie wählen.“
  4. Rückgängig stellt die vorherige Verwendung wieder her.
- **Status:** live (Stand 26.11.2026: alle verknüpften Issues erledigt; Nutzerabnahme offen) — **Verweis:** #978
- Fehlt noch: private Abnahme. „Geschenk an Kontakt“ ist eine eigene Aktion an einer offenen Auslage, keine Guthaben-Wahl. Sie erlässt höchstens den offenen Anteil, behält die Ursprungskategorie und verändert Kontostände und Vermögen nicht. Eine alleinstehende Auslage benötigt eine ausdrücklich gewählte Ausgabenkategorie.

### C-03c – Kontakt-Korrekturen per Betreiber-Befehl
- **Story:** Als Betreiber möchte ich einmalige Korrekturen an Kontakt-Zuordnung und Guthaben-Wahl per Befehl mit Probelauf ausführen, damit ich echte Altdaten sicher bereinige, ohne die App-Oberfläche zu belasten.
- **Ausgangslage:** Bestehende echte Daten haben Zuordnungen, die in der Oberfläche nicht mehr erreichbar sind.
- **Ablauf:**
  1. Ich lege eine Korrekturdatei an (ohne echte Daten im Repo).
  2. Ich starte `migrate-cli contact-allocate --file <json> --dry-run`; der Lauf prüft `adopt`, `reallocate`, `credit` und `waive` ohne Speicherung. Nach einer Zusammenführung kann ich die Ziel-ID oder die alte Kontakt-ID verwenden; historische Buchungs-IDs bleiben erhalten.
  3. Ich prüfe Salden und Vermögen vorher und nachher.
  4. Ich führe den Befehl ohne `--dry-run` aus; erfolgreiche Einträge teilen eine Audit-Gruppe. Abgeglichene betroffene Buchungen benötigen `--unlock` ausschließlich für diese Kontaktentscheidung.
  5. Bei Bedarf nehme ich sie per `undo-group` zurück.
- **Ergebnis:** Kontakt-Zuordnungen sind korrigiert; es gibt einen Audit-Eintrag und eine Rückgängig-Gruppe.
- **Abnahmekriterien:**
  1. `--dry-run` schreibt nichts und zeigt die geplanten Änderungen.
  2. Kontostände und Vermögen sind vor und nach dem Lauf gleich.
  3. `undo-group` stellt den Zustand vor dem Lauf her.
  4. Ein unbekannter oder fremder Kontakt bzw. eine fremde Auslage wird ohne Teilschreibung dieses Eintrags abgelehnt; andere gültige Einträge können angewendet werden (Exitcode 3 bei abgelehnten Einträgen, siehe `docs/ops.md`).
  5. Nach einer Zusammenführung gehören historische Rückzahlungen und Auslagen zur gemeinsamen Kontaktidentität; fremde Kontakte bleiben ausgeschlossen. Bankbetrag, Datum, Konto und Abgleichstatus bleiben auch mit `--unlock` unverändert.
- **Status:** live (Stand 26.11.2026: alle verknüpften Issues erledigt; Nutzerabnahme offen) — **Verweis:** #978
- Fehlt noch: Integration und private Abnahme der Identitätsprüfung im Betreiber-Befehl nach Zusammenführungen. Lokale synthetische Tests ersetzen die private Abnahme nicht.

### C-04 – Kontakte zusammenführen
- **Story:** Als Nutzer möchte ich doppelte Kontakte zusammenführen, damit Salden und Verlauf einer Person an einer Stelle stehen und keine Forderung doppelt oder getrennt auftaucht.
- **Ausgangslage:** Dieselbe Person ist zweimal angelegt (z. B. Kurzname und Vollname).
- **Ablauf:**
  1. Ich öffne „Einstellungen › Kontakte“ (Kontakt-Stammdaten) und wähle beim doppelten Kontakt die Aktion „Zusammenführen“.
  2. Im Dialog „Kontakte zusammenführen“ wähle ich bei „Zusammenführen mit“ den Zielkontakt.
  3. Die App zeigt die „Vorschau der Zusammenführung“ („Zuerst die Vorschau prüfen, dann bestätigen.“).
  4. Ich bestätige; die App meldet „Kontakte zusammengeführt.“
  5. Der Name des Quellkontakts bleibt als Alias; mit „Rückgängig“ lässt sich die Zusammenführung zurücknehmen.
- **Ergebnis:** Ein Kontakt; die ursprünglichen Buchungs-IDs, Beträge und Status bleiben unverändert; nichts wird hart gelöscht.
- **Abnahmekriterien:**
  1. Zusammenführen geht nur nach Vorschau und Bestätigung.
  2. Der Kontakt als Ziel muss ein anderer, nicht archivierter sein („Wähle einen anderen Kontakt als Ziel.“).
  3. Lassen sich die Salden nicht sicher zusammenführen, bricht die App ab: „Die Salden beider Kontakte lassen sich nicht sicher zusammenführen.“ (kein stilles Verrechnen).
  4. Haben sich Daten zwischenzeitlich geändert, verlangt die App eine neue Vorschau.
  5. Rückgängig stellt beide Kontakte mit ihren Salden her.
- **Status:** live (Stand 26.11.2026: alle verknüpften Issues erledigt; Nutzerabnahme offen) — **Verweis:** #871, #869
- Hinweis: Im Code ist ein Dialog bereits vorhanden (PR #1046, „Contact merge: preview, commit, Undo“); #871 und #869 sind offen. Status vor Abnahme klären, ob „geplant“ noch stimmt. Ohne diese Klärung gilt oben der im Code vorgefundene Ablauf.

### C-08 – Verknüpfte Auslage nach Rückfrage korrigieren

- **Story:** Als Nutzer möchte ich eine bereits einer Rückzahlung zugeordnete Auslage korrigieren oder löschen können, ohne Verknüpfungen selbst aufzulösen.
- **Flow:** Opening an outlay allocated by a repayment asks „Verknüpfte Auslage wirklich bearbeiten?“ and gives the repayment dates. Cancel and Escape close the question. „Bearbeitung bestätigen“ opens the form and authorizes the edit in this opening. Deletion has its own confirmation. Allocations that fit are retained. Any released amount becomes credit on the existing repayment, with the newest allocation reduced first.
- **Abnahmekriterien:** Ohne `unlockContactLinked` (Löschen: `unlockLinked`) antwortet die API mit `contact_linked` und ändert nichts. Mit Bestätigung gilt: Summe der Zuordnungen je Auslage höchstens deren Anteil; Kontaktsaldo = Auslagen minus Rückzahlungen; Guthaben + Zuordnungen = Rückzahlung. Der Override (mit Grund) ist im Protokoll gespeichert, und ein Rückgängig stellt Buchung, Zuordnungen und Kategorierückgaben in einem Schritt wieder her.
- **Status:** live (Stand 26.11.2026: alle verknüpften Issues erledigt; Nutzerabnahme offen) — **Verweis:** #1108

### C-09 – Bezahlt für: Anteil mit vorhandenem Guthaben des Kontakts verrechnen

- **Story:** Als Nutzer möchte ich beim Erfassen sehen, dass ein Kontakt seinen Anteil schon vorab bezahlt hat, damit die Zeile nicht so tut, als würde ich auslegen.
- **Ablauf:** In „Bezahlt für“ zeigt jede Anteilszeile eines Kontakts mit Guthaben, wie viel Guthaben er hat und was danach übrig ist. Deckt das Guthaben den Anteil, steht „Bereits beglichen“ und die Zeile „Kategorie trägt …“ nennt den Betrag ohne den beglichenen Anteil. Deckt es nur einen Teil, steht, wie viel verrechnet wird und dass der Rest bis zur Rückzahlung offen bleibt. Ohne Guthaben bleibt der bisherige Text. Das Guthaben gilt zum Buchungsdatum und für die gewählte Kategorie; mehrere Anteile desselben Kontakts verbrauchen es nacheinander, nie doppelt.
- **Abnahmekriterien:** Die Verrechnung selbst läuft wie bisher beim Speichern in derselben Änderungsgruppe, ohne Geldbewegung: Kontaktsaldo vorher = nachher minus Anteil, Guthaben + Zuordnungen = Rückzahlung, die Konten ändern sich nur um den Einkauf; ein Rückgängig stellt Buchung und Verrechnung gemeinsam wieder her. Beim Bearbeiten einer bestehenden Buchung erscheint der Hinweis noch nicht.
- **Status:** live (Stand 26.11.2026: alle verknüpften Issues erledigt; Nutzerabnahme offen) — **Verweis:** #1147. Erster Teil: Anzeige mit vorher/nachher und Texte je Fall; die Verrechnung war schon vorhanden und ist nun durch API-Tests mit synthetischen Beträgen abgesichert. Offen: Auswahl „nicht verrechnen“ pro Anteil, Hinweis beim Bearbeiten, Browser-Abnahme. Keine Live-Abnahme behauptet.

**Delivery update (#1147).** In new shared purchases, each contact share with eligible credit has a checked “Mit Guthaben verrechnen” option. Clearing it keeps the credit available and leaves that share open. A later share can use the retained credit. The preview shows eligible credit before and after the choice and respects reservations already saved for later dates. Saving and Undo use the same booking group. The choice is made during capture. Editing a previously saved purchase keeps its recorded offset.

### C-10 – Zahlung eines Kontakts per Abhakliste aufteilen

- **Story:** Als Nutzer möchte ich eine Sammelüberweisung eines Kontakts beim Erfassen auf seine offenen Posten verteilen, damit ich sie nicht von Hand aufteilen muss und Auslagen, Beiträge und Rest sauber verbucht sind.
- **Ausgangslage:** Ein Kontakt überweist einen Betrag, der mehrere Dinge deckt (z. B. 845,00 € = Mietanteil 800,00 € + Abo 19,99 € + Auslage 25,01 €, synthetisches Beispiel).
- **Ablauf:**
  1. In „Buchung erfassen“ wähle ich „Einnahme“, Betrag, Konto, Datum und bei der Zeile „Rückzahlung von Kontakt“ den Kontakt. Dieselbe Liste erscheint auch, wenn ich stattdessen einen Empfänger/Zahler wähle, der zu einem Kontakt gehört; der eingegebene Name bleibt als Empfänger der Buchung.
  2. Unter den Zeilen erscheint eine Liste: Kopfzeile „Erhalten“ mit dem Betrag, je offenem Posten eine Zeile mit Häkchen (erwartete Beiträge des Kontakts mit „→ Kategorie“, danach offene Auslagen, älteste zuerst; Auslagen vorab angehakt, von den Beiträgen der erste; weitere Beiträge lassen sich dazu anhaken, jeder bekommt einen eigenen Teil und eine eigene Verknüpfung; ein Beitrag ohne Ziel steht ausgegraut; je Zeile zeigt „davon“, was angerechnet wird) offene Guthaben des Kontakts als eigene Zeilen „Guthaben“ mit negativem Betrag (vorab angehakt; ein Guthaben, das sich nicht auf bestehende Auslagen anrechnen lässt, z. B. mit Kategorie vorgemerkt, steht ausgegraut) und die Fußzeile „Rest“, die bei jedem Häkchen mitrechnet.
  3. Rest 0,00 €: alles angehakt ist beglichen. Rest unter 0: „bleibt offen bis nächsten Monat“ (Vorgabe) oder „schenken“. Rest über 0: „als Guthaben für nächsten Monat stehen lassen“ (Vorgabe) oder „als Geschenk an mich buchen“ (Einnahmeart Geschenke).
  4. „Speichern“ rechnet angehakte Guthaben zuerst auf die angehakten Auslagen an (bestehende Zuordnung der Rückzahlung, gleiche Änderungsgruppe), danach bucht es eine Buchung mit den passenden Teilen: Kategorie-Einnahmen der Beiträge, Rückzahlung der Auslagen und, je nach Wahl, Guthaben oder Geschenk; eine Kürzung trifft zuerst die Auslagen (jüngste zuletzt), erst danach die Beiträge.
- **Ergebnis:** Eine Buchung, eine Änderungsgruppe; „Rückgängig“ stellt Kontoblatt, Guthaben, Salden und Verknüpfungen exakt wieder her.
- **Abnahmekriterien:**
  1. 845,00 € bei Auslage 25,01 € und Beiträgen 800,00 € + 19,99 €: drei Zeilen, Rest 0,00 €, Teile ergeben 84500 Cent, Kontaktsaldo 0.
  2. 830,00 € alles angehakt: Rest −15,00 €; „bleibt offen“ lässt genau 15,00 € als Forderung offen, „schenken“ gleicht sie über den vorhandenen Geschenk-Weg aus.
  3. 860,00 € alles angehakt: Rest +15,00 €; „Guthaben“ erhöht das Kontaktguthaben um 15,00 €, „Geschenk an mich“ bucht 15,00 € als Einnahmeart Geschenke.
  4. Die Liste ist mit Tastatur bedienbar (Leertaste), Zeilen sind mindestens 44 px hoch.
  5. Auslage 300 und Guthaben 100: „Rest“ ist bei 200 erhalten 0,00 €, der Kontaktsaldo danach 0, das Guthaben verbraucht; „Rückgängig“ stellt Guthaben und offene Auslage wieder her.
  6. Hat der Kontakt keine offenen Posten, erscheint keine Liste und die Buchung läuft wie bisher.
  7. Zwei Beiträge in einer Zahlung (81.999 Cent = 80.000 + 1.999): zwei Teile, beide Verknüpfungen „erhalten“; jede Zeile zeigt nur ihren eigenen Teil, nie den Gesamtbetrag doppelt (Einnahmen des Monats, Plangenauigkeit, Prognose). Zu wenig bezahlt: der letzte Beitrag steht „abweichend“. „Rückgängig“ und Löschen der Buchung lösen beide Verknüpfungen.
  8. Neu aufteilen (#1336): Bei einer vorhandenen Einnahme eines Kontakts (Empfänger gehört zum Kontakt) bietet das Bearbeiten „Neu aufteilen“ an. Die Liste zeigt nur Beiträge, die eigenen Verknüpfungen sind angehakt; gespeichert wird nur, wenn die Auswahl den ganzen Betrag deckt (Rest 0,00 €). Betrag, Konto und Datum bleiben; Teile und Verknüpfungen ersetzt eine Änderungsgruppe, „Rückgängig“ stellt beides her. Geprüfte (gesperrte) und schon abgerechnete Buchungen (Auslagen zurückgezahlt) bleiben nach den üblichen Bearbeitungsregeln gesperrt.
- **Status:** live (Stand 26.11.2026: alle verknüpften Issues erledigt; Nutzerabnahme offen) — **Verweis:** #1322, #1336

- **Ergänzung Kontaktliste (#1354):** umgesetzt (Branch fix/header-language-1354-1356), Abnahme offen. Keine Bank-Sync-Kachel und kein Hinweis zur EUR-Führung mehr; die Tabelle liegt auf einer weißen Karte, der Stift steht neben dem Namen und die Saldo-Spalte ist rechtsbündig.
