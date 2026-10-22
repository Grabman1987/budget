# Kombinierter Settings-Checkpoint: Source-Coverage-Abgleich

Alter Checkpoint `codex/impl-settings-469-486` `09312b49e578db493bfe279133d30260c5e2ed44`, eigene Basis `6420676d257698767931dd151863765cec914acf`. Geprüft wurden nur Basis/Diff/Handoff und die Herkunft sowie aktuelle Verwendung der betroffenen Quellpfade, keine neue fachliche Source-Prüfung, Tests, Checks oder Laufzeitprüfung. Spätere Settings-Branch `codex/impl-485-486-settings-navigation` am Head `ec1b973dfc5530cb62f0f209961cc93a381c8355`; deren Merge-Base mit diesem Checkpoint ist exakt `09312b49e578db493bfe279133d30260c5e2ed44`.

**Ergebnis: Kein akzeptierter Produkt-Quellteil liegt nur noch auf dem alten kombinierten Checkpoint.** Die acht eigenen Pfade teilen sich so auf:

| Alter Pfad | Spätere Quelle / Einordnung |
| --- | --- |
| `apps/web/src/pages/display-preferences.tsx` | Blob `2e2f5fbb22f4ccc03edcdebf53169fbc3180a55c` an beiden Heads bytegleich; am späteren Head durch `pages/settings-sections.tsx` in `DisplaySettingsPage` eingebunden. Automatisch/Hell/Dunkel und Privacy/Undo sind damit übernommen. |
| `apps/web/src/pages/profile-settings.css` | Blob `99c93cfa1802c8b840de8238a200717a4e86bbf5` an beiden Heads bytegleich; Touch-/Wrap-Regeln für die Darstellung übernommen. |
| `apps/web/src/nav/pages.ts` | Blob `ffd8510766ed4b4855a5f503576ed5afdcdaa72d` an beiden Heads bytegleich; Altpfad-Titel bleibt „Portfolio-Auswertung“. Neue kanonische Zielroute steht separat in `settings/navigation.ts`; der Altpfad wird weitergeleitet. |
| `apps/web/src/nav/areas.ts` | Später in `560cc818` zu den sechs Settings-Abschnitten umgebaut. Der alte Depots-Registereintrag ist dadurch als Navigation ersetzt; `settings/navigation.ts` benennt die neue Zielroute „Portfolio-Auswertung“. |
| `apps/web/src/pages/area-head.tsx` | Settings-Kontexttitel und `fields = []` sind am späteren Head weiterhin im `einstellungen`-Zweig vorhanden; zusätzliche Überschriften für verlegte Fachseiten kamen hinzu. |
| `apps/web/src/pages/profile-settings.tsx` | Alte Mischseite durch die verlegte reine Profilseite abgelöst; `DisplayPreferences` und die zwei Preview-Abschnitte werden jetzt zusammen in `settings-sections.tsx` unter Darstellung gerendert. |
| `apps/web/src/pages/settings-nav.tsx` | Gruppierte Altnavigation durch sechs Abschnitte ersetzt; dekorative Chevron-Rechts/Links bleiben `size={16}`/`strokeWidth={1.75}`. Spätere Navigationsquelle wurde unabhängig im `settings-485-486-navigation-source-review.md` bei Source `78fa4838953313be5134add009b9b261b34120a8` geprüft. |
| `docs/implementation/settings-469-486-NOT-VALIDATED.md` | Historischer Handoff wurde unverändert in die spätere Nachfahren-Branch mitgenommen; `settings-485-486-NOTVALIDATED.md` beschreibt deren neue Seitenstruktur und Grenzen. Kein Produktcode. |

Abgleich mit den separat geprüften #469-Copy- (`65aee06ce8b5ae970a6b2bcb11b2ef652cddb132`), #469-Glossar- (`142aca8077cc2a80c455e9c1e78ef22b89e127b7`) und #471-Icons- (`178c80b15a8e1e6e66115c2635d8992bb703d662`) Branches: Diese sind keine Abstammungsnachweise für den alten Settings-Checkpoint. Die direkte Nachfahren-Branch #485/#486 liefert den Nachweis für alle sieben Produktpfade. Nichts aus `09312b49` muss isoliert portiert werden.

**Review-Status sauber trennen:** `09312b49` wurde damit nicht rückwirkend unabhängig geprüft; die zentrale Zeile kann als „durch spätere Nachfahrenquelle ersetzt; keine einzigartige Port-Lücke“ klassifiziert werden, nicht als „source-clear“. Der separat archivierte #485/#486-Navigationsreview nennt Theme/Privacy nur als beibehalten und führt keine gezielte Prüfung des bytegleich geerbten `display-preferences.tsx` samt Undo-Verhalten oder dessen CSS durch. Soll gerade dieser weiter genutzte Inhalt einen unabhängigen Review-Nachweis erhalten, ist ein enger Review am aktuellen #485/#486-Quellhead nötig; ein Port aus dem alten Checkpoint wäre falsch. Keine Runtime-/UI-/AT-Validierung behauptet.
