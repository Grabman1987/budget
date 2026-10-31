# Redesign implementation plan — STOP 2

Date: 30 October 2026 (Europe/Vienna). Status: **STOP 2 accepted; Phase C and implementation in branches/PRs authorised. Integration follows the current queue process; releases and real-data changes remain separately gated**.

The owner explicitly approved Phase B after [STOP 1](00-bestand.md). This document is the complete planning deliverable. The owner accepted STOP 2 on 2026-10-30 and explicitly authorised Phase C and implementation in branches/PRs. Held integrations follow the current dated owner grants in the [queue process](../queue/README.md); releases, flag activation, real-data changes, protected-rule changes and new external data sharing retain their specific gates. [PROGRESS](PROGRESS.md) records the checkpoint; GitHub Project 1 remains the only execution board.

## 1. Executive summary

Deliver an incremental redesign of the existing Budget application using its current financial engine and approved design variants. Preserve all 54 baseline route patterns, their capabilities, protected writers, 16 report destinations and retained history. Financial trust and navigable replacements come before hiding old screens.

The accepted baseline is main/live `50c0016560ee634c6ee8ede8180169bc60cb29a6`. Phase B refreshed main, health, PRs and Project 1: the SHA remains unchanged, public health is ok, no PR is open, and the board remains 372 items (326 Live, 28 Warteschlange, 8 In Arbeit, 10 Wartet auf Fabian). Latest CI 41028177749 still fails the mobile legacy-inbox case and its aggregate. These observations identify the starting state, not acceptance of balances or a passing delivery gate.

This plan defines **50 stable planning slices** (decomposed into 56 bounded Phase C issue/PR boundaries below), with routes, owned scope, reuse, Must/Should criteria, tests and an owner-preview case for each. T0/T5 may resolve as evidence-only work; T7 and protected extensions have explicit approval gates. They are planning identifiers, not 50 newly created issues or a demand to recreate completed work. Seven later Moonshot slices cover scenarios, explanation, assistance and operational proof.

Main area order is **Shell → Heute → Plan → Konten/Buchung → Vermögen → Reports → Einstellungen → Zustände/Onboarding**. Trust diagnosis precedes the broad rollout. E0 is a minimal settings destination required before moving contacts; it does not pull the full Settings redesign ahead. Old functioning bodies remain available while their new navigation and layouts are adopted.

The redesign flag is **OFF in production / ON in authenticated synthetic preview**. The approved alias/body migrations and styles are gated with it. A later production activation is a specific owner-approved release, not a side effect of merging a layout PR.

## 2. Binding guardrails and decisions

The current [SPEC](../../SPEC.md), [DESIGN](../../DESIGN.md), [CLAUDE](../../CLAUDE.md) and [queue process](../queue/README.md) apply. The explicit 30 October owner decisions override older design/navigation proposals. Do not propagate obsolete local-main process rules or the old automatic-every-merge deploy model.

| Decision                  | Implementation contract                                                                                                                                                                                                     |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Five areas and header     | Heute, Plan, Konten, Vermögen, Reports. Page dropdowns replace the specified tabs. Desktop settings through the bottom-left profile; phone through Heute avatar only, with context links to exact settings still permitted. |
| D1                        | Only monthly persistent assignments. Bis Gehalt remains a read-only Heute projection. Existing monthly rollover, close and locks stay unchanged.                                                                            |
| D2                        | No overdraft beside Zu verteilen; credit line is never envelope money. Account detail and Heute cash forecast may explain the facility.                                                                                     |
| D3                        | Booking-v1 presentation with category and optional contact per shared split line, one cent remainder for the whole booking, existing data model and audit/Undo.                                                             |
| Status                    | Circled c = pending; double check = confirmed; lock = reconciled. Cash capture confirmed and bank pending follow SPEC; icons cannot change the lock contract.                                                               |
| D4                        | Vermögen = overview/actions. One compact “Investiert: Wert vs. eingezahlt” chart and one YTD world-equity comparison row in percentage points, linking to the full wealth report. Approximate freedom exposes assumptions.  |
| Reports                   | 16 entries in four groups, numbers only for display; existing technical IDs and meaningful old aliases remain stable.                                                                                                       |
| Contacts                  | Master data in Settings, balances/open items/history in Reports. Only report action is Schulden erlassen using the existing gift/write-off semantics. Repayments remain normal booking allocation.                          |
| D5                        | Warenkorb under Kategorien & Regeln, with /einstellungen/warenkorb unchanged.                                                                                                                                               |
| D6                        | Existing passkeys/recovery/sessions and current step-up/recovery restrictions. CSV ZIP and encrypted backup are different actions/artifacts. No invented stored-code reveal, password or 2FA system.                        |
| D8                        | Plan income uses the budget month and the same budget summary as its chain/50–30–20. Expected/received schedule progress has its own label. Actual cashflow/account/report booking dates remain their existing contract.    |
| Latest route-map addendum | Payment calendar ansicht=kalender and goal progress ansicht=fortschritt; one target/stage editor as the final wealth-settings item; Allokation is a read-only consumer with a context-preserving link.                      |
| Private setup             | The new task includes the six optional onboarding steps. Existing users are never forced through them; public registration/publication remains deferred.                                                                    |

Money stays integer cents. Shared domain/API calculation contracts remain authoritative; page code formats and displays rather than reproducing business arithmetic. Missing price/FX/valuation stays unavailable; no synthetic zero, invented historical quote or guaranteed goal date. Net worth, positive assets, selected signed investment basis and securities-only value are explicitly different scopes.

No private people, institutions, actual balances, exports, PDFs or credentials enter repository files, issues, fixtures, CI or public review evidence. Use only synthetic data on preview. No new price source, bank order, arbitrary import UI, automatic product selection, public registration, multi-user system or external financial assistant is implied.

The superseded mockups/directions/hell variants listed in STOP 1 and 5-mockup-brief.md are history. The active 17 entry files and 25 JSX versions are pinned in [the inventory](00-bestand.md). Phase B re-listed redesign/ and confirmed README's pinned version. Revalidate all affected ETags before each implementation briefing; a changed file requires review, not silent adoption.

## 3. Trust prerequisites and branch decisions

### N1–N8 ownership and release rules

| Finding                         | Owning slice  | Binding result / blocker                                                                                                                                                                                                                                                                |
| ------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1 closed residuals             | T7 + K1/K2/H2 | Proposed display-only disclosure with unchanged balances/history; obtain explicit N1 display approval. A later correction is a separate source-backed, backed-up, copy-tested and explicitly approved operation. Known unexplained residuals cannot be silently dropped before release. |
| N2 offline/online low           | T2, H2, P5    | One approved 35-day result for identical scope/date/revision/levers; distinguish payday envelope projection and legitimately different horizons.                                                                                                                                        |
| N3 Investiert                   | T3, V1/V3/R3  | Shared selected signed Anlagebasis for that label; keep positive-asset net-worth decomposition separate to avoid double debt subtraction.                                                                                                                                               |
| N4 loan group vs all debt       | T3, K1/K2/V4  | Preserve the narrower Kredite group and explain all-liability totals.                                                                                                                                                                                                                   |
| N5 rounding                     | S2, K1, R2    | Existing domain formatter and balanced-chain presentation, exact cents in source, explicit approximation where rounded rows do not add exactly.                                                                                                                                         |
| N6 income mismatch              | T4, P1/R8     | Identical budget-month summary in Plan; no cashflow-date rewrite.                                                                                                                                                                                                                       |
| N7 positive debt-account credit | T3/V4         | Literal regression and precise labels; changing the financial partition requires its own protected-rule approval.                                                                                                                                                                       |
| N8 annual expenses              | T5/R3         | Reconcile the existing trailing-year contract. A no-change source explanation is acceptable; a different formula/classification requires a demonstrated defect and specific approval.                                                                                                   |

T0 clears the red delivery gate before integration. T1 defines reference cases. S1 supplies the flag. T2–T6 then prove the trust contracts, with T7 conditional on its explicit approval. S2/S3 and one read-only Heute flow can be prepared on synthetic data without publishing anything. **Broad area acceptance waits for the relevant trust cases.** An approved display correction is documented as a deliberate before/after semantic change, not a false old=new assertion.

