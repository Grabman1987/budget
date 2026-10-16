# Page review 2026-10-16 – agreed page decisions

Outcome of the owner page review on 2026-10-16 (German, owner-approved). Where it differs from older Figma frames, docs or audit recommendations, **this record and the linked issue comments take precedence**. Status per page: agreed, not implemented. Example amounts are synthetic.

## Supersessions, Präzisierungen, offene Punkte (Konfliktprüfung 16.10.2026)

**Ersetzt (neuere Owner-Entscheidung 16.10. gewinnt):**

1. Erfassung: neue Buchung startet vorgemerkt, **außer Bargeld** – sofort bestätigt, Status fest (#499). Restarbeit #523: Umbuchung Bar↔Bank → Bar-Seite bestätigt, Bank-Seite vorgemerkt (heute wird ein Status auf beide Seiten kopiert).
2. Kopf: roter Überzogen-Chip entfällt (ersetzt ROADMAP-#237-Chip und „inbox with counter“) → Pille „Prüfen · N“. Überzogene Kategorien nicht mehr in Prüfen (ersetzt #465-„urgent overspent summary“) → Heute › Zu tun + Plan.
3. Register: Plan Monat · Jahr · Zahlungen · Ziele · Prognose (Reiter „Zahlungen“, Seitenüberschrift darf „Zahlungen und Abos“ heißen). Konten Übersicht · Buchungen · Prüfen · Kontakte; Glossar „Posteingang“ → „Prüfen“; `/konten/posteingang(/$id)` leitet auf `/konten/pruefen` weiter (Suchparameter `pruefen=reconcile` existiert bereits).
4. Liquiditätsprognose: Report-Eintrag entfällt; `/reports/liquiditaet` leitet auf `/plan/prognose` weiter (Festlegung Claude, passt zu „alte Slugs leiten weiter“).
5. Modified Dietz entfällt aus der Anzeige (ersetzt „remains labelled“ der Referenzübernahme); Code-Entfernung in #525/#487.
6. Kompakter Benchmark-Vergleich in Vermögen ersetzt #480 „detailed benchmark stays in Reports“ nur für den Kompaktvergleich; Detail bleibt in Reports.
7. Onboarding: GAP06, ONB02–06, AC24/25, DEC01–04 zurückgestellt bis PUB1 (#490).

**Präzisierungen (Routine, Festlegung Claude):**

- Benchmarks: Vorauswahl Weltaktien (FTSE All-World) + Nasdaq 100 als einmaliger auditierter Schreibvorgang der bestehenden Benchmark-Auswahl, **kein Code-Default** (GAP01: leer = kein Vergleich; spätere Leerung bleibt leer). Differenz in Pp mit Hinweis „Kursindex, ohne Ausschüttungen“.
- Begriffe: „Verteilen“ = „Zu verteilen“ auf mehrere Kategorien; „zuweisen“ bleibt für eine Kategorie („Rate zuweisen“, „Schnell zuweisen“). Abnahmetest: „Noch zu verplanen“ = 0 Treffer (Composita wie „Geplante Zahlung“ bleiben korrekt).
- „Gespart“ = bestehende Formel Einnahmen − Konsum + reguläre Tilgung (DESIGN.md), damit Anfang + Gespart + Markt = Jetzt aufgeht.
- Portfolio-Umfang: Wertpapiere ohne Depot-Bargeld, Gebühren ein, Steuern aus; die Allokationssumme (#507, inkl. Verrechnung) heißt nie „Portfoliowert“.
- Sammel-Löschen: „unverknüpft“ = nicht mit Kontakt- oder Trade-Abrechnung verknüpft; Umbuchungspaare werden gemeinsam gelöscht. Einzel-Löschen gesperrt/verknüpft: Server lehnt ab, Dialog erklärt Grund und Weg (entsperren bzw. Abrechnung öffnen).
- Gehaltszettel: Abgleichfenster ±5 Tage wie im Code (nicht ±7); eine gesperrte (abgeglichene) Auszahlung wird nicht aufgeteilt, nur verknüpft mit Hinweis.
- Schulden: negative Giro-/Verrechnungskonten zählen als Schuld; „schuldenfrei“ = alle Kredite mit Konditionen getilgt, Karten „laufend ausgeglichen“ daneben.
- Rendite: Wechsel auf PP-Konvention ändert Renditezahlen bewusst (Beispiel Endfluss: bisher 20 %, PP 10 %) – unter GAP08 vermerkt.

**Offen (Owner-Frage):** Freiheit „Investiert = Anlagebasis (#507)“ – die Kontenauswahl ist nur aktuell, nicht historisiert, und würde rückwirkend auf die Ist-Kurve seit 10/2023 wirken; R16 nutzt heute `role=investment` und würde mitwechseln.

## Prüfstand Seitenreview

Status je Seite: vorgeschlagen → vereinbart → implementiert → deployt → abgenommen.
Figma-Datei: https://www.figma.com/design/Nv9oaV96Npql6onEofCFEi

**Phase 1 abgeschlossen (16.10.2026).** Nächster Schritt: Phase 2 – priorisierte Umsetzungsliste aus den Issues; vorher #505 mergen und Review-Ergebnis in docs/product nachtragen.

Fortschritt: Blöcke 1–7 ✓ (Block 7 Onboarding bis PUB1 zurückgestellt).

| Seite/Route | Figma-Frame | Status | Vereinbart | Offen | Aufgabe | Abnahmekriterium |
| --- | --- | --- | --- | --- | --- | --- |
| Heute `/` | H01 Desktop `172:3`, Phone `172:125`; H02 `172:197`, H03 `172:345`, H04 `172:457`, H05 `206:5910` | vereinbart 16.10. | siehe unten | Figma-Frame noch nicht nachgezogen | #475, #476 | siehe unten |
| Plan › Monat `/plan/monat` | P01 `174:2` (Seite `169:32`) | vereinbart 16.10. | siehe unten | P02–P06/P15–P23 Zustände beim Umsetzen prüfen | #449, #450, #469 | siehe unten |
| Plan › Ziele `/plan/sparziele` | P10 `174:1480` (verworfen), P11 `174:1610` | vereinbart 16.10. | siehe unten | – | #482, #514 | siehe unten |
| Plan › Zahlungen `/plan/erwartet` | P08 `174:1256`, P09 `174:1368` | vereinbart 16.10. | siehe unten | – | #482 | siehe unten |
| Plan › Jahr `/plan/jahr` | P07 `174:1106` (zu dünn) | vereinbart 16.10. | siehe unten | – | #482 | siehe unten |
| Monatsabschluss `/monatsabschluss/$month` | P13 `174:1864`, P14 `174:1976` | vereinbart 16.10. | siehe unten | – | #483, #357 | siehe unten |
| Konten › Übersicht `/konten` | K01 `172:570` | vereinbart 16.10. | siehe unten | – | #467, #478 | siehe unten |
| Konto-Register + Depot `/konten/$id` | K02 `172:698`, K03 `172:842`, K04 `172:968`, K05 `172:1094` | vereinbart 16.10. | siehe unten | – | #467, #478 | siehe unten |
| Buchung erfassen (Dialog) | F01 `174:2092` | vereinbart 16.10. | siehe unten | – | #523 | siehe unten |
| Konten › Prüfen + Abgleich `/konten/pruefen` | K07–K09, K12–K13 | vereinbart 16.10. | siehe unten | – | #477 | siehe unten |
| Alle Buchungen `/konten/buchungen` | K06 `172:1220`, K14 `206:5060`, K15 `206:5476` | vereinbart 16.10. | siehe unten | – | #479, #515 | siehe unten |
| Kontakte `/konten/kontakte` | K10 `172:1694`, K11 `172:1814` | vereinbart 16.10. | siehe unten | – | #479 | siehe unten |
| Gehaltszettel → Plan › Einnahmen | G01 `173:2` | vereinbart 16.10. | siehe unten | G02–G11 in Figma nicht gefunden | #482 | siehe unten |
| Vermögen › Nettovermögen `/vermoegen/nettovermoegen` | V01 `172:1943` (App besser) | vereinbart 16.10. | siehe unten | – | #524, #469 | siehe unten |
| Vermögen › Portfolio `/vermoegen/portfolio` | V02 `172:2107`, V09 `206:6344` | vereinbart 16.10. | siehe unten | – | #525, #510 | siehe unten |
| Allokation + Vermögensstufen | V18–V21 (`260:1865`, `260:2002`) | Stufen-Logik deployt 16.10. (20c24257); Tabelle offen | siehe unten | Editor-Tabelle #526 | PR #507, #526 | siehe unten |
| Positionen, Instrument, Sparpläne | V10 `206:6836`, V03 `172:2271`, V14 `206:8502` | vereinbart 16.10. | siehe unten | – | #525 | siehe unten |
| Vermögen › Schulden `/vermoegen/schulden` | V05 `172:2557`, V15 `206:8922`, V16 `206:9364` | vereinbart 16.10. | siehe unten | Kreditkonditionen trägt der Owner ein | #527 | siehe unten |
| Vermögen › Freiheit `/vermoegen/freiheit` | V06 `172:2695` | vereinbart 16.10. | siehe unten | – | #528 | siehe unten |
| Reports › Katalog `/reports` | R00 `175:2` | vereinbart 16.10. | siehe unten | – | #487 | siehe unten |
| Report-Vorlage (alle Reports) | R02 `175:435` als Beispiel | vereinbart 16.10. | siehe unten | – | #488 | siehe unten |
| Reports › Auswertung/Explorer | R05 `175:929`, R23 `206:10218`, R24 `206:10630` | vereinbart 16.10. | siehe unten | – | #517 | siehe unten |
| Reports › Portfolio-Auswertung | R11 `175:1913`, R28 `206:12223` | vereinbart 16.10. | siehe unten | – | #525, #487 | siehe unten |
| Einstellungen › Übersicht `/einstellungen` | E00 `172:3110` | vereinbart 16.10. | siehe unten | – | #485, #486 | siehe unten |
| Einstellungen › Verbindungen | E03 `172:3474`, E08 `206:13904` | vereinbart 16.10. | siehe unten | Zugänge (Enable Banking, Dropbox) richtet der Owner ein | #486 | siehe unten |
| Suche + globale Zustände | S01 `173:1269` … S13 `186:1660` | vereinbart 16.10. | siehe unten | – | #522, #511, #479 | siehe unten |
| Onboarding O01–O08 | – (keine Frames) | zurückgestellt bis PUB1 | siehe unten | – | #490 | – |
| Globale Navigation | Seitenleiste/Kopf in H01 `172:3` / `172:125`, Regeln `197:1970` | vereinbart 16.10. | siehe unten | Figma-Frames nachziehen | #468, #476 | siehe unten |

## Heute – Entscheidungen 16.10.2026 (Owner)

1. Kennzahlen: Zu verteilen (Begriff geändert 16.10., siehe Plan) · Verfügbar im Budget · Nettovermögen. Im Modus „Bis Gehalt“ wird die mittlere Zahl zu „Frei bis Gehalt“.
2. Monatsschalter ‹ Monat › und „Monat | Bis Gehalt“ sitzen rechts im Titelblatt (statt „Stand/Einheit“); Stand darunter. Ergänzt H01 gemäß 3B.
3. Abschnittsfolge: 01 Monat im Blick · 02 Kontoprognose kompakt (35 Tage, Tiefpunkt mit Betrag + Datum, Link zur Detailseite H02) · 03 Vermögen · Zu tun · Fällig 14 Tage · Letzte Buchungen. Ergänzt H01 gemäß 5B.
4. Vermögensverlauf auf Heute: 12 Monate (Monatsendwerte + heute, Hover mit Betrag), nicht 14 Tage täglich.
5. iPhone: Kennzahlen als kompakte Liste (Name links, Betrag rechts, Erklärung hinter ⓘ), damit „Monat im Blick“ im ersten Bildschirm liegt.
6. iPhone: „+ Buchung“ bleibt runder Knopf unten (FAB); Seitenende mit Abstand, nichts verdeckt.
7. Angepinnte Envelopes: optionaler Abschnitt, schaltbar in „Ansicht anpassen“ (H05), standardmäßig aus.
8. Finanz-Check: kein eigener Block; verletzte Regeln als eine Zeile in „Zu tun“ → H04; keine Verletzung = keine Zeile.
9. Zustände (Routine, Claude): Platzhalter je Abschnitt beim Laden; Fehler nur im betroffenen Abschnitt; offline „Stand vom …“; anderer Monat → „Stand heute“ bei nur-aktuellen Abschnitten.

Bereits vorher entschieden (gilt weiter): Zu tun max. 4 Zeilen (BUD02.03), Titelblatt im Zeichnungsstil (ZS1), Teal/Orange (1A), Archivo für Zahlen (2B), Hover in jedem Chart.

## Globale Navigation – Entscheidungen 16.10.2026 (Owner)

Soll: Seitenleiste/Kopf aus H01 `172:3` / `172:125`; Regeln `197:1970`. Aufgabe: #468 (Q5), Prognose-Reiter zusätzlich #476.

1. Desktop-Kopf: Suche · Datenschutz-Auge · eine Pille „Prüfen · N“ (→ Konten › Prüfen) · + Buchung. Kein roter Überzogen-Chip im Kopf; überzogene Envelopes nur in Heute › Zu tun und im Plan (ein Alarmort, Q2).
2. Plan-Register kurz: Monat · Jahr · Zahlungen · Ziele · Prognose. Prognose = Plan-Unterseite (Detail H02), Heute-Karte verlinkt dorthin; Report Liquidität bleibt verlinkt. Kein Bereichssprung mehr.
3. iPhone-Kopf: Titel · Suche · Avatar; darunter Statuszeile („4 zu prüfen · 2 überzogen“) nur wenn nötig. Runder +-Knopf auf allen Seiten, blendet beim Runterscrollen aus.
4. Seitenleiste unten: ein Eintrag „Profil / Einstellungen“ plus kleines Hell/Dunkel-Symbol daneben.
5. Routine (Claude): Konten-Register Übersicht · Buchungen · Prüfen · Kontakte; Fokusrahmen nur bei Tastatur (:focus-visible); je Detailseite ein Titel und ein Rückweg; Offline-Warteschlange als eigener Status-Chip, nicht als Zähler (A-09).

**Abnahmekriterium Navigation:** keine Seite verlässt beim Registerwechsel ihren Bereich; am iPhone alle Register ohne Wischen lesbar; genau eine Alarmstelle im Kopf; FAB verdeckt keinen Betrag (Scroll-Test); Axe hell/dunkel ohne Verstöße, Touch-Ziele ≥ 44 px.

## Plan › Monat – Entscheidungen 16.10.2026 (Owner)

Soll: P01 `174:2` + Zerosum-Entscheidungen 12./13.10. (live seit #462). Aufgaben: #449 (Kopf/Filter/iPhone), #450 (Seitenliste), #469 (Begriffe).

1. Begriffe app-weit: „Zu verteilen“ (Leitzahl), „Zugewiesen“ (Spalte), „Verteilen“ (Aktion). Figma „Geplant“/„Noch zu verplanen“ überholt.
2. Einnahmen: Link im Titelblatt, kein eigener Reiter (5 Reiter bleiben).
3. Seitenliste ohne Auswahl: Monatsüberblick + 50/30/20 offen; Wasserfall, Einkommen vs. Ziele, Geld auf Konten zu; Zustand gemerkt.
4. iPhone: keine Ankreuzfelder, Langdruck = Auswahlmodus mit Leiste unten; „Schnell zuweisen“/„Ansicht“ ins ⋯-Menü.
5. Routine (Claude): Monatsschalter im Titelblatt wie Heute; kein roter Chip im Kopf; keine Positionsnummern in Zeilen.

**Abnahmekriterium Plan › Monat:** iPhone 390×844 zeigt erste Kategorie im ersten Bildschirm; Seitenliste ohne Auswahl nicht länger als Raster im ersten Viewport; Begriffe überall gleich (Suche im Code nach „verplanen“/„Geplant“ leer); Undo/Sperren unverändert grün.

## Plan › Ziele – Entscheidungen 16.10.2026 (Owner)

Soll: Liste = App-Tabelle (P10 `174:1480` verworfen, Figma-Regel 03); Detail = P11 `174:1610`. Aufgabe: #482 (abstimmen mit #514).

1. Sparziel setzt automatisch das Monatsziel seiner Kategorie (= nötige Rate); Knopf „übernehmen“ entfällt.
2. Ist-Linie aus Kategorie-Verfügbar am Monatsende, rückwirkend ab Zielbeginn.
3. Knopf „Rate zuweisen“ in Liste und Detail, über bestehenden Zuweisungsweg mit Rückgängig.
4. Erreichte Ziele: Gruppe „Erreicht“, danach „Abgeschlossen“ (eingeklappt), nichts gelöscht.
5. Routine: Detail nach P11; ein Titel, ein Rückweg, :focus-visible; Erklärtext hinter ⓘ.

**Abnahmekriterium Ziele:** Ziel ändern → Plan zeigt dieselbe Rate; neues Ziel mit 6 Monaten Kategorie-Historie zeigt 6 Ist-Punkte; „Rate zuweisen“ + Rückgängig centgenau neutral; Gruppen korrekt.

## Plan › Zahlungen – Entscheidungen 16.10.2026 (Owner)

Soll: P08 `174:1256` (Liste), P09 `174:1368` (Detail). Aufgabe: #482.

1. Liste: 35 Tage, Gruppen Überfällig · Diese Woche · Nächste Woche · Später, Summe je Gruppe; 90 Tage als Umschalter.
2. Aktionen: Pausieren (bis Datum) + Beenden (ab Datum); Löschen nur ohne je zugeordnete Buchung.
3. Detail-Verlauf Soll gegen Ist: letzte 12 Fälligkeiten mit Buchung, Abweichung, Status; nächste 3 erwartet. Bug „keine Fälligkeiten“ beheben.
4. Preisänderung: nach 2 gleichen Abweichungen Vorschlag in Konten › Prüfen (annehmen/ablehnen).
5. Routine: ein Titel, ein Rückweg, :focus-visible.

**Abnahmekriterium Zahlungen:** Liste ≈ 2 Bildschirme; Beenden ändert Vergangenheit nicht; Pausieren nur im Zeitraum; Abweichungen centgenau; Preisvorschlag erst nach 2 Abweichungen, Rückgängig neutral.

## Plan › Jahr – Entscheidungen 16.10.2026 (Owner)

Leitfrage: Reicht das Geld bis Jahresende, auch mit geplanten Ereignissen? P07 `174:1106` zu dünn; Basis = App-Seite, neu geordnet. Aufgabe: #482.

1. Leitzahl: Freies Geld am 31.12. mit Ereignissen; klein Einnahmen · Konsum · Ereignisse.
2. Diagramm: kumuliertes freies Geld Jan–Dez, Ist/Plan, Ereignis-Stufen beschriftet, Tiefpunkt, Hover.
3. Ereignisse als Liste mit an/aus, keine Matrix.
4. Jahrestabelle: Gruppen zugeklappt, aufklappbar, Schalter bleibt, erste Spalte fixiert.

**Abnahmekriterium Jahr:** Leitzahl = Diagramm-Endpunkt = Dezember „Zu verteilen mit Ereignissen“ (centgenau); Ereignis-Schalter ändert beides gleich; ≤ 2 Bildschirme zugeklappt; iPhone ohne Seiten-Querscroll.

## Monatsabschluss – Entscheidungen 16.10.2026 (Owner)

Soll: P13 `174:1864`, P14 `174:1976`. Aufgabe: #483 (Gate 4 #357).

1. 5 Schritte (Prüfen · Konten abgleichen · Überzogenes ausgleichen · Nächsten Monat planen · Ergebnis); leere automatisch überspringen.
2. Konten ohne Bewegung als Sammelzeile „Gemeinsam bestätigen“; Begründung nur bei Differenz.
3. Keine Monatssperre; Stand merken; spätere Änderung → Zu-tun-Zeile „nach Abschluss geändert“.
4. Ergebnis: P14-Zahlen + Sparquote + Ausgaben vs. Plan; Link Monatsreport.
5. Routine: Schritt „Prüfen“; Heute-Zu-tun ab dem 1.; FAB aus im Abschluss.

**Abnahmekriterium Monatsabschluss:** ruhiger Monat ≤ 3 Klicks; Sammelbestätigung mit Audit + Rückgängig; Nachbuchung → genau eine Zu-tun-Zeile; Ergebnis = Monatsreport (centgenau).

## Konten › Übersicht – Entscheidungen 16.10.2026 (Owner)

Soll: K01 `172:570`. Aufgabe: #467 (Depot-Vorlage #478).

1. Leitzahl Saldo Budget-Konten + „X von Y geprüft“; kein Nettovermögen-Hero.
2. Liste 36–40 px: Name · Prüfbadge · 30-Tage-Sparkline (Hover) · Saldo.
3. Prüffrist: Budget-Konten/Kreditkarten 14 Tage, Kredite/Investments 1 Monat; fällig = oranges Badge + Zu-tun-Zeile.
4. Ohne Buchung seit Abgleich bleibt geprüft.
5. Routine: feste Gruppenfolge mit Summen; Depot+Verrechnung als Plattform; Ziehen zum Sortieren; Bank-Sync-Status in Datenquellen; geschlossene Konten nie.

**Abnahmekriterium Konten-Übersicht:** alle Testkonten ohne Scrollen (1440×900); Prüfstand-Zahl = Badges; Fristen per Test; ruhiges Konto grün; Hover Datum + Saldo.

## Konto-Register + Depotseite – Entscheidungen 16.10.2026 (Owner)

Soll: K02 `172:698`, K03 `172:842`, K04 `172:968`, K05 `172:1094`. Aufgaben: #467 (Register), #478 (Depot 9A).

1. Kommend als eingeklappte Zeile oben; Aktionen beim Darüberfahren.
2. Kontoverlauf kompakt (~140 px), einklappbar: Ist + 35 Tage, Tiefpunkt, Dispolimit, Hover, ein Segment.
3. Register: Desktop YNAB-Tabelle inline bearbeitbar (36–40 px); iPhone 2-zeilig.
4. Depot: Kopf Depotwert + Verrechnungskonto; Reiter Bestände (Start, ohne Rendite) · Trades · Verrechnung.
5. Routine: Saldo groß, vorgemerkt/Prüfstatus klein; ein Titel; ein Zeitraum-Schalter.

**Abnahmekriterium Register/Depot:** erste Buchung im ersten Viewport; Inline-Änderung + Rückgängig; Diagramm = Kontoprognose; Summe Bestände = Depotwert = Portfolio (gleicher Stichtag); fehlender Kurs je Zeile markiert.

## Buchung erfassen – Entscheidungen 16.10.2026 (Owner)

Soll: F01 `174:2092` + Zeilenmodell 14.10. (live). Aufgabe: #523 (neu).

1. Desktop breit (~960 px), 2 Spalten: links Kopf, rechts Zeilen.
2. Notiz sichtbar; Projekt + Markierung unter „Mehr ▾“ (offen wenn gefüllt).
3. Zeilenbetrag erst ab 2 Zeilen / bei Teilen.
4. Routine: max. 3 Kategorie-Vorschläge einzeilig; neue Bargeldbuchung sofort bestätigt, Bankbuchung vorgemerkt (laut SPEC/#499); iPhone Vollbild mit festem Speichern.

**Abnahmekriterium Erfassung:** Szenarien 1–5 ohne Scrollen (≤ 2 Zeilen, 1440×900); 1 Zeile = 1 Betragsfeld; Rest centgenau; iPhone Speichern sichtbar; Capture-E2E grün.

## Konten › Prüfen + Abgleich – Entscheidungen 16.10.2026 (Owner)

Soll: K07 `172:1354`, K08 `172:1470`, K09 `172:1588`, K12 `206:4182`, K13 `206:4624`. Aufgabe: #477.

1. Segment „Umsätze · Aufgaben“ mit Zählern; Kopf-Pille = Summe.
2. Sammelannahme nur sichere Vorschläge; ein Rückgängig.
3. Abgleich-Differenz: erst Kandidaten, dann Korrektur mit wählbarer Kategorie (Standard „Zu verteilen“, je Konto gemerkt).
4. Routine: überzogene Kategorien raus; Gehaltszettel → G01; Sperre nach Abgleich wie bisher; Typ-Icons; „Einrichten“-Weg.

**Abnahmekriterium Prüfen:** Sammelannahme nur „passt“, Rückgängig centgenau; Kandidaten vor Korrektur; Kategorie je Konto gemerkt.

## Alle Buchungen – Entscheidungen 16.10.2026 (Owner)

Soll: K06 `172:1220`, K14 `206:5060`, K15 `206:5476`. Aufgaben: #479, #515.

1. Suche + „Filter ▾“, aktive Filter als Chips, live, in der URL.
2. Sammeländerung als Leiste unten (Kategorie, Status, Markierung, Projekt, ⋯); Gesperrte übersprungen; ein Rückgängig.
3. Sammel-Löschen erlaubt (ungesperrt, unverknüpft) mit Vorschau + Rückgängig.
4. Routine: Kommend eingeklappt; Anzahl + Summe immer; Saldo nur bei einem Konto; CSV im ⋯-Menü.

**Abnahmekriterium Alle Buchungen:** URL reproduziert Liste; Summe centgenau; Sammelaktionen überspringen Gesperrte, ein Audit, Rückgängig exakt.

## Kontakte – Entscheidungen 16.10.2026 (Owner)

Soll: K10 `172:1694`, K11 `172:1814` + Kontoblatt/Monatsauszug (live). Aufgabe: #479.

1. Saldo in Worten + Farbe („Schuldet dir …“ Teal / „Du schuldest …“ Orange), kein Minus.
2. Rückzahlung automatisch älteste zuerst, Vorschau änderbar.
3. Erinnerung nach 30 Tagen in Zu tun (eine je Kontakt).
4. Routine: ein Titel/Rückweg; nur offene Kontakte standardmäßig; Ausgleichen im ⋯-Menü.

**Abnahmekriterium Kontakte:** Wortlaut je Vorzeichen; FIFO-Zuordnung centgenau + manuelle Änderung; Zu-tun am Tag 31, weg bei Ausgleich.

## Gehaltszettel – Entscheidungen 16.10.2026 (Owner)

Soll: G01 `173:2`; G02–G11 nicht auffindbar → Basis App-Ablauf. Aufgabe: #482.

1. Ort Plan › Einnahmen (Liste + Hochladen); Automatik → Prüfen › Aufgaben; Report nur Auswertung.
2. Prüfdialog: PDF links, Maßkette rechts.
3. Bestätigen teilt vorhandene Auszahlungsbuchung (± Toleranz, ± 5 Tage) in Gehalt + Erstattungen; sonst neue vorgemerkte; ein Rückgängig.
4. Routine: „14 Gehälter“ nur erfasste Monate + Lückenzeile.

**Abnahmekriterium Gehaltszettel:** keine Doppelbuchung; Aufteilung centgenau; Rückgängig exakt; Sparquote ohne Erstattungen; keine Upload-Aktion im Report.

## Vermögen › Nettovermögen – Entscheidungen 16.10.2026 (Owner)

Soll: App-Stand nach #480 (besser als V01 `172:1943`). Aufgabe: #524 (GAP03), #469.

1. Zusammensetzung nach Vermögensart (aufklappbar bis Konto), Umschalter „nach Konto“.
2. Diagramm-Umschalter „Gesamt | Zusammensetzung“: gestapelte Monatsendwerte, Schulden unter Null, Hover, Tabelle.
3. Begriff „Gespart“ statt „Eigenleistung“.
4. Routine: Orange statt Rot bei Minus-Monaten; ein Titel. GAP04 erledigt (#480).

**Abnahmekriterium Nettovermögen:** Gruppen-Summe = Nettovermögen je Stichtag (centgenau); Endpunkte = Leitzahl; Umbuchung ändert nur Zusammensetzung.

## Vermögen › Portfolio – Entscheidungen 16.10.2026 (Owner)

Soll: V02 `172:2107`, V09 `206:6344`. Aufgabe: #525 (GAP01/02).

1. Ein Diagramm mit Umschalter „Wert € | Rendite %“ (TTWROR, PP-Standard), Einzahlungen als Marker.
2. Benchmarks vorausgewählt: Weltaktien + Nasdaq 100; S&P 500/ATX zuschaltbar; Differenz in Pp.
3. 5 Register: Übersicht · Positionen · Allokation · Sparpläne · Kennzahlen.
4. Routine: Umfang „Wertpapiere ohne Depot-Bargeld“ beschriftet; Orange statt Rot; Klassen-Verlauf kurz in Übersicht.

**Abnahmekriterium Portfolio:** Wert-Endpunkt = Leitzahl = Positionen; Einzahlung ändert Rendite nicht (PP-Beispiel 10 %); Benchmark gleicher Zeitraum/Start; Register ≤ 2 Bildschirme.

## Allokation + Vermögensstufen – Entscheidungen 16.10.2026 (Owner)

Soll: V18–V21 (Desktop-Flow `260:1865`, Phone-Flow `260:2002`). Aufgaben: PR #507, #526 (Tabelle).

1. **Bedingte Stufen automatisch per Schwelle aktiv** (gegen Claudes Empfehlung „erst nach Freigabe“); Bedingung nur Hinweis. Beantwortet die offene PR-#507-Frage.
2. Hysterese: Stufe bleibt, bis Anlagesumme 10 % unter ihre Schwelle fällt; Aufstieg exakt an der Schwelle.
3. Editor als Tabelle Stufe × Anlageklasse (Summe je Zeile 100 %).

**Abnahmekriterium Stufen:** Literal-Tests an Schwelle/Puffer über mehrere Monatsenden; gleicher Resolver für Allokation/Risiko/Reports/Sparvorschläge; siebenstufiges Beispiel in einem Bildschirm.

## Positionen, Instrument, Sparpläne – Entscheidungen 16.10.2026 (Owner)

Soll: V10 `206:6836`, V03 `172:2271`, V14 `206:8502`. Aufgabe: #525.

1. Instrument: Diagramm-Umschalter „Wert € | Kurs“, Standard Wert, Käufe als Marker, Einstand gestrichelt.
2. Sparplan: 12-Monats-Leiste ausgeführt/fehlt/offen, Ratenversionen, Käufe eingeklappt.
3. Routine: Listen auf 12 + „Alle anzeigen“, Zeilenklick statt Knöpfe; Positionen = bestehende Tabelle, Klick → Instrument.

**Abnahmekriterium:** Wert-Endpunkt = Portfolio-Position; Monatsleiste = zugeordnete Käufe; Seiten ≤ 2 Bildschirme.

## Vermögen › Schulden – Entscheidungen 16.10.2026 (Owner)

Soll: V05 `172:2557`, V15 `206:8922`, V16 `206:9364`. Aufgabe: #527.

1. Kreditkarten zählen mit (gegen Claudes Empfehlung); in der Tilgungstabelle „laufend ausgeglichen“.
2. Diagramm: Ist 12 Monate + Tilgungsplan gestrichelt bis schuldenfrei (+ Szenario-Linie).
3. Sondertilgung live auf der Seite, nichts gespeichert.
4. Routine: Orange statt Rot; fehlende Kreditkonditionen → Zu tun.

**Abnahmekriterium Schulden:** Restschuld = negative Konten (centgenau); V16-Beispiel unabhängig nachgerechnet; Szenario ohne Audit-Eintrag.

## Vermögen › Freiheit – Entscheidungen 16.10.2026 (Owner)

Soll: V06 `172:2695`. Aufgabe: #528 (abhängig von PR #507).

1. Diagramm Ist seit 10/2023 + Prognose.
2. Persönliches Zieljahr (gespeichert) mit nötiger Sparrate und Zieljahr-Linie.
3. „Investiert“ = Kontenauswahl der Anlagebasis (V18/#507).
4. Routine: ein Titel, Text hinter ⓘ, Tabellen-Umschalter.

**Abnahmekriterium Freiheit:** Investiert = Anlagesumme Allokation; nötige Rate centgenau nachgerechnet; Ist = Monatsendwerte ohne Interpolation.

## Reports › Katalog – Entscheidungen 16.10.2026 (Owner)

Soll: R00 `175:2` (Hub 6A). Aufgabe: #487.

1. Zuordnung 34 → 16 laut Kommentar in #487 (zusammengelegte Reports werden Ansichten, alte Slugs leiten weiter).
2. Persönliche Inflation als eigener Eintrag (Nr. 8 von 16, Gruppe Einnahmen/Ausgaben).
3. Projekte als Filter in „Einnahmen und Cashflow“.
4. Entfallen: Liquiditätsprognose, Jahresvorschau, Sparziele, Kontakte, Finanz-Check-Verlauf (leben im Bereich).

**Abnahmekriterium Katalog:** alle 34 alten Slugs leiten weiter; Zahlen gleich wie vorher; Suche über Name und Frage.

## Report-Vorlage „Antwort zuerst“ – Entscheidungen 16.10.2026 (Owner)

Beispiel R02 `175:435`. Aufgabe: #488.

1. Oben Satz + Leitzahl + Hauptdiagramm im ersten Viewport.
2. Weitere Abschnitte eingeklappt, Zustand gemerkt.
3. Ausgabenanalyse: Gruppen aufklappbar zu Kategorien.
4. Heatmap Kategorie × Monat nur in „Auswertung“.
5. Routine: 64-px-Kopf, ein Zeitraum-Segment, Vorzeitraum-Vergleich, Orange/Teal, A11y + Druck.

**Abnahmekriterium Vorlage:** Satz = Leitzahl = Diagramm (centgenau); Reports ≤ 2 Bildschirme; Heatmap-Link mit gleichem Zeitraum.

## Auswertung/Explorer – Entscheidungen 16.10.2026 (Owner)

Soll: R05 `175:929`, R23 `206:10218`, R24 `206:10630`. Aufgabe: #517.

1. Vorlagen: Heatmap Ausgaben, Jahresansicht, Gesamttabelle, Kategorie im Verlauf.
2. Umschalter Tabelle | Diagramm.
3. „Meine Auswertungen“ als Chips im Reports-Hub.
4. Routine: Orange/Teal-Heatmap, Chips, Kopf nach Vorlage, Zellklick → Buchungen.

**Abnahmekriterium Explorer:** Vorlagen = abgelöste Reports (Summen); Diagramm = Tabelle; Ansicht geräteübergreifend im Hub.

## Portfolio-Auswertung + Rendite/Risiko – Entscheidungen 16.10.2026 (Owner)

Soll: R11 `175:1913`, R28 `206:12223`. Aufgaben: #525, #487.

1. Vermögen › Portfolio = Stand; Report = Tiefe (Rendite & Risiko · Verteilung über Zeit · Einzahlungen und Wert).
2. Kennzahlen wie PP: TTWROR + IRR; Modified Dietz entfällt.
3. Monatsrenditen-Raster Jahr × Monat, eingeklappt.
4. Routine: eine Benchmark-Auswahl für beide Seiten; Risiko-Kennzahlen mit ⓘ.

**Abnahmekriterium:** TTWROR/IRR identisch auf beiden Seiten und = PP (Gate 3); Raster-Jahr = verkettete Monate.

## Einstellungen › Übersicht – Entscheidungen 16.10.2026 (Owner)

Soll: E00 `172:3110`. Aufgaben: #485, #486.

1. Verteilung der 12 Unterseiten laut Kommentar (Stammdaten an Nutzungsort, 6 Bereiche bleiben).
2. Speichern sofort + Rückgängig (Sicherheit mit Bestätigung).
3. Desktop Seitenleiste + direkt Darstellung; iPhone E00-Liste.
4. Routine: Regelnamen statt Codes, Statuskarten je Verbindung, Ziehen zum Sortieren.

**Abnahmekriterium Einstellungen:** alte Adressen leiten weiter; jede Änderung rückgängig; Seiten ≤ 2 Bildschirme.

## Einstellungen › Verbindungen – Entscheidungen 16.10.2026 (Owner)

Soll: E03 `172:3474`, E08 `206:13904`. Aufgabe: #486.

1. Bewegungen nur in Konten › Prüfen; Quelle zeigt Zähler + Link.
2. Lohnarten beim Gehaltszettel (Plan › Einnahmen).
3. Bankabruf 2× täglich (06:30/18:30) + Knopf.
4. Routine: Statuskarte je Quelle (Bank, Krypto, Gehaltszettel, Kurse, VPI), Geheimnisse nie sichtbar.

**Abnahmekriterium Verbindungen:** Karte je Quelle mit korrektem Status; keine Bewegungsliste außerhalb Prüfen; Abrufzeiten per Test.

## Suche + globale Zustände – Entscheidungen 16.10.2026 (Owner)

Soll: S01–S13 (Seite `173:1268`, `186:*`). Aufgaben: #522, #511, #479.

1. Offline: letzten Stand lesen („Stand vom …“), Erfassen per Warteschlange, Gerätespeicher bei Abmelden leeren.
2. Buchung löschen sofort + Rückgängig; Dialog nur bei gesperrt/verknüpft.
3. Fehlende Bewertung: „≈“ an der Zahl + Zu-tun-Zeile, kein Banner.
4. Routine: Suche über alle Objekte, Re-Login im Dialog, Zustände je Abschnitt.

**Abnahmekriterium:** Offline = letzter Abrufstand; Abmelden leert Speicher; Löschen/Rückgängig exakt; „≈“ überall konsistent.

## Block 7 + Phase-2-Übergang – Entscheidungen 16.10.2026 (Owner)

1. Onboarding O01–O08 bis PUB1 zurückgestellt (#490); offene Einrichtungspunkte über Zu tun.
2. PR #505 mergen (Doku), danach Review-Ergebnis in docs/product + DESIGN.md nachtragen.
3. Figma: nur neue Layouts nachziehen (Heute mit Kontoprognose, Stufen-Tabelle, Report-Vorlage, Konten-Liste); maßgeblich sind Prüfstand + Issues.

**Abnahmekriterium Heute (Entwurf):** erster Desktop-Viewport (1440×900) zeigt Titelblatt mit Schalter, 3 Kennzahlen und Monat im Blick; Kontoprognose zeigt Tiefpunkt-Marker; alle Zahlen stimmen mit Plan/Vermögen für denselben Stichtag (BUD11.02); Desktop/iPhone, hell/dunkel, Lade-/Fehler-/Leerzustand belegt.
