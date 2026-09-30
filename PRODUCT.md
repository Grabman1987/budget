# Product

<!-- impeccable:product-schema 1 -->

Name: **Budget** (O10 entschieden am 29.09.2026; privat, nur für den Eigentümer). Vorrang der Quellen regelt `SPEC.md`; Detailquelle ist `docs/concept/produktkonzept.md`. Diese Datei hält die dauerhaften Produktfakten und alle Entscheidungen der Designphase fest.

## Platform

web

## Stack

Entschieden am 28.09.2026 (Konzept 11.1, O1): TypeScript auf Node 22 LTS (Cloud-Standard, statt 24); Frontend React + Vite mit TanStack Router und Query, Tailwind, Radix-Komponenten; Diagramme als eigene SVG-Bausteine im Blaupausen-Stil (ECharts nur falls der Durchstich in P1a das nahelegt); Backend Hono mit zod; SQLite (WAL) mit Drizzle; Sicherung über Litestream plus nächtliche age-verschlüsselte Kopie; Belege im Objektspeicher; eigener Worker-Prozess für Hintergrundjobs. Installierbare PWA mit Offline-Warteschlange für neue Buchungen. Betrieb auf Fly.io. Ein technischer Durchstich in P1 bestätigt die Wahl. Neues Repo (O2); das bestehende Cockpit läuft bis Gate 4 weiter.

## Users

Ein einzelner Nutzer, der die Finanzen eines Haushalts führt (Single-User, 1.2). Partnerin, Freunde und Arbeitgeber sind **Kontakte** ohne eigenen Login, mit denen Geld hin- und hergeht.

Zwei Nutzungssituationen mit derselben Sitemap, unterschiedlich tief:

- **Unterwegs am Handy:** Barzahlung oder Auslage in 10 Sekunden erfassen, Beleg fotografieren, in 5 Sekunden sehen, ob der Monat hält, Posteingang abarbeiten.
- **Am Desktop:** steuern. Geld verteilen, Monatsabschluss, Jahresplanung, Schulden, Portfolio-Review, Berichte.

Der Nutzer kennt YNAB, Actual Budget und Portfolio Performance aus jahrelanger Nutzung und ersetzt alle drei durch diese App.

## Product Purpose

Eine private Haushalts-Finanz-App, die Cashflow und Vermögen nicht nur trackt, sondern aktiv optimiert. Sie ersetzt das bisherige Cockpit auf Actual Budget, YNAB und Portfolio Performance durch eine App mit einer Datenbasis und einer Sprache.

Fünf Ziele mit festen Messgrößen (Konzept Kapitel 2 und 8):

1. **Cashflow sichern:** Hält der Monat, hält das Konto bis zum nächsten Gehalt?
2. **Cashflow optimieren:** Wohin fließt das Geld, was lässt sich umlenken?
3. **Vermögen tracken:** Wie entwickelt sich das Nettovermögen und warum?
4. **Vermögen optimieren:** Ist das Geld richtig verteilt, wohin soll der nächste Euro?
5. **Vorausschauen:** Was kommt in 1, 3 und 12 Monaten?

Erfolg heißt: Eine Buchung dauert 10 Sekunden, die Antwort „hält der Monat?“ 5 Sekunden. Die Routinen brauchen etwa 10 Minuten pro Woche und 30 Minuten zum Monatswechsel. Nach einem Monatswechsel im Parallelbetrieb ohne Abweichung werden Actual, YNAB und PP abgeschaltet (Gate 4).

## Positioning

Ein Hybrid, den keines der Vorbilder bietet:

