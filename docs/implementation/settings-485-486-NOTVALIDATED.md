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

Root's later #471 checkpoint d50abbc0 contains mechanical glyph/size/stroke hunks touching the Plan menu and shell; combine those hunks with this navigation work. The initial IA checkpoint did not change API writers or worker schedules. No #719 source, historical evidence copies, dependencies, workflows, schemas or monetary formulas are changed by either checkpoint. The continuation below adds bounded source status, the approved bank schedule and CPI warning metadata.

## Genuine remaining work and acceptance

The initial checkpoint was the bounded IA/editor-reuse implementation. The continuation below reduces the source-card and export gaps; neither checkpoint constitutes complete acceptance of either epic. Settings-wide immediate server save is intentionally not introduced in this implementation-only navigation slice: explicit saves and existing audit/Undo paths remain. At that initial checkpoint, the five-source connection cards, provider scheduling and export/backup information were unfinished; the continuation below supersedes that scope statement. Other settings-wide content and server-save work remains open.

No tests, new tests, existing-test edits, typechecks, builds, browser/Axe/screenshots, CI, PR, merge or deployment were performed. Existing tests of the old settings group count, paths, mixed profile content and basket defaults need precise owner-policy review when validation resumes. Route/query/hash and OAuth callback acceptance, unsaved/pending navigation, explicit save/Undo and permission regressions, current Plan/Portfolio composition, desktop two-screen geometry, phone/WebKit/themes/focus/touch targets and live delivery remain unverified. Neither issue is closed or claimed complete/LIVE. Feature-branch workflow triggers were inspected and no PR was created.


## #486 provider/export continuation — NOT VALIDATED

This continuation is based on 560cc81868cf93f9797d670b8f3a1e7db441e596 on the same branch. It rereads the complete #486 issue and owner comments, including the per-section Connections decisions. It adds source only:

- Connections now composes one section each for Bank, Crypto, Payslip/Dropbox, Prices and CPI. Existing bank consent/setup and account mapping, crypto mapping/reconciliation and payslip password/default-account editors remain available in collapsed setup. Credential changes retain explicit Save; the new source-configuration relocation does not trigger server writes on mount. Password/configuration drafts have navigation guards. Bank OAuth cleanup removes only callback parameters, preserving unrelated query and hash state.
- Crypto movement review uses the existing bounded review body at `/konten/pruefen?readSource=crypto&teil=umsaetze`; Connections contains counts and a link, not the movement list. The route validator accepts only the supported `crypto` source. Existing actions, paging and matching stay in the canonical review body. Bank cards show their existing per-account open count and last-run linked/new counts, with source-filtered Prüfen links; these are deliberately not relabeled as a complete lifetime match inventory.
- Payslip wage/automation configuration reuses the existing atomic, audited config writer under Plan income. That page also opens the existing guarded PDF-upload/review dialog. Unknown wage-type mapping remains in the original intake review. Connections keeps PDF-password metadata, Dropbox scan counters/status and the default-account editor. Its strict `/default-account` facade merges only that field with the current configuration inside the existing writer transaction, preserving wage mappings and automation edited elsewhere; it does not display wage mappings. Scan metadata is shown only for the current configured Dropbox root, with its stored due timestamp. No manual scanner is created: the present scanner has only process-local concurrency, so an API-created second scanner would not be safe coordination with the worker.
- The existing `nextBankRun` now returns the next 06:30 or 18:30 **Europe/Vienna** slot. The calculation uses Vienna offset at each selected calendar-day slot, including the next day; both approved slots are outside DST transition hours. It retains existing durable due timestamps, catch-up, leases, consent gates, 15-minute manual gap, failure backoff and four requests per account per Vienna day (including pages/balance calls). Old persisted due times are not rewritten; they may execute once before the next successful run uses the new slots. API metadata describes the approved schedule. No live schedule or DST verification is claimed.
- Prices/CPI read metadata extends the existing `/market/status`: recorded combined quote/FX runs, adapter identifiers, enabled-instrument missing/stale count using the existing five-weekday predicate, and CPI's own stored month/fetch timestamp. Manual/imported quotes count as stored prices; no valuation or price selection rule changes. Setup links reach existing instrument detail/manual-price controls. The CPI action reuses the existing bounded 30-day refresh policy, and reports a skipped network fetch explicitly. Source schedule configuration is labeled as configuration, never worker health or a guaranteed next execution timestamp.
- CPI failures now open one unresolved warning per source series using the existing stale-value helper and sanitized error class. Repeated/error-class-changing failures do not create a second pending task. A nonempty successfully stored primary series resolves the source's warnings. Existing market run status continues to exclude CPI as before; a successful quote/FX run is not presented as CPI success. Bank/crypto/payslip/backup warning producers remain unchanged.
- Export lists the actual 15 CSV filenames and explains that the ZIP omits PDFs, passkeys and full application configuration. The existing immutable-snapshot ZIP stream, export admission, CSV escaping, fresh passkey step-up and cancellation cleanup remain intact. A process-local timestamp is set only when a noncancelled server stream completes; a separate page-visit observation confirms the browser received the blob. Neither is claimed as durable export history or proof the file was saved on disk.
- `/export/status` reads cached backup observations registered from the existing server scheduler: configuration, running, newest known archive **day**, inventory-list read time, observed successful completion and failed attempts since process start. The synthetic timestamp used internally after bucket listing is never exposed as completed backup evidence. Reads do not start jobs, access the bucket, change settings or expose keys, recipients, object paths or credentials. A missing runtime registration returns unavailable. The UI explicitly states restore evidence is not recorded; no successful restore or present-day freshness is inferred.

