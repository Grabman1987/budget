# Master data and six settings sections — NOT VALIDATED

Refs #485 and #486. Source-only continuation of 09312b49e578db493bfe279133d30260c5e2ed44 under the owner implementation-only direction of 2026-10-22. The earlier settings display-control note remains a record of its smaller slice; this checkpoint adds the IA relocation described here.

## Implemented source

The settings rail and phone index contain exactly Darstellung, Regeln und Automatik, Verbindungen, Daten und Export, Sicherheit and Erweitert. Desktop settings entry opens Darstellung; the phone retains the six-row index. Nested pages retain their parent section mark and contextual settings title. Display controls and account preview/reminder information are separated from the retained profile form. Projects and profile are reached through Erweitert.

Existing editors are reused at the following destinations; no parallel domain model, editor persistence or calculation engine was added:

| Previous address | Canonical destination |
| --- | --- |
| `/einstellungen/konten` | `/konten/verwalten` |
| `/einstellungen/depots` | `/konten/portfolio-einstellungen` (existing cost-method and benchmark controls) |
| `/einstellungen/kategorien` and `/$id` | `/plan/kategorien` and `/$id` |
| `/einstellungen/anlageklassen` | `/vermoegen/portfolio/allokation/bearbeiten` |
| `/einstellungen/warenkorb` | `/reports/inflation/warenkorb` |
| `/einstellungen/regelwerk` | `/einstellungen/regeln-automatik/regeln` |
| `/einstellungen/regelwerk/$code` | `/heute/finanzcheck/$code`; `bearbeiten=true` opens the existing threshold editor at `/einstellungen/regeln-automatik/regeln/$code` |
| `/einstellungen/zuordnung` | `/einstellungen/regeln-automatik/zuordnung` |
| `/einstellungen/datenquellen` | `/einstellungen/verbindungen` |
| `/einstellungen/export` | `/einstellungen/daten-export` |
| `/einstellungen/sicherheit` | Unchanged |
| `/einstellungen/projekte` and `/einstellungen/profil` | `/einstellungen/erweitert/projekte` and `/einstellungen/erweitert/profil` |

Redirects preserve raw query strings and hashes, including editor selection, periods, hidden categories and bank callback parameters. Recognized old profile display/preview/reminder fragments land in Darstellung. Old rule-result, pending and stage fragments retain the complete Finanz-Check overview under Heute. The old import redirect continues to reach the existing protected export flow. Settings/editor destinations remain under the authenticated shell; API authorization and export/security step-up are unchanged.

Configuration-only rules pages reuse the existing activation/threshold write hooks and editor without evaluating or writing on mount. Existing rule results, detailed explanations and operational checklist confirmations are retained under `/heute/finanzcheck` and `/$code`; configuration controls lead to their single settings location. Existing derivation after an explicit rule change/Undo remains part of the original writer. The current Heute package's d27f9a2f links use these agreed routes.

Profile, account-preview, cost-method, project and threshold drafts receive navigation/unload guards; pending saves block leaving. The existing threshold dialog also guards local closure. Other reused editor validation, close guards and write paths remain intact. Existing audit-group IDs now supply a visible one-click Undo for explicit profile and cost-method saves; original Undo implementations remain unchanged. No automatic server saves were introduced. The existing device theme/privacy immediate preference behavior is retained.

The basket editor starts with explicitly stored departures from its automatic defaults; all categories remain reachable through a labelled filter. Account settings retain drag and the grip's arrow-key alternative while redundant arrow buttons are hidden in this context. Security keeps existing sensitive controls and places device storage after them. Palette entries and contextual account/Plan/Portfolio/Inflation links point to the canonical editors.

## Source integration boundaries

Root applied the shared router, areas, header, search and shell patches in this worktree. The Plan menu addition was prepared against b5b971902416bd933e1185b261d247a6b766305e; integrate only this contextual-link hunk into that final Plan source and retain the later #609 income header. The portfolio editor link was prepared against e52447882b1def73d3ec9cced5d777c417bf7a35, preserving its ce1e67b five-register source. This older base contains only the existing allocation entry link; after adopting e5244788, also carry the companion provenance-editor link hunk from `/workspace/.budget-tools/cloud-control/settings-485-486/root-navigation.patch`. Its legacy address remains redirected meanwhile. Do not replace finished Plan or Portfolio files with the older full files from this branch.

Root's later #471 checkpoint d50abbc0 contains mechanical glyph/size/stroke hunks touching the Plan menu and shell; combine those hunks with this navigation work. No #719 source, historical evidence copies, dependencies, workflows, schemas, API writers, worker schedules or financial formulas were changed here.

## Genuine remaining work and acceptance

This is the bounded IA/editor-reuse implementation, not complete acceptance of either epic. Settings-wide immediate server save is intentionally not introduced in this implementation-only navigation slice: explicit saves and existing audit/Undo paths remain. The complete five-source connection-card design, price/VPI source presentation, provider configuration/provisioning, bank schedule/error-task guarantees, export-history/backup read models and other settings-wide content work remain outside it. No fake last-run/next-run/backup values or duplicate schedule logic were added.

No tests, new tests, existing-test edits, typechecks, builds, browser/Axe/screenshots, CI, PR, merge or deployment were performed. Existing tests of the old settings group count, paths, mixed profile content and basket defaults need precise owner-policy review when validation resumes. Route/query/hash and OAuth callback acceptance, unsaved/pending navigation, explicit save/Undo and permission regressions, current Plan/Portfolio composition, desktop two-screen geometry, phone/WebKit/themes/focus/touch targets and live delivery remain unverified. Neither issue is closed or claimed complete/LIVE. Feature-branch workflow triggers were inspected and no PR was created.