- **Envelope-Budgeting im Kern** (YNAB-Prinzip: Jeder vorhandene Euro hat genau einen Job, Zielwert „Zu verteilen“ = 0).
- **Ausgabenlimit-Sicht obendrauf:** Aus den Zielen je Kategorie entsteht ein Monatslimit mit täglicher Pace-Linie („760 € von 3.000 €“), ohne das Envelope-Prinzip aufzugeben.
- **Regelwerk aus Finanz-Basics** (R01–R16: 50/30/20, Notgroschen, vom Vormonat leben, Sinking Funds, Dispo nie im Plan, Tilgungsreihenfolge, Asset Allocation, Klumpenrisiko, Freiheitszahl …) als konfigurierbare Daten, laufend geprüft, jede Regel mit Status und konkreter Maßnahme.
- **Geldfluss-Wasserfall** in acht Stufen, der am Gehaltstag, bei Windfalls und bei Überschuss beantwortet, wohin der nächste freie Euro fließt.
- **Vollständiges Vermögens- und Portfolio-Tracking** in derselben Datenbasis (TTWROR, IRR, Benchmark, Allocation Soll/Ist, Schulden mit Tilgungsszenarien).

## Operating Context

Acht Routinen tragen die App (Konzept Kapitel 4), jede mit geführtem Ablauf und Fortschrittsanzeige statt verstreuter Einzelseiten:

| Rhythmus | Routine | Gerät |
| --- | --- | --- |
| Täglich, automatisch | Nachtlauf: Bank-Sync 2 × täglich, Kurse, Wechselkurse, erwartete Zahlungen zuordnen, Umbuchungen und Dubletten erkennen, Regeln prüfen | Server |
| Laufend | Erfassen | Handy |
| Wöchentlich | Posteingang leeren, Pace prüfen | Handy oder Desktop |
| Gehaltstag | Geld verteilen mit dem Wasserfall-Assistenten | Desktop oder Handy |
| Monatswechsel | Monatsabschluss: Kontostände prüfen, manuelle Werte, Überziehungen decken, Kontakte abrechnen, Monatsbericht | Desktop |
| Quartal | Portfolio-Review, Abo-Preise, Bank-Einwilligungen erneuern (alle 180 Tage) | Desktop |
| Jährlich | Jahresplanung, Jahresbericht, Wiederherstellung einer Sicherung testen | Desktop |
| Ereignis | Szenario anlegen (Gehaltsänderung, Karenz, Teilzeit) | Desktop |

Der **Posteingang** ist die zentrale Arbeitsliste: unkategorisierte Buchungen, Vorschläge, abweichende erwartete Zahlungen, Regelverletzungen, veraltete Werte, ablaufende Bank-Einwilligungen.

Datenquellen: Enable Banking (PSD2) für österreichische Banken, CSV/XLSX-Import für Konten ohne API, Bitpanda-Lese-API, Depot-Importe plus Portfolio-Performance-XML als Erstbefüllung, Kurse über yfinance mit Ersatzquelle Ariva, EZB-Wechselkurse, manuelle Bewertungen für P2P und Sonstiges Vermögen.

## Capabilities and Constraints

**Informationsarchitektur (Kapitel 6):** Fünf Hauptbereiche, je eine Leitfrage, auf Handy und Desktop gleich in Inhalt und Reihenfolge:

| Bereich | Leitfrage |
| --- | --- |
| Heute | Hält der Monat? (Leitzahl: frei verfügbar bis Gehalt) |
| Plan | Jeder Euro hat einen Job |
| Konten | Was ist passiert? |
| Vermögen | Was besitze ich? |
| Reports | Warum und wohin? |

Einstellungen liegen im Profil-Menü. Auf jeder Seite: Suche, Posteingang mit Zähler, „+ Buchung“. Zweite Ebene als Register, keine dritte Menüebene; Details als Seitenpanel (Desktop) oder Blatt von unten (Handy). Jede Ansicht hat eine eigene URL.

**Fachliche Invarianten (Kapitel 5.2):** Beträge als Integer in Cent; Summe der Anteile = Buchungsbetrag; Umbuchung = genau zwei Buchungen; nichts wird hart gelöscht, jede Änderung ist protokolliert und rückgängig machbar; Importe idempotent; Stichtag 01.10.2023 mit Eröffnungssalden, Kurshistorie vollständig auch davor.

**Navigation-Begriff:** Der fünfte Hauptbereich heißt „Reports“ (Entscheidung 28.09.2026, statt „Berichte“).

