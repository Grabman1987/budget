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
  4. Ausgeglichene Kontakte sind ausgeblendet, bis „Auch ausgeglichene Kontakte“ aktiv ist.
  5. Ein Rückgängig („Rückgängig gemacht.“) stellt den vorherigen Saldo her.
- **Status:** live — **Verweis:** Y15

### C-02 – Abrechnung je Kontakt
- **Story:** Als Nutzer möchte ich je Kontakt eine Abrechnung mit laufendem Saldo abrufen, damit ich sie der Person vorlegen oder verschicken kann und beide denselben Stand sehen.
- **Ausgangslage:** Jemand fragt, was er mir noch schuldet, oder ich will Auslagen einfordern.
- **Ablauf:**
  1. Ich öffne „Konten › Kontakte“ und wähle den Kontakt.
  2. Das „Kontaktkontoauszug“ zeigt je Zeile „Datum / Buchung“, „Betrag“, „Zuordnung“ und den laufenden „Offen“-Saldo.
  3. Ich blättere zu älteren oder späteren Bewegungen.
  4. Ich tippe „Text zum Kopieren“ und füge den Abschnitt in eine Nachricht ein; die App meldet „Abschnitt kopiert.“
- **Ergebnis:** Nur Anzeige und Zwischenablage; nichts wird gebucht oder versendet.
- **Abnahmekriterien:**
  1. Die Abrechnung zeigt Auslagen, Rückzahlungen und Ausgleiche mit laufendem Saldo.
  2. Der letzte Saldo stimmt mit der Kontaktübersicht überein.
  3. Ist Kopieren nicht möglich, steht „Kopieren nicht möglich. Text bitte manuell kopieren.“
  4. Ältere, nicht protokollierte Zuordnungen sind mit „Zuordnung nicht protokolliert“ gekennzeichnet.
- **Status:** live — **Verweis:** Y15

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
- **Status:** teilweise — **Verweis:** #978
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
- **Status:** teilweise — **Verweis:** #978
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
- **Status:** teilweise — **Verweis:** #978
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
- **Status:** teilweise — **Verweis:** #871, #869
- Hinweis: Im Code ist ein Dialog bereits vorhanden (PR #1046, „Contact merge: preview, commit, Undo“); #871 und #869 sind offen. Status vor Abnahme klären, ob „geplant“ noch stimmt. Ohne diese Klärung gilt oben der im Code vorgefundene Ablauf.

### C-08 – Verknüpfte Auslage nach Rückfrage korrigieren

- **Story:** Als Nutzer möchte ich eine bereits einer Rückzahlung zugeordnete Auslage korrigieren oder löschen können, ohne Verknüpfungen selbst aufzulösen.
- **Ablauf:** Ich ändere Betrag oder Aufteilung der Auslage und speichere. Die App antwortet mit „Verknüpfte Auslage wirklich bearbeiten?“ und nennt die Daten der Rückzahlungen. „Abbrechen“ oder Escape ändert nichts; „Bearbeitung bestätigen“ führt Änderung (oder Löschen) aus. Passt der neue Anteil noch, bleibt die Zuordnung der Rückzahlung bestehen. Sonst wird die zuletzt erfasste Rückzahlung zuerst gekürzt und der Rest bleibt als Guthaben beim Kontakt stehen; die Auslage ist entsprechend wieder offen. Nichts wird verworfen, nichts doppelt gezählt.
- **Abnahmekriterien:** Ohne `unlockContactLinked` (Löschen: `unlockLinked`) antwortet die API mit `contact_linked` und ändert nichts. Mit Bestätigung gilt: Summe der Zuordnungen je Auslage höchstens deren Anteil; Kontaktsaldo = Auslagen minus Rückzahlungen; Guthaben + Zuordnungen = Rückzahlung. Der Override (mit Grund) ist im Protokoll gespeichert, und ein Rückgängig stellt Buchung, Zuordnungen und Kategorierückgaben in einem Schritt wieder her.
- **Status:** teilweise, zur Review vorbereitet — **Verweis:** #1108. Gilt für Auslagen mit einfachen Rückzahlungs-Zuordnungen (Bearbeiten und Löschen). Weiterhin gesperrt, mit Hinweis „zuerst Rückzahlung rückgängig machen“: Rückzahlungsbuchungen selbst, Geschenke/Abschreibungen, Auslagen mit verbrauchtem Guthaben oder Kategorierückgaben. Keine Live-Abnahme behauptet.

### C-09 – Bezahlt für: Anteil mit vorhandenem Guthaben des Kontakts verrechnen

- **Story:** Als Nutzer möchte ich beim Erfassen sehen, dass ein Kontakt seinen Anteil schon vorab bezahlt hat, damit die Zeile nicht so tut, als würde ich auslegen.
- **Ablauf:** In „Bezahlt für“ zeigt jede Anteilszeile eines Kontakts mit Guthaben, wie viel Guthaben er hat und was danach übrig ist. Deckt das Guthaben den Anteil, steht „Bereits beglichen“ und die Zeile „Kategorie trägt …“ nennt den Betrag ohne den beglichenen Anteil. Deckt es nur einen Teil, steht, wie viel verrechnet wird und dass der Rest bis zur Rückzahlung offen bleibt. Ohne Guthaben bleibt der bisherige Text. Das Guthaben gilt zum Buchungsdatum und für die gewählte Kategorie; mehrere Anteile desselben Kontakts verbrauchen es nacheinander, nie doppelt.
- **Abnahmekriterien:** Die Verrechnung selbst läuft wie bisher beim Speichern in derselben Änderungsgruppe, ohne Geldbewegung: Kontaktsaldo vorher = nachher minus Anteil, Guthaben + Zuordnungen = Rückzahlung, die Konten ändern sich nur um den Einkauf; ein Rückgängig stellt Buchung und Verrechnung gemeinsam wieder her. Beim Bearbeiten einer bestehenden Buchung erscheint der Hinweis noch nicht.
- **Status:** teilweise, zur Review vorbereitet — **Verweis:** #1147. Erster Teil: Anzeige mit vorher/nachher und Texte je Fall; die Verrechnung war schon vorhanden und ist nun durch API-Tests mit synthetischen Beträgen abgesichert. Offen: Auswahl „nicht verrechnen“ pro Anteil, Hinweis beim Bearbeiten, Browser-Abnahme. Keine Live-Abnahme behauptet.

**Delivery update (#1147).** In new shared purchases, each contact share with eligible credit has a checked “Mit Guthaben verrechnen” option. Clearing it keeps the credit available and leaves that share open. A later share can use the retained credit. The preview shows eligible credit before and after the choice and respects reservations already saved for later dates. Saving and Undo use the same booking group. The choice is made during capture. Editing a previously saved purchase keeps its recorded offset.