### Integration seams for this continuation

The parent checkpoint remains required. Root explicitly authorized the necessary API/scheduler/global wiring in this isolated branch. Carry the new `backup/status.ts` file together with its scheduler/index/export consumers. API root routing already mounts these endpoint owners; no new API-root route or schema migration is required. `market.ts` repository's source-type union addition belongs with the CPI warning changes.

Combine only the small PlanIncomePage import/render/state hunks with final Plan b5b97190 and later #609 work; preserve their other income/header changes. Combine the small InboxPage/SourceLink and validateInboxSearch hunks with final #477/#574 source; do not replace the newer complete inbox files. Preserve the final payroll intake/automation producers when adopting the source-status/form placement hunks in `reports/payslip-intake.tsx` and its API. No source from #719/#626 was adopted. Previous portfolio/provenance and #471 seams above still apply.

### Genuine remaining acceptance

- Exact live next-run/worker-health telemetry is unavailable for crypto/market timers. Their configured time and retry policy are explained without manufactured timestamps. A safe manual Dropbox scan remains unimplemented pending durable cross-process coordination; manual PDF upload is available instead.
- Export history before the current server process, durable cross-device download records and restore-test evidence have no current read model. The UI states the actual observation scope. Backup inventory is not polled on a settings read and must not be presented as continuously verified freshness.
- Bank matching has last-run counters and current open tasks, not a newly invented all-time erfasst/fehlt/ohne-Zuordnung ledger. Provider credentials/provisioning remain owner-operated. No broad server autosave was added; dangerous credential saves intentionally stay explicit. Existing atomic config writer and its Undo/audit semantics are reused.
- Two-screen geometry, keyboard/focus/unsaved guards, mobile/WebKit/touch targets, palette/theme/Axe, route-filter retention, live provider errors/tasks, concurrency, day-boundary/DST scheduling, export cancellation/privacy and actual restore remain unverified. Existing tests expecting 02:30 UTC bank scheduling require an intentional owner-policy update when validation resumes; no tests were modified here.

No tests, test edits, checks/typechecks, builds, browsers, screenshots, CI dispatches, PRs, merges or deployments were performed. Workflow sources allow CI on pull requests and main pushes; this normal feature-branch checkpoint push creates no PR. This remains **NOT VALIDATED**, with no issue closure or LIVE claim.
