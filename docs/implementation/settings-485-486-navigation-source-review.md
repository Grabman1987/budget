# #485/#486 Navigation und Einstellungen: begrenzter Quellreview

- Basis: `6420676d257698767931dd151863765cec914acf`
- Geprüfter Branch-Head: `78fa4838953313be5134add009b9b261b34120a8` (`codex/impl-485-486-settings-navigation`)
- Gelesen: `docs/implementation/settings-485-486-NOTVALIDATED.md`, die dort archivierten unabhängigen Autosave- und Export-Reviews sowie das Navigations-, Seiten- und Quellenkarten-Delta. Keine Laufzeit-, Browser-, Geräte- oder Lieferungsvalidierung.

## Abgrenzung

Der Reviewer hat die späteren Autosave- und Export-Timestamp-Quelländerungen `baa966cc3e1c4a3085c6997430f8f8c61d9edc52`, `41222031dd0ba702265be5b9b395be5da1a01cdf` und `f1b1310d094bbe5e38d348c354b0872e605b52c3` selbst implementiert. Diese Änderungen werden hier **nicht** als unabhängig geprüft ausgegeben. Die archivierten Berichte `settings-486-autosave-source-review.md`, `settings-486-autosave-fix-source-review.md` und `settings-486-export-source-review.md` decken sie separat und source-only ab. Ebenso ist die ZIP-Erstellung, ihr Step-up und das Backup-Job-Verhalten außerhalb dieses Reviews.

Hier geprüft wurden die sechs Navigationsabschnitte, kanonische Routen/Legacy-Weiterleitungen einschließlich Query/Hash und Auth-Shell, Kontextlinks/Titel, verschobene Fachseiten, die Trennung von Regelkonfiguration und Finanz-Check sowie die neu sichtbaren Quellenstatuskarten und ihre API-Antwortgrenzen. Die Quellpfade für alte Einstellungen werden auf bestehende Editor- bzw. Prüfseiten abgebildet; die API-Routen bleiben hinter der vorhandenen Session-Grenze. Bei der lesenden Durchsicht ergab sich dort kein weiterer konkreter Navigations- oder Berechtigungsbefund.

## Befund

**P2 — Der manuelle Kursabruf wertet eine fachlich fehlgeschlagene 200-Antwort als unauffälligen Abschluss.** `apps/web/src/pages/market-sources.tsx:33-38` typisiert beide POST-Antworten als flaches `{ failed?, skipped? }` und prüft nur `result.failed`. `/api/market/refresh` liefert aber `{ prices, fx, cpi }`; `prices.failed` und `fx.failed` sind Arrays (`apps/server/src/market/timer.ts:73-86`). Auch wenn alle Kurs-/Wechselkursabfragen scheitern und der Server den Lauf ausdrücklich als `failed` protokolliert, ist `result.failed` im Client `undefined`. Der unmittelbare Aktionsstatus sagt lediglich „Abruf beendet“; eine ausdrückliche Fehlermeldung unterbleibt. Eine erfolgreiche spätere Statusaktualisierung kann den protokollierten Fehler zwar in der Karte zeigen, aber der POST-Erfolg darf nicht mit fachlichem Erfolg verwechselt werden. Für `kind === 'prices'` die tatsächlichen verschachtelten Fehlerarrays auswerten und im Aktionsstatus „fehlgeschlagen“/„teilweise“ klar benennen; CPI weiterhin nach seinem eigenen Rückgabeformat behandeln. Die Laufdaten nicht als neue Erfolgsevidenz erfinden.

**P3 — Rückmeldung des Kursbuttons steht in der VPI-Karte.** Der gemeinsame `message`-State wird ausschließlich am Ende des zweiten Abschnitts gerendert (`apps/web/src/pages/market-sources.tsx:69-84`). Sowohl ein Netzwerkfehler als auch ein Abschluss von „Kurse › Jetzt abrufen“ erscheint somit unter „Verbraucherpreisindex“, während neben dem auslösenden Kursbutton keine Rückmeldung steht. Rückmeldungen pro Quellabschnitt platzieren oder den Status unmittelbar beim auslösenden Button ausgeben; `role="alert"` für Fehler und `role="status"` für neutrale Abschlüsse passend trennen.

Dies ist ein statischer Review des genannten Head. Bestehende Handoff-Lücken (manueller Dropbox-Scan, verifizierte Worker-Live-Telemetrie, vollständige Exporthistorie/Restore-Nachweis) werden nicht als neue Regressionen gewertet. **NOT VALIDATED / NOT LIVE.**