The approved shared 35-day card in [#568/#569 adoption](../evidence/forecast-568-569/ADOPTION.md) supersedes the older period-bound card description for that caller. This does not authorise a new forecast formula or change the separate payday-envelope projection.

### Every retained Codex branch has a disposition

Adopt [the per-branch appendix](branches-2026-10-30.md): 190 CLOSE-RETAIN workstreams, one advanced merged branch frozen, three closed-unmerged branches frozen, 198 unmatched branches frozen. No immediate wholesale merge. This is 392 retained remote Codex refs, not 392 open PRs; the old “36 open” assertion cannot be used as an execution queue.

CLOSE-RETAIN does not delete a branch, prove unreverted current capability or close an issue. Before reuse, compare the exact owned residual patch and current tests/acceptance. Preserve dirty/untracked/unpushed local work. The other remote branches and 112 original worktrees stay untouched. Phase C rechecks SHAs/ownership and reuses or updates existing issues rather than duplicates.

Board “In Arbeit” (#469/#477/#487/#529/#563/#741/#762/#818) reserves a potential collision until the current writer is checked. Dated STATUS/ROADMAP checkboxes are evidence, not current acceptance; reconcile them per actual task after approval, without blanket closure.

## 4. One feature flag and a reversible preview path

**Chosen mechanism:** one build-time frontend constant, proposed name VITE_BUDGET_REDESIGN. It is true only for the exact value 1; absence, 0 and invalid values mean OFF. Reuse the existing Docker production/preview targets. Preview-build explicitly sets both its current VITE_BUDGET_PREVIEW marker and the new redesign flag; the unqualified production target builds OFF. This is a design decision to implement in S1, not an existing flag.

| Surface                | OFF / production default                 | ON / synthetic preview                                                                                                  |
| ---------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Shell and page layouts | Existing entry/components and appearance | Approved new shell and progressively migrated real bodies                                                               |
| Route migration        | Current compatible routes and aliases    | New destinations activated atomically with real body/validators; unfinished target uses the existing working capability |
| Semantic styles        | Existing theme unaffected                | Scoped root attribute and semantic roles; no global raw CSS replacement                                                 |
| API/domain             | Existing financial semantics             | Same financial semantics/queries; additive explanation/provenance fields where necessary                                |
| Storage/writers        | Existing audit/locks/Undo                | Same writers and protections; new metadata contract only after explicit acceptance                                      |
| Override               | No URL/localStorage/profile escape hatch | Only the trusted build selects it                                                                                       |

Do not add a flag table, remote flag service, per-user rollout system or two financial implementations. The flag is presentation/routing isolation, not authorisation: server sessions, step-up, validation and source permissions remain enforced.

**Partial preview rule:** the new shell may open an unchanged existing body while its area is pending; it may not hide a function or redirect to a placeholder. Keep legacy contact/wealth entry paths available until E0/R3/R4 provide the complete destination. Report catalog links temporarily use the currently working capability; final IDs/order/aliases are verified at the final catalog gate. Progress clearly distinguishes shell exposure from area acceptance.

**CSS isolation:** add roles through DESIGN/generator inputs and scope behavioural/layout changes to the redesigned root. Do not hand-edit generated tokens.css, copy data-mode selectors or globally remap --line. OFF screenshots must prove that unrelated old views have not changed.

**Hosted staging:** use the already defined budget-fg-preview app/volume/authenticated environment with synthetic fixture sources, disabled production bank/Dropbox/replication jobs and app-scoped credentials. Do not create another staging app or change secrets. Source presence of fly.preview.toml/workflow is not a claim that this candidate is currently deployed there.

**Pinned-date tests are separate:** apps/server/src/today.ts refuses BUDGET_TODAY when NODE_ENV=production. Keep that guard. Run BUDGET_TODAY parity in isolated test/E2E servers; never add it to Fly production or production-mode preview. Hosted preview uses its real server date with an explicitly recorded synthetic case/date/revision for manual comparison.

**Production activation:** S1 initially builds production explicitly OFF. A later, separately approved activation PR changes the production build input from 0 to 1 while preserving the same frontend gate and preview isolation. Independently review that bounded configuration diff, verify the exact candidate with both flag modes and required CI, integrate through the existing helper, and request release of the new current-main SHA. This activation commit is distinct from merely merging the area PRs; no URL or user preference can activate production.

**Rollback:** the current release helper and Deploy workflow accept only the current origin/main SHA. Prepare a reviewed **forward rollback commit** on current main that restores the production build input to OFF and the compatible existing presentation/route behaviour; do not try to pass an old SHA to release.sh, reset main, or bypass the workflow. Run fresh required CI for the rollback candidate, integrate through the authorised path, then publish with release.sh NEW_CURRENT_MAIN_SHA and verify exact live health. Confirm that separately approved additive migrations remain backward-compatible; turning OFF never deletes data or runs a schema downgrade. Retain URLs, stored views, audit and pending drafts, and exercise the installed-service-worker upgrade and /einrichtung fallback. If failed current-main gates prevent authorised recovery, stop with the concrete candidate/evidence and use the existing owner-authorised incident/recovery process; do not invent a gate bypass.

G1 requests a separate exact-SHA production/activation decision after preview acceptance. That future decision does not automatically approve N1 correction, secrets, real restore, external AI or a protected rule change.

## 5. Dependency order, delivery milestones and parallelism

These are prerequisite gates, not calendar promises. Up to two builders may work on **disjoint owned files** after approval, plus an independent reviewer; one heavy local check at a time. Router/nav, shared UI, auth, ledger writers and migration sequences each have one writer. An idle builder slot does not override dependencies or competing active work.

| Milestone                                 | Ordered work                                                          | Exit evidence                                                                                                  |
| ----------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| A: verified trust foundation              | T0/T1 → S1 → T2/T3/T4/T5/T6; S2; T7 after its own gate                | Exact definitions, literal references, OFF/ON isolation, explained remaining data issues; no broad rollout yet |
| B: Shell and Heute                        | S3 → H1 → H2                                                          | Five-area navigation, no orphans/lost searches, complete read-only lead → explanation → source → return        |
| C: Plan                                   | P1 → P2/P3/P4 (disjoint only) → P5/P6                                 | One complete monthly allocation/goal/payment/close routine, with existing forecast semantics                   |
| D: Konten/Buchung                         | K1 → K2 → K3 → K4 → K5                                                | Correct capture/review/reconcile/retry/Undo on desktop and phone                                               |
| E: Vermögen                               | V1 → V2 → V3 → V4                                                     | Scope-correct overview/actions, positions/schedules/allocation/debt all reachable                              |
| F: Reports                                | E0 prerequisite → R1 → R2 → R3–R11 (only disjoint bodies in parallel) | All 16 reports and every legacy view retain content/parameters; conditional redirects safe                     |
| G: Einstellungen                          | E1 → E2–E7 with owned scopes and explicit protected gates             | Real master-data/editor/source/security/export functions; no decorative fake action                            |
| H: Zustände/Onboarding and release review | Z1 → Z2 → G1                                                          | 54-page plus subview/state coverage, private optional setup, owner acceptance and separate release decision    |

Basic loading/empty/offline/error, source date, dirty guard and Undo are Must criteria in **each first area PR**. Z1 verifies their complete cross-area coverage; it is not permission to defer them.

E0 is the only deliberate destination-enabling Settings slice before Reports. V3 can link to the existing target editor until E5 completes its styling. S3 can use existing report bodies/search before the report redesign. These exceptions preserve the requested area order while keeping every visible action functional.

One slice below is one reviewable PR boundary within its named area or one shared contract. No PR bundles Heute+Plan+Konten styling. Dependencies may span areas, but their implementation is not mixed. Aim for the repository's roughly 1500-line reviewable diff budget excluding generated locks/snapshots. If a composed slice such as R3 or E2 exceeds it, divide **before Phase C issue creation** into explicit owned view/contract PRs with the same acceptance checklist, rather than opening a mixed oversized branch.

No-op/already fulfilled acceptance is linked to fresh evidence and not rebuilt. Slices with a newly discovered financial/security contract remain blocked individually while independent work continues. They cannot be quietly removed from the release checklist.

## 6. Common Must/Should and evidence contract

The following applies to every slice, in addition to its local criteria.

**Must-Meet (release blocking):** retained capabilities and valid old links; canonical same-scope figures; exact integer money and missing-data meaning; existing financial/auth/source/lock/audit/Undo protections; preview/cancel/conflict correctness; useful partial/error states; contextual return and reload; semantic controls with keyboard/focus; product 44px targets, phone safe areas/keyboard, 320px reflow or appropriate two-dimensional table treatment; light/dark, reduced motion and accessible equivalent chart tables; synthetic-only review evidence.

**Should-Meet:** density improvements, fewer duplicate labels, retained sensible disclosure preferences and reduced nonessential requests. A Should cannot replace a Must, or justify hiding a feature. Unfinished Should items are listed in the PR/board with a concrete effect and never reported as delivered.

**Evidence per PR:** slice/issue and exact head SHA; decisions cited; owned files and exclusions; reused modules; meaningful test command/results; each changed existing test/baseline justified; independently reviewed final diff; affected desktop 1440×900 and phone 390×844 screenshots in both themes; 320px/large-text/keyboard checks; named missing-data and relevant mutation/Undo proof; owner preview response with candidate SHA/date/cases and open criteria. A mockup screenshot, unit total or green CI alone does not count as owner/product acceptance.

Required checks and integration follow [the current queue policy](../queue/README.md). All required checks must pass on the exact PR head. High/shared/auth/DB/test/config changes use its full coverage plan; do not assume new redesign files qualify for a fast UI lane. Run targeted checks during work; rely on equivalent exact-head CI rather than repeatedly duplicating a full suite locally. Never relax assertions, timeouts, retry, visual tolerance or coverage. Technical selector/layout adapters require per-file reason and independent review; protected oracles/semantics require specific owner approval.

### A1. Numeric old=new snapshots with BUDGET_TODAY

Use the existing synthetic seed, e2e/sample.ts, isolated-ledger helper and test database lifecycle. The baseline day is 2026-09-17; add synthetic month-boundary/payday cases 2026-10-31, 2026-11-01 and 2026-11-13 only where relevant. Pin the browser clock and API date consistently; run outside production. No production DB or live authenticated snapshot is copied.

For each covered metric record a small test fixture: case ID, input fixture hash, pinned date, canonical query/params, currency/unit, scope/status set, source revision, raw integer/null result and displayed value. Exercise OFF and ON against identical reset/cloned synthetic state and compare both to the **independent literal expected result**. Snapshot UI formatting separately from money. Assert the same canonical result for lead/chain/chart/table/drilldown when their scopes match; different scopes need distinct names and source explanations.

N2/N3/N6 fixes are deliberate exceptions to reproducing the old bug/label. First record old mismatch, documented owner decision and independent correct expectation; then prove both corrected consumers share the canonical result. Do not update every golden output to “whatever the new implementation returns”. Missing values, negative values and date/FX boundaries are part of the snapshot contract.

| Case | Scenario                                   | Independent acceptance                                                                                                                                                                                                                              |
| ---- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F01  | Normal month / one truth                   | Current synthetic seed and an independent expected value for each lead; Zu verteilen, net worth and debt agree across same-scope reads. Read-only navigation produces no financial writes.                                                          |
| F02  | Overspending / credit / quiet states       | Synthetic cash deficit -700 cents, distinct uncovered card debt, 0, paused, under/over target. No credit line contributes budget funds; text/icon conveys each status in both themes.                                                               |
| F03  | Cent-exact shared booking splits           | 10001-cent gross with three equal-weight shares produces 3334/3334/3333 cents by the existing remainder policy; one booking-wide remainder. Missing 1 cent blocks save; cancel writes nothing.                                                      |
| F04  | Booking status and locks                   | New cash is confirmed; new bank capture pending; reconciled lock is read-only. Double-check is the confirmed icon. Editing icons never changes security/lock policy.                                                                                |
| F05  | Advance income and income types            | Synthetic 10000-cent receipt on 2026-10-31 assigned to November: October cashflow, November budget income. Capital/refunds remain outside household income where the existing contract excludes them; expected schedule values explicitly labelled. |
| F06  | Closed residual and net-worth completeness | Synthetic closed residuals +900/-40 cents alongside open accounts. Exact retained total unchanged; closed/zero/missing values distinct. No actual private account or residual values copied.                                                        |
| F07  | Signed investment basis and debt credit    | Positive selected investments 20000 cents and selected settlement cash -3000 yield Investiert 17000. Net-worth positive-assets/debt decomposition still totals correctly. A debt-role account with +500 credit tests N7 scope.                      |
| F08  | Unavailable and provisional data           | Missing quote, FX, stale/manual valuation, expired source, partial sync and no data: keep null/unavailable and provenance. Never convert to 0, fabricated history, NaN or a permitted investment/bulk action.                                       |
| F09  | Freedom annual expense reconciliation      | Eleven 10000-cent consumption months plus one 8000-cent month after refund = 118000 cents. Eight 10000-cent months annualise to 120000. Internal transfers and Zukunft investments do not invent consumption; use existing referenceMonth.          |
| F10  | Retry / conflict / Undo / rollback         | Replay the same permitted request and simulate delayed response, duplicate submit, source re-import, stale revision and failure mid-transaction. Existing identities prevent duplicate money; Undo returns the documented exact state.              |
| F11  | Return context and stale reads             | Same/different-month refetch, tab focus, Back, reload, session expiry, offline snapshot expiry and service-worker upgrade. Same-context cache can stay visible; mixed period/revision values or unauthorised offline reads cannot.                  |
| F12  | Contacts, forgiveness and metadata         | Synthetic 5000-cent debt, credit, zero and completed history. Forgiveness uses the existing zero-net write-off, cash unchanged, gift effect exact and Undo reversible. Alias/merge/archive needs its accepted metadata contract.                    |
| F13  | Print, export, restore and privacy         | CSV/table/chart use identical canonical inputs; print uses same values. Distinct synthetic encrypted artifact and CSV ZIP, no auth state/secrets in CSV, protected downloads denied to recovery sessions. Restore only into an isolated test copy.  |

### A2. Runtime route-orphan and legacy capability checks

Adopt the supplied draft as a **new planned test**, after correcting D5/editor/contact assumptions; it is not an already passing suite. Walk the actual router and validate the current counts independently. The source baseline is 54 content patterns + 23 redirect patterns + 6 dev patterns; final counts may change through documented activation/additions.

Every route must have a visible reachable entry/search/retained deep link or a tested alias. Every configured target must exist. Generic /reports/$reportId coverage is insufficient: assert known ID, whitelisted view, real rendered body, expected destination, valid params/hash and source drilldown. Unknown IDs/views must show the existing safe invalid state rather than a fabricated valid report. Test the appropriate actual backend/client predicates.

Run both flag states, desktop/phone entry paths, authenticated/unauthenticated continuations and Back/reload. Preserve all former report/page/register/settings names in search. A declared planned target never exempts a visible dead link. Old /reports/finanzcheck may retain OFF baseline behaviour during preview work but must reach its restored capability in the final ON candidate.

### A3. Writes and interruptions

Real isolated API/native-browser evidence for money-changing slices: preview and cancel zero writes; valid save exactly once; duplicate/retry/undo replay cannot duplicate money; stale basis rejects or refreshes explicitly; failed transaction leaves no half-result; permitted Undo restores the documented state; reconciled periods and source dependencies stay protected. Read-only navigation, filtering, chart interaction, N1 disclosure, report rendering and setup progress never silently create financial operations.

### A4. Visual and accessible application QA

Compare actual running synthetic app to the approved active canvas version at matching viewport/state; do not treat drawn controls or static example numbers as functional references. Desktop 1440×900 and phone 390×844 in light/dark; 320px reflow, large text, visible keyboard focus, Enter/Escape/Tab, dialog focus restoration, screen-reader labels, no colour-only state, chart table equivalents, reduced motion, no accidental horizontal page overflow. Respect current screenshot tolerances and inspect only affected new baselines.

Chromium phone emulation does not prove Safari or physical iPhone keyboard/camera behaviour. Use the existing WebKit/iPhone profile for relevant flows and the actual owner device for timing, keyboard, chooser, camera and screen reader criteria. Windows chooser defects require Windows evidence.

### A5. Source, privacy, print, export and restore

Expired consent, failed fetch, partial result, unmapped account, unreachable provider and stale/manual/missing valuation each have a specific recovery path and data date. No credential is entered/logged by an agent. Screen, table, CSV and print amounts use the same permitted sources; privacy mode covers every copied/rendered amount. Actual encrypted restore is tested on a separate test copy under its own authorisation, never over the live ledger.

### A6. Owner staging acceptance per area

After independent review and required candidate checks, publish an explicitly approved synthetic preview through the existing path. Give the owner the exact candidate SHA, flag state, fixture/date, task steps and expected literal outcomes. Record “accepted”, “rejected” or “partial” per Must criterion, not only a global thumbs-up. Fix/re-review affected failures and repeat only the relevant cases. A dated acceptance is invalidated only by relevant changed content; no needless repeated full device ceremony for a documentation edit.

### A7. Runtime and operations

Keep source/domain/API tests plus end-to-end checks for the actual touched consumers. Record request/load timing when investigating slowness; do not invent speedups or add analytics as a prerequisite. Verify OFF/ON build and installed-PWA upgrades, source recovery and preserved server/date/auth guards. Main red or an unsafe migration blocks integration/publication even if an owner likes the preview.

## 7. Per-area PR slices

IDs below are stable planning references. Existing tests mentioned are reusable evidence; any new suite or metric snapshot is **planned**, not created or executed in this Phase B. All local tests and owner cases inherit section 6. The “existing issue context” line is a reconciliation lead, not a claim that the slice is already an issue, open PR or complete.

### Trust prerequisites

#### T0 — Diagnose the existing red main gate

- **Dependencies / risk:** Initial prerequisite; High.
- **Affected routes:** No route change; prerequisite evidence/contract only.
- **Owned scope:** e2e/inbox.spec.ts:258; existing redirect/auth fixtures; only the proven root-cause files.
- **Reuse:** Current inbox navigation, Router and auth setup; current CI runner.
- **Must-Meet:** Reproduce the missing mobile heading on the pinned main SHA; distinguish product, fixture/state leak and runner failure. Repair only the demonstrated cause. Retain the 5,000 ms limit, retry policy and financial assertions. No rerun is called a fix.
- **Should-Meet:** Put the bounded diagnosis and exact SHA/check evidence in the existing delivery evidence record.
- **Tests:** Run the unchanged failing case and its direct-navigation/control counterpart; verify isolation between tests. Obtain fresh required main CI after the authorised repair, with no skipped aggregate.
- **Owner staging acceptance:** Lead verifies diagnosis and independent review; no owner staging approval can substitute for a green required gate. If no source fix is justified, record the diagnostic evidence in T1 rather than manufacturing a repair PR.
- **Existing issue context:** Inspect existing delivery/queue evidence; #783 is a different Windows/PDF issue, not an automatic match.

#### T1 — Freeze financial meanings, design versions and reference cases

- **Dependencies / risk:** T0; Elevated.
- **Affected routes:** No route change; prerequisite evidence/contract only.
- **Owned scope:** docs/redesign/; narrowly extended packages/fixtures; existing API/domain reference tests.
- **Reuse:** Accepted inventory and its input hashes; @budget/fixtures seed; existing literal finance tests.
- **Must-Meet:** Pin the reviewed source/design ETags and all metric scopes; define F01–F13 below, the 54-page IDs and redirect/view expectations. Record D1–D8 and corrected draft overrides in repo product/design contracts without copying private audits. No financial formula change.
- **Should-Meet:** Keep a small machine-readable case/route manifest derived from real router/catalog sources; do not build a generic specification engine.
- **Tests:** Existing domain/API cases plus missing literal expectations only. Prove a deliberately wrong metric/view fails the relevant reference check; do not regenerate expected values from production formulas.
- **Owner staging acceptance:** Owner accepts the synthetic case list and meanings on preview before broad layout acceptance. Phase B approval approves this target contract, not the actual financial results.
- **Existing issue context:** Reuse #508/#529 as context; do not duplicate their completed children.

#### T2 — Use one approved account forecast online and offline (N2)

- **Dependencies / risk:** T1, S1; High.
- **Affected routes:** `/`, `/plan/prognose`, `/heute/details/$kind`
- **Owned scope:** apps/web/src/heute/; pwa/offline-state.tsx and snapshot contracts; existing liquidity read adapter; API only for additive needed provenance.
- **Reuse:** liquidityQuery('35d', []), current liquidity report/domain; existing secure offline snapshots.
- **Must-Meet:** The compact Heute card and offline equivalent use the same 35-day result, source date, levers and revision. Keep the payday envelope projection distinct. Show last-known date/offline or unavailable; never fall back to a differently scoped heute.balance.low under the same label. No widening of offline read authorisation.
- **Should-Meet:** Reuse the existing query result/cache rather than introducing another forecast DTO/formula when the current snapshot can carry it.
- **Tests:** F01/F07/F08/F11; low value and earliest low date equality online/offline from the same snapshot; expired snapshot/logout denies reads; missing result is not zero. Preserve issue-558 and issue-568/569 regressions.
- **Owner staging acceptance:** Owner compares the same synthetic forecast online, offline and after reconnection; the selected six-month Plan view may differ with its horizon explicitly shown.
- **Existing issue context:** Coordinate with #522/#559/#700; inspect already merged #756/#786 before reuse.

#### T3 — Name and share the investment basis without breaking net worth (N3/N4/N7)

- **Dependencies / risk:** T1, S1; High.
- **Affected routes:** `/`, `/heute/details/$kind`, `/vermoegen/freiheit`, `/vermoegen/portfolio/allokation`
- **Owned scope:** Existing Heute/wealth read adapters and packages/db/src/repos/freedom-inputs.ts; net-worth consumer labels.
- **Reuse:** allocationInputsAsOf and freedomInvestmentBasis; netWorthSides/netWorthParts; shared valuation and formatting.
- **Must-Meet:** A figure labelled Investiert uses the selected signed Anlagebasis. Positive investment assets in the net-worth decomposition receive a distinct label and retain their own additive identity. Kredite, total liabilities and a positive debt-account credit are explicit different scopes. Do not substitute signed cash twice or alter total valuation. Diagnose N7 without changing its financial partition by stealth.
- **Should-Meet:** Expose existing account membership/source detail alongside the amount; no new universe selector.
- **Tests:** F06/F07/F08; literal selected-positive-plus-negative cash basis; net-worth chain still balances; positive credit on a debt-role account; missing FX and closed selected membership. Existing freedom-universe-615, Heute KPI and liabilities tests stay intact.
- **Owner staging acceptance:** Owner follows Investiert to its source accounts, compares Freiheit/Allokation, and verifies the separate net-worth chain. Any proposed partition-rule change is a protected follow-up.
- **Existing issue context:** Reuse #524/#525 and delivered #615/#528 evidence; do not reopen completed scope work.

#### T4 — Use budget-month income consistently in Plan (N6/D8)

- **Dependencies / risk:** T1, S1; High.
- **Affected routes:** `/plan/monat`, `/plan/monat/einnahmen`, `/plan/monat/envelope/$id`, `/plan/sparziele`
- **Owned scope:** budget/plan-page.tsx, envelope-page.tsx and related income presentation adapters.
- **Reuse:** Existing /api/budget month summary and income-month resolver; expected income read only for distinctly labelled schedule progress.
- **Must-Meet:** The Plan income lead, chain and 50/30/20 use the identical budget-month summary. Expected and matched/received schedule progress remain separate labels. Preserve actual booking dates, household/capital/reimbursement definitions and month-transfer rules. Add no income query formula in the page.
- **Should-Meet:** Use a common display selector for Plan summary fields rather than recomputing income totals.
- **Tests:** F05 plus income-next-month, income-scope-266, Plan head/chain and goals regressions. A synthetic cash receipt on October 31 assigned to November appears in October cashflow and November budget income.
- **Owner staging acceptance:** Owner compares Plan head, explanation and target page for a normal month and an advance-income month; exact cent parity and labels required.
- **Existing issue context:** Inspect #266 and already merged income-month work; new task is only the remaining mismatch.

#### T5 — Reconcile freedom annual expenses (N8) before changing anything

- **Dependencies / risk:** T1; High.
- **Affected routes:** `/vermoegen/freiheit`, `/reports/vermoegen-schulden`
- **Owned scope:** packages/db/src/repos/freedom-inputs.ts and freedom.ts; packages/domain/src/wealth/freedom.ts; synthetic evidence only.
- **Reuse:** freedomExpenseMonths, referenceMonth and freedomAnnualSpendCents; existing R16 contract.
- **Must-Meet:** Prove the trailing-12-month Bedarf/Wunsch activity, net refunds and short-history annualisation against independent expected cents. Trace transfer/principal/investment inclusion to existing classification. A large year-versus-current-month difference alone is not a defect. If source classification or formula needs a change beyond approved rules, stop that correction with a concrete protected-change proposal.
- **Should-Meet:** Display period and included categories using existing months[] detail; no second expense model.
- **Tests:** F09 (118000-cent full-year net consumption; 120000-cent annualised eight-month case); internal transfer and Zukunft investment do not invent consumption. Preserve existing R16/freedom tests and missing-value behaviour.
- **Owner staging acceptance:** Owner reviews the explained synthetic annual basis; any private reconciliation remains private and is separately accepted. A no-change diagnostic resolution is a valid result.
- **Existing issue context:** Reuse #528/#615 and existing freedom evidence; no new formula ticket without a demonstrated defect.

#### T6 — Restore the lost Finanz-Check history capability

- **Dependencies / risk:** T1, S1; Elevated.
- **Affected routes:** `/reports/finanzcheck`, `/reports/onepager`
- **Owned scope:** router.tsx, reports/report-search.ts, pages/reports-pages.tsx and existing finanzcheck report body.
- **Reuse:** Existing Finanz-Check/R07 history body, report framing and parameter validation.
- **Must-Meet:** Under the redesign flag, /reports/finanzcheck resolves to /reports/onepager?darstellung=finanzcheck with its real rule-history body. Preserve month, period, hash and valid incoming filters. Flag OFF keeps the current route behaviour until a separately approved compatibility release. No score model or R-rule change.
- **Should-Meet:** Reuse current report navigation and legacy aliases; do not duplicate rule evaluation.
- **Tests:** Literal redirect target, whitelisted darstellung, actual body and drilldown checks in both flag modes. Existing redirects test adaptations cite this owner decision; future route-orphan catches a redirect back to /.
- **Owner staging acceptance:** Owner opens a bookmarked Finanz-Check and returns to the same period. History must be visible, not merely a renamed URL.
- **Existing issue context:** #814 is a new health-score feature and stays separate from this recovery.

#### T7 — Explain closed-account remainders (N1, separately gated)

- **Dependencies / risk:** T1, S1; High.
- **Affected routes:** `/konten`, `/konten/$id`, `/heute/details/$kind`
- **Owned scope:** Existing account/wealth read disclosure and closed-account presentation only.
- **Reuse:** Current valuations, retained closed-account ledger and source drilldowns.
- **Must-Meet:** Only after explicit N1 display approval, show closed non-zero residuals as a separately labelled, accessible disclosure contributing to the total. Change no booking, current/historical value, Anlagebasis membership or return. Exclusion/write-off is outside this PR. Until approved, affected redesign metrics must retain a transparent source explanation rather than silently omitting accounts.
- **Should-Meet:** A read-only review reason may link to the retained account; do not create new persistent inbox records from page reads.
- **Tests:** F06; open values plus retained closed residuals equal the same net worth. Zero residual and missing FX have distinct states; no mutation requests on render or disclosure.
- **Owner staging acceptance:** Owner separately accepts N1 display scope. A balance correction requires source proof, backup, copy-based dry run and a new explicit approval.
- **Existing issue context:** Reference N1 private audit by identifier only; no private names/balances in issue or fixtures.

### Shell and shared UI

#### S1 — Add one fail-closed redesign flag and isolated build wiring

- **Dependencies / risk:** T1; High.
- **Affected routes:** `all routes (flag selection only)`
- **Owned scope:** One frontend flag module; Dockerfile preview-build; relevant Vite/test build inputs; scoped root attribute.
- **Reuse:** Existing preview target/workflow and production runtime; VITE_BUDGET_PREVIEW environment marker.
- **Must-Meet:** VITE_BUDGET_REDESIGN defaults OFF. Preview target explicitly builds ON; production builds OFF. A single trusted build constant controls redesigned shell/routes/styles; query/localStorage/profile cannot activate it. Both builds are verified. New read fields remain additive; backend financial rules are never selected by this flag. Preserve synthetic preview isolation and production auth.
- **Should-Meet:** Use the existing build split; no flag service, per-user rollout engine, new Fly app or DB flag table.
- **Tests:** OFF/ON build smoke, route/header/style selection, absent/invalid values OFF, no URL override; production still refuses BUDGET_TODAY. Test a real installed-service-worker upgrade between build modes.
- **Owner staging acceptance:** Owner sees clear synthetic-preview identity and confirms no production activation. Flag wiring changes are reviewed as build/deploy code; no credentials changed.
- **Existing issue context:** Reuse existing preview delivery work (#769); no rollout workflow bypass.

#### S2 — Map semantic tokens and shared primitives

- **Dependencies / risk:** S1, T1; Elevated.
- **Affected routes:** `shared UI; existing dev component page`
- **Owned scope:** DESIGN.md, generator inputs, packages/ui components/styles; narrowly scoped redesign styles.
- **Reuse:** @budget/ui TitleBlock, DimensionChain, PartsList, RevisionTable, dialogs, fields, AmountInput, DateInput, charts.
- **Must-Meet:** Map draft --line to quiet app --rule, data-mode to data-theme, and status colours to semantic roles. Blue/amber/red/green/grey always has an icon/text. Keep generated CSS generated; isolate new tokens/styles so OFF appearance does not change. Use semantic native controls, focus and reduced motion.
- **Should-Meet:** Extend an existing primitive only after checking fit; avoid a second component library or raw chart engine.
- **Tests:** Token generation/scale/contrast checks; shared primitive keyboard/focus tests; component screenshots at 1440/390, both themes, plus 320px reflow and high text zoom. Current UI tests retain equivalent coverage.
- **Owner staging acceptance:** Owner accepts the token/component reference sheet in both themes before area layout work.
- **Existing issue context:** Inspect delivered #472–474; approved colours do not authorise global unscoped replacements.

#### S3 — Build the five-area shell, dropdowns, search and safe returns

- **Dependencies / risk:** S1, S2, T6; Elevated.
- **Affected routes:** `/`, `/suche`, `/erfassen`, `/plan/*`, `/konten/*`, `/vermoegen/*`, `/reports/*`, `/einstellungen*`
- **Owned scope:** shell/, nav/, router.tsx and common page frame; new route-orphan adoption.
- **Reuse:** Existing navigation/search catalogue, auth continuation, PanelHost, AppLink and profile menu.
- **Must-Meet:** Five areas in the same order, settings only via desktop profile/Heute avatar on phone. Plan/Vermögen page dropdowns replace area tabs; Konten entry paths follow the approved map. Preserve N capture, search, privacy/theme, contextual account capture and /erfassen login continuation. Keep old functioning bodies/targets until each migration slice is ready. No new redirect points at a placeholder. Back restores period/filter/scroll; ordinary filtering replaces history while entity/page transitions push it.
- **Should-Meet:** Retain former names/aliases in one index and expose phone search without a hardware keyboard.
- **Tests:** Route-orphan contract A2, every former name, two flag modes, auth continuation and current/zero Prüfen paths. shell/mobile-shell/capture-links plus real back/reload tests; 1440/390 both themes, keyboard and safe areas.
- **Owner staging acceptance:** Owner performs Heute → Plan → Konten → Vermögen → Reports and settings from the two approved entry paths, then checks each context return.
- **Existing issue context:** Reuse #469/#487/#489 and completed shell work; one writer owns router/nav.

### Heute

#### H1 — Heute v2: priorities, lead value and meaningful source status

- **Dependencies / risk:** S3, T2, T3, T4, T5; Elevated.
- **Affected routes:** `/`
- **Owned scope:** heute/heute-page.tsx, kennzahlen/charts/attention components and scoped styles.
- **Reuse:** Current Heute/budget/liquidity queries, attention sources and @budget/ui.
- **Must-Meet:** One clear free-until-payday lead, source-aware interpretation and immediate next work; keep the current month context. Do not conflate free envelope money with forecast cash or overdraft. Retain due payments, pinned categories, month-close/rule/inbox/account tasks and existing privacy. Cached same-context data remains visible during background refresh; wrong-month values are never shown.
- **Should-Meet:** Compact due list with an explicit expansion; improve density after all functions have homes.
- **Tests:** F01/F02/F04/F08/F11; Heute section-state, phone viewport, KPI and attention tests; figures compare to canonical reads. Source failure remains local to its section.
- **Owner staging acceptance:** Owner identifies the next action and correct month/free amount within the Moonshot five-second task protocol; synthetic preview before physical-device timing.
- **Existing issue context:** Reuse #475/#574/#575 and merged #817, rather than replaying old branches.

#### H2 — Heute explanation and drilldown as one complete read-only flow

- **Dependencies / risk:** H1, T2, T3; Elevated.
- **Affected routes:** `/`, `/heute/details/$kind`
- **Owned scope:** heute detail pages, existing explanation components and context links.
- **Reuse:** DimensionChain and existing source query/detail routes.
- **Must-Meet:** Lead → calculation terms → contributing account/category/payment → same return context works. Show unit, scope, source date, status, missing-value reason and forecast assumptions. Current 35-day cash chart and payday envelope projection stay distinct. N1 source visibility follows its separate gate.
- **Should-Meet:** Reuse the same explanatory contract on offline read views where authorised; do not make offline writes from a disclosure.
- **Tests:** F01/F06/F07/F08/F11; exact displayed terms and source totals; no writes during drilldown; browser Back, reload and offline permission tests.
- **Owner staging acceptance:** Owner completes the Phase-1 read-only Heute-through-detail scenario, including one missing-data state.
- **Existing issue context:** Reuse existing Heute explanation/#518 and current investment source components.

### Plan

#### P1 — Monthly Plan v2 and guarded assignment

- **Dependencies / risk:** H2, T4, S2; High.
- **Affected routes:** `/plan/monat`, `/plan/monat/envelope/$id`, `/plan/monat/einnahmen`
- **Owned scope:** budget/plan-page, inspector, model adapters and existing writer bindings.
- **Reuse:** @budget/ui amount input; quickAssignPlan, existing cover/funding guards and audited assignment writers.
- **Must-Meet:** Monthly assignment only; no payday toggle or overdraft budget. Preserve water­fall/time/groups/classes/triage, multi-month view, category selection, target status, ghost/delta preview and one Undo group. Reuse current target/reset policy including negative assignment caps. Phone header compacts without losing the amount or action. Same query fields drive lead/rows/inspector.
- **Should-Meet:** Density menu, conditional filter chips and visible category/group add controls only after core parity.
- **Tests:** F01/F02/F05/F11; plan/head/available/menus/inspector, issue-592/593 and assignment/cover invariants. Cancel preview writes nothing; concurrent updates cannot be overwritten; Undo restores cents.
- **Owner staging acceptance:** Owner assigns, moves, covers and resets synthetic money across a month boundary, including a capped negative assignment and both phone/desktop.
- **Existing issue context:** Coordinate #482 and existing Plan evidence; shared writer contracts remain unchanged.

#### P2 — Plan year and preserved planned events

- **Dependencies / risk:** P1; High.
- **Affected routes:** `/plan/jahr`
- **Owned scope:** budget/plan-year-page.tsx, year-planning/event presentation and URL state.
- **Reuse:** Existing budget-month batch read, budget-year domain and event writers.
- **Must-Meet:** Keep annual assigned/activity/available views, categories, drilldown and planned events. Selected year/month/metric and event editor return survive back/reload. Scenarios do not become income or bookings. Every event retains explicit dates and existing audit/Undo.
- **Should-Meet:** Expose useful groups by default; avoid duplicate totals and duplicate month controls.
- **Tests:** Existing plan-year/events/scenario tests; F05/F11; annual totals equal the same twelve monthly queries; event preview/cancel/Undo and changed-basis conflict.
- **Owner staging acceptance:** Owner creates and cancels a synthetic event, compares the table/forecast and returns to the selected year.
- **Existing issue context:** Inspect merged #773/#608 evidence before changing current event behaviour.

#### P3 — Plan payments and annual calendar destination

- **Dependencies / risk:** P1; High.
- **Affected routes:** `/plan/erwartet`, `/plan/erwartet/$id`, `/plan/erwartet/einnahmen`, `/reports/vorschau`
- **Owned scope:** expected page/detail, search validators and existing payments-preview view.
- **Reuse:** Current versioned expected-payment read/writers, domain FX/date conversion and annual preview body.
- **Must-Meet:** Reuse list/calendar capability with ansicht=kalender and explicit expected/received labels. Keep create/edit/pause/end/version/skip/link actions and currency warnings. A read-only comparison must not execute the page's existing expected/refresh POST; separate manual refresh/background worker from rendering for the new view. Retarget old preview only after its full calendar renders.
- **Should-Meet:** Use existing endpoints before adding a batch read; any new read remains side-effect-free.
- **Tests:** expected/income-pause/payment/version and preview report tests; F05/F08/F10; preserved year/date/hash on legacy links; no mutation merely opening the new view; annual/native-EUR totals preserve conventions.
- **Owner staging acceptance:** Owner opens the old annual-preview link, edits and undoes one synthetic schedule and checks foreign-currency missing-data handling.
- **Existing issue context:** Reuse #482/#607/#741 where their actual scope overlaps; no change to automatic document policy.

#### P4 — Plan goals and progress destination

- **Dependencies / risk:** P1; High.
- **Affected routes:** `/plan/sparziele`, `/plan/sparziele/$id`, `/reports/sparziele`
- **Owned scope:** goals page/panel and existing goals-progress body/search state.
- **Reuse:** Current Plan target/funding and #604 lifecycle/Undo.
- **Must-Meet:** Preserve create/edit/start month, funded and completed history, complete/manual complete and rate assignment. Rate assignment fills only the existing current-month remainder; assignment itself never counts as an actual spending completion event. Adopt ansicht=fortschritt before retargeting the old report; detail back label is Ziele.
- **Should-Meet:** Keep reached/history counts visible without forcing a large list.
- **Tests:** Existing goals/progress/#604 tests; exact current-month shortfall, first expense/Undo, no duplicated rate, month rollover; URL state and zero-write disclosure.
- **Owner staging acceptance:** Owner completes the synthetic goal cycle and its Undo, then follows the legacy progress link.
- **Existing issue context:** Reuse delivered #760/#604; preserve separate future-month rate semantics.

#### P5 — Plan forecast UI with existing horizon and scenario controls

- **Dependencies / risk:** P2, P3, P4, T2; High.
- **Affected routes:** `/plan/prognose`, `/reports/liquiditaet`
- **Owned scope:** reports/liquidity report/chart/tools/selection and existing debt/forecast links.
- **Reuse:** Existing liquidity domain/read, scheduled inflow provenance and current levers.
- **Must-Meet:** Expose horizon, events, income pauses and the current authorised tools without a second forecast. Keep 35d/6m/12m choices and literal unit/date/scope; no result is unavailable, not 0. Read-only levers and unsaved scenarios never create bookings. Preserve conflict/Undo on actual event/pause writes.
- **Should-Meet:** Preserve the approved default-closed tools behaviour and open state across refetch; remove duplicated verdict/low text.
- **Tests:** Existing issue-567/#568/#569, liquidity, income-pause and tools tests; same 35d input equals Heute; different horizons explain differences. F07/F08/F11.
- **Owner staging acceptance:** Owner compares the same 35d run from Heute and Plan, then changes a horizon/lever and returns without losing selection.
- **Existing issue context:** Do not reinstate the older heute-horizon-1005 window for the approved compact card.

#### P6 — Month close, resumable progress and guarded next-month plan

- **Dependencies / risk:** P1, P3, P4; High.
- **Affected routes:** `/monatsabschluss/$month`
- **Owned scope:** month-close page, next-month-plan and existing account-review links.
- **Reuse:** Existing month-close persistence, audit/Undo and funding previews.
- **Must-Meet:** Preserve all close steps, recorded progress, skip rules, account checks, result summary and lock boundaries. Dirty next-month proposals survive guarded navigation or are explicitly discarded. Distinguish navigating a step from an intentional progress write; do not alter stored progress/locking semantics without a separately reviewed contract. No blind bulk confirmations.
- **Should-Meet:** Skip truly empty display steps only if the underlying checks remain equivalent; keep the results resumable.
- **Tests:** Current month-close tests plus interrupted/resumed, no-op step, failed write rollback, stale plan and grouped Undo cases. No weakening of close/lock assertions.
- **Owner staging acceptance:** Owner runs one complete synthetic close and resume; actual Gate 4 remains a separate private month-end comparison.
- **Existing issue context:** Reuse #483/#357 and merged month-close work; never close the epic from a partial slice.

### Konten and booking

#### K1 — Accounts overview and accessible account ordering

- **Dependencies / risk:** P6, S3; Elevated.
- **Affected routes:** `/konten`, `/konten/buchungen`
- **Owned scope:** ledger/overview-page, overview/tree-value adapters and account-order UI.
- **Reuse:** Existing account/portfolio value queries, review summaries and order writer.
- **Must-Meet:** Use the approved account groups/order, compact source/review information and real ledger sparklines. Keep closed accounts/history accessible; N1 display follows T7 approval. Provide Alle Buchungen on desktop/phone, including zero-account/zero-review states. Drag ordering has keyboard/touch alternatives and existing Undo.
- **Should-Meet:** Collapse long groups without hiding their totals/problems; no duplicate global capture button.
- **Tests:** account-order, sidebar/depot-value and account-overview tests; exact signed groups at same date; F06/F07/F08; order save/Undo and refresh.
- **Owner staging acceptance:** Owner changes order and undoes it, opens Alle Buchungen on phone and follows a source-status problem.
- **Existing issue context:** Reuse #467/#577 and delivered account overview, no synthetic replacement curves.

#### K2 — Account/depot detail and reconciliation

- **Dependencies / risk:** K1; High.
- **Affected routes:** `/konten/$id`
- **Owned scope:** ledger/account-page, depot-page, bank-balance/reconcile and manual-value presentation.
- **Reuse:** Current register, account series, source freshness, reconciliation and manual valuation writers.
- **Must-Meet:** Keep register reachable early; explain displayed account value versus settlement/depot cash. Preserve source statement/receipt links, pending/confirmed/reconciled status, source dates/coverage, upcoming transactions and native/EUR view. Reconciliation retains exact differences, locks, duplicate/absent-entry branches, explicit adjustment and Undo. Previewing an adjustment writes nothing.
- **Should-Meet:** Keep upcoming list compact when empty; one source/bank balance display with full detail available.
- **Tests:** account-review, issue-578/580/581/582, depot and reconciliation tests; F04/F07/F08/F10; locked write denial, duplicate handling, failed-write rollback and source-linked return.
- **Owner staging acceptance:** Owner reconciles a synthetic exact balance, a missing entry and a protected entry, then undoes the permitted action.
- **Existing issue context:** Reuse #499/#527 where relevant; actual balance confirmation #358 remains private.

#### K3 — All bookings: explicit edit, filters and retained saved views

- **Dependencies / risk:** K2; High.
- **Affected routes:** `/konten/buchungen`, `/reports/einnahmen-ausgaben/buchungen`
- **Owned scope:** bookings page/table/selection bar/inline-cell presentation and search state.
- **Reuse:** Existing queryBookings, validated filters, saved-view contracts and CSV export.
- **Must-Meet:** Preserve all account/category/payee/status/project/flag/date filters, sorting, pagination, selection, CSV and report-cell return. Circled c/double-check/lock status is shared. Make editing deliberate; no accidental write from merely focusing a select. Existing explicit commit/Undo semantics stay intact; any change from blur-save needs scoped protected-behaviour review, not just selector edits. Preserve #818 state when available.
- **Should-Meet:** Use desktop filter row and phone sheet without dropping criteria; retain selected view ID across reload.
- **Tests:** Current ledger filters/bulk/deletion/report-cell tests; F04/F10/F11; no write during search/sort/export; exact preview, stale-revision rejection, grouped Undo. Saved-view aliases are data, never report numbers.
- **Owner staging acceptance:** Owner filters, saves/reopens an existing supported view, bulk edits a permitted field and returns to the same report cell.
- **Existing issue context:** #818 is already In Arbeit; recheck its writer/branch before touching saved views.

#### K4 — Booking v1 editor with one shared split remainder

- **Dependencies / risk:** K3, S2; High.
- **Affected routes:** `/erfassen`, `all ?panel=buchung callers`, `/konten/$id`
- **Owned scope:** ledger/booking-panel, capture-form/model and shared split/status controls.
- **Reuse:** Existing arithmetic parser, split allocation, contacts, receipt links, writer, dirty guard and offline queue.
- **Must-Meet:** Use approved head order and category/contact lines; one booking-wide cent remainder and blocked invalid save. Keep cash confirmed, bank pending, reconciled locks, transfer counterpart, amount arithmetic, recurrence, memo/flag/project/income type, receipts and save-and-new. Duplicate submission/retry cannot create duplicate money. Cancel/session loss/navigation protects or explicitly discards the draft. No keypad and no schema change for D3.
- **Should-Meet:** Keep delete separate from Save with existing confirmation/Undo; preserve contextual account prefill.
- **Tests:** capture/capture-layout/capture-links and issue-583/584/586, split and native API tests; F03/F04/F05/F10/F11; keyboard focus/traversal and real phone keyboard. Financial locks/oracles unchanged.
- **Owner staging acceptance:** Owner accepts each provided state frame: cash/bank, locked, incomplete split, double-submit, offline draft and dirty cancel; ten-second physical capture measured separately.
- **Existing issue context:** Reuse #463/#499/#523/#586 and existing receipt work; no duplicate capture flow.

#### K5 — Prüfen v1, safe batch preview and source recovery

- **Dependencies / risk:** K4; High.
- **Affected routes:** `/konten/pruefen`, `/konten/pruefen/$id`, `/konten/posteingang`, `/konten/posteingang/$id`, `?panel=posteingang`
- **Owned scope:** inbox views, bank-bulk preview and task/source presentation.
- **Reuse:** Existing eligibility, assignment/merge/transfer checks and audited actions.
- **Must-Meet:** Show the exact definition of safe plus count and impact preview before batch confirmation. Transfers, possible duplicates and ambiguous matches remain excluded. Preserve separate Umsätze/Aufgaben, historical tasks, all source classes, individual review/reject and grouped Undo. Failures/conflicts do not mark rows confirmed. Retain source consent/failure/partial/unmapped/unreachable recovery. No auto rule based only on matching text.
- **Should-Meet:** Reuse prepared list suggestions to reduce N+1 where already supported; no permissive bulk policy change.
- **Tests:** bank-inbox-bulk, inbox/context/source-summary and issue-566 tests; F04/F08/F10/F11. Literal excluded-transfer/duplicate cases, stale preview, partial failure rollback and one Undo group.
- **Owner staging acceptance:** Owner reviews one safe batch and two unsafe cases, retries a source error, and reaches Prüfen at count zero.
- **Existing issue context:** #477/#563/#741 are In Arbeit; preserve their current guard contracts and avoid parallel writers.

### Vermögen

#### V1 — Vermögen v3 overview and one compact benchmark row

- **Dependencies / risk:** K5, T3, T5; Elevated.
- **Affected routes:** `/vermoegen`, `/vermoegen/nettovermoegen`, `/vermoegen/portfolio`
- **Owned scope:** wealth overview/page routing and current charts/quality adapters.
- **Reuse:** Current net-worth/positions/performance/Anlagebasis reads and @budget/ui charts.
- **Must-Meet:** Lead is net worth, with exact composition and actionable next work; only compact Investiert: Wert vs. eingezahlt chart and one YTD world-equity comparison in percentage points. Distinguish chart portfolio scope from the net-worth lead. Keep + Investment choices and approximate freedom link. No invented benchmark selection, stale price or zero fallback. Do not move legacy analysis away until R3 exists.
- **Should-Meet:** A missing comparison offers the existing settings link; no new code-default investment product.
- **Tests:** F06/F07/F08/F09; composition signed denominator/availability, current portfolio return/benchmark conventions, no data mutations on read. Legacy product/trade/savings redirects run before overview fallback.
- **Owner staging acceptance:** Owner identifies portfolio versus net-worth scope, follows the YTD row and confirms all Investment actions have working destinations.
- **Existing issue context:** Reuse #524/#525 and delivered composition; detailed report redirects are deferred to R3.

#### V2 — Positions, instruments and activities

- **Dependencies / risk:** V1; High.
- **Affected routes:** `/vermoegen/portfolio/positionen`, `/vermoegen/portfolio/instrument/$id`, `/konten/$id`
- **Owned scope:** Current position/instrument/trade/price-history adapters and art filters.
- **Reuse:** Existing market valuation, portfolio detail, holdings, trade and receipt/audit writers.
- **Must-Meet:** Keep Wertpapiere/Krypto/P2P filters and positions plus activities view ansicht=aktivitaeten. Preserve units, prices, costs, gain, fees/taxes, manual valuations, closed positions and trade edit/delete/source provenance. Missing values stay explicit. Detail routes keep source/period/filter context. No new price source, quote rule or trade-cost convention.
- **Should-Meet:** Expose phone metadata in a second line rather than permanently removing columns; use optional details for extended analytics.
- **Tests:** wealth-detail, trade/price/history and investment-quality tests; F07/F08/F10/F11; trade save/Undo/delete guards and missing-FX suppression.
- **Owner staging acceptance:** Owner opens a position, a zero holding and a missing valuation, inspects a trade and returns to the same filtered list.
- **Existing issue context:** Reuse #544–548/#740 evidence; native/Windows receipt issues remain distinct.

#### V3 — Savings plans and read-only allocation with a settings return

- **Dependencies / risk:** V2; High.
- **Affected routes:** `/vermoegen/portfolio/sparplaene`, `/vermoegen/portfolio/sparplan/$id`, `/vermoegen/portfolio/allokation`
- **Owned scope:** wealth/savings, allocation and existing funding-plan presentation.
- **Reuse:** Existing schedule versioning, current-month execution guard, risk policy and dated target resolver.
- **Must-Meet:** Keep schedule create/edit/end/history, currency totals, due execution preview, funding scenario and allocation deviations. Allokation targets/stages are read-only; link to the existing single settings editor and preserve selection/date on return. Retain signed settlement cash, stage buffer, provisional-data suppression and separate scenario/global-policy meanings. No bank orders or automatic new allocation policy.
- **Should-Meet:** Rate changes show their effective date and already scheduled future versions; no duplicate target editor.
- **Tests:** savings-plans/funding-plan/allocation and issue-526 tests; F07/F08/F10/F11; one execution per instrument/account/month, save/Undo/conflict and native-currency total checks.
- **Owner staging acceptance:** Owner edits a synthetic schedule, follows a target setting and returns, then checks the provisional-data guard.
- **Existing issue context:** #762 remains a separate active strategy task; preserve current funding-plan contract.

#### V4 — Debt action view and existing repayment scenarios

- **Dependencies / risk:** V3; High.
- **Affected routes:** `/vermoegen/schulden`
- **Owned scope:** wealth/debts, loan-planning/strategies/scenario presentation.
- **Reuse:** Existing debtsAsOf, projection/debt domain, terms and scenario persistence.
- **Must-Meet:** Show exact current debt, account breakdown, missing terms and actionable term editing; keep local extra repayment, existing saved scenarios, fees/rate changes and strategy comparison. Actual and model lines have distinct styles. No account balance/loan condition changes from moving a slider or opening a page. Historical 12-month analysis remains available until copied into R3.
- **Should-Meet:** Keep only the mathematical explanation folded; preserve assumptions across a background refetch.
- **Tests:** debts/loan-planning/issue-610/611 tests; F07/F08/F11; independent payoff/interest examples, currency, zero credit account, cancel/Undo and changed-basis conflicts.
- **Owner staging acceptance:** Owner compares base/extra repayment, reloads an existing scenario, cancels one edit and follows missing terms.
- **Existing issue context:** Reuse #527/#611/#612; no new credit-versus-investment advice.

### Reports

#### R1 — Reports catalog: 16 entries, four groups and stable identities

- **Dependencies / risk:** V4, E0, S3; Elevated.
- **Affected routes:** `/reports`, `/reports/gruppe/$slug`, `/reports/$reportId`
- **Owned scope:** reports hub/model/search, nav config and group aliases.
- **Reuse:** Existing 16 bodies/source mappings and saved Explorer/recent views.
- **Must-Meet:** Use the approved order and groups; names/technical IDs remain stable. All 16 entries and former names searchable on phone. Introduce contacts and consolidate portfolio catalog only with currently functioning fallback entry paths; final canonical retargeting waits for R3/R4. Group filter/search/recent and saved-view access remain reachable. No number-based routing.
- **Should-Meet:** Load long illustrative previews only when needed; never virtualise away search/accessibility targets.
- **Tests:** issue-619/628 hub, legacy-name and runtime route-orphan tests; exact 3+2+3+8 final shape, phone all-16 reachability and grouped alias parameter preservation.
- **Owner staging acceptance:** Owner finds every entry and former name on phone and desktop and confirms none open a placeholder.
- **Existing issue context:** #487 is In Arbeit; reuse already merged hub/search work and reconcile remaining criteria.

#### R2 — One report frame: chain, result, controls, accessible detail

- **Dependencies / risk:** R1; Elevated.
- **Affected routes:** `/reports/$reportId`, `/reports/gehalt/historie`, `/reports/einnahmen-ausgaben/buchungen`
- **Owned scope:** Existing report frames/section IDs, report navigation and scoped chart/table styles.
- **Reuse:** @budget/ui DimensionChain and chart grammar; existing report bodies/queries.
- **Must-Meet:** Consistent calculation chain plus result, one appropriate time control and clear unit/scope/source date. Preserve all report bodies, print/export links, source/drilldowns, trend controls and table alternatives. Stable section IDs replace position-based restoration; no new query arithmetic or copied mockup numbers. Historical negatives remain quiet signed values; act-now red stays distinct.
- **Should-Meet:** Reduce repeated headings/verdicts while preserving content and keyboard landmarks.
- **Tests:** Existing issue-552/553 frame/section tests, each body smoke and screenshot checks; invalid report/view case, filter/back/scroll restoration, privacy and both-theme Axe.
- **Owner staging acceptance:** Owner approves the reusable frame in monthly/yearly/period report examples and one missing-data case.
- **Existing issue context:** Reuse #488/#489; body-specific tasks remain separate.

#### R3 — Consolidate the full Vermögensreport before redirecting legacy analysis

- **Dependencies / risk:** R2, T3, T5, V4; High.
- **Affected routes:** `/reports/vermoegen-schulden`, `/reports/pallocation`, `/reports/peinzahlungen`, `/reports/prendite`, `/vermoegen/freiheit`, `/vermoegen/portfolio/kennzahlen`, `/vermoegen/nettovermoegen`
- **Owned scope:** Existing wealth-history, whole-picture, assets/debts, portfolio report views and freedom modules; dispatcher/validator.
- **Reuse:** Existing net-worth/history/portfolio/freedom queries and domain conventions.
- **Must-Meet:** Preserve bilanz, verlauf, gesamt, freiheit, verteilung, einzahlungen and rendite. Include net-worth composition/history, contribution/market bridge, debt history, freedom assumptions/goals/actual/projection tables, performance/risk/heatmap/class history and source coverage. Add whitelist/dispatch before aliases. Keep old route working until its complete replacement is owner-accepted. Do not rename technical ID vermoegen-schulden or change financial methods.
- **Should-Meet:** Compose retained report sections rather than reconstructing their calculations in a universal report engine.
- **Tests:** F06–F09/F11; portfolio/freedom/history/R16/source tests plus literal destination+body+params assertions for each alias; value/index/percentage units and missing history remain distinct.
- **Owner staging acceptance:** Owner checks each legacy view including saved freedom goal/edit/Undo and all tables before enabling its redirect. R3 may be split into explicitly owned view PRs before Phase C if its diff exceeds the reviewable limit.
- **Existing issue context:** Reuse #524/#525/#487 and merged #622/#623 work; no blind source-stack merge.

#### R4 — Contacts report with only debt forgiveness

- **Dependencies / risk:** R2, E0, K4; High.
- **Affected routes:** `/reports/kontakte`, `/konten/kontakte`, `/konten/kontakte/$id`
- **Owned scope:** Current contact list/statement/report composition, source-movement drilldown and write-off form; guarded redirects.
- **Reuse:** getContactStatement/listContactStatements, current writeOffContact, existing booking allocation/audit/Undo.
- **Must-Meet:** Combine balances, open items and complete retained history. One report action: Schulden erlassen for money owed to the user, with exact shortfall/category/contact preview and current maximum. Use existing zero-net write-off semantics; no second cash expense and no credit-to-income write-off in this report. Repayments arrive through normal booking allocation. Remove report repayment/settle/create/rename controls only once replacement paths work. Gift category must be chosen/confirmed from real data; never invent a person's category by name.
- **Should-Meet:** Keep zero-balance completed contacts/history selectable; resolve source-booking links without leaving orphan pages.
- **Tests:** F12; contacts/write-off/source-statement tests; 5000-cent forgiveness changes contact/envelope classification, account cash unchanged, repeated/stale submit denied and Undo restores all; no other report write action exposed.
- **Owner staging acceptance:** Owner checks owed/credit/zero cases, follows original bookings, forgives a synthetic debt and undoes it; master data remains in settings.
- **Existing issue context:** Reuse #479/#485 and current contact-history evidence; API settlements may remain for backward-compatible callers even when UI actions are retired.

#### R5 — Monthly/yearly/period-comparison reports and print

- **Dependencies / risk:** R2, T6; Elevated.
- **Affected routes:** `/reports/onepager`, `/reports/jahresreport`, `/reports/vergleich`, `/reports/finanzcheck`
- **Owned scope:** Current onepager/year/compare bodies and print stylesheet.
- **Reuse:** Existing monthly/year/compare queries and printable layout.
- **Must-Meet:** Catalog positions 1–3 retain all terms, prior/current periods, drilldown and prints; Monatsbericht retains the recovered Finanz-Check view. A4 output uses the same amounts as screen, no controls or cropped totals, with page identifiers/source date.
- **Should-Meet:** Keep monthly one sheet and yearly existing two-sheet grammar where content fits; no unreadable shrink-to-fit.
- **Tests:** Existing month/year/compare/finanzcheck tests, print media screenshots/PDF spot inspection, both themes with forced light print, F01/F05/F09.
- **Owner staging acceptance:** Owner compares a synthetic month, year and period pair on screen and in print.
- **Existing issue context:** Reuse existing report contracts; new catalog numbers do not replace technical IDs.

#### R6 — Explorer and saved analysis views

- **Dependencies / risk:** R2; High.
- **Affected routes:** `/reports/explorer`, `/reports/jahresansicht`, `/reports/kategorien`, `/reports/gesamttabelle`
- **Owned scope:** Current Explorer templates, saved-view chooser, chart/table and cell drilldown.
- **Reuse:** Existing aggregation, server-persisted views and current legacy storage recovery.
- **Must-Meet:** Keep every template, category/class/metric/period selector, table/chart toggle, CSV, save/replace/delete and source-cell query. Preserve saved IDs and invalid/deleted-view handling. Old template aliases must not reinterpret ansicht as a catalog number. Cancel/conflict never overwrites another device's view.
- **Should-Meet:** Reuse query defaults centrally; no parallel frontend aggregation.
- **Tests:** Existing Explorer/saved-view/template/alias/cell tests; F01/F08/F11; cross-device revision conflict and real Undo where supported; query equality between CSV/table/chart.
- **Owner staging acceptance:** Owner reopens saved views, drills a cell into bookings and returns with selected row/period intact.
- **Existing issue context:** Reuse #517/#625–628 and delivered server views.

#### R7 — Portfolio comparisons, costs, taxes and income reports

- **Dependencies / risk:** R2, R3; High.
- **Affected routes:** `/reports/pdepots`, `/reports/psteuern`
- **Owned scope:** Current depot comparison and portfolio cost/tax/income bodies.
- **Reuse:** Existing PP-convention performance, cost-basis/gain/TER and capital-income reads.
- **Must-Meet:** Report positions 7–8 preserve comparable scope/period/benchmark/currency, costs/paid taxes/returns and existing illustrative labels. Keep capital income distinct from household income and never recalculate withheld tax or invent missing basis. Move existing income history/expected income depth here from Vermögen with its assumptions shown.
- **Should-Meet:** Preserve detailed component tables and source valuation drilldown without a large KPI wall.
- **Tests:** Existing portfolio-depots/portfolio-costs/performance/source-quality tests; F07/F08; benchmark boundary quote missing, account-vs-security cash scope, exact fee/tax totals and CSV/table parity.
- **Owner staging acceptance:** Owner compares two synthetic depots on an identical interval and traces one cost/income component.
- **Existing issue context:** Gate 3 private holdings/returns acceptance remains #355/#356.

#### R8 — Income/cashflow and spending analysis

- **Dependencies / risk:** R2, T4; High.
- **Affected routes:** `/reports/einnahmen-ausgaben`, `/reports/einnahmen`, `/reports/cashflow`, `/reports/projekte`, `/reports/ausgaben`, `/reports/empfaenger`, `/reports/einnahmen-ausgaben/buchungen`
- **Owned scope:** Existing income/project/cashflow and spending/payee report views.
- **Reuse:** Current household/capital/refund source predicates and table/chart/CSV queries.
- **Must-Meet:** Catalog 9–10 retain income, cashflow, project and payee views with stable aliases and original actual-date semantics. Budget-month Plan income is not a replacement cashflow date. Preserve zero-balance histories, unsupported currency, project filters and exact source booking drilldowns.
- **Should-Meet:** Make the selected mode/scope visible rather than silently forcing one definition across reports.
- **Tests:** Existing income-expense/cashflow/payee/issue-621/622 tests; F05/F08/F11, literal capital/refund exclusion and same-query table/chart/CSV results.
- **Owner staging acceptance:** Owner follows each old alias and reconciles its explanation to its source bookings without losing the selected period.
- **Existing issue context:** Reuse #621/#622 and open project-related work; no tax/accounting redefinition.

#### R9 — Payroll report and existing document review path

- **Dependencies / risk:** R2, K4; High.
- **Affected routes:** `/reports/gehalt`, `/reports/gehalt/historie`, `/plan/monat/einnahmen`
- **Owned scope:** Existing payroll history/payslip/upload-review components and links.
- **Reuse:** Current deterministic parser, receipt storage/linking, guarded payroll mapping and explicit #741 automation path.
- **Must-Meet:** Retain gross/deduction/net/reimbursement parts, payout reconciliation, editable unknown-code mapping, password entry and original PDF. Preserve the newer explicitly authorised deterministic automatic-upload path and the distinct manual/scheduled path. Never infer a missing payout date, change confirmed booking metadata or recreate undone money on retry.
- **Should-Meet:** Keep desktop actions coherent and phone fields/keyboard accessible; Windows file chooser behaviour requires Windows evidence.
- **Tests:** Existing payslip/document/source/idempotency tests; synthetic PDFs only, correct/unknown code/password failure, payout match versus create, retry after Undo and atomic failure. Native Windows chooser plus WebKit panel checks.
- **Owner staging acceptance:** Owner reviews a synthetic PDF, one uncertain line and the existing automatic/manual distinction; real payslips remain private.
- **Existing issue context:** Coordinate #499/#741/#783; do not replace unresolved Windows evidence with Linux screenshots.

#### R10 — Money flow, savings rate and money age

- **Dependencies / risk:** R2; High.
- **Affected routes:** `/reports/geldfluss`, `/reports/sparquote`
- **Owned scope:** Existing flow and saving/age report bodies and responsive chart/table layout.
- **Reuse:** Current cashflow/savings/age queries and @budget/ui chart grammar.
- **Must-Meet:** Catalog 12–13 keep the current one-pool flow, household/capital/refund conventions, signed contributions and money-age source rules. No second model to match a decorative mockup. Phone Sankey simplification retains the full equivalent table.
- **Should-Meet:** Use line/shape/legend and explicit units instead of colour-only reading.
- **Tests:** Existing flow/savings/age tests; F01/F05/F08; chart/table source equality, negative/zero income, missing data and phone keyboard/table access.
- **Owner staging acceptance:** Owner reads a synthetic flow and savings/age explanation and traces one term to its sources.
- **Existing issue context:** Reuse existing report bodies and definitions rather than implementing new financial indicators.

#### R11 — Budget adherence, contracts/costs and personal inflation

- **Dependencies / risk:** R2, P1, P3; High.
- **Affected routes:** `/reports/budgettreue`, `/reports/planungstreue`, `/reports/abos`, `/reports/kosten`, `/reports/inflation`
- **Owned scope:** Current adherence/planning-accuracy, contracts/bank-cost and inflation report views.
- **Reuse:** Existing plan snapshot/adherence, expected payment, bank fee and VPI/basket calculations.
- **Must-Meet:** Catalog 14–16 retain budget-versus-forecast-accuracy distinction, cost and contract source data, personal basket/base/index/explorer/history and editable basket context link. Do not add cancellation/binding fields from the illustrative draft. History uses quiet signed ink; current actionable deficits stay explicit.
- **Should-Meet:** Keep basket editing at its new group with the same URL, and return to the report's selected base/year.
- **Tests:** Existing planning-accuracy/budget-adherence/bank-cost/contracts/inflation tests; F02/F05/F08/F11; currency costs, no invented notice terms, category weight/index and source-date parity.
- **Owner staging acceptance:** Owner compares one adherence period, a recurring cost and inflation base/year, then edits a synthetic basket and returns.
- **Existing issue context:** Reuse #482/#469/#486 and existing inflation work; no new subscription data model.

### Settings

#### E0 — Prepare the contact master-data destination before contact migration

- **Dependencies / risk:** V4; High.
- **Affected routes:** `/einstellungen/kontakte`, `/konten/kontakte`, `/konten/kontakte/$id`
- **Owned scope:** Settings route/entry, existing contact create/rename components and context return only.
- **Reuse:** Current contact read, POST create/PATCH name and FormDialog.
- **Must-Meet:** Create a real settings destination for currently supported master-data actions before R4 removes them from Konten. Preserve contact IDs/history and source backlinks. This is a narrow destination-enabling exception to later Settings styling. It must not also change the report, merge contacts or pretend aliases/archive endpoints already exist.
- **Should-Meet:** Reuse the legacy master-data form initially; visual completion belongs to E2.
- **Tests:** Existing create/rename/contact-source tests; no financial change when entering settings, cancelled form writes nothing, return context retained in both flags.
- **Owner staging acceptance:** Owner can create/rename a synthetic contact from the destination and return before the old entry is removed.
- **Existing issue context:** Coordinates #485/#486; current contacts API supports create/name and financial workflows, not a complete alias/merge/archive contract.

#### E1 — Settings structure and profile

- **Dependencies / risk:** R11, E0; Elevated.
- **Affected routes:** `/einstellungen`, `/einstellungen/profil`
- **Owned scope:** pages/settings-index/settings-nav/profile and central navigation labels.
- **Reuse:** Existing profile storage, grouped settings index and field primitives.
- **Must-Meet:** Six groups: Profil & Sicherheit; Konten & Depots; Kategorien & Regeln; Verbindungen; Vermögen; Daten. Desktop index opens Profil; phone index is reached through Heute's avatar. Keep direct context links and back context. Preserve stored profile fields without copying private data into defaults.
- **Should-Meet:** A successful save uses existing feedback/Undo where supported; no unapproved household/risk-score feature.
- **Tests:** Profile/settings navigation tests in both flag modes; F11; dirty cancel, stale form save, existing fields and source returns.
- **Owner staging acceptance:** Owner opens settings from the two approved entry paths, edits/cancels a synthetic profile field and returns.
- **Existing issue context:** Reuse #485/#486; #812/#813 add new profile semantics and stay separate.

#### E2 — Accounts, depots and complete contact master data

- **Dependencies / risk:** E1, E0, K2, R4; High.
- **Affected routes:** `/einstellungen/konten`, `/einstellungen/depots`, `/einstellungen/kontakte`
- **Owned scope:** Existing account/depot settings forms; contact master-data UI and narrowly added audited metadata contract if needed.
- **Reuse:** Existing account type/referenceAccount validation, cost-method and benchmark settings, contact create/rename.
- **Must-Meet:** Keep create/edit/archive/reopen accounts, separate cash/depot links, limits/terms, cost method and saved benchmark choices. Complete contact name/aliases/merge/archive in settings only. The current contact API exposes create/name, so alias/merge/archive require E2's explicit pre-implementation contract: stable source identities, no hard delete, no silent netting of different people, conflict detection, complete audit/Undo and locked-history preservation. An additive schema migration must be reversible and copy-tested before separate migration approval. Until that contract is accepted, show existing real actions without a fake new control; contact capability acceptance remains incomplete.
- **Should-Meet:** Move destructive account actions away from Save and retain keyboard ordering alternative from K1; reuse E0 rather than duplicate forms.
- **Tests:** Account settings/reference-link/cost-method/benchmark tests; F04/F07/F12. New alias/merge/archive API and Undo/rollback tests use two synthetic contacts with open, credit and closed history. Assert original booking IDs/amounts/statuses unchanged; no partial merge on conflict.
- **Owner staging acceptance:** Owner checks account form cases and explicitly reviews the contact metadata contract/preview before protected implementation or migration. Completion requires every promised master-data action, not just renamed headings.
- **Existing issue context:** #485/#486/#499 overlap; no archive/merge endpoint is assumed to exist.

#### E3 — Categories, rules, assignment rules and personal basket

- **Dependencies / risk:** E1, P1, R11; High.
- **Affected routes:** `/einstellungen/kategorien`, `/einstellungen/kategorien/$id`, `/einstellungen/regelwerk`, `/einstellungen/regelwerk/$code`, `/einstellungen/zuordnung`, `/einstellungen/warenkorb`
- **Owned scope:** Existing categories, rules/thresholds, assignment rules and basket settings presentation.
- **Reuse:** Current category writers, RULE_CODES/params, assignment-rule tester and VPI basket settings.
- **Must-Meet:** Warenkorb is in Kategorien & Regeln with unchanged URL. Preserve add/edit/merge/split/order/hide categories, every registered/disabled rule, threshold/version semantics, rule test against history, precedence, cleanup mappings and basket choices/weights. No rule count hardcoded, auto-category policy change or new financial threshold. Dirty forms have guards; save/Undo stays atomic.
- **Should-Meet:** Use the same status/icon grammar as Plan; keep advanced rule details available behind accessible disclosure.
- **Tests:** Existing category/rule/assignment/basket tests, F02/F08/F11; exact ordering, conflict/rollback, rule disable/Undo, income-month mappings and report-return context.
- **Owner staging acceptance:** Owner edits a synthetic category/threshold/rule/basket, tests a mapping and returns to the same report or Plan selection.
- **Existing issue context:** Reuse #469/#486 and existing rule source setup; never replace defaults with personal production values.

#### E4 — Connections with explicit failure and resumption states

- **Dependencies / risk:** E1, K5; High.
- **Affected routes:** `/einstellungen/datenquellen`
- **Owned scope:** Existing bank/read-source/market/payslip configuration UI and status views.
- **Reuse:** Current consent, bank sync/source adapters, mapping and persisted source policies.
- **Must-Meet:** Keep callback URL unchanged. Connected, expired consent, failed fetch, partial sync, unmapped account and service unavailable each show last successful date, affected scope and a working recovery action. Preserve immediate BOOK versus confirmation-first policy and the explicit #741 document path. No hidden token/password handling, source enablement or live sync from plan approval.
- **Should-Meet:** Expose next run only from real job metadata; no fake green sync stamp or invented timer.
- **Tests:** Existing bank-source/read-source/document/mapping tests; F08/F10/F11; expiry/reconnect, partial failure, duplicate fetch, mapping conflict and cancellation leave money/auth boundaries intact.
- **Owner staging acceptance:** Owner uses synthetic adapter failures and resumption; real bank/Dropbox credentials are entered only by the owner under separate source-setup approval.
- **Existing issue context:** Coordinate #741/#726/#727 and existing source acceptance; no real sync is run by this redesign plan.

#### E5 — One allocation and wealth-stage editor in Settings

- **Dependencies / risk:** E1, V3; High.
- **Affected routes:** `/einstellungen/anlageklassen`, `?panel=sollquoten`, `?panel=anlageklasse`, `?panel=anlagegruppe`, `?panel=anlageklasse-archivieren`, `?panel=instrument`
- **Owned scope:** Current asset-class settings/target-panel grid and context return.
- **Reuse:** Existing dated target/exposure resolver, risk policy, scope and audited target writer.
- **Must-Meet:** One final settings item combines target allocation and stages. Rows and columns can be added through current validated classes; every complete row is exactly 10000 bp. Preserve dated boundaries, 90% month-end buffer, scope selection, custom bands, unmapped/incomplete values and grouped Undo. Allokation remains a read-only consumer/link. No new financial stage rule or shadow editor.
- **Should-Meet:** Keep phone cards/row summaries and keyboard-accessible table editing; historical targets remain inspectable.
- **Tests:** Current issue-526/allocation/exposure/risk tests; F07/F08/F11; row sum, lower/upper-bound translation, signed cash, concurrent scope save and Undo. Allokation → settings → same context return.
- **Owner staging acceptance:** Owner edits one synthetic stage and class column, inspects a dated version and returns; financial expectations remain the existing contract.
- **Existing issue context:** Reuse delivered #507/#526 and shared-date fixes; #762 strategy does not own this writer.

#### E6 — Passkeys, recovery codes and sessions

- **Dependencies / risk:** E1, S2; High.
- **Affected routes:** `/einstellungen/sicherheit`, `/login`, `/setup`
- **Owned scope:** Existing security/passkey/recovery/session UI and step-up components.
- **Reuse:** Current auth API, withStepUp, one-time recovery reveal, session revocation and passkey login.
- **Must-Meet:** Represent Passkeys/recovery/sessions accurately. No password/2FA switch. Preserve recovery-only session restrictions, last-passkey protection, step-up and CSRF/session/origin guards. Recovery code plaintext is shown only when actually issued; do not invent historical code retrieval. Sensitive confirmation/denial/failure states are usable on phone.
- **Should-Meet:** Use clear destructive-action confirmations and preserve explicit reauthentication; no security-rule change justified as visual cleanup.
- **Tests:** Existing auth-account/passkey/recovery/session/export-admission tests; denied recovery-session access, expired step-up, cancelled WebAuthn and last-key guard. Focus/keyboard/phone display without leaking codes into screenshots/logs.
- **Owner staging acceptance:** Owner accepts synthetic-session flows; actual device passkey/recovery acceptance remains separate and private.
- **Existing issue context:** Keep #310/device gates separate; no credential, secret or auth rule changes from STOP 2.

#### E7 — Distinct data export and encrypted backup actions

- **Dependencies / risk:** E1, E6; High.
- **Affected routes:** `/einstellungen/export`, `/einstellungen/projekte`
- **Owned scope:** Current export/projects UI; bounded backup-download contract and endpoint only if safely supported.
- **Reuse:** Existing session/step-up export admission, consistent CSV ZIP snapshot, encrypted-backup subsystem and projects storage.
- **Must-Meet:** CSV ZIP export and encrypted application backup are separate labelled actions. Preserve CSV completeness/exclusions and all current auth gates. No authenticated encrypted-backup download endpoint was found in the inspected API: do not relabel CSV as backup or expose SQLite/plaintext. First define one read-only stream of an existing completed encrypted artifact through current storage/permissions, with exact auth, retention, integrity and failure rules; no key, token or new backup destination. If the current server cannot safely supply that artifact, keep this action unimplemented and require the specific backend/security contract before release acceptance. Projects retain existing supported metadata actions.
- **Should-Meet:** Show artifact timestamp/type clearly; downloading never triggers a destructive restore or hides incomplete backup state.
- **Tests:** Current export/admission tests plus proposed encrypted-artifact download tests: passkey step-up, recovery denied, absent/incomplete artifact, interrupted stream/integrity, no plaintext/key leakage and no financial DB writes. Synthetic archive/restore verification on a test copy only.
- **Owner staging acceptance:** Owner separately accepts both downloaded artifact types and the protected backup-access contract. Actual restore is a separately recorded evidence exercise.
- **Existing issue context:** Preserve existing backup/restore policy; no new credentials, restore target or secrets approved by this UI task.

### States and private onboarding

#### Z1 — Complete state, accessibility and routine parity acceptance

- **Dependencies / risk:** E1, E2, E3, E4, E5, E6, E7, R3, R4, P6, K5, P2, P5, R1, R2, R5, R6, R7, R8, R9, R10, R11; Elevated.
- **Affected routes:** `all 54 baseline routes and new destinations`
- **Owned scope:** Only demonstrated remaining state/accessibility/return gaps; evidence matrix.
- **Reuse:** Every area's already delivered loading/empty/offline/error states and existing test helpers.
- **Must-Meet:** Cross-check all 54 pages, 7 URL panels, 44 local dialogs, 8 URL-dialog states, 16 reports/legacy aliases and 19 persisted-state categories. Loading vs refetch, empty vs missing, offline vs stale, conflict vs error and forbidden writes are distinct. No area waits until Z1 for basic error handling. Chart equivalents, focus, 44px product targets, 320px reflow, both themes and reduced motion are checked.
- **Should-Meet:** Fix a small remaining defect in its own owning area PR if Z1 would otherwise cross several areas; Z1 collects evidence and shared fixes only.
- **Tests:** Acceptance matrix A1–A7 below plus real native browser checks; service-worker upgrade, session expiry, tab switch, network failure and exact Undo. Do not lower thresholds to pass.
- **Owner staging acceptance:** Owner performs weekly/payday/month-close/quarterly synthetic routines, then separately records physical-device results; any gap remains open.
- **Existing issue context:** Use existing #310/#354–358 and #522/#559/#699/#700 boundaries; no fabricated personal acceptance.

#### Z2 — Optional private six-step setup, separate from auth setup

- **Dependencies / risk:** Z1; High.
- **Affected routes:** `/einrichtung (new authenticated route)`, `/setup (existing passkey setup, retained)`, `/einstellungen/profil (optional entry)`
- **Owned scope:** Bounded onboarding page/progress and existing audited profile/account/category/income/assignment actions.
- **Reuse:** Approved onboarding-v1 composition; existing form/writer components and settings/progress persistence.
- **Must-Meet:** Add the exact six design steps (Willkommen, Konten, Einnahmen, Kategorien, Geld verteilen, Fertig) with skippable/default states, Back and resumable progress; existing users never get forced into setup. Keep /setup as the current passkey bootstrap; /einrichtung is authenticated private guidance behind the redesign flag. Saving progress does not imply that financial actions ran. Each real action requires its existing preview/guards/Undo; revisiting never duplicates accounts or assignments. Bank verbinden links to the existing owner-operated consent flow; no embedded credential form, public registration, SaaS import or demo data in the real ledger. Keep actual opening dates/start-of-history and create expected income only, never a fictional received salary.
- **Should-Meet:** Offer a direct optional profile entry and resume at the last incomplete step; preserve keyboard and screen-reader sequence.
- **Tests:** New setup-resume tests (planned), existing setup/auth/capture/category/assignment regressions, F10/F11; skip all, partial completion, crash/reload, duplicate submit, changed basis and flag OFF with an in-progress flow.
- **Owner staging acceptance:** Owner completes/skips/resumes the synthetic six-step flow and confirms an existing-user session bypasses it. Public #490 registration remains deferred.
- **Existing issue context:** Latest task authorises private setup planning; any additive progress schema follows copy/rollback migration gates.

### Release gate

#### G1 — Owner-reviewed release and flag rollback rehearsal

- **Dependencies / risk:** Z1, Z2, T7; High.
- **Affected routes:** `all accepted redesigned routes`
- **Owned scope:** Delivery/evidence records and existing preview/release helpers; no new pipeline bypass.
- **Reuse:** Existing merge-pr.sh --hold-release, preview workflow, release.sh and /health verification.
- **Must-Meet:** Plan approval alone does not merge or publish. After separately authorised implementation, independent review and exact-head CI, integrate held releases serially. Publish only the owner-approved exact current-main candidate, with production flag OFF until a separately approved activation commit changes its build input. Rehearse a reviewed forward rollback commit restoring OFF, fresh required CI and release.sh NEW_CURRENT_MAIN_SHA; never deploy an old SHA through the current-main-only helper or rewrite data. Canonical legacy URLs remain usable after OFF. No private data on preview; no feature-complete claim until all relevant owner criteria pass.
- **Should-Meet:** Keep small accepted batches; retain last verified release revision and synthetic acceptance evidence.
- **Tests:** Build/runtime OFF and ON, authenticated preview smoke, old bookmark/installed-PWA return, failure rollback and health ancestry/exact revision checks. Database migrations, if separately approved, are backward-compatible with OFF.
- **Owner staging acceptance:** Owner signs the candidate SHA, rollout/activation scope and observed preview evidence. Production activation and any real data correction require their specific approvals.
- **Existing issue context:** No issue is marked Live/queue:complete until released and individually accepted; partial/parent issues stay open.

## 7.1 Phase C decomposition before executable issue creation

R3 and E2 are aggregate planning identifiers. Their multi-view and metadata scope is too broad for one independently reviewable implementation diff. Replace them with these eight explicitly owned boundaries; all other planning IDs remain unchanged (56 executable boundaries total). No aggregate duplicate issue is created. Dependencies on R3 mean all R3a–R3d; dependencies on E2 mean all E2a–E2d. Their original full Must/Should/test/owner-acceptance criteria and section 6 apply to every relevant child, and the aggregate is accepted only when all children and protected gates are complete. If even a child proves too large, split its owned scope before dispatch and record the mapping.

| Boundary | Title                                                            | Dependencies   | Owned scope / additional gate                                                                                                                                                                                                                                                                                           |
| -------- | ---------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R3a      | Wealth report: balance sheet, history and whole picture          | R2, T3, T5, V4 | Existing bilanz/verlauf/gesamt bodies, net-worth composition/history, contribution/market bridge and debt history. Preserve exact queries and source coverage. No legacy redirect activation.                                                                                                                           |
| R3b      | Wealth report: complete freedom view                             | R3a            | Existing freedom modules, accepted darstellung whitelist/body, assumptions, saved goals, actual/projection tables and current edit/Undo. Preserve trailing-year/missing-data semantics. No old freedom redirect activation.                                                                                             |
| R3c      | Wealth report: portfolio distribution, contributions and returns | R3a            | Existing verteilung/einzahlungen/rendite views, performance/risk/heatmap/class history and source coverage. Preserve date/scope/unit contracts. No legacy alias cut-over.                                                                                                                                               |
| R3d      | Wealth report: accepted legacy aliases and complete dispatch     | R3a, R3b, R3c  | Only dispatch/validator and retained legacy aliases once every target body is owner-accepted. Preserve technical IDs, parameters, fragments and OFF fallback; no premature redirect.                                                                                                                                    |
| E2a      | Account and depot settings forms                                 | E1, E0, K2, R4 | Existing account/depot forms only: create/edit/archive/reopen, cash/depot links, limits/terms, cost method and benchmark. Preserve guards/Undo and K1 keyboard ordering; no contact metadata schema.                                                                                                                    |
| E2b      | Contact metadata identity, history and Undo contract             | E1, E0, R4     | Document the missing alias/archive/merge identity, no-hard-delete, locked-history, conflicts, audit/Undo and reversible copy-tested migration contract using synthetic examples. Proposal and independent review only; owner contract/migration approval gates E2c/E2d. No new endpoint or data mutation in this slice. |
| E2c      | Contact aliases and archive after contract approval              | E2b            | Only approved alias/archive metadata API/UI and any separately approved reversible migration. Retain source IDs/history, current create/name forms, locks and full audit/Undo. No merge or financial posting change; stay blocked until exact contract/migration approval.                                              |
| E2d      | Contact merge after contract approval                            | E2b, E2c       | Only explicitly approved merge preview/commit/Undo with source identities, conflict/locked-history preservation and no silent netting. Original booking IDs/cents/statuses unchanged. No hard delete; separate contract/migration approval remains required.                                                            |

R3 children inherit F06–F09/F11, actual rendered-body/params/alias tests, retained query semantics, owner checks for each migrated view and complete report tables. E2 children inherit F04/F07/F12, real API/SQLite conflict/rollback/Undo tests and independent full-diff finance/security/migration review where applicable. E2b must provide independent literal two-contact examples before implementation; E2c/E2d acceptance remains incomplete until every promised metadata action is real and owner-approved.

## 8. Full route, report, dialog and state parity

### 8.1 Baseline checklist — 0 of 54 implemented, preview-accepted or released

Every existing page pattern is mapped below. The baseline denominator remains 54; a generic report route still represents many bodies, so completion also requires sections 8.2–8.6. A route merely loading or a redirect returning HTTP 200 never completes a row.

Mark Implemented only after reviewed code and required checks; Preview only after the owner's named Must cases; Released only after the explicitly approved production descendant and its health verification. No box is checked by this planning document.

| Baseline # | Existing route                          | Approved responsibility                                                                                          | Owning slices | Implemented | Owner preview | Released |
| ---------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------- | ----------- | ------------- | -------- |
| 1          | `/`                                     | Heute                                                                                                            | H1/H2         | [ ]         | [ ]           | [ ]      |
| 2          | `/heute/details/$kind`                  | Heute › Herleitung (Detail)                                                                                      | H2            | [ ]         | [ ]           | [ ]      |
| 3          | `/erfassen`                             | Dialog „Buchung erfassen“ (Vollseiten-Fallback)                                                                  | K4            | [ ]         | [ ]           | [ ]      |
| 4          | `/suche`                                | Global (⌘K als Vollseite)                                                                                        | S3            | [ ]         | [ ]           | [ ]      |
| 5          | `/plan/monat`                           | Plan › Monat                                                                                                     | P1            | [ ]         | [ ]           | [ ]      |
| 6          | `/plan/monat/envelope/$id`              | Plan › Monat › Envelope                                                                                          | P1            | [ ]         | [ ]           | [ ]      |
| 7          | `/plan/monat/einnahmen`                 | Plan › Monat › Einnahmen                                                                                         | P1/R9         | [ ]         | [ ]           | [ ]      |
| 8          | `/plan/jahr`                            | Plan › Jahr (Desktop)                                                                                            | P2            | [ ]         | [ ]           | [ ]      |
| 9          | `/plan/erwartet`                        | Plan › Zahlungen (Desktop)                                                                                       | P3            | [ ]         | [ ]           | [ ]      |
| 10         | `/plan/erwartet/$id`                    | Plan › Zahlungen › Zahlung                                                                                       | P3            | [ ]         | [ ]           | [ ]      |
| 11         | `/plan/erwartet/einnahmen`              | Plan › Zahlungen › Einnahmen                                                                                     | P3            | [ ]         | [ ]           | [ ]      |
| 12         | `/plan/sparziele`                       | Plan › Ziele (Desktop)                                                                                           | P4            | [ ]         | [ ]           | [ ]      |
| 13         | `/plan/sparziele/$id`                   | Plan › Ziele › Ziel                                                                                              | P4            | [ ]         | [ ]           | [ ]      |
| 14         | `/plan/prognose`                        | Plan › Prognose (Desktop)                                                                                        | P5            | [ ]         | [ ]           | [ ]      |
| 15         | `/monatsabschluss/$month`               | Plan (Ablauf, kein Dropdown-Eintrag)                                                                             | P6            | [ ]         | [ ]           | [ ]      |
| 16         | `/konten`                               | Konten › Übersicht                                                                                               | K1            | [ ]         | [ ]           | [ ]      |
| 17         | `/konten/$id`                           | Konten › Übersicht › Kontoblatt. Für Anlagekonten (Depot, Krypto, P2P) zusätzlich Vermögen › Positionen › Detail | K2            | [ ]         | [ ]           | [ ]      |
| 18         | `/konten/buchungen`                     | Konten › Alle Buchungen (Klick auf den Kopf „Konten“ im Kontenbaum, ⌘K)                                          | K3            | [ ]         | [ ]           | [ ]      |
| 19         | `/konten/pruefen`                       | Konten › Prüfen (Pill in der Top-Bar „Prüfen · N“)                                                               | K5            | [ ]         | [ ]           | [ ]      |
| 20         | `/konten/pruefen/$id`                   | Konten › Prüfen › Aufgabe                                                                                        | K5            | [ ]         | [ ]           | [ ]      |
| 21         | `/konten/kontakte`                      | Reports › Auswertungen › Kontakte; Stammdaten → Einstellungen › Konten & Depots › Kontakte                       | R4/E0/E2      | [ ]         | [ ]           | [ ]      |
| 22         | `/konten/kontakte/$id`                  | Reports › Kontakte › Kontoblatt                                                                                  | R4            | [ ]         | [ ]           | [ ]      |
| 23         | `/vermoegen/nettovermoegen`             | Vermögen › Übersicht (Leitzahl, Zusammensetzung); Verlauf → Vermögensreport                                      | V1/R3         | [ ]         | [ ]           | [ ]      |
| 24         | `/vermoegen/portfolio`                  | Vermögen › Übersicht                                                                                             | V1            | [ ]         | [ ]           | [ ]      |
| 25         | `/vermoegen/portfolio/positionen`       | Vermögen › Positionen                                                                                            | V2            | [ ]         | [ ]           | [ ]      |
| 26         | `/vermoegen/portfolio/allokation`       | Vermögen › Allokation                                                                                            | V3/E5         | [ ]         | [ ]           | [ ]      |
| 27         | `/vermoegen/portfolio/sparplaene`       | Vermögen › Sparpläne                                                                                             | V3            | [ ]         | [ ]           | [ ]      |
| 28         | `/vermoegen/portfolio/kennzahlen`       | Reports › Portfolio › Vermögensreport › Rendite und Kennzahlen                                                   | R3            | [ ]         | [ ]           | [ ]      |
| 29         | `/vermoegen/portfolio/instrument/$id`   | Vermögen › Positionen › Instrument                                                                               | V2            | [ ]         | [ ]           | [ ]      |
| 30         | `/vermoegen/portfolio/sparplan/$id`     | Vermögen › Sparpläne › Sparplan                                                                                  | V3            | [ ]         | [ ]           | [ ]      |
| 31         | `/vermoegen/schulden`                   | Vermögen › Schulden                                                                                              | V4            | [ ]         | [ ]           | [ ]      |
| 32         | `/vermoegen/freiheit`                   | Vermögen › Übersicht (eine Zeile) + Vermögensreport › Finanzielle Freiheit                                       | R3            | [ ]         | [ ]           | [ ]      |
| 33         | `/reports`                              | Reports › Übersicht                                                                                              | R1            | [ ]         | [ ]           | [ ]      |
| 34         | `/reports/gruppe/$slug`                 | Reports › Übersicht, nach Gruppe gefiltert                                                                       | R1            | [ ]         | [ ]           | [ ]      |
| 35         | `/reports/$reportId`                    | einzelner Report                                                                                                 | R2–R11        | [ ]         | [ ]           | [ ]      |
| 36         | `/reports/gehalt/historie`              | Reports › E&A › Gehalt › Historie                                                                                | R9            | [ ]         | [ ]           | [ ]      |
| 37         | `/reports/einnahmen-ausgaben/buchungen` | Reports › E&A › Einnahmen und Cashflow › Buchungen                                                               | K3/R8         | [ ]         | [ ]           | [ ]      |
| 38         | `/einstellungen`                        | Index (Handy)                                                                                                    | E1            | [ ]         | [ ]           | [ ]      |
| 39         | `/einstellungen/profil`                 | Profil & Sicherheit › Profil                                                                                     | E1            | [ ]         | [ ]           | [ ]      |
| 40         | `/einstellungen/sicherheit`             | Profil & Sicherheit › Sicherheit                                                                                 | E6            | [ ]         | [ ]           | [ ]      |
| 41         | `/einstellungen/konten`                 | Konten & Depots › Konten (anlegen, bearbeiten, archivieren)                                                      | E2            | [ ]         | [ ]           | [ ]      |
| 42         | `/einstellungen/depots`                 | Konten & Depots › Depots & Kryptos                                                                               | E2            | [ ]         | [ ]           | [ ]      |
| 43         | `/einstellungen/kategorien`             | Kategorien & Regeln › Kategorien                                                                                 | E3            | [ ]         | [ ]           | [ ]      |
| 44         | `/einstellungen/kategorien/$id`         | Kategorien & Regeln › Kategorie                                                                                  | E3            | [ ]         | [ ]           | [ ]      |
| 45         | `/einstellungen/regelwerk`              | Kategorien & Regeln › Regelwerk                                                                                  | E3            | [ ]         | [ ]           | [ ]      |
| 46         | `/einstellungen/regelwerk/$code`        | Kategorien & Regeln › Regel                                                                                      | E3            | [ ]         | [ ]           | [ ]      |
| 47         | `/einstellungen/zuordnung`              | Kategorien & Regeln › Zuordnungsregeln                                                                           | E3            | [ ]         | [ ]           | [ ]      |
| 48         | `/einstellungen/datenquellen`           | Verbindungen                                                                                                     | E4            | [ ]         | [ ]           | [ ]      |
| 49         | `/einstellungen/anlageklassen`          | Vermögen › Anlageklassen (+ Vermögensstufen & Zielallokation über `?panel=sollquoten`)                           | E5            | [ ]         | [ ]           | [ ]      |
| 50         | `/einstellungen/warenkorb`              | Kategorien & Regeln › Warenkorb (D5)                                                                             | E3            | [ ]         | [ ]           | [ ]      |
| 51         | `/einstellungen/export`                 | Daten › CSV-Export                                                                                               | E7            | [ ]         | [ ]           | [ ]      |
| 52         | `/einstellungen/projekte`               | Daten › Projekte (zurückhaltend)                                                                                 | E7            | [ ]         | [ ]           | [ ]      |
| 53         | `/login`                                | —                                                                                                                | E6/S3         | [ ]         | [ ]           | [ ]      |
| 54         | `/setup`                                | —                                                                                                                | E6/Z2         | [ ]         | [ ]           | [ ]      |

Additional target checklist, separate from the 54 baseline rows:

| Target / activation                       | Owner   | Implementation boundary                                                                                                 | Accepted |
| ----------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------- | -------- |
| /vermoegen as a real overview             | V1      | Existing redirect becomes content, old analysis retained until R3                                                       | [ ]      |
| /einstellungen/kontakte                   | E0 / E2 | New real master-data route; OFF resolves to compatible legacy capability                                                | [ ]      |
| /reports/kontakte canonical body          | R4      | Remove reverse redirect only after ledger/report/settings parity                                                        | [ ]      |
| /einrichtung optional authenticated guide | Z2      | New route; /setup remains the existing auth bootstrap; OFF returns safely to profile/settings without deleting progress | [ ]      |

A future runtime router count must distinguish additions, redirect-to-page activations and generic report dispatch. Do not hardcode “54 forever” or call the supplied mixed “113/113” figure a page total. No dev-only page is a user navigation entry; six current dev routes remain covered separately.

### 8.2 Sixteen reports in approved display order

Technical identity is the existing ID below. Descriptive draft slugs are search/label aliases; numbering can change without changing stored IDs or saved links. Every row also requires the shared frame, source drilldown, equivalent table, state/error checks and phone discoverability.

| Display # | Group                  | Label                    | Stable ID          | Required retained capability                                         | Slices       |
| --------- | ---------------------- | ------------------------ | ------------------ | -------------------------------------------------------------------- | ------------ |
| 1         | Berichte               | Monatsbericht            | onepager           | Standard; finanzcheck (restored)                                     | R5 / T6      |
| 2         | Berichte               | Jahresbericht            | jahresreport       | Existing year/print                                                  | R5           |
| 3         | Berichte               | Zeitraumvergleich        | vergleich          | Existing comparison modes                                            | R5           |
| 4         | Auswertungen           | Kontakte                 | kontakte           | Balances, open items, retained contact detail/history                | R4 / E0 / E2 |
| 5         | Auswertungen           | Auswertung               | explorer           | year, category, total templates and saved views                      | R6           |
| 6         | Portfolio              | Vermögensreport          | vermoegen-schulden | bilanz, verlauf, gesamt, freiheit, verteilung, einzahlungen, rendite | R3           |
| 7         | Portfolio              | Depots im Vergleich      | pdepots            | Existing identical-period depot comparison                           | R7           |
| 8         | Portfolio              | Kosten, Steuern, Erträge | psteuern           | Costs/taxes and retained historical/expected capital income          | R7           |
| 9         | Einnahmen und Ausgaben | Einnahmen und Cashflow   | einnahmen-ausgaben | Standard, income, cashflow, projekte; existing project context       | R8           |
| 10        | Einnahmen und Ausgaben | Ausgabenanalyse          | ausgaben           | gruppen, empfaenger                                                  | R8           |
| 11        | Einnahmen und Ausgaben | Gehalt                   | gehalt             | History, payslip review/upload/retained PDF                          | R9           |
| 12        | Einnahmen und Ausgaben | Geldfluss                | geldfluss          | Existing source flow and equivalent table                            | R10          |
| 13        | Einnahmen und Ausgaben | Sparquote und Geldalter  | sparquote          | Existing savings/age definitions                                     | R10          |
| 14        | Einnahmen und Ausgaben | Budgettreue              | budgettreue        | budget, planungstreue                                                | R11          |
| 15        | Einnahmen und Ausgaben | Verträge und Kosten      | abos               | vertraege, bankkosten; no new notice fields                          | R11          |
| 16        | Einnahmen und Ausgaben | Persönliche Inflation    | inflation          | Basket/base/year and existing category explorer                      | R11          |

The final groups contain 3 Berichte + 2 Auswertungen + 3 Portfolio + 8 Einnahmen und Ausgaben. Keep the existing sources/aliases for all older catalog IDs, including the separate liquiditaet compatibility entry. R3 may consolidate bodies without erasing their source scopes, return convention or source links.

### 8.3 All 23 current redirect entries and their ON destination contracts

Every row is tested in OFF and ON. OFF preserves compatible current behaviour until a separately approved compatibility release. ON preserves validated month/period/filters and fragment, plus the alias's original intended view. Existing valid saved IDs are never replaced with a report number. Use the existing safe return validator; arbitrary external return URLs are rejected.

| Existing source           | Final ON target / behaviour                               | Owning slice | Must preserve                                                     |
| ------------------------- | --------------------------------------------------------- | ------------ | ----------------------------------------------------------------- |
| /reports/liquiditaet      | /plan/prognose                                            | P5           | Keep horizon/levers/period and actual body                        |
| /reports/einnahmen        | /reports/einnahmen-ausgaben?darstellung=income            | R8           | Alias intent wins over conflicting incoming display               |
| /reports/cashflow         | /reports/einnahmen-ausgaben?darstellung=cashflow          | R8           | Same original cashflow capability                                 |
| /reports/projekte         | /reports/einnahmen-ausgaben?darstellung=projekte          | R8           | Keep project ID and invalid/deleted-project handling              |
| /reports/empfaenger       | /reports/ausgaben?darstellung=empfaenger                  | R8           | Keep payee/category/period drilldown                              |
| /reports/planungstreue    | /reports/budgettreue?darstellung=planungstreue            | R11          | Do not replace forecast accuracy with budget adherence            |
| /reports/kosten           | /reports/abos?darstellung=bankkosten                      | R11          | Keep bank-interest/fee scope                                      |
| /reports/vermoegen        | /reports/vermoegen-schulden?darstellung=verlauf           | R3           | Complete net-worth history/table present first                    |
| /reports/gesamtuebersicht | /reports/vermoegen-schulden?darstellung=gesamt            | R3           | Complete contribution/whole-picture capability first              |
| /reports/peinzahlungen    | /reports/vermoegen-schulden?darstellung=einzahlungen      | R3           | Direct, no extra portfolio redirect; literal intended view        |
| /reports/prendite         | /reports/vermoegen-schulden?darstellung=rendite           | R3           | Direct, complete risk/returns/missing-history view                |
| /reports/jahresansicht    | /reports/explorer?vorlage=year                            | R6           | Preserve existing view IDs and YTD fallback only when absent      |
| /reports/kategorien       | /reports/explorer?vorlage=category                        | R6           | Preserve source filters and valid saved-view context              |
| /reports/gesamttabelle    | /reports/explorer?vorlage=total                           | R6           | Preserve Alles fallback only when absent; CSV/detail access       |
| /reports/vorschau         | /plan/erwartet?ansicht=kalender                           | P3           | Only after retained 12-month calendar renders                     |
| /reports/sparziele        | /plan/sparziele?ansicht=fortschritt                       | P4           | Only after full progress capability; goal back link becomes Ziele |
| /reports/kontakte         | Canonical contact report; remove current reverse redirect | R4           | E0 settings entry and full contact ledger/history must exist      |
| /reports/finanzcheck      | /reports/onepager?darstellung=finanzcheck                 | T6 / R5      | Actual history body and validator required; never silently Heute  |
| /konten/posteingang       | /konten/pruefen                                           | K5           | Keep Teil/Gruppe/Quelle/Historical and origin context             |
| /konten/posteingang/$id   | /konten/pruefen/$id                                       | K5           | Keep task identity and back path                                  |
| /einstellungen/import     | /einstellungen/export                                     | E7           | No import UI revived; export remains authenticated                |
| /plan                     | /plan/monat                                               | S3 / P1      | Preserve valid month/filter context                               |
| /vermoegen                | Real overview page; remove old redirect to nettovermoegen | V1           | No cycle while old net-worth view stays available                 |

Additional migrations:

| Source                                             | Final ON target / condition                                                                                                                                      |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| /vermoegen/nettovermoegen                          | /vermoegen only once full history/composition is reachable in R3; carry period/filter context into the report link and retain any existing supported view intent |
| /vermoegen/portfolio                               | Run existing sparplan/produkt/handel legacy dispatch first; only then /vermoegen overview                                                                        |
| /vermoegen/portfolio/kennzahlen                    | /reports/vermoegen-schulden?darstellung=rendite after the full target exists                                                                                     |
| /vermoegen/freiheit                                | /reports/vermoegen-schulden?darstellung=freiheit after goals/assumptions/history/tables exist                                                                    |
| /konten/kontakte                                   | /reports/kontakte after E0/R4, keeping contact and detail context                                                                                                |
| /reports/pallocation                               | /reports/vermoegen-schulden; default verteilung only when no valid intended view is present; preserve einzahlungen/rendite when explicitly selected              |
| /reports/gruppe/monat and /reports/gruppe/ausgaben | Einnahmen und Ausgaben group; original report remains individually searchable                                                                                    |
| /reports/gruppe/zukunft                            | Portfolio group                                                                                                                                                  |
| /reports/gruppe/ueberblick                         | Berichte group; contact report back link explicitly targets Auswertungen                                                                                         |
| /reports/gruppe/portfolio                          | Same valid Portfolio group                                                                                                                                       |
| /einstellungen desktop index                       | /einstellungen/profil; phone retains grouped index                                                                                                               |
| /plan/monat?kategorie=                             | Existing envelope detail redirect, selected month retained                                                                                                       |
| ?panel=posteingang                                 | Existing Prüfen redirect, including origin state                                                                                                                 |
| /login and /setup auth branches                    | Preserve current passkey/setup/weiter validation and session cleanup; optional setup never changes them                                                          |

All nine supplied beforeLoad branch behaviours remain tested, including root/shell/login/setup auth choices, envelope category redirect, three portfolio legacy parameter cases and settings desktop dispatch. Redirects must settle without cycles; specific static routes outrank dynamic account/report patterns. The baseline table counts routes, not each condition inside a beforeLoad function.

### 8.4 Seven URL panel IDs and eight URL-dialog states

| Panel ID                 | Owner   | Retained contract                                                                          |
| ------------------------ | ------- | ------------------------------------------------------------------------------------------ |
| buchung                  | K4      | Every page; account context and /erfassen fallback; dirty/lock/session/offline protections |
| posteingang              | K5      | Root legacy redirect, not a new panel; preserve source return                              |
| anlageklasse             | E5      | Existing class editor, validated identity, dated exposure and Undo                         |
| anlagegruppe             | E5      | Existing group editor; preserve class membership/Undo                                      |
| anlageklasse-archivieren | E5      | Existing archive/reactivate guard; retained history                                        |
| instrument               | V2 / E5 | Same existing instrument form/writer from context; no new valuation method                 |
| sollquoten               | E5 / V3 | Exactly one editor in Settings; Allokation only links to it with return context            |

| URL-dialog state                               | Owner   | Retained contract                                          |
| ---------------------------------------------- | ------- | ---------------------------------------------------------- |
| /plan/jahr?ereignis=                           | P2      | Existing explicit event date, dirty guard and return       |
| /konten/$id?pruefen=reconcile                  | K2      | Reconcile preview, locks, conflict and Undo                |
| /konten/$id?pruefen=value                      | K2 / V2 | Manual valuation history/provenance and Undo               |
| /einstellungen/regelwerk/$code?bearbeiten=true | E3      | Rule parameters, not an invented new rule                  |
| /vermoegen/portfolio/instrument/$id?handel=    | V2      | Legacy product/trade dispatch remains first                |
| /reports/gehalt?gehaltszettel= / ?zettel=      | R9      | Original document, exact payout/mapping guard              |
| /vermoegen/portfolio*?sparplan=neu             | V3      | Direct creation at sparplaene, never swallowed by overview |
| /plan/monat?kategorie=                         | P1      | Retain category-to-envelope redirect and selected month    |

### 8.5 All 44 supplied local dialog/workflow entries

These are the source audit's numbered entries, including overlapping shared forms/URL-driven variants. Do not sum them with section 8.4 as if every row were a distinct implementation component. Explicitly replaced contact workflows retain their financial capability through ordinary booking allocation.

| Source # | Dialog / workflow                        | Owner             | Acceptance invariant                                                                                 |
| -------- | ---------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------- |
| 1        | Category create/edit                     | P1 / E3           | Dirty guard, target/hidden/history and audited Undo                                                  |
| 2        | Group create/rename                      | P1 / E3           | Explicit save and membership preserved                                                               |
| 3        | Category merge                           | E3                | Preview, existing dependencies, no lost historical totals                                            |
| 4        | Category split                           | E3                | Existing cent allocation/history and Undo                                                            |
| 5        | Assign/move/cover envelope               | P1                | Preview, funding caps, conflict and grouped Undo                                                     |
| 6        | Cover source choice                      | P1                | Explicit valid source; no accidental auto-cover                                                      |
| 7        | Waterfall distribution assistant         | P1                | Existing order, delta preview and no overspending                                                    |
| 8        | Fill-target preview                      | P1                | Exact shortfall, cancel zero writes                                                                  |
| 9        | Goal create/edit                         | P4                | Start month/current target and dirty guard                                                           |
| 10       | Planned event create/edit                | P2                | Explicit date, isolated preview/Undo                                                                 |
| 11       | Recurring payment/version/pause/end      | P3                | Schedule/version identity and guarded mutations                                                      |
| 12       | Income detail                            | P1 / P3           | Budget versus expected/received scope explicit                                                       |
| 13       | Link occurrence booking                  | P3                | Source identity, no duplicate actual receipt                                                         |
| 14       | Booking create/edit and protected delete | K4                | All shared split/status/draft/lock states                                                            |
| 15       | Bulk booking deletion preview            | K3                | Confirmed dependency-aware group and Undo                                                            |
| 16       | Account create                           | K1 / E2 / Z2      | Valid type/date/currency and explicit opening balance                                                |
| 17       | Account edit/close                       | E2                | Separate destructive confirmation, retained history/reopen                                           |
| 18       | Account reconciliation                   | K2                | Exact difference and current lock/adjustment rules                                                   |
| 19       | Manual investment value                  | K2 / V2           | Dated provenance, existing valuation writer and Undo                                                 |
| 20       | Contact create/rename                    | E0 / E2           | Relocated to Settings; ID/history retained                                                           |
| 21       | Contact write-off                        | R4                | Renamed/narrowed to debt forgiveness, gift shortfall, cash unchanged                                 |
| 22       | Standalone contact repayment form        | K4 / R4           | Explicit owner replacement: normal booking allocation; retire standalone UI only after path verified |
| 23       | Contact source-booking opener            | R4                | Exact source, retained closed history, no write on open                                              |
| 24       | Assignment-rule editor                   | E3 / K5           | Current history test, precedence and explicit rule save                                              |
| 25       | Rule threshold editor                    | E3                | Existing disabled states/params and protected semantics                                              |
| 26       | Bank candidate acceptance                | K5                | Eligibility/ambiguity/transfer/duplicate guards                                                      |
| 27       | Bulk bank preview                        | K5                | Exact affected count, excluded unsafe rows, atomic apply/Undo                                        |
| 28       | Savings execution review                 | V3 / K5           | Actual execution fields, one per instrument/account/month                                            |
| 29       | Instrument metadata                      | V2                | Existing currencies/exposure/version references                                                      |
| 30       | Quote entry                              | V2                | Explicit source/date, no fabricated fallback                                                         |
| 31       | Trade create/edit/delete                 | V2                | Current cost/fee/tax/position guards and audit/Undo                                                  |
| 32       | Savings schedule create/edit/end         | V3                | Dated rate versions/native currency and guarded end                                                  |
| 33       | Target/stage editor                      | E5                | Single settings editor; dated targets/10000bp/Undo                                                   |
| 34       | Loan rate change                         | V4                | Effective date/terms and model versus fact                                                           |
| 35       | Loan scenario create/edit/delete         | V4                | Base revision, no cash write on preview                                                              |
| 36       | Payslip review/edit/upload               | R9                | Deterministic manual/automatic-path distinction and atomic links                                     |
| 37       | Issued card statement review/settlement  | K2 / K5 / R9      | Retain issued amount, existing purchase/bonus distinction, receipt links/idempotency                 |
| 38       | Offline queue sheet                      | K4 / Z1           | Existing auth epoch, retry/error/edit/delete protections                                             |
| 39       | Global search palette                    | S3                | Former names, all report IDs/actions, keyboard/phone entry                                           |
| 40       | Keyboard shortcut help                   | S3                | Working capture/search/privacy shortcuts and focus return                                            |
| 41       | PDF preview                              | K2 / R9 / V2      | Retained document identity/privacy and fallback download                                             |
| 42       | Explanation popover/dialog               | H2 / P1 / R2 / R3 | Same query/scope/source and accessible focus                                                         |
| 43       | PWA update/session banner                | S1 / K4 / Z1      | No lost draft on reload/login; real version/permission state                                         |
| 44       | New recovery-code reveal                 | E6 / Z2           | Issued codes only, no log/screenshot leaks, existing auth restrictions                               |

Each owning PR cites the source audit entry, its new in-app home and its confirmation/Undo/archive/dirty protection. Existing destructive security actions (remove key, revoke sessions, logout, regenerate recovery codes, forget document password, delete local queue entry) keep their actual irreversible aspects explicit; do not fabricate Undo for security operations that intentionally lack it.

### 8.6 Storage, history and transient state

The supplied audit identifies 19 storage keys plus history.state and local React state. The following **19 review groups** consolidate that wider state inventory; they are not a new assertion that every row corresponds to one of the 19 keys.

| Review group                                               | Owner                    | Required treatment                                                                  |
| ---------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------- |
| Sidebar collapsed/width; account tree groups               | S3 / K1                  | Keep preference; do not expose settings as sixth area                               |
| Heute pinned categories and more-detail preference         | H1                       | Preserve existing preference and actual data scope                                  |
| Heute period/balance preference                            | H1 / T2                  | Keep payday projection preference distinct from fixed cash-card horizon             |
| Plan overview and month span                               | P1                       | Preserve preference, same month query and category selection                        |
| Account chart open and upcoming register state             | K2 / K3                  | Keep current details and meaningful empty state                                     |
| Capture memory                                             | K4                       | Preserve allowed account/payee/category defaults; no invented receipt/status        |
| Reconcile category per account                             | K2                       | Retain valid default and existing guard                                             |
| Liquidity horizon/levers                                   | P5                       | URL is explicit and validated; old preference fallback remains compatible           |
| Report-section disclosure                                  | R2                       | Stable section ID instead of positional index                                       |
| Old local Explorer views and server saved views            | R6                       | Preserve migration/retry; never repurpose saved IDs                                 |
| Recent reports/session selections                          | R1 / S3                  | Retain actual IDs and former aliases                                                |
| PWA persistence request marker                             | Z1                       | Preserve existing storage permission semantics                                      |
| Offline-read epoch                                         | T2 / K4 / Z1             | Never widen authorisation on offline/error/flag change                              |
| Sensitive local-data cleanup                               | E6 / Z1                  | Logout clears protected financial cache under current contract                      |
| History-state back-origin markers                          | S3 and every owner slice | Keep valid return semantics; new filters are shareable and validated                |
| Plan inspector/selection/restored detail state             | P1                       | Restore same context; discard/retain unsaved edits explicitly                       |
| Payment view/kind/horizon formerly in history.state        | P3                       | Adopt validated URL params, preserve compatible old links                           |
| Report/wealth/debt/freedom view and assumptions            | V1–V4 / R2–R11           | Keep source date, valid URL state and changed-basis warning                         |
| Forms, selection, drafts, document reviews and queue items | K2–K5 / E1–E7 / R9 / Z2  | No silent draft loss or financial mutation from reopening; preserve auth boundaries |

Retain genuine preferences in existing storage. Shareable view/period/filter state belongs in validated URLs; ordinary filter typing replaces history, opening a page/entity pushes it. Unsaved writes stay guarded drafts, not URL financial payloads. Do not persist passwords, raw private source data or new sensitive caches as a convenience. Existing logout/offline-epoch protections apply equally in both flag states.

## 9. Moonshot phases 1–6 and first-eight-week packages A–E

The area order is the adoption order for existing capability; the six Moonshot phases describe new capability and proof. They are two axes, not permission to defer critical wealth/report definitions until Phase 4 or basic states until the end.

| Moonshot phase / original planning window | Concrete work in this plan                                                                                                                                                                                  | Gate to advance                                                                                                                                                                                |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — Trust, Nov–Dec 2026                   | T0–T6; conditional T7; S1–S3; H1/H2. Restore Finanz-Check and expose all existing working report entries/search early, even while bodies retain old layouts.                                                | Literal same-scope numeric proof, canonical concepts, safe flag/nav and one real read-only explanation flow accepted by owner. No broad redesign acceptance before it.                         |
| 2 — Core routines, Jan–Feb 2027           | P1–P6, K1–K5: existing year/payments/goals/forecast UI is retained/adopted here, without adding a new scenario engine.                                                                                      | Complete synthetic capture → review → assign → close/recover routine on desktop/phone; physical-device task timing recorded separately.                                                        |
| 3 — Forecast, Mar–Apr 2027                | M3-1/M3-2/M3-3 add bounded timeline/scenario comparison/backtest after core routines. They can proceed while disjoint wealth/report presentation is prepared, respecting the two-builder/shared-file limit. | Reproducible scenarios, isolated facts/assumptions, explicit apply, honest historical coverage and usefulness against baseline.                                                                |
| 4 — Long-term connection, May–Jun 2027    | V1–V4 → E0/R1–R11 → E1–E7 → Z1/Z2 and G1 as readiness permits; M4-1 extends contribution explanation.                                                                                                       | All old views still reachable, complete scope-correct wealth/report explanations, private optional setup and complete owner acceptance for the candidate. Existing Gate 3 remains independent. |
| 5 — Assistance, Jul–Aug 2027              | M5-1 then M5-2, only after stable explainable query contracts.                                                                                                                                              | No unproven amount or hidden write; versioned ≥100-case catalogue; explicit model/data decision for any external processing.                                                                   |
| 6 — Proven daily use, Sep–Oct 2027        | M6-1: two month changes, quarter review, source/backup/auth recovery and timings on actual devices.                                                                                                         | Explicit personal financial/device/operating acceptance; only Gate 4 permits final cut-over from prior tools.                                                                                  |

These windows are inherited planning targets, not promised deadlines or measured effort. Fifty slice slots do not imply fifty weeks or simultaneous development. The lead orders work by verified dependency and review readiness. A delayed personal/source/contract acceptance is recorded against the affected item, while independent work continues.

### Section 8 of MOONSHOT — packages A–E in the first eight weeks

| Package                                   | Concrete slices / result                                                      | Boundary / exit                                                                                              |
| ----------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| A: decisions and reference cases          | T1, accepted inventory, route/report/state parity tables and fixture manifest | No new money rule; missing requirements exposed as specific contracts                                        |
| B: source and numbers                     | T2–T5, T7 proposal, N4/N5/N7 explicit cases                                   | Diagnose before correction; protected changes separately approved                                            |
| C: tokens and shared UI                   | S1/S2, role-mapped components and both flag/theme modes                       | No global CSS overwrite or second component/finance system                                                   |
| D: navigation and complete report entries | T6/S3, current report bodies/search; R1's final catalog when ready            | All destinations work; preserve current fallback capability until final migration; no premature body rewrite |
| E: one complete Heute flow                | H1/H2, using canonical reads and real source detail                           | Read-only lead → explanation → source → same return; correct data and owner comprehension                    |

Suggested focus: weeks 1–2 A/B diagnostics, weeks 3–4 C plus T6, weeks 5–6 D, weeks 7–8 E. The red CI and protected approval gates may change this timing; no automatic calendar-based merge or milestone “done”. At eight weeks the owner reviews search effort/understanding, numeric trust and state handling before increasing scenario breadth.

### Later Moonshot slices — separately gated extensions

These seven entries are bounded planned PR/acceptance cuts, not issues created now. Their scope goes beyond reskinning existing bodies, so the named contracts/data/privacy decisions must be accepted before dispatch. Keep the existing packages/domain calculations; no new equation is inferred from the vision.

#### M3-1 — One shared read-only timeline

- **Phase / dependencies:** 3; P2–P5, K5; Phase 2 routine acceptance.
- **Owned area / reuse:** Plan timeline composes actual bookings, versioned expected payments and planned events using existing domain/date logic; distinguish facts from expectations and prevent duplicates.
- **Must-Meet:** Same event/period identity across list/chart/source drilldown; missing dates remain unknown; no writes while viewing.
- **Should-Meet:** Small existing-module composition and ordinary-UI access without a universal framework.
- **Tests:** Fixed-date ordering, overlapping schedule versions, transfer/execution de-duplication and one absent-source case.
- **Owner gate:** Owner accepts the bounded timeline contract and synthetic routine before introducing new scenarios.

#### M3-2 — Two isolated, comparable planning scenarios

- **Phase / dependencies:** 3; M3-1; approved scenario storage/apply contract.
- **Owned area / reuse:** One one-off expense plus the existing income pause; save explicit assumptions with base revision separately from ledger. Compare low point/date, free funds and existing goal effects.
- **Must-Meet:** Scenario creation never books money; changed basis invalidates/recalculates preview. An explicit apply action invokes existing guarded event/assignment writers atomically; no new budget period or formula.
- **Should-Meet:** Small existing-module composition and ordinary-UI access without a universal framework.
- **Tests:** Two literal alternatives, identical-input reproducibility, changed revision, partial failure and grouped Undo. No speculative probability band.
- **Owner gate:** Owner accepts the named scenarios and exact apply-preview contract; new assumption classes need their own later contract.

#### M3-3 — Forecast backtest and warning quality

- **Phase / dependencies:** 3; M3-2; available timestamped historical inputs.
- **Owned area / reuse:** Compare predictions with later actuals using only what was known on each forecast date; report absolute error, warning lead and false alarms against the current simple baseline.
- **Must-Meet:** No future data leakage. If historical inputs do not exist, mark the retrospective sample limited and start a minimal forward record after approval; do not manufacture history.
- **Should-Meet:** Small existing-module composition and ordinary-UI access without a universal framework.
- **Tests:** A planted future correction cannot alter an earlier forecast input; published sample counts/coverage and literal baseline example.
- **Owner gate:** Owner reviews coverage and usefulness before any statistical uncertainty display or extra forecast method.

#### M4-1 — Explain cross-area changes down to contributions

- **Phase / dependencies:** 4; V1–V4, R3/R7/R8 and Phase-4 metric contracts.
- **Owned area / reuse:** Read-only change bridge from saving/cashflow, principal, costs and market moves to current wealth and long-term goal sensitivities, using existing domain results.
- **Must-Meet:** Same scope/date/unit across headline/bridge/table; internal transfers do not create wealth. Explain any residual with missing-data provenance rather than force a balancing plug.
- **Should-Meet:** Small existing-module composition and ordinary-UI access without a universal framework.
- **Tests:** Literal contribution bridge, transfer invariance, missing valuation and same-period return convention; source drilldown retains filters.
- **Owner gate:** Owner accepts the complete change explanation; private PP Gate 3 remains separate.

#### M5-1 — Allowlisted reproducible question-to-query contracts

- **Phase / dependencies:** 5; Trust cases, complete report/source contracts, M4-1.
- **Owned area / reuse:** Initially allow only explain a difference, open an existing analysis and prepare an existing bounded scenario. A typed result contains source query, revision, scope, assumptions and literal amounts.
- **Must-Meet:** No arbitrary SQL, script execution, new calculation or financial write capability; every answer reopens the identical permitted query. Missing/ambiguous data yields a limited answer or clarification.
- **Should-Meet:** Small existing-module composition and ordinary-UI access without a universal framework.
- **Tests:** Versioned catalogue of at least 100 normal/adversarial cases, including malicious document text and absent valuations. Reject fabricated/unattributed amounts.
- **Owner gate:** Owner accepts the permitted question list and data-access boundary before any assistant UI/service.

#### M5-2 — Read-only assistance and existing priority previews

- **Phase / dependencies:** 5; M5-1; separate model/data choice if an external model is desired.
- **Owned area / reuse:** UI explains a permitted result and optionally prepares a waterfall allocation preview from existing user priorities. Ordinary UI remains fully usable without assistance.
- **Must-Meet:** Text never grants a write. Only existing explicit audited UI confirmation applies a proposal. No private finance data is sent externally without a separate explicit selection/consent; no provider integration is assumed.
- **Should-Meet:** Small existing-module composition and ordinary-UI access without a universal framework.
- **Tests:** The same 100-case catalogue plus assistant outage, altered base revision, source injection, no hidden write/export and ordinary-UI fallback.
- **Owner gate:** Owner accepts sources/privacy/failure behaviour; external processing remains separately approved, not implied by STOP 2.

#### M6-1 — Prove real routines and operations

- **Phase / dependencies:** 6; G1 and accepted future slices actually delivered; existing personal gates.
- **Owned area / reuse:** Evidence-only closing work for two month changes and one quarterly review, source failure/reconnect, export, passkey/recovery and isolated encrypted-backup restore.
- **Must-Meet:** Physical devices and owner sign-off for actual timings; cent parity where applicable; all unexplained differences remain open. No automatic retirement of existing tools.
- **Should-Meet:** Small existing-module composition and ordinary-UI access without a universal framework.
- **Tests:** Ten repeated five-second understanding/ten-second capture tasks, defined-load weekly routine ≤10 min and month close ≤30 min; source-run success/partial-failure counts; restoration integrity.
- **Owner gate:** Only explicit Gate 4 acceptance permits final cut-over; publication/multi-user features remain a separate project.

## 10. Builder briefing, CALM and IN-APP checklists

Current queue policy permits at most **two implementation packages plus an independent reviewer**, which is within the owner's requested 2–3 builder maximum. No third infrastructure implementation lane, unbounded swarm or unattended queue loop. Assign a concrete model/execution path from available tools; ordinary scoped implementation can use Sol, complex diagnosis a suitable higher-capability lead, independent finance/security review a capable different agent. Do not claim a particular model/vendor was used when it was not.

Each builder receives a written briefing containing:

1. Slice ID and one complete acceptance task; linked existing/new GitHub issue after Phase C reconciliation.
2. Fresh base SHA, branch/worktree, exact owned files and shared-file/migration reservations; upstream dependency PRs and accepted design file/ETag.
3. Applicable owner decisions, domain/API/query contracts, literal fixture IDs, Must/Should criteria and explicit excluded behaviours.
4. Actual reused components and writers; no private source data or mockup financial values.
5. Test commands/profile, targeted screenshot spec(s), allowed technical existing-test adaptations with reasons, and any separately required protected approval.
6. The CALM and IN-APP checklists below, plus the exact owner-preview task.
7. Completion freeze: final head/diff, commands/results, actual screenshots, open gaps, review request. Builder stops without merging, deploying, closing issues or modifying another writer's files.

The supplied task names CALM without expanding the acronym. This plan operationalises it as the following project review checklist, rather than attributing an invented formal definition to an external source:

**CALM**

- [ ] One primary financial question and clear lead; next useful action visible.
- [ ] Quiet hierarchy and no repeated equal-weight KPI/card wall or duplicate primary action.
- [ ] Approved semantic colours with icon/text; historical change and present warning remain distinct.
- [ ] Details progressively reveal source/assumption/quality; essential work or a missing-data reason is not hidden.
- [ ] Existing Blueprint roles, type, chart line grammar and accessible controls; no raw mockup CSS/runtime copy.

**IN-APP**

- [ ] Verified in the real running synthetic application, including ordinary in-app navigation and direct old link, not only a canvas/story/screenshot.
- [ ] Real query values, source/detail/return path, appropriate period and privacy mode.
- [ ] Every visible action works or shows an honest actionable error; no decorative fake control.
- [ ] Preview/cancel, save, conflict, interrupted session/network, duplicate submit and Undo where applicable.
- [ ] Same-context refetch, missing data, empty, offline and partial failure; no stale mixed-month amounts.
- [ ] Desktop/phone, both themes, keyboard/focus, 44px product target, 320px/large text and chart table alternative.
- [ ] Native WebKit/Windows/physical-device evidence wherever the criterion actually requires it.
- [ ] Required final-head tests and independent review recorded; builder makes no “live/complete” claim.

## 11. Risks, protected contracts and release blockers

| Risk / known gap                                 | Impact                                                                 | Owner and mitigation / gate                                                                                                                                                             |
| ------------------------------------------------ | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing main CI failure                         | Integration on an unverified base                                      | T0 exact reproduction/root cause; unchanged oracle/timeout; fresh required green before integration                                                                                     |
| Semantic equality confused with visual parity    | Existing wrong label reproduced or new calculation diverges            | T1–T5 literal cases; display/query provenance; intentional correction expectations, not blanket snapshot replacement                                                                    |
| Signed cash/closed accounts/different debt bases | Double-counting, hidden residual or inaccurate scope                   | T3/T7 and exact net-worth chain/source disclosure; no exclusion/write-off by default                                                                                                    |
| N8 mistaken current-month comparison             | Unauthorised consumption/FIRE rule change                              | Reconcile twelve months/referenceMonth first; protected proposal if a real defect is found                                                                                              |
| Contacts merge/alias/archive backend not present | A mockup promises actions that do not exist; financial identity loss   | E0 preserves real existing actions; E2 must define and approve metadata/history/conflict/Undo semantics before implementation/migration. Missing Must actions keep that row unaccepted. |
| Backup download endpoint not established         | CSV or plaintext database misrepresented as backup; sensitive exposure | E7 bounded encrypted-artifact contract/security review; no fake button, key exposure, new destination or restore on download                                                            |
| Premature redirects                              | Lost report body, period, saved view or old action                     | Atomic body+validator/alias adoption, runtime literal assertions, OFF fallback, owner target acceptance before retirement                                                               |
| Shared files and old branches                    | Conflicting writers/mixed stack or lost retained work                  | Single writer per shared area; accepted branch dispositions; compare owned residuals and fresh issue status                                                                             |
| Flag or global-token leakage                     | Production changes despite OFF, inconsistent builds                    | S1/S2 both build variants and scoped styles; production config guard; no runtime user override                                                                                          |
| BUDGET_TODAY in hosted production-mode preview   | Server refuses startup or tests weaken safety                          | Keep production guard; deterministic fixtures only on isolated non-production verification servers                                                                                      |
| Document automation/cash/status/locks            | Accidental financial or security contract regression                   | Preserve latest SPEC path exceptions, existing writers and literal API/native tests; no “layout-only” exemption                                                                         |
| Overlarge PR after reuse assessment              | Review becomes unreliable                                              | Pre-dispatch split by owned report view/metadata contract, retain complete criteria and dependencies; no mixed area branch                                                              |
| Late states/onboarding                           | Attractive happy path with broken daily routine                        | Every area's first PR includes states/guards; Z1 covers complete cross-area parity; new private guide optional and idempotent                                                           |
| Physical-device/PP/YNAB evidence still open      | False product acceptance/cut-over claim                                | Keep #310/#354–358 and specific source/device criteria open until actually verified                                                                                                     |
| Later assistant/data backtest uncertainty        | Fabricated explanation or retrospective data leakage                   | M3/M5 typed provenance, no future leakage, bounded catalogue/privacy gate and normal-UI fallback                                                                                        |

### Specific approvals that remain distinct

- **STOP 2:** accepted on 2026-10-30. The owner also explicitly authorised Phase C and implementation in branches/PRs. Production merges, releases and real-data changes still require a separate OK.
- **N1 display:** T7 is a concrete display-only proposal; record explicit approval of that scope before implementing it. **N1 financial correction is excluded**, with a separate backed-up, dry-run and source-reconciled proposal if ever needed.
- **Protected financial/security changes:** a specific change to formula, posting, source policy, lock/Undo/auth or existing financial oracle requires a named approved contract. Neither D8 display alignment nor a beautiful frame grants that.
- **Contact metadata and backup access:** E2/E7 first produce the bounded missing contract and independent review; any migration, protected identity/security change or credentials need the specific existing approval gate. This work can be prepared without touching production.
- **Release:** owner approves candidate SHA, flag activation and rollout separately after actual preview acceptance; use only the existing integration/release process.
- **Private operations/external sharing:** real financial correction, credentials, bank consent, destructive restore and external AI data sharing each keep their specific approval boundaries.

These are not reasons to ask the owner to reconfirm D1–D6, D8, five-area navigation, report ordering, contacts placement or private optional onboarding planning. Those decisions are settled.

## 12. Phase C conversion and STOP 2 handoff

The owner approved the plan, Phase C and implementation in branches/PRs on 2026-10-30. Execute within that grant:

1. Re-read current main/health/CI, Project 1 items and any active writers. Revalidate affected design ETags and retained source branches; do not reset another checkout or start a competing merge chain.
2. For each actual PR boundary, reuse the matching open issue where acceptance/file scope align; otherwise create one small issue in Project 1. Use the planning ID as traceability, add risk/area/size and dependencies, and copy the slice's Must/Should/tests/owner-preview case plus section-6 common gates.
3. Distinguish a completed existing criterion, a new redesign criterion and a personal/protected blocked criterion. Do not duplicate #487/#477/#563/#741/#762/#818 or close parents because children merged. Split oversized E2/R3 before creating their executable issues, with explicit owned contracts/views and inherited full acceptance.
4. Record ticket → planning slice → branch/head → independent review → CI → preview acceptance → authorised release revision in one compact coordination entry. Local PROGRESS is a checkpoint, not a replacement board.
5. Implementation in branches/PRs is authorised: dispatch ready, owned boundaries through the current queue process. Do not clear STOP files, change production settings, merge production branches or publish without the separate applicable approval. Preserve protected contract/migration gates and independent review.
6. In PRs use Refs #N, not automatic Closes. Only exact released revision plus all acceptance criteria allow Live/queue:complete/closure. Partial delivery and real-device/private acceptance remain visibly open.

**Accepted STOP 2 deliverable:** this plan, its 50 current planning slices (56 Phase C boundaries), seven gated Moonshot extensions, all 54 baseline route mappings, 16 reports, 23 existing aliases, seven panels, eight URL-dialog states and 44 local workflow homes. There is still **0/54 implemented/owner-accepted/released by this planning session**. None of the proposed tests, feature flags, routes, migrations or interfaces has been implemented here.

The requested STOP 2 response was received and accepted. Continue Phase C and branch/PR implementation; keep production OFF and all protected approvals separate. No GitHub issue, PR, comment/message to another person, design write, merge, deployment or financial data change was performed in Phase B.
