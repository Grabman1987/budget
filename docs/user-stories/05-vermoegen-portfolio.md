# User-Stories – Vermögen und Portfolio

Bereich Vermögen (Nettovermögen, Portfolio, Schulden, Freiheit) und die zugehörigen Einstellungen. Pfade: `/vermoegen/nettovermoegen`, `/vermoegen/portfolio` (Positionen, Allokation, Sparpläne, Kennzahlen), `/vermoegen/schulden`, `/vermoegen/freiheit`. Alle Beträge in Cent, Anzeige in Euro. Stories mit „(geplant)“ im Ablauf folgen dem Ticket, nicht dem Code.

Geteilt: V-06 und V-09 sind aufgeteilt (V-06a/V-06b, V-09a/V-09b). V-17 und V-18 sind neu aufgenommen (Tickets #520 und #519, im Quellkatalog noch nicht enthalten).

### V-01 – Wertpapiere, Depots und Anlageklassen verwalten
- **Story:** Als Nutzer möchte ich Wertpapiere, Depots, Verrechnungskonten und Anlageklassen anlegen und pflegen, damit jede Position einer Klasse zugeordnet ist und Allokation, Kennzahlen und Reports mit dem richtigen Bestand rechnen.
- **Ausgangslage:** Ich kaufe ein neues Wertpapier oder eröffne ein Depot. Das Anlagekonto muss unter Einstellungen › Konten bereits offen sein.
- **Ablauf:**
  1. Vermögen › Portfolio öffnen, über „Investment hinzufügen“ den Eintrag „Wertpapier anlegen“ (oder „Krypto anlegen“) wählen. Das Formular „Instrument anlegen“ öffnet sich.
  2. Felder Name, Art, Währung, ISIN, Symbol, TER (%), Hebelfaktor und Länderanteile ausfüllen. Die App prüft Format und Doppelte ISIN (Meldung „Diese ISIN gehört bereits zu einem anderen Instrument.“).
  3. Bei „Anlageklasse“ eine Klasse wählen und „Klassenzuordnung gültig ab“ setzen. „Instrument anlegen“ speichert, die Toast-Meldung bietet „Rückgängig“.
  4. Bestehende Stammdaten über „Stammdaten bearbeiten“ im Instrument ändern; Klassen selbst unter Einstellungen › Anlageklassen pflegen.
  5. Depot und Verrechnungskonto unter Einstellungen › Konten anlegen oder öffnen/schließen.
- **Ergebnis:** Das Instrument erscheint in Positionen (sobald ein Bestand existiert) oder unter „Instrumente ohne Bestand“. Es zählt in der gewählten Klasse.
- **Abnahmekriterien:**
  - Ein neues Wertpapier mit Klasse erscheint nach dem ersten Handel in Portfolio › Allokation unter dieser Klasse; ohne Klasse unter „Ohne Anlageklasse“.
  - Eine doppelte ISIN wird abgelehnt, nichts wird gespeichert.
  - „Rückgängig“ nimmt das Anlegen vollständig zurück, „Wiederholen“ stellt es her.
  - Randfall: Ein geschlossenes Anlagekonto lässt keinen Handel zu („Das Anlagekonto wurde geschlossen. Bitte zuerst wieder öffnen.“). Am Handy ist das Formular als Panel bedienbar.
- **Status:** teilweise · **Verweis:** I01
  Fehlt noch: erweiterte Quellen-/Kosteneinstellungen, durchgängiger Depot-Verwaltungsablauf, privat zugeordnete Instrumente/Konten.

### V-02 – Käufe, Verkäufe, Erträge, Gebühren und Steuern erfassen
- **Story:** Als Nutzer möchte ich Handel und Erträge samt Gebühren und Steuern erfassen, damit Bestand, Einstand und Erträge stimmen und der Kontostand des Verrechnungskontos zur Bank passt.
- **Ausgangslage:** Eine Abrechnung des Brokers liegt vor, der Handel ist noch nicht in der App (sonst Eintrag aus Prüfen übernehmen). Ein offenes Anlagekonto und das Instrument existieren.
- **Ablauf:**
  1. Vermögen › Portfolio › „Handel erfassen“ (auch im Instrument und über „Investment hinzufügen“).
  2. „Handelsart“ wählen: Kauf, Verkauf, Dividende / Ausschüttung, Zinsen, Gebühr, Steuer, Einlieferung, Auslieferung oder Aktiensplit.
  3. „Anlagekonto“, „Instrument“, „Handelsdatum“, „Stück“ (bis acht Nachkommastellen), Bruttobetrag, Gebühren und „Einbehaltene Steuer“ in Kontowährung eintragen. Notiz optional.
  4. „Handel speichern“. Die App legt Handel und zugehörige Kontobuchung zusammen an.
  5. Im Instrument unter „Handelsverlauf“ den Eintrag prüfen. „Bearbeiten“ und „Rückgängig“ wirken auf Handel und Buchung gemeinsam; Löschen meldet „Handel und zugehörige Kontobuchung gelöscht.“
- **Ergebnis:** Bestand, Einstand und Kontosaldo sind aktualisiert; die Buchung erscheint in Konten › Buchungen.
- **Abnahmekriterien:**
  - Ein Kauf mindert den Saldo des Verrechnungskontos um Betrag plus Gebühren und erhöht die Stückzahl in Positionen.
  - Bearbeiten ändert Handel und Buchung gleichzeitig; „Rückgängig“ stellt beide wieder her. Die Summe im Handelsverlauf passt zu den Buchungen in Konten › Buchungen.
  - Eine ungültige Stückzahl (negativ, mehr als acht Nachkommastellen) wird mit Hinweis abgelehnt.
  - Randfall: Verlassen mit ungespeicherten Angaben fragt „Ungespeicherte Handelsangaben verwerfen?“. Bei Fremdwährungsinstrument wird die Kontowährung angezeigt.
- **Status:** teilweise · **Verweis:** I02, I03
  Fehlt noch: vollständige Quellhistorien, privater Abgleich mit den Abrechnungen.

### V-03 – Positionen und Verlauf je Wertpapier sehen
- **Story:** Als Nutzer möchte ich aktuelle Positionen und den Verlauf je Wertpapier sehen, damit ich erkenne, welche Position seit dem Kauf zugelegt hat und ob ein Nachkauf oder Verkauf ansteht.
- **Ausgangslage:** Es gibt mindestens einen gebuchten Handel. Kurse sind gespeichert (sonst siehe V-06a/V-06b).
- **Ablauf:**
  1. Vermögen › Portfolio › Positionen öffnen. Oben steht der Portfoliowert mit „Maßkette Portfoliowert“; „Wertpapiere ohne Depot-Bargeld“ nennt den Umfang.
  2. Positionen nach Anlageklasse lesen: Spalten Einstandskurs, Aktueller Kurs, Kursdatum, Marktwert, Einstand, Gewinn € und Gewinn %.
  3. Mit „Zeitraum“ (1M, 3M, YTD, 1J, 3J, Alles) den Betrachtungszeitraum ändern.
  4. Eine Zeile öffnen: Die Detailseite zeigt „Bestand je Konto“, „Wert und Kurs“ mit Darstellung und Zeitraum und den Handelsverlauf.
  5. Unter „Instrumente ohne Bestand“ geschlossene Positionen ansehen.
- **Ergebnis:** Ich weiß Wert, Einstand und Entwicklung je Position und je Broker.
- **Abnahmekriterien:**
  - Die Summe „gesamter Bestand“ entspricht dem Wertpapieranteil im Nettovermögen (ohne Depot-Bargeld) auf Vermögen › Nettovermögen.
  - Ein Wertpapier bei zwei Brokern zeigt in „Bestand je Konto“ beide Bestände; die Summe passt zur Position.
  - Randfall fehlender Kurs: Die Zeile zeigt „Kurs fehlt“ oder „Wert geschätzt, kein Kurs“; der Kopf zeigt „Bewertung unvollständig“, nicht null.
  - Randfall: Am Handy bleibt die Tabelle seitlich scrollbar; vollständig verkaufte Positionen stehen nur unter „Instrumente ohne Bestand“.
- **Status:** teilweise · **Verweis:** I04, I09
  Fehlt noch: historische Produktansichten, Vergleich mit den echten PP-Daten, vollständige Depot-Abläufe.

### V-04 – Einstandsmethode wählen
- **Story:** Als Nutzer möchte ich zwischen gleitendem Durchschnitt und FIFO wählen, damit Einstand und Verkaufsgewinne meiner gewünschten Methode folgen und ich Ergebnisse mit meiner Steuerlogik vergleichen kann.
- **Ausgangslage:** Es gibt Käufe und Verkäufe. Die Methode gilt für alle Depots und Krypto-Konten.
- **Ablauf:**
  1. Einstellungen › Depots & Kryptos öffnen, Abschnitt „Einstandskosten“.
  2. Bei „Einstandskostenmethode“ „Durchschnittseinstand (Standard)“ oder „FIFO – älteste Kaufposten zuerst“ wählen. Der Hinweis darunter erklärt die Wirkung.
  3. „Speichern“. Die App rechnet die vorhandene Historie neu; Käufe und Verkäufe bleiben unverändert.
  4. In Vermögen › Portfolio › Positionen die geänderten Einstände ansehen („Datenbasis und Spalten“ nennt die Methode).
- **Ergebnis:** Einstand und realisierte Gewinne folgen der gewählten Methode; belegte Verkaufsgewinne bleiben auch bei 0 Anteilen sichtbar.
- **Abnahmekriterien:**
  - Nach Wechsel auf FIFO weicht der Einstand einer Position mit mehreren Käufen zu unterschiedlichen Preisen ab, die Stückzahl bleibt gleich.
  - „Verwerfen“ lässt die gespeicherte Methode unverändert; bei zwischenzeitlicher Änderung kommt „Aktuellen Stand laden“.
  - Randfall: Eine Position ohne Verkauf zeigt in beiden Methoden denselben gesamten Einstand.
  - Die App berechnet oder bucht keine zusätzliche Kapitalertragsteuer (Hinweis unter „Einstand, Gebühren und Steuern“).
- **Status:** live · **Verweis:** I06

### V-05 – Realisierte und unrealisierte Gewinne sehen
- **Story:** Als Nutzer möchte ich realisierte und unrealisierte Gewinne getrennt sehen, damit ich weiß, welcher Teil verkauft ist und welcher noch vom Kurs abhängt.
- **Ausgangslage:** Es gibt Käufe, bei realisierten Gewinnen mindestens einen Verkauf. Der Startbestand vor dem Beginn der Aufzeichnungen hat eventuell keinen bekannten Einstand.
- **Ablauf:**
  1. Vermögen › Portfolio › Positionen: Spalten „Gewinn €“ und „Gewinn %“ zeigen den unrealisierten Gewinn je Position.
  2. Reports › Portfolio › Rendite und Kennzahlen: Abschnitt „Realisierte Gewinne“ nach Zeitraum lesen.
  3. Bei unbekannter Basis zeigt die Zeile „Kein positiver Einstand“ oder einen unbekannten Einstand, keinen erfundenen Wert.
  4. Mit „Einstandsmethode“ (siehe V-04) prüfen, wie sich das Ergebnis ändert.
- **Ergebnis:** Ich sehe getrennt, was bereits verdient ist und was noch schwankt.
- **Abnahmekriterien:**
  - Die Summe der Gewinne € in Positionen passt zum Marktwert minus Einstand in der Summenzeile.
  - Ein vollständig verkaufter Wert taucht nur bei den realisierten Gewinnen auf.
  - Randfall unbekannte Basis: Gewinn bleibt „unbekannt“; er wird nicht mit 0 summiert.
  - Randfall fehlender Kurs: Gewinn nicht berechenbar, die Zeile ist markiert.
- **Status:** offen · **Verweis:** I07, I05
  Fehlt noch: privater Abgleich mit der Referenz, historische Einstände und Wechselkurse zum Buchungstag, vollständige Anzeige für ganz verkaufte Positionen.

### V-06a – Kurse nachts automatisch laden
- **Story:** Als Nutzer möchte ich, dass Kurse nachts automatisch geladen werden, damit Bewertungen am Morgen aktuell sind, ohne dass ich Kurse suchen muss.
- **Ausgangslage:** Kursquellen sind unter Einstellungen › Datenquellen aktiv. Wertpapiere haben ISIN oder Symbol.
- **Ablauf:**
  1. Es läuft ein Abruf pro Nacht (ca. 02:30 Wiener Zeit, Schlusskurse des Vortags).
  2. Am Morgen Vermögen › Portfolio › Positionen öffnen; „Kursdatum“ zeigt das Datum je Position.
  3. Bei Problemen erscheint ein Eintrag in Konten › Prüfen, zum Beispiel „Kurse nicht abrufbar“ (Ursachenansicht siehe V-14).
     Klappt der nächste Abruf für dieses Instrument, schließt sich der Eintrag selbst; Quelle und Stand des erfolgreichen Abrufs stehen als Begründung im Eintrag (Verlauf siehe I-01b).
  4. Im Instrument „Wert und Kurs“ prüfen, welche Quelle je Tag gilt (Gespeicherter Kurs, Ausführungskurs, Einstandsschätzung).
- **Ergebnis:** Positionen und Nettovermögen sind mit den Vortagskursen bewertet.
- **Abnahmekriterien:**
  - Pro Nacht entsteht höchstens ein Lauf je Quelle; das Kursdatum liegt höchstens einen Handelstag zurück.
  - Der Positionswert ist Stück mal Kurs und stimmt mit dem Wertpapierwert im Nettovermögen überein.
  - Randfall: Ohne Kurs zeigt die Zeile „Kurs fehlt“ und der Wert fällt auf Ausführungskurs zurück, markiert „Geschätzt“.
  - Randfall: Ein abgelaufener Kurs trägt die Markierung „Kurs veraltet“.
  - Eine Warnung aus einem fehlgeschlagenen Abruf schließt der nächste erfolgreiche Abruf desselben Instruments (bei Wechselkursen derselben Währung), im Änderungsprotokoll erfasst; Warnungen anderer Instrumente und Warnungen zu echten Abweichungen bleiben offen.
- **Status:** live (Stand 26.11.2026: alle verknüpften Issues erledigt; Nutzerabnahme offen) — **Verweis:** I10, I12, #1101
  Fehlt noch: ausdrücklicher Erstabruf-Zeitstempel, abgenommener Live-Quellen-Status, Kurskennungen und Konventionen mit der Quelle abgeglichen.

### V-06b – Kurse manuell überschreiben
- **Story:** Als Nutzer möchte ich einen Kurs von Hand eintragen, damit ein fehlender oder falscher automatischer Kurs den Wert nicht verfälscht.
- **Ausgangslage:** Die Quelle liefert für ein Instrument keinen oder einen falschen Kurs, oder ein Wert ist nur manuell bekannt.
- **Ablauf:**
  1. Vermögen › Portfolio › Positionen: in der Zeile oder im Instrument „Kurs eintragen“.
  2. „Kursdatum“ und Kurs eintragen und „Kurs speichern“.
  3. Meldung „Manueller Kurs gespeichert.“ mit „Rückgängig“.
  4. Hinweis beachten: Ein manueller Kurs bleibt beim automatischen Abruf erhalten.
- **Ergebnis:** Die Position ist mit dem eingetragenen Kurs bewertet; die Quelle ist im Instrumentverlauf sichtbar.
- **Abnahmekriterien:**
  - Der Positionswert ändert sich sofort auf Stück mal manuellem Kurs; das Nettovermögen folgt.
  - „Rückgängig“ stellt den vorigen Kurs oder „Kurs fehlt“ wieder her.
  - Der nächtliche Abruf überschreibt den manuellen Kurs nicht.
  - Randfall: Ein manueller Kurs löst die Fehlermeldung der automatischen Quelle nicht von selbst (siehe V-14).
- **Status:** teilweise · **Verweis:** I11
  Fehlt noch: manuelle Werte für andere Vermögensarten (Wert aktualisieren ist nur für manuell bewertete Konten vorhanden).

### V-07 – Sparpläne anlegen und Ausführungen zuordnen
- **Story:** Als Nutzer möchte ich Sparpläne anlegen und deren Ausführungen zuordnen, damit ich sehe, ob jeder Monat wie geplant gekauft wurde, und Abweichungen rechtzeitig bemerke.
- **Ausgangslage:** Der Broker führt einen Sparplan aus; das Anlagekonto und das Instrument sind angelegt.
- **Ablauf:**
  1. Vermögen › Portfolio › Sparpläne öffnen und „Sparplan anlegen“.
  2. Instrument, „Anlagekonto“, „Rate“, „Intervall“, „Ausführungstag“ (1 bis 31) und optional „Quellkonto“, „Beginn“, „Notiz“ eintragen und speichern.
  3. Die Tabelle zeigt je Plan Intervall, „Nächste“ Ausführung und „Letzte 12 Monate“ mit Status „Zugeordnet ausgeführt“, „Zuordnung fehlt“, „Zuordnung prüfen“ oder „Nicht geplant“.
  4. Eine Ausführung bestätigen: „Sparplanausführung bestätigen“ öffnet den Handel mit Plan-Vorbelegung; echte Stückzahl, Betrag und Gebühren aus der Abrechnung übernehmen, „Ausführung bestätigen“.
  4a. Schneller: die Sparplan-Abrechnung als PDF über „Dokument hochladen“ ablegen (V-15). Passt genau eine offene Ausführung desselben Instruments (höchstens drei Tage um den geplanten Tag), öffnet „Weiter“ denselben Dialog mit Datum, Stück, Betrag und Gebühren aus der Abrechnung; es bleibt nur „Ausführung bestätigen“.
  5. Rate ändern („Rate bearbeiten“) oder beenden („Sparplan beenden“ mit „Ende einschließlich“); „Verlauf“ zeigt die Versionen.
- **Ergebnis:** Plan, Ausführungen und Abweichungen sind je Monat sichtbar; es ist kein Bankauftrag ausgelöst.
- **Abnahmekriterien:**
  - Nach Bestätigung zeigt der Monat „Zugeordnet ausgeführt“, und der Kauf steht im Handelsverlauf des Instruments.
  - Die Bestätigung einer Ausführung aus einer hochgeladenen Abrechnung kann zugleich die Umbuchung vom Verrechnungskonto schreiben (V-15); „Rückgängig“ nimmt Ausführung und Umbuchung gemeinsam zurück.
  - Eine hochgeladene Sparplan-Abrechnung ohne eindeutig passende offene Ausführung wird als normaler Kauf vorgeschlagen; der Dialog sagt „Der Handel wird ohne Zuordnung zum Sparplan erfasst.“
  - „Monatlich gesamt“ ist die Summe der laufenden Raten.
  - Eine Ratenänderung gilt ab Datum; frühere Monate behalten die alte Rate (Verlauf).
  - Randfall: Das Ende darf nicht vor dem Beginn der Version liegen; ein Plan ohne laufende Raten zeigt „Keine laufenden oder vorgemerkten Sparpläne.“
- **Status:** live (Stand 26.11.2026: alle verknüpften Issues erledigt; Nutzerabnahme offen) — **Verweis:** I17, #1099
  Fehlt noch: Vorschläge zur Änderung der Rate, privater Abgleich mit den Brokerausführungen.

### V-08 – Kennzahlen und Rendite vergleichen
- **Story:** Als Nutzer möchte ich TTWROR, XIRR, Volatilität, maximalen Rückgang und Sharpe-Kennzahl sehen, damit ich beurteile, ob die Rendite das Risiko lohnt und ob ich einen Index schlage.
- **Ausgangslage:** Mindestens ein Handel und Kurse für den Zeitraum. Benchmarks unter Einstellungen gewählt.
- **Ablauf:**
  1. Vermögen › Portfolio › Kennzahlen öffnen, „Zeitraum“ wählen.
  2. Die Kacheln „TTWROR im Zeitraum“, „XIRR p. a.“, „Volatilität“, „Max. Rückgang“ und „Sharpe“ lesen; Fachbegriffe haben Erklärungen.
  3. Im Abschnitt „Vergleich“ Benchmark, Rendite und „Differenz Portfolio“ ansehen.
  4. Über „Tatsächliche Zahlungsströme nach Steuern anzeigen“ die Ein- und Auszahlungen je Tag prüfen.
  5. Ausführlicher: Reports › Portfolio › Rendite und Kennzahlen (siehe RP-18b).
- **Ergebnis:** Ich kenne Rendite, Risiko und den Abstand zum Vergleichsindex.
- **Abnahmekriterien:**
  - Der gleiche Zeitraum liefert auf Kennzahlen und im Report Rendite und Kennzahlen dieselben Werte.
  - TTWROR berücksichtigt Ein-/Auszahlungen nicht als Rendite; XIRR berücksichtigt deren Zeitpunkt (Hinweis im Text).
  - Randfall ohne Daten: „Keine zusammenhängende Renditehistorie für diesen Zeitraum.“
  - Randfall fehlender Kurs: Kennzahl nicht berechnet statt 0.
- **Status:** teilweise · **Verweis:** I14, I15
  Fehlt noch: Gleichheit mit Portfolio Performance bei gleichen Perioden, Referenzvergleich für Depots.

### V-09a – Soll und Ist der Anlageklassen sehen
- **Story:** Als Nutzer möchte ich Soll- und Ist-Anteil je Anlageklasse sehen, damit ich erkenne, welche Klasse zu groß oder zu klein ist, bevor ich den nächsten Betrag investiere.
- **Ausgangslage:** Positionen sind Klassen zugeordnet und bewertet. Zielquoten sind unter Einstellungen › Zielallokation und Stufen gesetzt (sonst „Kein Soll festgelegt“).
- **Ablauf:**
  1. Vermögen › Portfolio › Allokation öffnen. „Aufteilung Soll/Ist“ zeigt Balken und die Tabelle mit „Ist %“, „Ziel %“, „Abw. Pp“ und „Abw. €“.
  2. Status je Klasse ablesen: „Im Soll“, „Unter Soll“, „Außerhalb des Bands“.
  3. Bei unklassifizierten Positionen („Ohne Anlageklasse“) „Unklassifizierte Positionen zuordnen“ nutzen.
  4. „Wie wird gerechnet?“ und „Bewertungsbasis, Zuordnung und Rebalancing-Hinweise“ öffnen für Datenstand und Quellen.
  5. Zielquoten ändern: Einstellungen › Zielallokation und Stufen, Gültig ab setzen und speichern (neue Version).
- **Ergebnis:** Ich sehe die Abweichung in Prozentpunkten und Euro je Klasse.
- **Abnahmekriterien:**
  - Die Ist-Anteile ergeben 100 %; die Summe der Klassenwerte entspricht dem klassifizierten Positionswert in Positionen.
  - Eine neue Sollversion mit Datum ändert die Abweichung ab diesem Datum; frühere Reports behalten die alte Version.
  - Randfall: Ohne Positionen steht „Keine gehaltenen Instrumente im ausgewählten Allokationsuniversum.“; ohne Bewertung „Keine positive Bewertungsbasis“.
  - Randfall: Fehlt ein Kurs, ist die Abweichung „vorläufig“ markiert.
- **Status:** teilweise · **Verweis:** I16
  Fehlt noch: Regions-/Produktansichten, abgenommene private Umschichtungsabläufe.

### V-09b – Hinweise zum Umschichten (R13–R15)
- **Story:** Als Nutzer möchte ich Hinweise zum Umschichten sehen, damit ich weiß, welche Klasse oder Position die Regeln R13 bis R15 verletzt, und neues Geld dorthin lenke, wo es fehlt.
- **Ausgangslage:** Sollquoten und Bänder sind gesetzt, die Bewertung ist vollständig und größer als 0 €.
- **Ablauf:**
  1. Vermögen › Portfolio › Allokation: Abschnitt „Rebalancing“.
  2. Hinweise lesen: Klasse über oder unter Band (R13), einzelne Position über ihrem Limit (R14), spekulativer Anteil über seinem Limit (R15).
  3. Den Hinweis mit „Bewertungsbasis, Zuordnung und Rebalancing-Hinweise“ gegenprüfen; gehebelte ETFs zählen mit ihrer wirtschaftlichen Brutto-Exposure.
  4. Umsetzen: manuell über „Handel erfassen“ oder bei der nächsten Sparplanrate; die App löst keine Order aus.
- **Ergebnis:** Ich weiß, wo ich nachsteuere; kein Ziel und kein Sparplan ändert sich automatisch.
- **Abnahmekriterien:**
  - Dieselben Schwellen erscheinen im Finanz-Check und Heute (gleiche Regelstände R13–R15).
  - Ein Hinweis nennt Klasse, Ist-Anteil und Referenz; die Prozentwerte passen zur Tabelle Soll/Ist.
  - Randfall: Ohne Sollquoten heißt es „Keine Sollquoten erfasst; keine weiteren Risikohinweise.“; bei unvollständiger Bewertung stehen Hinweise erst nach vollständiger Bewertung bereit.
  - Ein späteres Risikoprofil (#812) darf nur Kontext anzeigen und ändert Ziele nicht.
- **Status:** teilweise · **Verweis:** I16
  Fehlt noch: Aktionen im Sparplan, privat abgenommene Umschichtungsabläufe.

### V-10 – Monatliche Trendallokation mit täglicher Sparplanvorschau (teilweise)
- **Story:** Als Nutzer möchte ich eine monatlich verbindliche Trendallokation und eine tägliche Vorschau des nächsten Sparplans mit getrenntem Rebalancing sehen, damit ich täglich weiß, wie viel ich beim nächsten Sparplan in welches Wertpapier investieren würde, ohne dass die Vorschau die verbindliche Allokation still ändert.
- **Ausgangslage:** Strategie ist unter Portfolio konfiguriert (vier Kategorien, Zuordnung der Wertpapiere, Sparrate selbst eingegeben); der ungehebelte Nasdaq-100-Index liefert abgeschlossene Handelstage.
- **Ablauf:** (geplant)
  1. Vermögen › Portfolio: Strategie einrichten, Wertpapiere je Kategorie zuordnen und festlegen, welches Wertpapier neue Einzahlungen erhält.
  2. Monatliche Sparrate eintragen.
  3. Das Trendsignal (stark, gemischt, schwach aus SMA200 des Nasdaq-100 in USD) wird monatlich verbindlich festgehalten; Datenstand und Signalgrundlage sind sichtbar.
  4. Die tägliche Vorschau zeigt „Wenn der Sparplan am 15. jetzt liefe“: Kaufbeträge je Wertpapier aus Istgewichten und Zielgewichten, ohne die verbindliche Allokation zu ändern.
  5. Rebalancing wird getrennt dargestellt; Bestätigung bleibt manuell (V-07).
- **Ergebnis:** Eine klare Kaufempfehlung je Wertpapier mit Quelle und Stand; es gibt keine automatische Order.
- **Abnahmekriterien:**
  - Die Summe der vorgeschlagenen Kaufbeträge entspricht der eingegebenen Sparrate.
  - Eine tägliche Signaländerung ändert die verbindliche Allokation erst zum Monatswechsel.
  - Randfall: Fehlen Indexdaten, entsteht kein neues Signal, es bleibt das letzte bekannte mit Hinweis.
  - Ein gehaltenes, nicht mehr bespartes Wertpapier zählt zu Depotwert und Istgewicht.
- **Status:** zurückgestellt (Issue nicht geplant geschlossen; Stand 26.11.2026) — **Verweis:** #762
  Umgesetzt (nur Lesen): Abschnitt „Trendsignal · Grundlage“ unter Vermögen › Portfolio › Sparpläne › Trendstrategie zeigt für die tägliche Vorschau, das Monatssignal des laufenden Monats und die gespeicherte verbindliche Entscheidung jeweils Ergebnis, Schlusstag, Schlusskurs, 200-Tage-Durchschnitt und den Durchschnitt 20 US-Handelstage zuvor (Anzeige auf zwei Stellen gerundet, verglichen wird exakt), Quelle, Index, US-Kalender und Erfassungszeit. Fehlt die Reihe, ist sie lückenhaft oder veraltet, steht „Nicht ermittelbar“ mit Grund und fehlenden Tagen, nie eine Schätzung.
  Fehlt noch: Abnahme am echten Abruf (erster Kurslauf nach Einschalten), Prüfung der Kaufaufteilung und des Rebalancings am Live-Depot, Geräteabnahme.

### V-11 – Nettovermögen mit Eigenanteil und Marktanteil sehen
- **Story:** Als Nutzer möchte ich das Nettovermögen als Anfang plus Gespart plus Markt mit Zusammensetzung sehen, damit ich weiß, ob mein Vermögen durch Sparen oder durch den Markt gewachsen ist.
- **Ausgangslage:** Konten mit Salden seit dem 01.10.2023 existieren; für Wertpapiere gibt es Kurse.
- **Ablauf:**
  1. Vermögen › Nettovermögen öffnen (Vermögen führt dorthin); „Zeitraum“ wählen (1M, 3M, YTD, 1J, 3J, Alles).
  2. „Maßkette Nettovermögen im Zeitraum“ lesen: Anfang + Gespart + Markt = Ende.
  3. Im Verlauf („Verlauf anzeigen“) den täglichen Verlauf ansehen; gestrichelt sind Schulden, sie werden abgezogen.
  4. „Woraus es besteht“: Zusammensetzung anzeigen, eine Vermögensart öffnen und die Kontobeiträge lesen.
- **Ergebnis:** Ich sehe den Wertzuwachs getrennt nach eigener Einzahlung und Markt.
- **Abnahmekriterien:**
  - Anfang + Gespart + Markt ergibt exakt das Nettovermögen am Ende.
  - Der Wert stimmt mit Konten › Übersicht, dem Report Vermögen & Schulden und dem Report Vermögensverläufe überein.
  - Randfall: Ohne Konten steht „Noch keine Konten. Lege unter Konten ein Konto an.“; bei geschätzten Kursen trägt die Zahl den Hinweis „≈“.
  - Randfall: Prozentanteile erscheinen erst ab 100 Euro Nettovermögen.
- **Status:** live · **Verweis:** I18

### V-12 – Kredite mit Sondertilgung durchrechnen
- **Story:** Als Nutzer möchte ich einen Kredit mit Sondertilgung durchrechnen, damit ich vor einer Entscheidung sehe, wie viel Zinsen ich spare und wie viel früher ich schuldenfrei bin.
- **Ausgangslage:** Ein Kredit (oder eine Kreditkarte mit negativem Saldo) existiert; Zins, Rate und Laufzeit sind unter Einstellungen › Konten gepflegt.
- **Ablauf:**
  1. Vermögen › Schulden öffnen: Restschuld mit „Maßkette Restschuld“ und „Tilgung je Kredit und Kreditkarte“.
  2. „Kredit für das Modell“ wählen. Fehlen Konditionen, führt „Konditionen pflegen“ nach Einstellungen › Konten.
  3. Bei „Sondertilgung“ Monatsrate, Sondertilgung, Zins und Gebühr eintragen (jeweils ab 0).
  4. Ergebnis lesen: „Schuldenfrei“, „Laufzeit“, „Zinsen gesamt“, „Zinsersparnis“, „Früher frei“ und die Tabelle „Szenarien im Vergleich zur Basis“.
  5. Mehrere Schulden: „Strategien vergleichen“ (Avalanche, Schneeball, Nur Mindestraten) mit „Zusatzbetrag pro Monat“.
- **Ergebnis:** Ich sehe Ersparnis und Enddatum; nichts davon wird gespeichert oder gebucht.
- **Abnahmekriterien:**
  - Das Szenario ohne Sondertilgung entspricht dem Basis-Tilgungsplan; „Zinsersparnis“ ist Basiszinsen minus Szenariozinsen.
  - Die Restschuld stimmt mit dem negativen Kontowert in Konten › Übersicht überein.
  - Randfall: Deckt die Rate die Zinsen nicht, kommt „Die Rate deckt in einem Monat die Zinsen und Gebühren nicht.“; ohne Tilgung in 1.200 Monaten „Nicht innerhalb von 1.200 Monaten getilgt.“
  - Randfall: Ein Kredit ohne Restschuld zeigt „Dieser Kredit hat keine Restschuld.“; Zinsen verschiedener Währungen werden nicht summiert.
- **Status:** teilweise · **Verweis:** I19
  Fehlt noch: variable Zinsänderungen im Zeitverlauf, privat abgenommene Vertragsszenarien.

### V-13 – Freiheitszahl mit Soll-Pfad verfolgen
- **Story:** Als Nutzer möchte ich die Freiheitszahl (R16) mit Soll-Pfad sehen, damit ich erkenne, ob ich auf Kurs zum Zieljahr bin und welche Sparrate dafür nötig ist.
- **Ausgangslage:** Mindestens ein abgeschlossener Budgetmonat (Ausgabenbasis) und Investments mit Wert.
- **Ablauf:**
  1. Open Vermögen › Freiheit at `/vermoegen/freiheit`: „Freiheitszahl“ shows progress and „Maßkette Freiheitszahl“. The old `darstellung=freiheit` wealth-report bookmark redirects here in redesign ON.
  2. Unter „Persönliches Ziel“ bei „Ziel bis“ „Jahr (Jänner)“ oder „Alter im Kalenderjahr“ wählen und das Ziel speichern; „Nötige Sparrate“ erscheint.
  3. Unter „Annahmen“ „Sparrate pro Monat“ und „Rendite nach Inflation“ eintragen; „Ziel erreicht“ nennt den Monat.
  4. „Weg zum Ziel“ zeigt den Ist-Verlauf seit Oktober 2023 und die Prognose. Die Kontenauswahl steht unter „Investiert“.
  5. „Woher die Jahresausgaben kommen“ zeigt je Monat Nettoausgaben Bedarf und Wunsch.
- **Ergebnis:** Ich weiß Fortschritt in Prozent, erwarteten Zielmonat und nötige Sparrate. Die Prognose-Annahmen werden nicht gespeichert; das Ziel wird gespeichert.
- **Abnahmekriterien:**
  - Investiert geteilt durch 25 Jahresausgaben ergibt den angezeigten Prozentwert; die Jahresausgaben stimmen mit der Monatstabelle darunter überein.
  - Ein Zieländerung lässt sich rückgängig machen („Zieländerung rückgängig gemacht“).
  - Randfall: Ohne abgeschlossene Monate steht „Noch keine abgeschlossenen Budgetmonate. Die Ausgabenbasis fehlt.“; ohne Sparrate beginnt die Prognose nicht.
  - Randfall: Erreicht die Prognose das Ziel nicht, heißt es „Nicht innerhalb von 60 Jahren“.
- **Navigation acceptance (#1157):** Freedom remains under Vermögen with its area menu, original source accounts, privacy, goal editing and grouped Undo; no duplicate report view. Navigation implemented for review; CI and owner acceptance pending.
- **Status:** teilweise · **Verweis:** I20
  Fehlt noch: private Abnahme, gespeicherte Annahmen.

### V-14 – Kurs- und Kryptoabweichungen mit Ursache
- **Story:** Als Nutzer möchte ich zu jeder Kurs- oder Krypto-Abweichung die Ursache sehen, damit ich weiß, ob ein Zuordnungsfehler, eine fehlende Bewegung oder ein echter Bestandsunterschied vorliegt und die Warnung wirklich behebe statt wegklicke.
- **Ausgangslage:** Konten › Prüfen enthält Einträge wie „Kurse nicht abrufbar“ (Währungskonflikt, leere Antwort, Abruffehler) oder Krypto-Bestandsabweichungen.
- **Ablauf:** (Kurswarnungen: erster Umsetzungsschritt in #1081; Krypto-Bestandsrechnung weiterhin geplant. Entscheidung 15.11.2026: Die Ursachenansicht öffnet unter Konten › Prüfen.)
  1. Konten › Prüfen öffnen und eine Warnung zu Kurs oder Krypto-Bestand wählen.
  2. Die Ursachenansicht nennt erwartet und tatsächlich, Stichtag, Quelle, Instrument-ID, Kurswährung und betroffene Bewegungen.
  3. Bei Krypto erklärt eine nachvollziehbare Bestandsrechnung, ob Zuordnung, fehlende Bewegung oder ein echter Unterschied vorliegt.
  4. Eine Korrektur der Quelle mit Vorschau erneut testen.
     Bei Währungskonflikten zeigt die Vorschau erwartet und tatsächlich je Quelle. Sie unterscheidet die gemeldete Währung (Yahoo/Ariva) von der Währung in der Quellzuordnung (Cryptocalc); fehlende sichere Belege bleiben sichtbar.
  5. Erst bei erfolgreicher Prüfung schließt die Warnung; „Als erledigt markieren“ täuscht keine Quellreparatur vor.
  Kurswarnungen öffnen über „Warnung erklären“ eine eigene Seite. Diese trennt die gespeicherte Fehlerklasse und das Warnungsdatum von der aktuellen Instrument-Zuordnung, Kurswährung und dem letzten gespeicherten Kurs samt Quelle. Nicht gespeicherte historische Quellwerte bleiben ausdrücklich unbekannt. Die Vorschau prüft alle Quellen mit der aktuellen Zuordnung über die letzten 30 Tage, speichert keine Kurse und schließt keine Warnung. Der bestehende automatische Abruf schließt sie bei Erfolg. Erfasste Bewegungs-IDs sind aufklappbar; eine Quellenkorrektur ist in diesem Schritt noch kein neuer Editor.
- **Beispiel:** Die Börse meldet 0,50 einer Münze. Die App rechnet aus den erfassten Bewegungen nur 0,48. Die Ansicht zeigt beide Zahlen und die Bewegung, die fehlt (z. B. eine Gebühr von 0,02), damit ich sie nachtragen kann.
- **Ergebnis:** Jede Warnung hat eine benannte Ursache und einen prüfbaren Abschluss.
- **Abnahmekriterien:**
  - Jede Abweichung zeigt Ursache, Stichtag, Quelle, Instrument und betroffene Bewegungen.
  - Ein manuell dokumentierter Kurs löst die Fehlermeldung der automatischen Quelle nicht.
  - Kurswarnungen können über die Oberfläche und den allgemeinen Erledigen-Endpunkt nicht pauschal geschlossen werden; auch eine erfolgreiche Vorschau lässt sie offen.
  - Währungskonflikte in der Vorschau zeigen erwartete Währung und sicheren Quellbeleg (Antwort oder Zuordnung); fehlende Belege werden nicht aus Fehlertexten geraten. Yahoo-Einheiten wie GBp bleiben im Beleg von GBP unterscheidbar; die bestehende Währungsnormalisierung anderer Quellen bleibt erhalten.
  - Historische Fehlerbelege und aktuelle Vorschauergebnisse sind klar getrennt; Beträge bleiben bei verborgener Betragsanzeige verborgen.
  - Die Bestandsrechnung (Bewegungen) stimmt mit dem Bestand im Instrument überein.
  - Randfall: Viele Krypto-Bewegungen bleiben gruppiert prüfbar; am Handy ist die Ursachenansicht lesbar.
  - Nur Warnungen mit einer Abruf-Fehlerklasse schließen sich nach erfolgreichem Abruf selbst, mit Begründung im Eintrag (#1101, I-01b). Warnungen zu Bestand, fehlenden Bewegungen oder abweichenden Schlusskursen bleiben offen, bis ihre Ursache behoben ist.
- **Status:** live (Stand 26.11.2026: alle verknüpften Issues erledigt; Nutzerabnahme offen) — **Verweis:** #1081
  Umgesetzt: Ursachenansicht und schreibfreie Quellvorschau für Kurswarnungen, serverseitige Sperre des pauschalen Abschlusses; zweiter Schritt ergänzt sichere Währungsbelege je Vorschauquelle. Fehlt noch: gespeicherte Fehlerbelege je Quelle einschließlich tatsächlich gelieferter Währung, Editor für Quellkorrekturen, Krypto-Bestandsrechnung mit Zuordnungs-/Bewegungsdiagnose und deren geprüfter Abschluss sowie private Abnahme.

### V-15 – Wertpapierabrechnungen als PDF einlesen
- **Story:** Als Nutzer möchte ich Wertpapierabrechnungen (Sparplan, Round-up, Kauf/Verkauf) als PDF deterministisch einlesen lassen, damit ich Trades nicht abtippe und Tippfehler bei Stück, Betrag und Gebühren ausgeschlossen sind.
- **Ausgangslage:** Der Broker hat eine Abrechnung als PDF geliefert; zentraler Upload für Dokumente existiert.
- **Ablauf:**
  1. PDF über den zentralen Upload ablegen („Dokument hochladen“, I-04). Die App meldet „Erkannt: Wertpapierabrechnung“.
  2. Die App liest Kopf (Datum, Ausführungs-ID, Sparplan-ID, Depot), Position (Name, ISIN, Stück, Kurs, Betrag), Gesamtbetrag und Abrechnungskonto, Kosten und Steuern aus und prüft sie gegeneinander (Stück × Kurs gegen Betrag, Betrag und Kosten gegen die Buchung des Verrechnungskontos).
  3. Unter „Gelesene Angaben“ stehen Handelsart, Instrument mit ISIN, Handelsdatum, Stück, Bruttobetrag, Gebühren und einbehaltene Steuer. Was nicht sicher gelesen wurde, steht dort als „nicht sicher gelesen“. Gespeichert ist noch nichts.
  4. „Weiter“ öffnet „Handel erfassen“ (V-02) als Vorschlag: Instrument per ISIN, Anlagekonto, wenn genau eines in der Währung der Abrechnung offen ist, dazu die gelesenen Werte. Nicht sicher gelesene Felder bleiben leer und werden im Dialog namentlich genannt („Nicht sicher gelesen und deshalb leer, bitte selbst eintragen: …“).
  5. Bei einer Sparplan-Abrechnung mit genau einer passenden offenen Ausführung öffnet sich stattdessen „Sparplanausführung bestätigen“ mit denselben Werten (V-07).
  6. Unter „Verrechnungskonto (Gegenbuchung)“ steht „Keine Gegenbuchung“ oder ein offenes Konto in derselben Währung (vorbelegt, wenn am Anlagekonto ein Verrechnungskonto hinterlegt ist). Die Kontoendung der Abrechnung steht nur als Hinweis da; die App ordnet sie nicht selbst zu. Eine Zeile sagt vorab, welche Umbuchung entsteht.
  7. Ich vergleiche mit der Abrechnung und bestätige mit „Handel erfassen“ bzw. „Ausführung bestätigen“; erst dann entstehen Handel, Kontobuchung am Anlagekonto und, wenn gewählt, die Umbuchung vom bzw. auf das Verrechnungskonto. „Rückgängig“ nimmt alles gemeinsam zurück.
- **Ergebnis:** Der Handel ist ohne Tippen erfasst; es wird nichts automatisch gebucht und nichts geschätzt.
- **Abnahmekriterien:**
  - Dasselbe PDF liefert immer dasselbe Ergebnis.
  - Ohne gewähltes Verrechnungskonto wird nur der Handel gebucht; das Verrechnungskonto bleibt unverändert. Nichts wird vor der Bestätigung gebucht.
  - Mit gewähltem Verrechnungskonto bewegt die Umbuchung genau den Abrechnungsbetrag: bei einem Kauf Bruttobetrag plus Gebühr vom Verrechnungskonto aufs Anlagekonto, bei einem Verkauf Bruttobetrag minus Gebühr und Steuer zurück. Das Anlagekonto bleibt bei 0 Barbestand. Die Gebühr bleibt im Handel (Einstand und Kosten-Report „Orders“); es gibt keine zweite Gebührenbuchung, nichts wird doppelt gezählt.
  - Handel, Anlagekonto-Buchung und Umbuchung stehen in einer Gruppe; ein „Rückgängig“ nimmt alle drei zurück. Eine wiederholte Bestätigung derselben Abrechnung schreibt nichts (auch keine zweite Umbuchung).
  - Eine Umbuchung in anderer Währung, auf das Anlagekonto selbst oder auf ein geschlossenes Konto wird abgelehnt, ohne etwas zu schreiben.
  - Wird ein gelöschter Handel per „Rückgängig“ der Gruppe wiederhergestellt, kommen Handel, Anlagekonto-Buchung und beide Umbuchungsbeine zusammen zurück, die Salden stehen wie vor dem Löschen. Die Umbuchung allein oder die Anlagekonto-Buchung allein lässt sich bei gelöschtem Handel nicht wiederherstellen.
  - Löscht man den Handel, wird die zugehörige Umbuchung mitgelöscht (eine Gruppe, ein „Rückgängig“ stellt beides wieder her); der Lösch-Dialog sagt es. Betrag, Gebühr, Steuer, Handelsart und Datum eines Handels mit Umbuchung lassen sich nicht ändern: „Bitte den Handel löschen (die Umbuchung wird mitgelöscht) und neu erfassen.“ Notiz bleibt änderbar. Die Gegenbuchung braucht die Referenz der Abrechnung, sonst wird sie abgelehnt.
  - Randfall: Steht die Zahlung schon als Buchung auf dem Verrechnungskonto (etwa aus dem Bankabruf), „Keine Gegenbuchung“ wählen; der Dialog weist darauf hin. Ein späteres Löschen des Handels lässt die Umbuchung bestehen (wie bei V-02).
  - Eine über den Sparplan bestätigte Ausführung trägt die Ausführungs-ID der Abrechnung; dieselbe PDF wird danach auch nach geänderten Werten als erfasst erkannt.
  - Eine vollständig gelesene und geprüfte Abrechnung füllt alle Felder; der Bruttobetrag samt Gebühren entspricht der Kontobuchung des Verrechnungskontos.
  - Widersprechen sich Stück, Kurs und Betrag, bleiben Stück und Bruttobetrag leer; bei unbekannter Kostenzeile oder fehlender Buchungszeile bleiben Gebühren und Steuer leer. Ein leeres Pflichtfeld verhindert das Speichern.
  - Ist der gedruckte Kurs zu grob gerundet, um Stück × Kurs zu prüfen, bleiben die gedruckten Werte stehen und der Dialog weist darauf hin.
  - Eine bereits erfasste Abrechnung wird erkannt: „Diese Abrechnung ist bereits als Handel vom <Datum> erfasst. Es wird nichts doppelt angelegt.“, „Weiter“ ist gesperrt. Erkannt wird sie an der Ausführungs-ID (auch bei erneut heruntergeladener Datei) oder an einem von Hand oder über den Sparplan erfassten Handel mit gleichem Instrument, Tag, Stück und Bruttobetrag. Ein über den Sparplan bestätigter Handel trägt keine Ausführungs-ID; wurden dabei Werte geändert, wird dieselbe PDF erneut vorgeschlagen (der Sparplanmonat ist dann aber nicht mehr offen).
  - Nach dem Löschen des Handels lässt sich dieselbe Abrechnung wieder vorschlagen.
  - Gibt es schon einen Handel mit gleichem Instrument, Tag, Stück und Bruttobetrag aus einer anderen Quelle (etwa dem Portfolio-Performance-Import, anderer Import-Schlüssel), meldet der Dialog „Möglicherweise schon erfasst“; im Formular wird erst nach „Trotzdem als weiteren Handel erfassen“ gebucht. Ein Handel aus einer anderen Abrechnung (andere Ausführungs-ID) gilt nicht als Duplikat.
  - Randfall: Unbekannte oder doppelt angelegte ISIN lässt „Instrument“ leer und nennt die ISIN; passt die Währung der Abrechnung zu keinem offenen Anlagekonto, bleiben die Beträge leer.
  - Randfall: Ein abweichendes Layout wird nicht als Wertpapierabrechnung erkannt und lässt sich nur als Beleg ablegen.
  - Dividenden, Zinsen und Steuerberichte sind ausdrücklich nicht Teil dieser Story.
- **Status:** live (Stand 26.11.2026: alle verknüpften Issues erledigt; Nutzerabnahme offen) — **Verweis:** #1057, #1099
  Fehlt noch: Vorschlag als Eintrag unter Konten › Prüfen (heute direkt aus dem Upload), Ablage der PDF als Beleg am Handel, automatischer Abgleich mit einer bereits gebuchten Zahlung auf dem Verrechnungskonto, Prüfung von Kauf/Verkauf-Orders an echten Mustern (Wortlaut bisher angenommen), Mehrfach-Upload.

### V-16 – Pensions- und Rentenlücke prüfen (zurückgestellt)
- **Story:** Als Nutzer möchte ich die Pensions- und Rentenlücke prüfen, damit ich sehe, ob die erwartete Rente ein gewähltes Ausgabenziel zum Pensionsdatum deckt.
- **Ausgangslage:** Ausdrücklich zurückgestellt; nur auf neue Freigabe des Eigentümers.
- **Ablauf:** (geplant, nicht begonnen) Erst nach Freigabe: kleine erste Frage wählen, Land, Datum und Rentenquelle festlegen, dann eigenes Arbeitspaket. Kein Ablauf definiert.
- **Ergebnis:** Keines in der aktuellen Ausbaustufe; weder Voraussetzung noch Teil von Freiheitszahl oder Health Score.
- **Abnahmekriterien:**
  - Es gibt keine Rentenzahl und keine Rentenschätzung in der App.
  - Die Freiheitszahl (V-13) funktioniert unverändert ohne Rentenmodell.
  - Randfall: Die Story wird erst nach ausdrücklicher Wiederaufnahme geplant.
- **Status:** zurückgestellt (Issue nicht geplant geschlossen; Stand 26.11.2026) — **Verweis:** #815
  Fehlt noch: alles; Anforderungen und Beispiele fehlen.

### V-17 – Wertpapierüberträge mit belegter Kostenbasis (neu, geplant)
Siehe K-13 (Wertpapierüberträge mit Kostenbasis, #520). Gleiche Funktion, dort beschrieben. Wird noch nicht gebaut (Entscheidung 15.11.2026).
- **Status:** zurückgestellt (Issue nicht geplant geschlossen; Stand 26.11.2026) — **Verweis:** #520

### V-18 – Record a currency exchange in EUR

The project lead’s decision on 2026-11-23 uses the ordinary EUR booking workflow documented in [K-14](03-konten-buchungen.md#k-14--record-a-currency-exchange-in-eur).

- **Status:** live, using the existing booking form. **Reference:** #519.


- **Vermögen › „Als Nächstes · Vermögen“ (#1352):** Die Karte trägt ihren Umfang im Titel und meldet „Keine offenen Vermögens-Aufgaben“, damit sie nicht mit den offenen Punkten unter Prüfen verwechselt wird. — **Status:** umgesetzt (Branch fix/consistent-figures-1352), Abnahme offen — **Verweis:** #1352