**Reports-Katalog (Entscheidung 29.09.2026, erweitert die 16 Berichte aus Konzept 9.1 auf 25):**
- Monat und Einkommen: Monats-One-Pager (druckbar), Gehaltsreport (Brutto → Netto, Erhöhungen gegen Inflation), Einnahmen (erwartet gegen eingegangen), Geldfluss (Sankey), Jahresansicht (Kategorie × Monat), Kategorieübersicht, Gesamttabelle (alle Monate, CSV), Sparquote und Geldalter.
- Ausgaben und Plan: Ausgabenanalyse, Budgettreue inkl. 50/30/20, Abos und Fixkosten, Persönliche Inflation, Empfänger-Analyse, Bank- und Zinskosten.
- Zukunft und Vermögen: Liquiditätsprognose (90 Tage, 12 Monate, Szenarien), Cashflow-Verlauf, Vermögensverläufe, Portfolio-Performance, Jahresvorschau Zahlungen, Sparziele-Fortschritt.
- Überblick: Jahresreport (druckbar), Finanz-Check-Verlauf, Explorer mit gespeicherten Ansichten, Kontakte-Abrechnung, Zeitraumvergleich.
Alle Reports rechnen aus demselben Hauptbuch; Nettovermögen, Rendite und Regelstatus sind auf Heute, Vermögen und Reports identisch.

**Feedback-Runde Reports (Entscheidungen 29.09.2026):**
- Katalog jetzt 30 Reports in 5 Baugruppen: neu „Projekte und Nebeneinkünfte“ (1.9), Baugruppe 4 „Portfolio“ (Depots im Vergleich, Allocation, Einzahlungen und Wert, Rendite und Kennzahlen, Kosten/Steuern/Erträge), Überblick wird 5. Reihenfolge 1.7 Sparquote und Geldalter, 1.8 Gesamttabelle. „Abos und Fixkosten“ heißt „Verträge und Abos“ und enthält alle Verträge mit Fristen und Fremdwährung.
- Vermögen und Reports doppeln sich nicht: Vermögen ist der Ort für Entscheidungen (Soll/Ist, Rebalancing, Sparpläne), Reports zeigen, wie sich die Entscheidungen ausgewirkt haben (auch gegen Weltindex). Der Performance-Verlauf ist aus Vermögen › Portfolio in die Reports gewandert.
- 50/30/20 zeigt zugewiesenes Geld: periodische Kosten, Sonderzahlungen und Windfall-Umbuchungen zählen als Zwölftel; Bedarf + Wunsch + Zukunft + Übrig/aus Guthaben = 100 % der Einnahmen.
- Liquiditätsprognose ist das Planungswerkzeug für geplante Ereignisse (z. B. Papamonat ohne Gehalt, Kinderwagen, Kinderzimmer): Ereignisliste, 6-Monats-Vorausschau, Urteil „geht sich aus“, 10 % Puffer, Stellschrauben (Weihnachtsgeld, Sparplan-Pause, Kündigen). Das Szenario „ohne Beitrag Miete“ entfällt.
- Gehaltsreport folgt der eigenen Gehaltsübersicht (Auszahlung je Monat und Jahr, Jahresgehälter mit Zuwachs, Gehaltszettel mit Bezügen/Abzügen, Kollektiverhöhung/Biennalsprung). „Gehaltszettel hinzufügen“: PDF hochladen (Ablage in Dropbox › Finanzen › Einkommen › Gehalt) oder Werte eingeben.
- Kreditkonditionen (Rahmen, Dispo, Zinssatz, Laufzeit) werden unter Einstellungen › Konten gepflegt; Fremdwährung: Originalbetrag bleibt, Umrechnung mit EZB-Kurs des Buchungstags, Abweichung der Bank als Fremdwährungsgebühr.
- Regelwerk: Stufenmodell nach Nettovermögen (bis 10.000 / 100.000 / 1 Mio. €) mit Regeln aus I Will Teach You to Be Rich, Get Good with Money, Your Money or Your Life, Everyday Millionaires; „Dignity“ nur als Haltung (Würde statt Scham). Pflege unter Einstellungen › Regelwerk.
- Farben: pastelliges Grün/Rot für Heatmaps und für Veränderungen mit Vorzeichen (besser/schlechter); Rot für Handlungsbedarf bleibt unverändert.
- Planungswerkzeug mit KI-Unterstützung beim Befüllen und Entscheiden ist ein Ziel für später (V1+).

