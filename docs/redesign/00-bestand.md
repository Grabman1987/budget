# Redesign inventory — STOP 1

Observed: 30 October 2026, 13:14 CET (Europe/Vienna).
Repository and live comparison revision: `50c0016560ee634c6ee8ede8180169bc60cb29a6`.
Scope: Phase A of the owner's project-lead instruction. This is an evidence inventory with recommendations, not the implementation plan or permission to implement.

## 1. Findings that determine the next step

1. The application already has 54 content route patterns and 16 report-hub entries. The new design reorganises existing capabilities; it is not a new application or a project to build 16 reports from scratch.
2. The main checkout is 126 commits behind current origin/main. It also contains an unrelated untracked apps/web/.impeccable directory. It was preserved. All current-source comparisons and this isolated documentation worktree use the revision above.
3. Public health returned status=ok at that exact main revision. This proves the running revision, not financial correctness or owner acceptance.
4. The latest main CI run is red, despite earlier successful CI and deployment at the same SHA. No integration/release candidate can be called verified from the earlier green run alone.
5. The assumption “approximately 36 open Codex branches” is stale and lacks a named cohort in the supplied audit. There are zero open PRs. The fresh remote inventory contains 695 branches, including 392 codex/ branches. Their individual dispositions are recorded in [the branch appendix](branches-2026-10-30.md).
6. N2, N3 and N6 still have conflicting source paths. N8 has an existing explicit 12-month consumption contract, so a single current-month comparison does not establish a defect. These need reproducible synthetic reference cases before broad redesign.
7. Latest owner decisions resolve most Moonshot questions. Some older paragraphs, navigation drafts and mockup details still disagree with those decisions. Apply the overrides below; do not ask the owner to decide D1–D6 again.

No production code, financial data, remote branch, issue, PR, board item, design file, secret or release was changed. Only local documentation and Git worktree metadata were created.

## 2. Authority and evidence boundaries

Product and financial requirements come from SPEC, including dated owner overrides. The explicit 30 October task and 12-review-entscheidungen.md govern the requested redesign where they supersede older navigation/design descriptions. Current docs/queue/README.md governs delivery. The source checkout's current AGENTS and CLAUDE defer to it.

The Dropbox CLAUDE and the old local main describe obsolete model roles, test restrictions and automatic deployment. Current main instead permits scoped technical test adaptations with independent review, requires separate permission for protected financial/security/locking/undo changes, limits normal implementation to two packages, and separates integration from release. For this project use at most two builders plus an independent reviewer. The current instruction additionally prohibits implementation, merges and production changes before its explicit gates.

The inventory does not restart unattended queue loops or clear existing STOP files. It does not change STATUS or ROADMAP to make old checkboxes appear current. Board and dated documentation discrepancies are presented at STOP 1.

Evidence classes used here:

| Class                  | Meaning                                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Fresh source evidence  | Read at the exact revision above; identifies code paths and contracts                                             |
| Fresh remote evidence  | GitHub/API or public health read in this session                                                                  |
| Supplied private audit | Dated observation from the owner's design handoff; not independently repeated against a live authenticated ledger |
| Design-source evidence | Native connector reads of active HTML/JSX and README; no new visual/device acceptance                             |
| Recommendation         | Proposed handling for Phase B or a later authorised implementation; not an executed change                        |

No private financial figures, actual institutions, contact names, raw financial responses or screenshots have been copied into these public-repository documents. Source names and hashes identify the external evidence without copying its financial contents.

## 3. GitHub, delivery and acceptance inventory

### Current snapshot

| Item                        | Fresh result                                                             |
| --------------------------- | ------------------------------------------------------------------------ |
| Public health               | status ok, revision 50c0016560ee634c6ee8ede8180169bc60cb29a6             |
| Remote main                 | Same SHA, verified with git ls-remote                                    |
| Local original main         | f0b3c5e82f99e7f3c03fab559b9698178eb5cdfa; 126 commits behind             |
| Project 1                   | 372 items: 326 Live, 28 Warteschlange, 8 In Arbeit, 10 Wartet auf Fabian |
| Open issues                 | 45                                                                       |
| Open PRs                    | 0                                                                        |
| Complete PR state inventory | 504 PRs: 478 MERGED, 26 CLOSED, none OPEN                                |
| Remote branches             | 695 total, 392 codex/                                                    |
| Existing local worktrees    | 112 before this documentation worktree; none removed                     |

The 46 non-Live board items comprise 45 issues plus PR #497. Board “In Arbeit” is not proof that a writer is currently running.

Current “In Arbeit” issues: #469 terminology, #477 Prüfen, #487 reports hub, #529 coordination, #563 safe bulk confirmation, #741 document automation, #762 allocation/savings planning, #818 saved booking filters. Treat their owned areas as potential collisions until the current writer state is checked at implementation dispatch.

Existing acceptance issues #310 and #354–358 remain open. They cover physical-device timing, account/month parity, holdings, returns, month-end and current balance. Redesign approval cannot close them.

Board PR #497 is still in Warteschlange although the PR is CLOSED without merge. It is a reconciliation candidate, not a request to reopen or duplicate it. Existing epics, partial deliveries and deferred #815 must remain separate from a redesign rollout.

### Main CI

