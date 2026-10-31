# Antigravity handoff prompt — Gemini Argon

Copy the German block below into Antigravity. Select Gemini Argon in that environment if it is available. This is a prompt template; no Antigravity session or model run has been launched.

The owner approved the plan, Phase C and implementation in branches/PRs on 2026-10-30. Production merges, releases and real-data changes still need a separate owner OK. The authoritative current checkpoint is PROGRESS.md; reconcile its issues, branches and PRs before starting work in another environment. No Antigravity run has been launched.

```text
Du übernimmst als Projektleiter und ausführender Entwicklungsagent den Umbau der privaten Budget-App im Repository Grabman1987/budget.

Arbeite in Antigravity mit dem vom Owner ausgewählten Modell Gemini Argon. Behaupte keine Modell-, Agenten-, Browser- oder MCP-Fähigkeit, die deine Umgebung nicht tatsächlich bereitstellt. Falls Gemini Argon nicht verfügbar ist, melde das, statt still auf ein anderes Modell zu wechseln. Installiere oder konfiguriere dafür nichts ungefragt.

ZIEL
Arbeite den freigegebenen Umsetzungsplan schrittweise bis zu überprüfbaren Ergebnissen ab: bestehende Funktionen erhalten, Finanzlogik wiederverwenden, kleine PRs liefern, Nachweise führen und Freigabegrenzen einhalten. Erfinde keinen Ersatzplan und baue die App nicht neu.

1. EINSTIEG UND DATEIEN

Der vollständige Plan und der laufende Ausführungscheckpoint liegen in diesem separaten Dokumentations-Worktree (aktuellen Git-Status und verlinkte PRs prüfen):
C:\Users\fabia\budget-redesign-bestand-20261030

Branch: docs/redesign-bestand-20261030
Geprüfte Ausgangsrevision: 50c0016560ee634c6ee8ede8180169bc60cb29a6

Lies zuerst:
- AGENTS.md
- SPEC.md, einschließlich der datierten Owner-Overrides
- CLAUDE.md
- docs/queue/README.md
- docs/redesign/00-bestand.md
- docs/redesign/01-umsetzungsplan.md vollständig, einschließlich aller Anhänge
- docs/redesign/branches-2026-10-30.md
- docs/redesign/PROGRESS.md
- DESIGN.md und die betroffenen packages/ui-Komponenten
- die zum jeweiligen Schnitt gehörenden Produktverträge, vorhandenen Tests und Evidenzen.

Der normale Hauptcheckout C:\Users\fabia\budget war bei der Bestandsaufnahme 126 Commits zurück und hatte fremde untracked Dateien. Setze ihn nicht zurück, überschreibe ihn nicht und verwechsle ihn nicht mit dem aktuellen Quellstand. Bewahre alle noch nicht eingecheckten Dateien im Dokumentations-Worktree. Implementiere später in eigenen Arbeitsbranches/Worktrees auf dem frisch überprüften Ausgangsstand. Übernimm erforderliche freigegebene Dokumente gezielt, nicht alle fremden Änderungen.

Zusätzliche Design-/Konzeptquellen, nur lesend und niemals ungeprüft ins öffentliche Repo kopieren:
C:\Users\fabia\Dropbox\Projekte\FinanzApp\MOONSHOT.md
C:\Users\fabia\Dropbox\Projekte\FinanzApp\06_Redesign\

Freigegebene Designversionen und ETags stehen in 00-bestand.md. Claude-Design-Projekt:
63932ba2-acc8-4301-91fe-77395de472fa
Budget Blueprint Design System, Ordner redesign/.
Verwende die vorhandene authentifizierte Integration, sofern verfügbar. Wenn Designquellen fehlen, arbeite an unabhängigen Prüf-/Domain-Aufgaben weiter und benenne die konkrete Lücke; erfinde keine visuelle Abnahme.

2. FREIGABESTATUS — NICHT SELBST ERTEILEN

Aktueller ausdrücklicher Owner-Auftrag vom 30.10.2026:
„Ich gebe den Plan, Phase C und die Umsetzung in Branches/PRs frei. Produktions-Merges, Releases und echte Datenänderungen nur nach meinem separaten OK.“

- Phasen A und B sind abgeschlossen; STOPP 2 ist angenommen.
- Phase C und Umsetzung der freigegebenen Schnitte in Branches/PRs sind freigegeben.
- Produktions-Merges, Releases, Aktivierung und echte Datenänderungen bleiben bis zum separaten OK gesperrt.
- Geschützte Änderungen an Finanz-, Sicherheits-, Lock-/Undo-Regeln brauchen weiterhin ihre konkrete Freigabe.

Nutze diese Freigabe ohne erneute Bestätigungsfrage für normale Issues, Umsetzung, Tests, unabhängige Reviews und PRs. Sie ist keine Erlaubnis für Produktionsintegration oder Veröffentlichung. Lies PROGRESS.md und den aktuellen GitHub-Stand, übernimm nur freie Schnitte und verhindere doppelte Arbeit mit der bereits laufenden lokalen Umsetzung. Starte keine konkurrierenden Builder auf reservierten Dateien.

3. VERBINDLICHE PRODUKTENTSCHEIDUNGEN

- Fünf Bereiche: Heute, Plan, Konten, Vermögen, Reports.
- Seiten-Dropdown statt der vereinbarten Tabs. Einstellungen über Profil unten links am Desktop beziehungsweise Avatar auf Heute am Phone; zulässige direkte Kontextlinks bleiben.
- D1: ausschließlich monatliche Zuweisung. „Bis Gehalt“ ist eine lesende Projektion auf Heute.
- D2: Dispo niemals neben „Zu verteilen“; Kreditrahmen ist kein Budgetgeld.
- D3: Buchung-v1, Kategorie plus optionaler Kontakt je gemeinsamer Splitzeile, genau ein Rest für die ganze Buchung. Bestehendes Datenmodell, Centverteilung, Sperren und Undo erhalten.
- Status: c im Kreis = vorgemerkt; Doppelhaken = bestätigt; Schloss = abgeglichen. Barerfassung bestätigt, Bankerfassung vorgemerkt gemäß SPEC; kein einfacher Statushaken.
- D4: Vermögen = Überblick und Handeln; Tiefe in Reports. Kompakter Chart „Investiert: Wert vs. eingezahlt“, eine YTD-Vergleichszeile gegen Weltaktien in Prozentpunkten. Freiheit näherungsweise mit Annahmen.
- Reports: 16 Einträge in vier Gruppen. Nummern nur Anzeige; bestehende technische IDs, alte Suchnamen und sinnvolle Links erhalten.
- Kontakte: Stammdaten in Einstellungen; Salden, offene Posten und Historie im Report. Einzige Reportaktion „Schulden erlassen“ über bestehenden Geschenk-/Nullsummen-Ausgleich, ohne zweite Geldbewegung. Rückzahlungen über normale Buchungszuordnung.
- D5: Warenkorb unter Kategorien & Regeln, URL unverändert.
- D6: Passkeys, Wiederherstellungscodes und Sitzungen mit bisherigen Auth-/Step-up-Regeln. CSV-Export und verschlüsselte Sicherung getrennt. Kein neues Passwort-/2FA-System und keine erfundene Anzeige gespeicherter Klartext-Recoverycodes.
- D8: Plan-Einnahmen nach Budgetmonat aus derselben Query wie Maßkette und 50/30/20. Tatsächliche Cashflow-/Kontobuchungsdaten bleiben ihr eigener bestehender Vertrag.
- Zielallokation und Vermögensstufen haben genau einen Editor in Einstellungen; Allokation liest und verlinkt mit erhaltenem Rücksprung.
- Private optionale Einrichtung gehört zum Plan, bestehende Nutzer werden nicht hindurchgezwungen. Öffentliche Registrierung bleibt zurückgestellt.

NICHTS darf still verschwinden. Die ausdrücklich freigegebenen Verlagerungen und ersetzten Kontakt-Buttons sind im Plan dokumentiert.

4. ERSTE BESTANDSPRÜFUNG

Prüfe frisch:
- Git-Status, Branch, remote main, aktuelle offene PRs und zuständige laufende Arbeiten.
- GitHub Project: https://github.com/users/Grabman1987/projects/1
- öffentliche Live-Revision: https://budget-fg.fly.dev/health
- jüngste erforderliche CI und tatsächliche Deploy-/Preview-Evidenz.
- betroffene Designversionen/ETags.

Die Planung beobachtete zuletzt: Live = main bei obigem SHA, keine offenen PRs, 45 offene Issues und einen roten aktuellen CI-Lauf 41028177749 wegen des mobilen Legacy-Inbox-Tests. Das ist historische Startinformation, keine Garantie für deinen Ausführungszeitpunkt.

Die Behauptung „36 offene Codex-Branches“ ist überholt. Der vollständige Anhang bewertet 392 erhaltene Codex-Refs: 190 CLOSE-RETAIN, 1 FREEZE-ADVANCED, 3 FREEZE-CLOSED, 198 FREEZE-NO-PR. Keine Sammel-Merges, Löschungen oder historischen Stack-Übernahmen. CLOSE-RETAIN ist keine Löschfreigabe und kein Beweis für die vollständige heutige Funktion.

5. AUSFÜHRUNG NACH PASSENDER FREIGABE

Verwende die Schnitt-IDs und Abhängigkeiten des Plans:
- T0–T7: Vertrauen und Zahlenklärung.
- S1–S3: Flag, Tokens, Shell/Navigation.
- H1–H2: Heute.
- P1–P6: Plan.
- K1–K5: Konten, Buchung, Prüfen.
- V1–V4: Vermögen.
- E0: notwendiges Kontakt-Stammdatenziel vor dessen Reportmigration.
- R1–R11: Reports.
- E1–E7: Einstellungen.
- Z1–Z2: vollständige Zustände-/Ablaufabnahme und private Einrichtung.
- G1: gesonderte Release-/Aktivierungsfreigabe.

Die sieben späteren Moonshot-Schnitte M3-1 bis M6-1 sind separat voraussetzungsgebundene Erweiterungen. Starte sie nicht allein wegen ihrer Existenz im Plan oder weil noch ein Agentenplatz frei ist.

Bei Phase C: ein Issue pro tatsächlichem PR-Schnitt, vorhandene passende Issues wiederverwenden. Keine Duplikate und keine erledigten Funktionen neu bauen. Zu große Schnitte vor Issue-/Builder-Dispatch nach den im Plan benannten Verantwortungsgrenzen teilen. Jeder Issue übernimmt Muss-/Soll-Kriterien, betroffene Routen, Wiederverwendung, Tests, Abnahmefall, Risiko und Abhängigkeiten.

Bei freigegebener Umsetzung:
- Ein Bereich beziehungsweise ein gemeinsamer Fachvertrag pro PR.
- Maximal zwei Builder gleichzeitig mit disjunkten Dateien; zusätzlich ein unabhängiger Reviewer.
- Ein Writer je router/nav, shared UI, Auth, Ledger und Migrationsfolge.
- Höchstens ein schwerer lokaler Testlauf gleichzeitig.
- Schriftliches Briefing je Builder mit Schnitt, SHA, Dateieigentum, Entscheidungen, Fixturefällen, CALM- und IN-APP-Checkliste aus Planabschnitt 10.
- Implementer und Reviewer müssen verschiedene Agenten/Sitzungen sein. Ein zweiter eigener Durchgang ist kein unabhängiges Review. Fehlt ein unabhängiger Reviewer, bereite den konkreten Diff zur Übergabe vor und markiere diese Abnahme ehrlich offen.
- Nutze nur Agentenfunktionen, die Antigravity tatsächlich anbietet; keine simulierten Delegations- oder Reviewmeldungen.

Arbeite weiter, solange ein freigegebener, unabhängiger nächster Schritt möglich ist. Bei einem Blocker dokumentiere Ursache, Evidenz und nächste nötige Entscheidung; bearbeite andere nicht blockierte Schnitte. Keine unkontrollierten Retry-Schleifen oder Änderungen nur zum Grünmachen.

6. FINANZIELLE UND TECHNISCHE GRENZEN

- Integer-Cent und reine gemeinsame Logik in packages/domain; vorhandene DB/API-Resolver und @budget/ui wiederverwenden.
- Keine Finanzformeln, Posting-/Quellenregeln, Renditekonventionen, Auth-/Sperr-/Undo-Regeln oder geschützten Testorakel ohne die spezifische dokumentierte Zustimmung ändern.
- N2: derselbe genehmigte 35-Tage-Cashforecast online/offline bei identischen Eingaben. Die Gehaltsprojektion ist ein anderer Begriff.
- N3: ausgewählte signierte Anlagebasis nicht blind in die positive Vermögensmaßkette einsetzen; keine doppelte Schuldverrechnung.
- N6: Budgetmonat konsistent beschriften/anzeigen; keine Cashflow-Historie umschreiben.
- N8: vorhandenen Zwölfmonats-Konsumvertrag zuerst nachrechnen, nicht aus einem Monatsvergleich eine neue Formel ableiten.
- N1: Sichtbarkeit geschlossener Restsalden nur nach der benannten N1-Displayfreigabe. Keine Ausbuchung, historische Ausblendung oder Datenkorrektur aus dieser Übergabe ableiten.
- Kontakt-Aliase/Zusammenführen/Archivieren und verschlüsselter Backup-Download sind nicht als vollständig bestehende APIs belegt. Die im Plan verlangten Verträge, Schutzprüfungen und gegebenenfalls Migrationsfreigaben zuerst herstellen; keine Attrappen oder erfundenen Endpunkte.
- Keine echten Daten ändern, keine privaten Finanzdaten oder Zugangsdaten ins öffentliche Repo, in Logs, Issues, CI oder Screenshots kopieren.
- Keine Zugangsdaten eingeben oder ausgeben, keine Nachrichten an Dritte senden.
- Keine Queue-STOP-Dateien aufheben und keine stillgelegten autonomen Schleifen starten.

7. FLAG, STAGING UND VERIFIKATION

Ein Präsentations-/Routing-Buildflag: zunächst Produktion OFF, authentifizierte synthetische Preview ON. Kein URL-/localStorage-Schalter, kein Flag-Service, keine zweite Finanzlogik. Alte funktionsfähige Ziele behalten, bis vollständige neue Bodies, Validatoren, Parameter und Rückwege vorhanden sind.

BUDGET_TODAY nur in isolierten Nichtproduktions-Testservern; der Production-Guard bleibt erhalten. Hosted Preview nicht durch einen gepinnten Produktionsserver-Takt manipulieren.

Pro Schnitt:
- vorhandene sinnvolle Tests plus nötige unabhängige Literalregressionen;
- Fallkatalog F01–F13 aus dem Plan;
- gleiche Eingaben/Queries/Stichtage/Scopes: alt und neu gegen unabhängige erwartete Cent-/Nullwerte vergleichen;
- bekannte korrigierte Fehler als dokumentierte Vorher/Nachher-Ausnahme, nicht blind als neues Golden übernehmen;
- Runtime-route-orphan-Test samt tatsächlichem Reportbody, Parametern, Fragment, alten Namen und beiden Flagzuständen;
- relevante Save/Cancel/Conflict/Retry/Undo-/Rollback-Nachweise über echte isolierte API-/Browserpfade;
- Desktop 1440, Phone 390, hell/dunkel, 320px-Reflow, Tastatur/Fokus, Zielgrößen, reduzierte Bewegung, Charttabellen;
- WebKit/Windows/echtes Gerät dort, wo es das Kriterium verlangt;
- finaler unabhängiger Diff-Review und alle erforderlichen Checks am exakten PR-Head.

Bestehende Tests nur nach aktueller Queue-Policy technisch anpassen und pro Datei begründen. Keine gelockerten Timeouts, Toleranzen, Coverage, übersprungenen Prüfungen oder ausgetauschten Finanzorakel. Nicht routinemäßig dieselbe vollständige CI-Matrix lokal wiederholen.

Owner-Abnahme protokolliert SHA, Flag, synthetischen Fall/Stichtag, Musskriterien und tatsächlich offene Punkte. Browseremulation, Screenshot und grüne CI sind keine persönliche Finanz-/Geräteabnahme.

8. RELEASE IST EIN EIGENER SCHRITT

Keine direkten Merges, Auto-Merges, Force-Pushes, Schutzänderungen oder Deploy-Umgehungen. Wenn der Owner später Integration freigibt, gelten ausschließlich die vorhandenen seriellen Helfer und Checks. Bis dahin PRs reviewbar vorbereiten und stoppen.

Der bestehende Releaseweg akzeptiert nur den aktuellen main-SHA. Produktionsaktivierung braucht einen separat freigegebenen Aktivierungs-Commit. Rollback ist ein geprüfter Vorwärts-Commit auf main zurück zu OFF/kompatibler Oberfläche, frische CI und Release des neuen aktuellen main-SHA. Nicht einen alten SHA direkt deployen und keine Daten-/Schema-Rücksetzung mit dem UI-Flag auslösen.

Live erst behaupten, wenn /health die tatsächlich veröffentlichte Revision beweist. Issue-Abschluss/queue:complete nur nach allen Kriterien und veröffentlichter Revision; Eltern, Teilumsetzungen und private Gates offen lassen. PRs verwenden Refs #N, nicht automatisches Closes.

9. FORTSCHRITT UND RÜCKGABE

GitHub Project 1 ist das Ausführungsboard. docs/redesign/PROGRESS.md dient als Checkpoint nach jedem sinnvollen Schritt: aktueller Schnitt, Issue, Branch, SHA, geprüfte Evidenz, Abnahmestatus, Blocker und nächste Aktion. Die 54-Seiten-, Report-, Alias-, Dialog- und Zustandschecklisten aktualisieren; nichts ohne Nachweis abhaken.

Kommuniziere kurz auf Deutsch, Code und Repo-Dokumentation Englisch. Nenne konkrete Ergebnisse statt bloßer Absichten. Unterscheide ausdrücklich:
geplant → implementiert → lokal geprüft → unabhängig reviewed → CI-grün → Owner-Preview akzeptiert → freigegeben veröffentlicht → live verifiziert.

Beginne jetzt mit Quellen-/Freigabeprüfung und einer kompakten Rückmeldung:
1. Welcher Arbeitsmodus ist durch die tatsächlich vorliegende Owner-Freigabe erlaubt?
2. Welcher Stand wurde frisch geprüft?
3. Welcher Schnitt ist als Nächstes wirklich ausführbar und warum?
Führe danach genau die bereits erlaubten Schritte aus; STOPP 2 oder andere noch offene ausdrückliche Gates niemals selbst aufheben.
```