**Buchungserfassung (Entscheidung 28.09.2026, ersetzt Konzept 7.5 Punkt 2):** Kein eigener Ziffernblock. Der Betrag ist ein Eingabefeld wie bei YNAB, in das Grundrechenarten direkt getippt werden können, ergänzt um kleine Operator-Knöpfe. Einnahmen können einer Kategorie zugeordnet werden (z. B. Geldgeschenk für eine Reise), Standard ist „Zu verteilen“. Bei einer Umbuchung ist die Gegenseite immer ein anderes Konto, nie ein Empfänger.

**Heute (Entscheidung 28.09.2026):** Kein Urteilssatz wie „Ja, der Monat hält“; die Leitzahl beantwortet die Frage selbst. Der Seitenkopf zeigt den aktuellen Monat. Der Finanz-Check trägt eine Kennzahl (erfüllt / Warnung / verletzt über alle Regeln).

**Kreditkarten (Entscheidung 30.09.2026, ersetzt die einfache Konzeptregel aus Konzept 3.1):** Kartenausgaben folgen YNAB. In den Envelope „Kartenzahlung“ wandert nur der gedeckte Teil einer Kartenausgabe; was die Kategorie nicht decken kann, bleibt als neue Kartenschuld stehen (Kredit-Überziehung) und mindert „Zu verteilen“ im Folgemonat nicht, anders als eine Überziehung mit Bargeld. Wird die Kategorie später im Monat gedeckt, wandert der Betrag nachträglich. Gutschriften auf der Karte fließen voll in die Kategorie zurück, Zahlungen an die Karte mindern den Envelope. Die einfache Konzeptregel bleibt für den Parallelbetrieb umschaltbar.

**Geldfluss-Wasserfall (Entscheidung 28.09.2026, ergänzt Konzept 3.6):** Neun statt acht Stufen. Nach „1 Fixkosten und Mindestraten“ kommt neu „2 Laufender Monat“ mit den variablen Monatszielen für Bedarf und Wunsch (Lebensmittel, Treibstoff, Freizeit …); die Konzeptstufen 2–8 rücken auf 3–9. Plan › Monat ordnet die Tabelle standardmäßig nach diesen Stufen (umschaltbar auf Gruppen oder Klassen); Überziehungen erscheinen als Triage-Leiste über der unveränderten Tabelle, nicht als eigener Modus.

**Umfang V1:** Budget, Vermögen und Portfolio komplett, 27 KPIs mit fester Formel und genau einem primären Ort, 30 Reports inkl. Explorer und druckbarer Blätter (`SPEC.md` §7), Diagramm-Grammatik nach Konzept 9.2 und 9.3 und DESIGN.md.

**Login:** Passkeys (Face ID, Touch ID, Windows Hello), zehn Wiederherstellungscodes, 30-Tage-Session auf registrierten Geräten, erneute Bestätigung für Export, Bankverbindung und neue Passkeys.

**Nicht in V1:** Steuer, KI-Beratung oder KI-Kategorisierung, Fahrzeug- und Immobilienbewertung, Mehrbenutzer und Partner-Verknüpfung, native App, Kompatibilität zu Actual.

**Umsetzung:** Pakete P0–P6 mit vier Gates (`SPEC.md` §11, `docs/ROADMAP.md`). Stand 29.09.2026: Ende P0, Gate 1 steht an.

**Offen:** Die Konten- und Kategorienliste für die Migration (P2). Name entschieden: Budget.

## Brand Commitments