- Latest [CI run 41028177749](https://github.com/Grabman1987/budget/actions/runs/41028177749), created 30 October 2026 09:41 CET, completed with failure at 10:07 CET.
- Failed jobs: e2e (6), then the required aggregate check.
- Bounded failed-log inspection identifies the mobile case in e2e/inbox.spec.ts:258, “legacy inbox panel URLs lead to the existing page”. At line 262 the heading “Offene Entscheidungen” was not found within the existing 5,000 ms limit, including its retry.
- This inventory does not determine whether that is a regression, state leak or flake. No retry, timeout change, baseline refresh or fix was attempted.
- Earlier [CI 40842964335](https://github.com/Grabman1987/budget/actions/runs/40842964335) and [Deploy 40735383794](https://github.com/Grabman1987/budget/actions/runs/40735383794) succeeded at this SHA. Those results explain the healthy deployment; they do not clear the later failed verification.
- Phase B must include a narrow diagnostic prerequisite before implementation integration. Documentation planning can proceed after STOP 1.

STATUS.md describes a 10 October snapshot at 7571ac6f, while ROADMAP retains “adoption pending validation” notes for work subsequently merged. The live board, PR history and health provide the fresh state. Keep dated evidence; reconcile actual acceptance, rather than replacing history with a blanket “done”.

## 4. Branch disposition

The supplied usage audit asserts 36 unvalidated branches but does not enumerate them. A Git ancestry list would also be misleading: squash-merged branch tips often are not ancestors of main. The local remote-ref query returned 418 non-ancestor refs, including 294 codex/ refs; those are not 418 unmerged tasks.

The complete fresh PR inventory was joined to all 392 remote codex/ branches by exact head-ref name and compared with the recorded PR head SHA:

| Disposition                                            | Count | Decision and reason                                                                                                                                                                                                                 |
| ------------------------------------------------------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Close historical workstream; retain branch as evidence | 190   | Latest PR is MERGED and the retained remote tip matches its PR head. Do not merge again. This is a process disposition, not a branch-deletion command or a claim that no later revert exists.                                       |
| Freeze advanced historical branch                      | 1     | codex/ux-cover-limits-1005 differs from the head of merged PR #204. Preserve its extra changes; no automatic closure or merge.                                                                                                      |
| Freeze closed, unmerged work                           | 3     | codex/issue-509 (#633), codex/509-case-002-overspending (#690), codex/sprint-741-payroll-delivery (#755). A closed PR is not merged evidence; retain the work and compare any useful residual patch with current main before reuse. |
| Freeze unassociated branch                             | 198   | No PR in the complete inventory matches the branch name. Preserve patches, local worktree changes and provenance. No blanket merge, deletion or “obsolete” claim.                                                                   |

No branch qualifies for an immediate merge in Phase A. Existing capability must be checked before reusing a residual patch. The other 303 remote branches are outside this Codex-branch cohort and remain untouched.

The appendix records each branch, full observed tip, PR evidence and individual disposition. “Close” means close out the already integrated workstream in the future approved reconciliation; no PR, issue or branch was actually closed here. Any later deletion requires checking retained/unpushed/untracked work and applicable ownership constraints.

## 5. Owner decisions applied to the inventory

| Decision                  | Binding interpretation for Phase B                                                                                                                                                                                                                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1                        | Assign only by calendar budget month. “Bis Gehalt” is a read-only Heute projection; preserve existing monthly rollover and locks. No second persistent budget period.                                                                                                                                            |
| D2                        | Never present overdraft or a credit line beside Zu verteilen. Credit facilities stay in account detail and the Heute account forecast, never as envelope funds.                                                                                                                                                  |
| D3                        | Preserve the booking-v1 composition, with category and optional contact in each shared split line and one booking-wide remainder. Use existing cent allocation, metadata, audit, lock and Undo contracts.                                                                                                        |
| Booking status            | Pending: circled c; confirmed: double check; reconciled: lock. A visual icon change cannot permit toggling locks. Cash capture stays confirmed; bank capture retains the SPEC pending default.                                                                                                                   |
| D4                        | Vermögen is overview and action; detailed analysis goes to Reports. Keep one compact YTD benchmark row and the title “Investiert: Wert vs. eingezahlt”. Show freedom with approximation and explicit assumptions.                                                                                                |
| Report structure          | Five main areas; 16 report entries in four groups. Numbers are display order. Existing technical IDs remain stable; new descriptive names are labels/aliases.                                                                                                                                                    |
| Contacts                  | Master data in Einstellungen; balances, open items and history in Reports. Repayments use normal booking allocation. Only “Schulden erlassen” is an action in the contact report, with the shortfall mapped to that person's gift category, preview and Undo. Do not turn it into a second cash expense.         |
| D5                        | Warenkorb belongs to Einstellungen → Kategorien & Regeln; retain /einstellungen/warenkorb.                                                                                                                                                                                                                       |
| D6                        | Passkeys, recovery codes and sessions, preserving existing step-up and recovery restrictions. CSV export and encrypted backup are distinct. No new password/2FA authentication system.                                                                                                                           |
| D8                        | Plan's unqualified income figure uses the budget month, from the same budget read as its chain and 50/30/20. Expected/received schedule amounts need explicit labels. Actual cashflow/account booking dates remain a distinct existing contract; no blanket financial rewrite follows from the display decision. |
| Navigation/header         | Page dropdowns replace area tabs where specified; no sixth settings item in the main bar. Desktop settings through the sidebar profile; phone settings through Heute's avatar. Retain search and phone-accessible entry paths.                                                                                   |
| Latest route-map addendum | Goal progress at Plan → Ziele, ansicht=fortschritt; annual payment calendar at Plan → Zahlungen, ansicht=kalender. Allokation is read-only with a return-preserving link to the single settings editor.                                                                                                          |

“Nichts darf verschwinden” means preserve capabilities and reachable history, except explicit owner-approved replacements such as removing standalone contact repayment controls. Preserve their underlying financial booking capability through its new authorised entry point.

## 6. Numeric trust findings N1–N8

The private audits contain dated UI/API observations. They were not re-executed against a private production DB in this session. The following fresh source checks confirm paths or definitions, not the underlying financial data.

| Finding                                 | Fresh evidence / diagnostic boundary                                                                                                                                                                   | Required before redesign acceptance                                                                                                                                                                                                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1: closed accounts with residual value | Supplied audit reports two closed residual accounts; accounts with deletedAt null can still enter wealth inputs. No current private balances independently verified.                                   | Owner-approved visibility/reconciliation proposal below. Preserve history.                                                                                                                                                                                                                                  |
| N2: offline/online low point            | Heute CompactForecastCard calls liquidityQuery('35d', []); pwa/offline-state.tsx:338–340 renders heute.balance.low. Plan forecast also has its own chosen horizon/levers.                              | Same date, scope, horizon, levers and revision must yield the same low point online/offline. Cache the canonical response; if missing, say unavailable. Different six-month and 35-day horizons may legitimately differ and must be labelled.                                                               |
| N3: “Investiert”                        | domain/heute/net-worth.ts partitions positive investment-role accounts; freedomInvestmentBasis uses allocationInputsAsOf with the selected signed Anlagebasis.                                         | Use the shared selected basis for a figure labelled Investiert. Keep the net-worth decomposition separately and accurately labelled; substituting a signed basis into the positive-assets chain would double-count debts. Sidebar group totals and securities-only values may differ, with distinct labels. |
| N4: loans versus all debt               | A “Kredite” account group is narrower than all negative accounts.                                                                                                                                      | Preserve the group, explain total debt and source drilldown. Do not change the total to make unrelated labels equal.                                                                                                                                                                                        |
| N5: rounding                            | Sidebar and exact-cent totals have different presentation paths; audit flags rounding of negative halves and visible row totals.                                                                       | Reuse domain formatting and existing balanced-chain rounding; preserve exact cents beneath displayed whole euros. Define approximation where a rounded list cannot add exactly.                                                                                                                             |
| N6: income mismatch                     | plan-page.tsx:148 uses receivedIncome.data.receivedCents, while its chain and 50/30/20 use summary.incomeCents. Goals use the budget summary.                                                          | D8 fixes Plan's meaning. Use the same budget response for its lead/chain/ratio; explicitly distinguish planned schedule progress. Include next-month income fixtures without rewriting booking dates.                                                                                                       |
| N7: two debt definitions                | netWorthSides counts negative values only; netWorthParts also places a positive debt-role account into debtCents.                                                                                      | Add a positive-credit-on-debt-account case and precise labels. Any change to the financial partition needs documented approval; do not “fix” it cosmetically.                                                                                                                                               |
| N8: annual freedom expenses             | freedom-inputs.ts derives Bedarf/Wunsch envelope activity for 12 months ending at referenceMonth; domain freedomAnnualSpendCents sums the last 12, or annualises shorter history. Refunds stay netted. | Reconcile the twelve monthly contributions and included categories, transfers, principal and investments against that contract. A current-month expense is not the expected value for the trailing-year figure. Diagnose source classification before proposing a formula change.                           |

### N1 recommendation and impact — not authorised for implementation

Prefer a visible “closed account with remaining value” disclosure and linked account history before any financial correction. Keep those existing valuations in net worth. This restores explainability without changing account balances, returns, freedom or historical net worth.

Then independently establish whether each residual value still exists. If a value is truly erroneous, prepare a separate dated, audited, reversible adjustment with a backup and copy-based dry run, and show its effect on current/historical net worth, Anlagebasis, performance and freedom. Apply only after the owner's explicit N1 approval. Do not automatically write the values off or exclude all closed accounts.

Use synthetic accounts for regression evidence; no private account names or balances belong in fixtures. A display approval does not also approve a balance correction.

### Minimum trust prerequisites

N2, N3, N6, N8 and restored Finanz-Check access belong in Moonshot Phase 1 even though wealth and report presentation is delivered later. For N8 a documented reconciliation may resolve the finding without code changes. N1 gets a visible explanation and explicit owner gate; N4/N5/N7 get covered reference cases and labels before their affected screens roll out.

Horizon precedence: [the later #568/#569 adoption](../evidence/forecast-568-569/ADOPTION.md) explicitly records the owner-approved shared 35-day liquidity card and its salary-marker provenance. It supersedes the earlier period-bound Heute chart described in [heute-horizon-1005.md](../heute-horizon-1005.md) for that caller. Preserve the currently approved 35-day card while resolving N2; do not reinstate the older window under the label of parity. The read-only payday envelope projection remains a distinct D1 concept. The dated adoption/README checklists are not fresh proof of delivery or owner acceptance.

“Old equals new” must compare identical queries at a pinned BUDGET_TODAY, common data revision, currency, scope and status set. It must not freeze known wrong labels/definitions: an approved defect correction needs a separately documented before/after expectation and literal independent oracle. Once corrected, both UI variants consume the same canonical result.

## 7. SPEC versus active designs and superseded drafts

The design project was verified through the native connector as Budget Blueprint Design System, project 63932ba2-acc8-4301-91fe-77395de472fa. README, 17 active entry HTML files and 25 selected JSX implementation sources were read. The entry HTML references were followed; a filename inventory alone was not treated as inspection. Additional shared data/kit dependencies are identified by the entries and remain implementation inputs.

This was source review. It did not repeat the Moonshot screenshots, render every frame, exercise real persistence, inspect a physical iPhone, prove accessibility, or certify light/dark responsive fidelity. Fixed 1440/390 canvas frames and drawn controls do not establish those properties.

| Source conflict / gap                                                         | Disposition                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Usage audit suggests a phone “Mehr” area and automatic telemetry in the shell | Superseded by five fixed areas. Usage ranks are hypotheses, not measured traffic. Telemetry is a separate optional proposal, not a redesign dependency or an approved database table.                                                                                           |
| Route-map row 50 and nav-config draft still put Warenkorb under Vermögen      | D5 and current settings JSX put it under Kategorien & Regeln. Correct the implementation input during Phase B; keep URL stable.                                                                                                                                                 |
| Older route-map panel table permits direct target editing from Allokation     | Latest addendum requires one editor in Einstellungen and a read-only link from Allokation. Preserve caller selection/period on return.                                                                                                                                          |
| Research memo suggests payday assignment and a numeric keypad                 | D1 and SPEC supersede those suggestions. Keep monthly assignment and the existing arithmetic amount input; no new capture keypad.                                                                                                                                               |
| Older documents say the phone catalog is incomplete                           | Current v2-reports.jsx iterates the report groups; supplied review says the earlier partial-group slice was fixed. The Moonshot's earlier “five of sixteen” measurement is historical. Still verify all 16 rendered, searchable and actionable on phone.                        |
| Report README lists descriptive slugs, but route map preserves technical IDs  | Preserve onepager, vermoegen-schulden, einnahmen-ausgaben and other existing IDs. Treat descriptive titles as search aliases; never switch identity when a report number changes.                                                                                               |
| Mockup contracts report includes Kündigungsfrist and “by cancellation date”   | v2-reports4.jsx contains these fields, while the owner's existing decision excludes new binding/notice fields. Preserve existing available cost functionality; do not invent a contract database to copy illustrative data.                                                     |
| Mockup booking code chooses a confirmed example for income                    | Presentation examples are not booking-status policy. Use SPEC's account-specific cash/bank defaults and retain the explicit state frames.                                                                                                                                       |
| Recovery-code mockup offers “Anzeigen”                                        | Preserve actual recovery-code storage/one-time reveal semantics and fresh-auth requirements. Do not invent retrieval of stored plaintext codes to match a drawn button.                                                                                                         |
| Onboarding draft shows six persisted, skippable steps                         | The latest task explicitly includes Zustände/Onboarding and the approved onboarding-v1. Plan private optional setup behind the redesign flag under that current scope; existing users must not be forced through it. Public registration/publication under #490 stays deferred. |
| New “safe” bulk confirmation copy                                             | Native design source defines safety and shows a preview. Reuse existing server eligibility and exclusions; no new permissive rule derived merely from matching amount/payee. Preserve transfer/duplicate exclusion, audit, conflict checking and grouped Undo.                  |
| Partial/error/expired-source states                                           | Retain existing source/retry and audit semantics. A generic green “checked” mark cannot replace provenance, date and valuation coverage.                                                                                                                                        |

The superseded mockups listed by the owner, directions/hell variants, plan-monat-v1, old wealth v1/v2 screens and reports-v1-zeilen-* are excluded as target references. No changes were made to the external draft files.

### Component and token reuse

Existing @budget/ui exports provide TitleBlock, DimensionChain, RevisionTable, PartsList, Panel/dialog support, buttons, fields, AmountInput, DateInput, toast, switches, class swatches and chart primitives. Compose/adapt these rather than copying the mockup's React CDN/Babel runtime, inline computations or static numbers into production.

DESIGN.md is the generator input. packages/ui/scripts/generate-tokens.mjs produces tokens.css and scale-tokens.css. Preserve generation and contrast/scale checks.

| Draft convention                                   | App contract / action                                                                                                                   |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| data-mode=hell/dunkel                              | App data-theme=light/dark; adapt semantically                                                                                           |
| Draft --line is a quiet divider                    | App --line is strong blue ink; app --rule is the quiet divider                                                                          |
| Draft --field, --onprimary and similar names       | Map by role to actual app tokens, not a global rename                                                                                   |
| Blue/amber/red/green/grey budget status with icons | Add/extend semantic roles from the approved palette through generator inputs; distinguish act-now red from signed historic change roles |
| Fixed frame controls made from span/div            | Replace with genuine accessible controls, focus handling and keyboard support                                                           |
| Drawn charts/data                                  | Reuse domain/API values and @budget/ui charts; provide accessible equivalent tables                                                     |

Loading, empty, offline and partial failure behaviour belong to each area from its first PR. The later Zustände package consolidates acceptance coverage; it cannot defer basic error handling until the end.

## 8. Route and feature parity inventory

The supplied route map counts 54 content route patterns, 23 redirect routes, 9 internal redirect branches, 6 dev routes, 7 URL panel IDs and 44 other dialogs/sheets. The “113/113” target-map number combines route patterns, 16 canonical report IDs, group aliases, panels and URL-dialog states; it is not 113 pages. Conversely /reports/$reportId counts once among 54 while containing multiple reports and views.

Fresh source inspection confirms the high-risk redirects and existing 16-entry hub. The 54 list below is the source handoff's numbered baseline; the future runtime walker must independently verify the entire router. No runtime orphan test was executed here.

| Route/capability risk                                     | Required treatment                                                                                                                                                                                                                 |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| /reports/finanzcheck currently redirects to /             | Phase 1: restore its actual rule-history capability through /reports/onepager?darstellung=finanzcheck, including validator and dispatcher. Do not merely change the pathname. This is distinct from new health-score feature #814. |
| /reports/vorschau and /reports/sparziele                  | Approved calendar/progress destinations must render the previous capability before retargeting. Preserve year/month/filter context.                                                                                                |
| /reports/kontakte                                         | Remove the reverse redirect only once the combined report has balances/open items/history and settings has master data. Preserve contact detail URLs and source-booking links.                                                     |
| /vermoegen/freiheit and /vermoegen/portfolio/kennzahlen   | Keep the old route until the report view has complete content, assumptions, tables, goals, missing-data states and context.                                                                                                        |
| /vermoegen/portfolio legacy links                         | Run existing sparplan/produkt/handel routing first, then the overview fallback. A blanket redirect would lose creation/edit paths.                                                                                                 |
| /erfassen                                                 | Keep the login continuation and full-page fallback, including pending draft protection.                                                                                                                                            |
| /einstellungen/datenquellen                               | Keep the path; bank callback depends on it. Only the label changes to Verbindungen.                                                                                                                                                |
| /einstellungen on desktop                                 | New first settings destination is Profil, as already decided.                                                                                                                                                                      |
| Settings contact entry, read-only allocation link         | Add master-data navigation without duplicating financial workflows.                                                                                                                                                                |
| Phone hidden Plan entries, Prüfen at zero, Alle Buchungen | Verify visible search entry and reachable destinations without requiring a hardware keyboard. Preserve the Konten overview link to Alle Buchungen; five-bar shape alone is insufficient.                                           |
| Reports group aliases and stored views                    | Preserve old names, IDs, query values, hash, defaults and view IDs. No number-based identity.                                                                                                                                      |

The route-orphan test is an implementation sketch. Its assumed nav-config module does not exist yet and its guard intentionally rejects today's Finanz-Check redirect. Do not claim it passes. Strengthen the adoption case with literal expected destination/view assertions, validation of actual report bodies, parameters/hash, invalid IDs and back/reload behaviour. Generic /reports/$reportId matching can otherwise accept an unknown or empty report as “covered”. Test both feature-flag states; a static coverage set is not proof of reachable phone controls.

All 54 baseline pages are inventoried; **0/54 redesigned and owner-accepted in this session**. The list is coverage evidence, not a second task queue. PR and acceptance status will be added in Phase B/C.

| Baseline # | Existing route pattern                  | Target responsibility                                                                                            | State                       |
| ---------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------- |
| 1          | `/`                                     | Heute                                                                                                            | Inventoried; not redesigned |
| 2          | `/heute/details/$kind`                  | Heute › Herleitung (Detail)                                                                                      | Inventoried; not redesigned |
| 3          | `/erfassen`                             | Dialog „Buchung erfassen“ (Vollseiten-Fallback)                                                                  | Inventoried; not redesigned |
| 4          | `/suche`                                | Global (⌘K als Vollseite)                                                                                        | Inventoried; not redesigned |
| 5          | `/plan/monat`                           | Plan › Monat                                                                                                     | Inventoried; not redesigned |
| 6          | `/plan/monat/envelope/$id`              | Plan › Monat › Envelope                                                                                          | Inventoried; not redesigned |
| 7          | `/plan/monat/einnahmen`                 | Plan › Monat › Einnahmen                                                                                         | Inventoried; not redesigned |
| 8          | `/plan/jahr`                            | Plan › Jahr (Desktop)                                                                                            | Inventoried; not redesigned |
| 9          | `/plan/erwartet`                        | Plan › Zahlungen (Desktop)                                                                                       | Inventoried; not redesigned |
| 10         | `/plan/erwartet/$id`                    | Plan › Zahlungen › Zahlung                                                                                       | Inventoried; not redesigned |
| 11         | `/plan/erwartet/einnahmen`              | Plan › Zahlungen › Einnahmen                                                                                     | Inventoried; not redesigned |
| 12         | `/plan/sparziele`                       | Plan › Ziele (Desktop)                                                                                           | Inventoried; not redesigned |
| 13         | `/plan/sparziele/$id`                   | Plan › Ziele › Ziel                                                                                              | Inventoried; not redesigned |
| 14         | `/plan/prognose`                        | Plan › Prognose (Desktop)                                                                                        | Inventoried; not redesigned |
| 15         | `/monatsabschluss/$month`               | Plan (Ablauf, kein Dropdown-Eintrag)                                                                             | Inventoried; not redesigned |
| 16         | `/konten`                               | Konten › Übersicht                                                                                               | Inventoried; not redesigned |
| 17         | `/konten/$id`                           | Konten › Übersicht › Kontoblatt. Für Anlagekonten (Depot, Krypto, P2P) zusätzlich Vermögen › Positionen › Detail | Inventoried; not redesigned |
| 18         | `/konten/buchungen`                     | Konten › Alle Buchungen (Klick auf den Kopf „Konten“ im Kontenbaum, ⌘K)                                          | Inventoried; not redesigned |
| 19         | `/konten/pruefen`                       | Konten › Prüfen (Pill in der Top-Bar „Prüfen · N“)                                                               | Inventoried; not redesigned |
| 20         | `/konten/pruefen/$id`                   | Konten › Prüfen › Aufgabe                                                                                        | Inventoried; not redesigned |
| 21         | `/konten/kontakte`                      | Reports › Auswertungen › Kontakte; Stammdaten → Einstellungen › Konten & Depots › Kontakte                       | Inventoried; not redesigned |
| 22         | `/konten/kontakte/$id`                  | Reports › Kontakte › Kontoblatt                                                                                  | Inventoried; not redesigned |
| 23         | `/vermoegen/nettovermoegen`             | Vermögen › Übersicht (Leitzahl, Zusammensetzung); Verlauf → Vermögensreport                                      | Inventoried; not redesigned |
| 24         | `/vermoegen/portfolio`                  | Vermögen › Übersicht                                                                                             | Inventoried; not redesigned |
| 25         | `/vermoegen/portfolio/positionen`       | Vermögen › Positionen                                                                                            | Inventoried; not redesigned |
| 26         | `/vermoegen/portfolio/allokation`       | Vermögen › Allokation                                                                                            | Inventoried; not redesigned |
| 27         | `/vermoegen/portfolio/sparplaene`       | Vermögen › Sparpläne                                                                                             | Inventoried; not redesigned |
| 28         | `/vermoegen/portfolio/kennzahlen`       | Reports › Portfolio › Vermögensreport › Rendite und Kennzahlen                                                   | Inventoried; not redesigned |
| 29         | `/vermoegen/portfolio/instrument/$id`   | Vermögen › Positionen › Instrument                                                                               | Inventoried; not redesigned |
| 30         | `/vermoegen/portfolio/sparplan/$id`     | Vermögen › Sparpläne › Sparplan                                                                                  | Inventoried; not redesigned |
| 31         | `/vermoegen/schulden`                   | Vermögen › Schulden                                                                                              | Inventoried; not redesigned |
| 32         | `/vermoegen/freiheit`                   | Vermögen › Übersicht (eine Zeile) + Vermögensreport › Finanzielle Freiheit                                       | Inventoried; not redesigned |
| 33         | `/reports`                              | Reports › Übersicht                                                                                              | Inventoried; not redesigned |
| 34         | `/reports/gruppe/$slug`                 | Reports › Übersicht, nach Gruppe gefiltert                                                                       | Inventoried; not redesigned |
| 35         | `/reports/$reportId`                    | einzelner Report                                                                                                 | Inventoried; not redesigned |
| 36         | `/reports/gehalt/historie`              | Reports › E&A › Gehalt › Historie                                                                                | Inventoried; not redesigned |
| 37         | `/reports/einnahmen-ausgaben/buchungen` | Reports › E&A › Einnahmen und Cashflow › Buchungen                                                               | Inventoried; not redesigned |
| 38         | `/einstellungen`                        | Index (Handy)                                                                                                    | Inventoried; not redesigned |
| 39         | `/einstellungen/profil`                 | Profil & Sicherheit › Profil                                                                                     | Inventoried; not redesigned |
| 40         | `/einstellungen/sicherheit`             | Profil & Sicherheit › Sicherheit                                                                                 | Inventoried; not redesigned |
| 41         | `/einstellungen/konten`                 | Konten & Depots › Konten (anlegen, bearbeiten, archivieren)                                                      | Inventoried; not redesigned |
| 42         | `/einstellungen/depots`                 | Konten & Depots › Depots & Kryptos                                                                               | Inventoried; not redesigned |
| 43         | `/einstellungen/kategorien`             | Kategorien & Regeln › Kategorien                                                                                 | Inventoried; not redesigned |
| 44         | `/einstellungen/kategorien/$id`         | Kategorien & Regeln › Kategorie                                                                                  | Inventoried; not redesigned |
| 45         | `/einstellungen/regelwerk`              | Kategorien & Regeln › Regelwerk                                                                                  | Inventoried; not redesigned |
| 46         | `/einstellungen/regelwerk/$code`        | Kategorien & Regeln › Regel                                                                                      | Inventoried; not redesigned |
| 47         | `/einstellungen/zuordnung`              | Kategorien & Regeln › Zuordnungsregeln                                                                           | Inventoried; not redesigned |
| 48         | `/einstellungen/datenquellen`           | Verbindungen                                                                                                     | Inventoried; not redesigned |
| 49         | `/einstellungen/anlageklassen`          | Vermögen › Anlageklassen (+ Vermögensstufen & Zielallokation über `?panel=sollquoten`)                           | Inventoried; not redesigned |
| 50         | `/einstellungen/warenkorb`              | Kategorien & Regeln › Warenkorb (D5)                                                                             | Inventoried; not redesigned |
| 51         | `/einstellungen/export`                 | Daten › CSV-Export                                                                                               | Inventoried; not redesigned |
| 52         | `/einstellungen/projekte`               | Daten › Projekte (zurückhaltend)                                                                                 | Inventoried; not redesigned |
| 53         | `/login`                                | —                                                                                                                | Inventoried; not redesigned |
| 54         | `/setup`                                | —                                                                                                                | Inventoried; not redesigned |

## 9. Relationship to Moonshot phases and packages A–E

This is the dependency recommendation for the implementation plan, not a PR backlog.

| Moonshot phase                     | Redesign relationship                                                                                                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1, trust (Nov–Dec 2026)            | Numeric definitions/reference cases, N2/N3/N6/N8 diagnosis, Finanz-Check recovery, semantic tokens, safe navigation and a read-only Heute explanation. Resolve the failed CI prerequisite before integration. |
| 2, core routines (Jan–Feb 2027)    | Heute, monthly Plan, Prüfen, booking and accounts as complete routines, with cent-correct splits, interruption/retry, Undo and accessible phone capture.                                                      |
| 3, forecast (Mar–Apr 2027)         | Reuse existing Plan year/payments/goals/forecast first. Only separately approved scenario extensions may add assumptions; never turn forecasts into booked money.                                             |
| 4, wealth/reports (May–Jun 2027)   | Reorganise Vermögen and consolidate report views with preserved domain contracts and gated redirects.                                                                                                         |
| 5, assistance (Jul–Aug 2027)       | Later, read-only and evidence-bound; no assistant service or private-data export in this redesign foundation.                                                                                                 |
| 6, proven operation (Sep–Oct 2027) | Physical-device routines, month changes, source recovery, export and restore evidence. Existing acceptance gates remain open until individually satisfied.                                                    |

The dates are the original vision's planning windows, not a new delivery promise. Early correctness for wealth/reports belongs in Phase 1; the full wealth/report presentation can follow later. Route-safe catalog/search exposure can likewise precede report-body redesign.

For section 8 of MOONSHOT: A = decision reconciliation and literal synthetic references; B = numeric/source diagnosis; C = semantic tokens and existing UI; D = route/search/report-entry completeness; E = a single read-only Heute value → explanation → existing detail → preserved return. A/B must establish meaning before C/D/E makes the new view broadly visible.

Preserve the requested main delivery order in Phase B: Shell → Heute → Plan → Konten/Buchung → Vermögen → Reports → Einstellungen → Zustände/Onboarding. Necessary correctness, safe routing, source states and settings destination infrastructure are explicit prerequisites, not reasons to ship dead links in the early shell.

Current source includes an isolated synthetic preview workflow and fly.preview.toml for budget-fg-preview. Reuse that for the future staging decision instead of creating another staging app. The existing VITE_BUDGET_PREVIEW banner is an environment marker, not a redesign flag. Phase B must specify a separate fail-closed redesign flag, OFF in production and ON in authenticated synthetic preview, covering shell, routes and semantic styles together. No flag or preview was changed here.

## 10. Input manifest and design versions

External inputs were inspected for this inventory; hashes pin the supplied files. They remain outside the public repository. Historical 5-mockup-brief.md was excluded as instructed. Competitor research remains dated source material, not freshly verified product recommendations.

| External source                                | SHA-256                                                          |
| ---------------------------------------------- | ---------------------------------------------------------------- |
| MOONSHOT.md                                    | 1a3770d0a14db99df07979e85c7e4bb6071e3cc243f0c86e42877237d8761246 |
| DESIGN.md                                      | 9dc9cc0417c1a984eff856f5d2021f146fdf0ca2b28f68f9508854e356c070e4 |
| 06_Redesign/1-usage-audit.md                   | ec6a4ea8b05c9f89be52c1480a14caaafe6184359b1b8ef9c06034afa5930d4c |
| 06_Redesign/2-page-forensics.md                | 251ef869b0fc50fc0d36bfd9d6ddbd05f217eed7bfed658f10129c278a06a187 |
| 06_Redesign/3-numbers-audit.md                 | 97758a34060ae618d8df773af830f99bbe582a532789e4dd719854eeb9d94f45 |
| 06_Redesign/4-route-map.md                     | dabf82c17ba4c26bec91e243af33152336bac396a09a7ce891122dbbfb7efb8f |
| 06_Redesign/6-recherche-ynab-actual-zerosum.md | bfda6fefed7d76312c943250c66870d457987788b1616ee31b89eac23bcfb1bd |
| 06_Redesign/7-notizen-einstellungen.md         | 897cdec161af5aad83ee9435fcda45ebf1b0dcdddda6aa0d4430270cc6ee19cb |
| 06_Redesign/8-paritaet-vermoegen-live.md       | b34de4346333ef8df0629a68bbade3791814711b34d18ac33bb0cb6b77973357 |
| 06_Redesign/9-konkurrenz-vermoegen.md          | e321b7ade5e6822ae1b4300b8bd1d67c7cbd06bda8259e25976924359bef7098 |
| 06_Redesign/10-vermoegen-handeln-vs-reports.md | a745421cc0cc5e8c3c843ed23baa1ef82076ac8834e27aa212246d3404889a8a |
| 06_Redesign/11-routenkarte.md                  | 9fdad37032eb3ce7f64f1be50bd4ae3d0079b3f49dfcf099542c3e1934f98061 |
| 06_Redesign/12-review-entscheidungen.md        | e97dfea5be1a518f70174b5f756ff89a78a8e84dd195c58327d4383c46d7dee5 |
| 06_Redesign/nav-config.draft.ts                | 595dadd81d7e873b21c97c54a406427be38d287c61f4a314e8ef6a746925641d |
| 06_Redesign/route-orphan.test.draft.ts         | 3596ef31f7ab385848d06c5c1f9a6f099a1ba63c524cb0813de21beab4faada0 |

Active native design entry reads:

| Entry                                  | ETag             |
| -------------------------------------- | ---------------- |
| redesign/heute-v2.html                 | 1793359918618172 |
| redesign/plan-monat-v2.html            | 1793359877219671 |
| redesign/plan-jahr-v1.html             | 1793356348844772 |
| redesign/plan-zahlungen-v1.html        | 1793356348844772 |
| redesign/plan-ziele-v1.html            | 1793356348844772 |
| redesign/plan-prognose-v1.html         | 1793356348844772 |
| redesign/pruefen-v1.html               | 1793359807877858 |
| redesign/konten-v1.html                | 1793359824557542 |
| redesign/konten-alle-buchungen-v1.html | 1793358068183923 |
| redesign/buchung-v1.html               | 1793359864956087 |
| redesign/vermoegen-v3.html             | 1793359456026093 |
| redesign/vermoegen-v3-positionen.html  | 1793359456026093 |
| redesign/vermoegen-v3-planen.html      | 1793359456026093 |
| redesign/reports-v1.html               | 1793359769537665 |
| redesign/einstellungen-v1.html         | 1793359837555643 |
| redesign/zustaende-v1.html             | 1793358068183923 |
| redesign/onboarding-v1.html            | 1793358524913300 |

Selected JSX source reads:

| Source                        | ETag             |
| ----------------------------- | ---------------- |
| redesign/v2-kit.jsx           | 1793359918618172 |
| redesign/v2-shell.jsx         | 1793358068183923 |
| redesign/v2-heute.jsx         | 1793279951671509 |
| redesign/v2-plan2-core.jsx    | 1793280441211157 |
| redesign/v2-plan2-desk.jsx    | 1793359414665748 |
| redesign/v2-plan2-phone.jsx   | 1793359877219671 |
| redesign/v2-planx.jsx         | 1793356348844772 |
| redesign/v2-planviews.jsx     | 1793356338827284 |
| redesign/v2-pruefen.jsx       | 1793359807877858 |
| redesign/v2-konten.jsx        | 1793359824557542 |
| redesign/v2-alle.jsx          | 1793358068183923 |
| redesign/v2-buchung.jsx       | 1793359864956087 |
| redesign/v2-v3a.jsx           | 1793359456026093 |
| redesign/v2-v3b.jsx           | 1793354333534223 |
| redesign/v2-v3c.jsx           | 1793345983154917 |
| redesign/v2-reports.jsx       | 1793359762572513 |
| redesign/v2-reports2.jsx      | 1793359456026093 |
| redesign/v2-reports3.jsx      | 1793354269590704 |
| redesign/v2-reports4.jsx      | 1793359481923654 |
| redesign/v2-reports5.jsx      | 1793356410304898 |
| redesign/v2-reports6.jsx      | 1793354269590704 |
| redesign/v2-einstellungen.jsx | 1793359837555643 |
| redesign/v2-sollquoten.jsx    | 1793356410304898 |
| redesign/v2-zustaende.jsx     | 1793356685694379 |
| redesign/v2-onboarding.jsx    | 1793358524913300 |

README ETag: 1793359769537665. These are source-version observations, not a whole-project byte-exact export claim.

## 11. STOP 1 — concrete decisions and remaining questions

The owner is asked to review this inventory before Phase B, as explicitly required by the task.

1. **Proceed to Phase B on the fresh baseline?** Recommended: use this revision/board snapshot and the branch dispositions above, keeping all source work. Recheck remote state before dispatch; do not merge 36 presumed outstanding branches.
2. **Private onboarding scope is included by the latest task:** Phase B plans the six-step optional private setup behind the redesign flag, without forced first use for existing users. Public onboarding/registration remains deferred under #490.
3. **Income scope is settled:** use the budget month for Plan income, with explicit expected/received schedule labels. Preserve actual cashflow, account and historical report booking dates under their existing SPEC contract. Any later request to change those financial periods needs a specific documented contract; none is inferred here.
4. **Board versus dated STATUS/ROADMAP:** recommended: use the fresh board/PR/health state for planning, retaining the old documents as dated evidence. Reconcile acceptance per issue after plan approval; no automatic board changes in Phase A.
5. **N1 proposal:** visible closed residuals first, with zero financial change; corrections only after separate source-backed owner approval. This STOP 1 response is not an implicit production-data approval.

D1–D6, D8, private onboarding planning scope, report ordering/IDs, contacts placement and the single target editor are already decided and are not reopened. The response required now is STOP 1 review and permission to prepare Phase B on this fresh baseline; N1 implementation remains separately gated.

After the owner responds, Phase B creates 01-umsetzungsplan.md with explicit per-area PR slices, routes, reused modules, Must/Should criteria, meaningful tests, the BUDGET_TODAY parity fixture, preview acceptance, risks and the 54-page progress checklist. STOP 2 then presents that complete plan for approval. Phase C creates or reconciles GitHub issues only after that approval. No issue or builder is dispatched by this document.