- **Sprache der Oberfläche:** Deutsch (de-AT), Beträge `1.234,56 €`, Minus als echtes „−“, Einnahmen mit „+“. Kennzahlen ohne Cent, Listen mit Cent. Code, Kommentare und technische Doku auf Englisch.
- **Eigenes Glossar statt Fremdbegriffen (Prinzip 1):** „Zu verteilen“, „Verfügbar“, „Bestätigt“, „Kontostand prüfen“, „Erwartet“, „Posteingang“, „Kontakt“, „Anteil“, „Umbuchung“. Keine Begriffe wie „Abgleichbuchung“, „cleared“ oder „Bei Bank gebucht“. Jeder Begriff steht im Glossar.
- **Generisch statt personenbezogen (Prinzip 2):** Kein Personen- oder Anbietername im Code, in UI-Texten oder in Beispielen. Personen sind Kontakte, Anbieter sind Institutionen, beides Daten.
- **Name:** Budget.
- **Visuelle Welt:** Kapitel 10 des Konzepts (Manrope, Farb-Tokens, Akzent, Klassenfarben, helle Kacheln) und die Mockups in `03_Mockups` sind nur Entwurf. Vom Nutzer festgelegt (28.09.2026): **Blautöne und Blaupausen-Look** – technisch, klar, stilsicher, „feine Klinge“; nicht generisch. Abgelehnt: Braun-/Rams-Industriedesign. Details entstehen über `/impeccable` und landen in DESIGN.md. Verbindlich ist außerdem die Bedeutungslogik: Die drei Klassen Bedarf/Wunsch/Zukunft, Richtung (Einnahme/Ausgabe) und Status (erfüllt/Warnung/verletzt) brauchen je eine eigene, überall gleiche Kennzeichnung.

## Evidence on Hand

- `docs/concept/produktkonzept.md` – ursprüngliche vollständige Spezifikation (Vorrang regelt `SPEC.md`).
- `docs/concept/ist-analyse-altes-cockpit.md` – Befunde zum alten Cockpit und Zuordnung des Nutzer-Feedbacks zu Ursachen.
- `design/prototype/` und `design/screens/` – verbindlicher Prototyp im Blaupausen-Look (ersetzt die alten Mockups `03_Mockups`, die nicht mehr gelten).
- `reference/finance-hub/` – getestete Rechenmodule des alten Repos (Liquidität, Tilgung, TTWROR/IRR, Kurshistorie, Kontoabgleich, Import-Zuordnung, Dublettenschutz, wiederkehrende Zahlungen, Betragsformat) werden nach TypeScript portiert und von Namen befreit.

**Nicht erfinden:** Alle Zahlen, Bank-, Broker- und Positionsnamen in den Mockups sind Beispieldaten. Echte Finanzdaten kommen erst über die Migration (P2) in die App. Keine realen Salden, Institutionen oder Personen in Entwürfe, Tests oder Doku übernehmen.

## Product Principles

1. **Eine Frage je Ort.** Jeder Hauptbereich, jede Kachel und jeder Bericht beantwortet genau eine Frage; jede Kennzahl hat genau einen primären Ort.
2. **Jede Zahl ist erklärbar.** Jede Kennzahl lässt sich bis zur einzelnen Buchung aufklappen; nichts verschwindet stillschweigend, alles ist rückgängig machbar.
3. **Mobil erfassen, Desktop steuern.** Beide Geräte zeigen dieselbe Sitemap und dieselben Inhalte, sie unterscheiden sich nur in der Tiefe.
4. **Regeln statt Bauchgefühl.** Finanz-Basics sind geprüfte Regeln mit Status und Maßnahme, nicht Hinweistexte.
5. **Automatisch, wo es zuverlässig ist.** Bank-Sync und Kurse laufen von selbst; manuelle Eingabe ist ein gleichwertiger Weg, kein Notbehelf.

## Accessibility & Inclusion

- Rot und Grün nur zusammen mit Vorzeichen oder Symbol (Farbfehlsichtigkeit). Kontrast und Farbfehlsichtigkeit werden mit einem Werkzeug geprüft, bevor Farben festgeschrieben werden.
- Berührflächen mindestens 44 × 44 px; Erfassung und Suchfelder sind mit Tastatur und Touch bedienbar (eigene Combobox statt `<datalist>`, die auf iOS Safari versagt).
- Reduzierte Bewegung wird respektiert.
- Vollwertiger Dunkelmodus.
