# Roadmap

### #731 — punctuation-capable shared date entry (2026-10-20)

- [x] Request a text keyboard for shared German date fields. Preserve partial editing, German/ISO conversion, calendar validity, limits and all financial actions.
- [x] The new keyboard-hint regression first fails against the unchanged numeric hint. After the one-line correction, ten focused tests pass, including both unchanged shared-date tests and seven wealth-stage cases; UI/Web types, affected lint and formatting pass. The coordinator adapts only the obsolete wealth-stage keyboard-hint expectation under the owner's decided-UI policy.
- [x] Canonical WebKit passes four cases (one new phone flow and three setup cases), with no failures, skips, retries or flaky results. Sequential dotted input, validity, Tab, 44px date control and unchanged target versions/no writes are verified. [Unedited capture and scope](evidence/shared-date-keyboard-731/README.md); browser emulation does not certify a physical iPhone keyboard.
- [x] `BUDGET_REQUIRE_AGE=1 npm run check` passes 570 files / 5,076 tests with one worker; the normal production build also passes.
- [ ] Complete exact-head CI and serial live delivery.

### #526 — edit wealth stages together (2026-10-20)

- [x] Replace the stage selector with an editable stage-by-asset-class table, retaining dated versions, per-row validation, account scope, custom bands, unmanaged targets and the existing audited save path. Phones show one card per stage.
- [x] Seven new focused component tests pass after independently splitting the draft-status case and removing redundant input updates/queries from the custom-band case; both CI timeouts remain documented and time limits remain unchanged. Canonical WebKit passes eleven tests, including the unchanged financial assertions in the coordinator-adapted existing tests: seven-by-six desktop fit, phone layout, 44px grid controls, keyboard, Axe in both themes, dated save, real Undo and stale-scope conflict. [Actual captures and qualifications](evidence/wealth-stage-table-526/README.md).
- [x] Required-age single-worker full check passes 569 files / 5,074 tests and the normal production build passes; all 3,574 frozen source files and guard checks remain unchanged. This result precedes the subsequent new-test-only CI correction; its focused tests, Web types, lint and formatting pass. Product and browser-evidence bytes remain unchanged.
- [x] Exact-head CI and serial live delivery verified at `dcc93c52ae5b7a459c04fc685bb1f05a8968e186`; Main CI, Deploy, fresh health and the complete reviewed Git tree match. Two unchanged older bank-inbox tests passed one unchanged failed-job retry.
- [ ] Resolve the inherited shared-date keyboard limitation in #731 before closing #526.

### #625 — four fixed Explorer report templates (2026-10-19)

- [x] Add Heatmap Ausgaben, Jahresansicht, Gesamttabelle and Kategorie im Verlauf beside saved views, reusing canonical aggregation, the shared report period/header and per-row heat. Monetary cell drilldown preserves exact classified source shares, booking identity and reloadable selection; existing saved-query/custom CSV behavior remains available.
- [x] Independently reviewed literal domain/API/UI proofs pass five files / 24 focused tests; affected Web types and changed-test lint/format pass. The sole existing #627 test adaptation is coordinator-authored router setup only, with all four original test bodies and financial/race/CSV oracles unchanged.
- [x] Actual clean runtime `90da8fa9`, including verified live Main `3427d925`: fresh E2E build passes; genuine WebKit retry passes 12/12 (nine feature plus three setup), both themes at configured phone 390×664 and true desktop 1440×900. All 14 owned / 3,379 tracked / 12 protected source hashes and all 167 reused compiled files remain exact. Initial pre-collection ENOSPC and the separately verified storage repair are preserved; [16 original images and safe profile proof](evidence/explorer-templates-625/README.md) qualify touch, fixed-navigation and full-page capture limits.
- [x] At clean evidence checkpoint `3c26f42b`, including verified live Main `3427d925`, the required-age two-worker full check passes 534 files / 4,676 tests (Vitest 410.52s), followed by the separate normal production build. Check/build/wrapper/guards exit zero; all 33 owned / 3,397 tracked hashes, 12 protected files, HEAD, file set and clean status remain exact. Product/test bytes and all 16 native PNGs are unchanged from the actual browser source; this result precedes only the README/own-Roadmap result update.
- [x] Repair the observed canonical Chromium156 mobile NAV hit by moving the same close control/callback into the local source header. Corrected genuine WebKit passes12/12;16 original unforced mouse-close flows/48 trusted inputs clear URL selection and panel, with44px/nav-clear geometry at input. Four separate real-keyboard open-header images and safe proof supplement the immutable original16 table images. Initial5/7 premature NEW-guard result and one-file counter-wrapper1 remain qualified.
- [x] At reviewed repaired-source freeze63bf6772 (HEAD67212, four modified source files), required-age two-worker full check passes534files/4682tests392.88s and normal production0; all3397/33owned/12protected hashes, permission bits/index and HEAD remain unchanged. Root first preguard wrapper1 ran no application checks; corrected second runner all0. Historical534/4676 above remains separately qualified.
- [ ] Complete final delivery-delta review, exact-head canonical Chromium CI and coordinator integration/public-live verification. Keep #625 open; legacy-report removal #487 and generic chart switching #626 remain separate.

### #509 — complete public reference-case assurance (2026-10-19)

- [x] Complete the public CASE-001–007 inventory with independent literal cents/raw units across domain, real repositories and API: cash/card carry, full/partial card reserves, signed splits, transfer-scope classification and existing purchase/dividend conventions. The retained eight comparison cases and all existing tests remain unchanged; production formulas and write policy are untouched.
- [x] Prove actual second-transfer-INSERT rollback after the first leg was reached, both-leg grouped undo with append-only audit identity, linked trade settlement undo/redo, dated pending exclusion and reconciliation locks. Reuse existing missing-debt-term proofs rather than inventing calculations ([public matrix](evidence/reference-adoption/wp-001-public-acceptance-509.md)).
- [x] Three new suites pass 26 focused cases; all workspace types and lint pass. Actual native WebKit passes 5/5, including three setup cases plus desktop 1440 and phone 390 walkthroughs of drilldown, privacy, invalid-split blocking and grouped undo. Both themes pass strict Axe/overflow; four exact original PNGs and two safe profile proofs are independently reviewed with explicit toast/navigation capture limits.
- [x] At frozen `aa98c7ae`, based on live Main713 `bf11eebd`, `BUDGET_REQUIRE_AGE=1 VITEST_MAX_WORKERS=2 npm run check` passes 526 files / 4,607 tests (Vitest 407.16s) and the separate normal production build passes. All 16 owned and all 3,340 tracked hashes, HEAD and clean status stay exact; this result precedes the following documentation-only update.
- [ ] Final delivery-delta review, exact-head canonical Chromium CI, controlled integration/deployment and public-live verification. Keep #509 open until all public acceptance gates pass; #690 remains open until the combined delivery is live. Private holdings/returns/month-end #355/#356/#357 stay separate and open; no Gate3/Gate4 or owner acceptance is claimed.

### Plan single-category bands — #481 (2026-10-19)

- [x] Owner decision 7A combines single-category groups and multi-category group heads with their first category in the single-month Groups view. Group totals and category figures remain distinct; collapse/focus, selection, inspector and inline + remain available. Existing cent calculations, APIs and write/undo callbacks are unchanged.
- [x] Current synthetic sample: 55 → 36 logical content rows, 34.55% fewer against the owner-approved 55-row main baseline; all 36 categories and 19 group contexts remain. Actual physical table heights 1746.625px at 1440×900 and 3842.25px at 390×664 are separate, with no physical-height percentage claim.
- [x] Actual frozen `218679c8`: fresh E2E build and canonical WebKit 15/15 pass, including retained 768/1180/1439 regressions, strict seven-width/two-theme page/role bounds and genuine existing right-edge scrolling/focus. Four current desktop/phone light/dark images and safe proof are [recorded and independently reviewed](evidence/plan-single-category-481/README.md); known fixed-navigation/FAB hit-test limits remain explicit.
- [x] Final clean normal-main merge `908e090c` includes verified live `bf11eebd`. Required-age two-worker check passes 519 files / 4573 tests, then normal production build passes; all 29 frozen plus 3337 tracked-file hashes, HEAD and clean status remain exact. Own product/test bytes remain exact `218679c8` through the mechanical main refresh; native evidence is qualified to its actual runtime head.
- [x] All nine existing-test adaptations were applied only by the coordinator under named owner decisions and independently reviewed, retaining financial oracles and original size budgets. Independent Codex whole-diff, geometry-policy, runtime/visual and mechanical-merge reviews are clear under [owner model authorization #694](https://github.com/Grabman1987/budget/issues/694).
- [ ] Complete exact-head Chromium desktop/mobile CI, affected-caller compatibility and final coordinator delivery review; local source/full evidence is not a remote-CI claim.
- [ ] Complete serial integration and deployed-revision verification. #481 remains open until every acceptance criterion is live; old queue loops remain disabled.

### #632 — pending and confirmed account-register proof (2026-10-19)

- [x] Audit the existing account register, then add only a dedicated isolated-ledger regression: one pending and one confirmed booking in A, plus a pending B sentinel. Literal balances are 98,199 and 49,110 cents; no product calculation or status rule changes.
- [x] Prove distinct rows, global-status-filter/account isolation and reload, unchanged raw booking/split/audit data during display, the separate planned #579 occurrence, and explicit existing confirmation/undo with exact amounts and audit linkage.
- [x] Final actual phone WebKit passes 4/4 including three setup cases, both themes, strict Axe, overflow and 44px targets. Two genuine register viewports and safe actual JSON are independently reviewed; account header remains above the photographed viewport ([evidence](evidence/account-pending-632/README.md)).
- [x] At frozen `8918df7c`, the age-required two-worker full check passes 514 files / 4,552 tests and the normal production build passes; all 3,307 tracked hashes, HEAD and clean status remain unchanged. This result precedes the following documentation-only update.
- [ ] Canonical desktop 1440 / Chromium mobile 390 execution, exact-head CI, controlled integration/live verification and remaining issue acceptance gates. Do not close #632 from local phone/unit evidence alone.

### #627 — CSV of the validated current Explorer table (2026-10-19)

- [x] Add a read-only authenticated filtered CSV using the existing validated pivot, raw integer units, supplied footer/truncation metadata, safe text encoding and explicit empty marker. Compare the server recomputation with the displayed result before creating a file; changed data retains the view and offers reload.
- [x] Literal projection/API/client/DOM checks and unchanged report/export neighbors pass seven files / 55 tests; the later identical-body relative-period fix passes three affected files / 17 tests. Download filenames identify the validated effective window. Existing tests and financial write paths remain unchanged ([evidence](evidence/reference-adoption/wp-009-explorer-csv-627.md)).
- [x] Corrected actual WebKit composition passes 8/8, including all unchanged #624 cases and the complete CSV race/reload/retry. The initial 7/8 fixture-400 failure remains documented; only its required discriminator was corrected.
- [x] Final genuine document-top capture passes 5/5, with four actual light/dark desktop/phone PNGs and safe geometry/focus evidence. Skip-link overlay is absent without CSS, hiding or focus mutation; root and independent review clear the new CSV visual scope. No whole-application or physical-device acceptance is implied.
- [x] Independent HIGH source/security review and effective-window correction passed, including thirty new tests and independent literal/adversarial probes.
- [x] At the reviewed 17-file candidate based on `74abab0`, the age-required two-worker full check passes 505 files / 4,507 tests and the normal production build passes. All candidate hashes remain unchanged after both commands; the following delivery update changes only these status documents.
- [ ] Complete final evidence-delta review, exact-head CI and serial live verification. Templates, charts, hub integration and full export remain separate; do not close #627 or its parent from local checks.

### #615 — shared Freiheit / R16 investment basis (2026-10-19)

- [x] Current and historical Freiheit, R16 and Allokation use the same selected Anlagebasis; the page explains retrospective current membership. Existing R16 formulas, source money, locks and undo remain unchanged.
- [x] Independent HIGH whole-diff review and literal scope-save/undo regressions passed. At candidate `1f8fad2`, the age-required full check passed 487 files / 4,401 tests and the production build passed; actual phone/1440px desktop WebKit passed 5/5 selected tests with both-theme Axe and overflow checks ([evidence](evidence/reference-adoption/wp-010-freedom-universe-615.md)).
- [ ] Exact-head remote CI, serial integration and live verification remain required. Historical Ist chart (#616), personal goals/assumptions (#617), parent and private acceptance gates remain separate.

### #677 — first-booking register refresh (2026-10-19)

- [x] Cancel pre-write booking reads before scheduling ledger invalidation so a pending initial empty response cannot satisfy the refresh after the first capture.
- [x] Deterministic register regression covers out-of-order empty/fresh responses, nonblocking save completion and undo; existing nonblocking edit and cache tests remain unchanged and pass.
- [ ] Exact-head CI, `ledger.spec.ts:217` with `--repeat-each=5`, controlled integration and live verification remain required. Do not close #677 from unit evidence alone.

### WP-001 — CASE-001 reference assurance, first bounded slice (#509, 2026-10-17)

- [x] Inventory existing CASE-001–007 domain/repository tests; document coverage, boundary and missing API proof in `docs/evidence/reference-adoption/wp-001-case-audit-2026-10-17.md`.
- [x] Add exact-cent domain and DB CASE-001 regressions (11,499-cent available, account balance independent of assignment, 10,000 cents moving from to-be-assigned into the envelope, real October to November rollover).
- [x] Focused tests run locally: `npx vitest run packages/db/src/repos/ledger-rules.test.ts packages/domain/src/ledger/envelope.test.ts` — 2 files, 23 tests passed (includes the CASE-001 database test with before/after assignment cash and the month-rollover variant); eslint and prettier clean on the changed test file.
- [ ] Full `npm run check` and PR CI at the exact branch head; no successful run claimed yet.
- [ ] Add missing API evidence for CASE-001 and split subsequent CASE-002–005 gaps into separately reviewable tasks.
- [ ] Complete independent review, controlled merge/deploy and private owner acceptance. Do not close #509 from this slice.

### NAV3 — FAB, sidebar footer and detail focus/back paths, #468 part B2 (2026-10-17)

- [x] Phone capture stays on every page, hides down and returns up without animation; existing safe-area/FAB bottom clearance retained. Desktop capture unchanged.
- [x] One sidebar profile/settings link with adjacent persisted theme toggle and announced dark state; collapsed sidebar retained.
- [x] Programmatic detail headings have no outline; interactive keyboard targets retain 2 px focus. Each touched detail name and contextual return link appears once; area registers retained.
- [x] Category, account/depot, contact, goal, envelope, income/payment and Heute dimension details reviewed; no data, API, financial, router-path or write/undo changes.
- [x] Focused units: 6 files / 12 tests; CSS scale: 0 violations. Browser validation includes 390 px, WebKit, light/dark Axe, return context and bounding-box clearance.
- [x] Browser regressions: 75 passed / 16 intended skips / 6 failures initially; targeted serial shell/FAB rerun 13 passed / 6 skips / 2 early Chromium focus-style reads. Final updated FAB/focus spec: 9 passed / 3 skips / 0 failures across desktop, Chromium 390 and WebKit, including light/dark Axe. The account return target was raised to 44 px; assertions remain intact.
- [x] One aggregate `npm run check` stopped on an unsupported `exact` option in the new contact unit. Fixed; separate Web typecheck and full lint passed (one existing UI warning). Complete serial unit suite: 443 files / 4,044 tests passed. E2E and production builds passed. No second aggregate run.
- [x] Git commit/push/draft PR blocked by `index.lock: Permission denied`; complete checked patch and German PR description handed off in `test-results/nav3.patch` and `test-results/nav3-pr.md` for the project lead.
- [ ] Fresh aggregate CI check, Linux snapshot refresh, actual draft PR and owner acceptance. No Windows baseline regeneration; `docs/evidence` restored and unchanged.

### NAV2 — header and search orientation, #468 part B1 (2026-10-17)

- [x] Desktop: one Prüfen pill, zero without a badge; existing amount privacy and booking action retained, overspent chip removed.
- [x] Phone: title/search/avatar, conditional linked status line to review and current-month Plan triage.
- [x] Search palette/results clear active area and show Suchen on phones; offline queue gets its own neutral status chip.
- [x] Focused units: 6 files / 75 tests. Full unit run: 439 files / 4,036 tests passed, one contact-suite import error from its old router double; after adapting only the double, the contact and two header files passed 16/16 targeted tests.
- [x] Browser regressions: 130 passed / 14 existing skips / 2 WebKit timeouts; both affected cases passed a targeted serial rerun (5/5 including setup). All 12 new header cases passed across desktop, Chromium 390 and WebKit; light/dark Axe, 44px targets and overflow passed.
- [x] One final `npm run check`: all typechecks passed, stopped at CSS formatting before units. Formatting corrected; separate full lint passed (one existing UI warning), CSS scale has 0 violations, E2E and production builds passed. No second aggregate run.
- [ ] Fresh aggregate CI check and Linux header snapshot refresh; no Windows baseline regeneration.
- [ ] Draft PR/CI and owner acceptance. Part B2 retains FAB behavior, sidebar footer, focus rings and back paths.

### NAV1 — area registers, #468 part A (2026-10-17)

- [x] Short Plan/Konten registers, Plan › Prognose reusing the liquidity page, Konten › Prüfen and legacy URL redirects preserving search parameters.
- [x] Internal links/search and minimal sitemap/glossary updates; phone register spacing retains the shared underline and scroll fade.
- [x] Focused verification: 7 unit files / 85 tests; 12 browser cases including setup across desktop, Chromium 390 and WebKit iPhone; production and E2E builds. No Windows baseline regeneration.
- [x] One final `npm run check` with one Vitest worker: 438 files / 4,027 tests passed; all workspace typechecks and formatting passed. Existing unused-disable warning in locked `packages/ui` remains.
- [ ] Linux snapshot refresh in CI where register labels changed.
- [ ] Draft PR/CI and owner acceptance. Header, FAB, sidebar and focus remain part B; page content remains #477.

### DS3: line, bar, radius and shadow ladders — #474 (2026-10-16)

- [x] Document the line ladder, 4/8/12 radii and one-layer card shadow in DESIGN.md; regenerate tokens.
- [x] Migrate structural/chart strokes, thin progress/stacked bars and card ghost borders while retaining focus and touch geometry.
- [x] Restrict plotter motion to the first chart per page on its first session visit, with storage-denial fallback and regression coverage.
- [x] Extend CSS scale checks for border widths and exact active-register exceptions.
- [x] Run the full check: typechecks/lint/format pass; 4,010 tests pass initially, one formatter assertion and three setup failures pass in isolated reruns (45 tests). Final UI run: 146 tests pass.
- [x] Verify the four focused browser files on desktop/mobile/WebKit: 55 pass, three capture failures and one intentional skip; all seven selected serial capture rerun cases pass. Plan geometry, 44px targets, overflow and light/dark Axe pass on all three projects. Windows Linux-baseline comparisons remain skipped by the existing helper.
- [ ] Green CI and Linux snapshot refresh; Windows baselines remain unchanged.

### DS2: binding type scale — #473 (2026-10-16)

- [x] Record owner decision 2B as T1–T12 in DESIGN.md; generate desktop/phone size and line-height tokens, with a restricted T12 role.
- [x] Migrate all CSS font sizes (wealth included); enforce declared type tokens in longhand and shorthand while retaining radius checks.
- [x] Cover literal rejection, valid tokens, T12 selectors, and responsive generation with focused tests.
- [x] Inspect desktop 1440 / Chromium mobile 390 captures and pass the existing overflow/Axe assertions with the unchanged compiled synthetic seed (standard tsx startup is blocked by os.userInfo).
- [ ] Green CI on the PR, including the Linux snapshot refresh (never regenerated on Windows).

### K2 — depot account template (#478, owner review 2026-10-16)

- [x] Reuse Portfolio's unsplit account positions and valuation date; literal database fixture proves 2,683 cents, identical units and unavailable missing prices.
- [x] Separate Depotwert from linked settlement cash; Bestände / Trades / Verrechnung use URL state, the existing trade editor and one shared account money register.
- [x] Suppress only actual investment trade-settlement category warnings; retain ordinary warnings and existing categories. No write, lock or undo path changes.
- [x] Desktop 1440 / phone 390 / WebKit iPhone: all 12 isolated browser cases pass, including light/dark Axe, 44px targets and synthetic screenshots. [Evidence](evidence/depot-template/README.md).
- [x] Eight new regressions and 47 existing investment/account regressions pass; follow-up workspace typechecks, lint/CSS scale and E2E build verified. No Windows baseline regeneration; no depot baseline refresh needed.
- [x] Round 2: retain shared review actions/dialogs and stored check status; show integrated depot cash and its register without a second Saldo. Chromium review/trades/depot regressions and WebKit depot cases pass; unchanged verdict coverage and Main-path timeout are recorded in the [evidence](evidence/depot-template/README.md#round-2--retained-account-header-behaviour).
- [ ] Required CI green on PR [#534](https://github.com/Grabman1987/budget/pull/534). Round 1's interrupted full-check history remains in the evidence; the owner explicitly requested focused checks and CI as the gate for round 2.
- [ ] Commit/push round 2: staging is blocked by `index.lock` permission denied; owner instruction is to leave the verified changes uncommitted.

### Reference adoption: PP returns and accepted follow-ups — 2026-10-15

- [x] Record owner decisions: PP returns as standard, cross-device Explorer views, limited transfer preparation. [Contract](product/reference-adoption.md).
- [x] Synchronize the WIP branch and all 14 package issues with GitHub/Project 1 under the owner's separate 2026-10-16 request. [Execution index](product/github-backlog.md), [overview #508](https://github.com/Grabman1987/budget/issues/508). Release/private gates remain open.
- [x] Reproduce timing boundaries before changing the calculation; retain gross opposing flows and include initial buy fees.
- [x] Separate after-tax cash facts from PP security TTWROR/XIRR flows, including currency rounding; share the method across overview, reports, depot indices and allocation.
- [x] Explain timing, scope and tax basis in existing disclosure/glossary/report surfaces.
- [x] Financial regressions, workspace typechecks/lint and independent final review; [evidence](evidence/reference-adoption/README.md) distinguishes the full run from the corrected assertion's targeted verification.
- [x] Inspect rebuilt desktop/mobile reports and preserve current synthetic captures.
- [ ] Complete final WebKit glossary/wealth checks within their unchanged time limits; isolated rerun still timed out at screenshot/Axe under observed memory pressure.
- [ ] Single all-green exact-head full check and required CI before publication.
- [ ] Private PP reconciliation with identical dates, instruments, accounts, prices, FX and tax scope; Gate 3 remains open.
- [ ] Implement database-backed Explorer views, including legacy preference migration, conflict handling and undo.
- [ ] Implement the limited transfer stages with explicit pairing and conservation/rollback proof.
- [ ] Other [research work packages](product/roadmap/README.md) remain sequenced backlog, not shipped features.

## Open wealth and Figma implementation gaps — owner 2026-10-15

Implementation-ready scope, dependencies, sources and acceptance are in
[GAP01–08](product/open-gaps.md). Every item remains open; recording the work is not delivery.

- [ ] GAP08 — agree scope/measure/date and authoritative Figma matrix before wealth graph implementation (AC31).
- [ ] GAP04 — reproduce/diagnose the existing total-net-worth EUR graph's missing visibility; fix only a verified defect (AC29).
- [ ] GAP01 — compact benchmark selection/comparison, equal-period index and difference inside Vermögen; reconcile V02/V09 (AC26).
- [ ] GAP02 — actual portfolio-value EUR history, distinct from return/index basis 100 (AC27).
- [ ] GAP03 — asset-group composition and time development with explicit EUR/percentage denominators and aggregate reconciliation (AC28).
- [ ] GAP05 — reconcile Plan/settings labels, destinations and financial glossary between Figma/docs/app; preserve deep links (AC30).
- [ ] GAP06 — complete O01–O08 Figma states and ONB02–06 first-use implementation/evidence (AC24/25/31).
- [ ] GAP07 — per-frame semantic requirement → design → source → acceptance matrix; record all partial/absent states (AC31).

## Product foundation and first-use planning — 2026-10-15

- [x] Locate original requirements and document source precedence without replacing existing decisions.
- [x] Inventory current routes/features and distinguish implementation from acceptance.
- [x] Draft routine contracts and financial first-use onboarding with resume/error/empty-data cases.
- [x] Consolidate functional subrequirements, actor/state/data contracts, all reports/KPIs/rules and source/Figma/test traceability.
- [x] Define literal acceptance cases, source/offline/recovery requirements and ordered implementation work packages.
- [ ] Owner reviews DEC01–04 in the product delivery plan; existing manual categories and explicit account dates remain the baseline.
- [ ] Design and implement the agreed onboarding; collect empty/populated/interrupted-installation evidence.

Reading entry point: [Product foundation](product/README.md). This is a documentation
proposal; no new financial onboarding UI or product gate is marked delivered.

### Owner addition: asset allocation by wealth stage (2026-10-15)

- [x] Reuse explicit account/instrument universe; edit eligible accounts and cash classes together with targets in one audited, conflict-checked transaction.
- [x] Editable lower-bound wealth stages with exact-cent activation and unchanged legacy boundaries; retain one shared resolver.
- [x] Seven-stage generic template with explicit class mapping and threshold activation with a 10 % hold-down buffer (owner decision 2026-10-16); native Desktop/iPhone Figma extension.
- [x] Owner decision 2026-10-16 (threshold activation, 10 % hold-down); exact-head CI, merge #507 and live revision `20c24257` verified. See [contract](allocation-wealth-stages.md).

### CI follow-up: consistent E2E observations — #465 / #499 (2026-10-15)

- [x] Read paired report geometry in one browser turn; select exact contact options; split portfolio overview/detail while retaining every assertion and screenshot.
- [x] Node22 full check434files /3,962tests, zero skips with required age and two workers; current WebKit capture12/12and diagnostic Chromium portfolio7/7. [Evidence](evidence/e2e-layout-2026-10-15.md).
- [ ] Exact-head required CI, serial main/deployment/live proof.

### Q2: Quiet historical reports and one inbox alert — #465 (2026-10-15)

- [x] Historical negative charts/text use existing ink; debt bars use dashed outlines; shared live-warning defaults, values and geometry remain.
- [x] Read-only inbox overview aggregate includes full filtered count/deficit before pagination; individual tasks, counts, privacy and Plan triage remain.
- [x] Focused regressions and synthetic desktop/mobile/WebKit light/dark evidence: [Q2 evidence](evidence/q2/README.md).
- [x] Apply and pin the five owner-requested skill sources through scoped project profiles: [adoption evidence](evidence/skill-adoption-2026-10-15.md).
- [x] Final integration with payroll main: Node 22 full check, 434 files / 3,962 tests, zero skips; rebuilt current WebKit integration 7/7.
- [ ] Exact-head required CI, serial merge and main CI/deployment/live proof.

### Wealth composition and portfolio detail — #499 (2026-10-15)

- [x] Align signed asset/debt account bars on one proportional zero axis.
- [x] Add the Portfolio overview's daily base-100 index using shared flow-adjusted daily returns; keep unavailable returns as gaps, preserve date spacing and explain stored valuations/carried quotes.
- [x] Keep SVG axis labels legible at responsive widths and place portfolio actions below the chart. Existing monthly report index, benchmarks, class series and financial formulas remain unchanged.
- [x] Synthetic financial/model/API tests, desktop/mobile/WebKit chart and composition coverage, responsive rendered-text assertions, Axe checks and fresh evidence: [wealth #499 evidence](evidence/wealth-performance-499/README.md).
- [x] Final combined Node 22 full check: 434 files / 3,962 tests, zero skips; rebuilt current WebKit integration 7/7 including wealth coverage.
- [ ] Required CI, serial deployment/live proof and private owner financial reconciliation. This slice does not close Gate 3 or the broader K3 acceptance.

### Direct payroll review, date and sender — #499 (2026-10-15)

- [x] Implement direct wide upload review, payout date/sender/eligible expectation, and inline unknown wage-code mapping with existing formulas.
- [x] Backend focused regressions: 49 tests; atomic mapping and payout/expectation undo; existing booking metadata retained.
- [x] Final integrated Node 22 full check: 434 files / 3,955 tests, zero skips; original three-project browser matrix 12/12 plus integrated current WebKit 6/6. [Evidence](evidence/payslip-flow/README.md).
- [ ] Exact-head required CI, serial merge, main CI, automatic deployment and live revision proof.
- [ ] Original Windows Chrome pre-native-picker hang remains unproven; drag/drop is a separately tested alternative.

### Contact history and monthly payments — #499 (2026-10-15)

- [x] Balance/name share the contact detail; recorded full repayment defines retained, collapsible history.
- [x] Itemize current-month payments, recorded allocations and credit; keep older open outlays visible and preserve same-day order. No financial writes or historical edits.
- [x] Full cloud check: 433 files / 3,936 tests; desktop/mobile Chromium and WebKit iPhone flows, light/dark Axe and synthetic screenshots. [Evidence](evidence/contact-history/README.md).
- [x] PR #502 final-head checks passed; main CI 38725948953 and automatic Deploy 38728003764 succeeded. Public health returned exact merge `501f2e8f0dec06c4bfd1d5a8faeed87256b04593`; tested-head ancestry verified. [Live proof](https://github.com/Grabman1987/budget/pull/502#issuecomment-6191133572).

### Account properties — #499 (2026-10-15)

- [x] Expose existing separate settlement cash on depot/crypto create/edit; integrated cash leaves the link empty, salary selection stays in Datenquellen and cash uses its existing account type.
- [x] Validate new references and incompatible linked-account type/currency changes; preserve historical metadata, credit-card fields and audited undo.
- [x] Focused API/UI and desktop/mobile/WebKit form flows, light/dark Axe and synthetic screenshots. [Evidence](evidence/account-properties/README.md).
- [x] Full integrated Node 22 check with required age: 433 files, 3930 passed, no skips; combined browser regressions and repeated asynchronous-undo completion check.
- [x] PR #500 final-head checks, main CI 38723344839 and automatic Deploy 38725377048 passed; exact live revision `5cf4f5f145e4bb210ae7fcf089dc3f60a88493fa` and ancestry verified. [Live proof](https://github.com/Grabman1987/budget/pull/500#issuecomment-6190736401).
- [ ] Broader K2/K3 and cash import/transfer acceptance remain separate.

### Payslip upload and payout review — #499 (2026-10-15)

- [x] Preserve native chooser and accept one bounded PDF drop through existing analysis.
- [x] Select payout account, reuse matching booking or confirm a pending payout (cash confirmed); exact salary/refund split and atomic undo.
- [x] Nine synthetic chooser, drop, existing-match and payout/undo flows across Chromium desktop/mobile and WebKit iPhone; light/dark Axe and overflow checks. [Fresh cloud evidence](evidence/payslip-payout/README.md).
- [x] Full integrated cloud check with required age: 433 files, 3930 passed, no skips; typecheck/lint/format and E2E build passed. All nine payout browser scenarios passed again.
- [x] Delivered with account properties in PR #500; exact main/deploy/live proof above.
- [ ] Owner retest of the original pre-file-chooser Chrome hang; not reproduced in an isolated profile.

### Booking line model — #463 (2026-10-14)

Owner follow-up #499: new cash capture is confirmed automatically; bank capture remains pending with manual confirmation. The coherent cash change shares this delivery under the owner-approved 15.10. batching rule.

- [x] Pure percentage/fixed contact-share allocation using existing largest-remainder integer cents; draft lines map to the existing split create/patch payloads with saved metadata/order retained.
- [x] Visible head before lines on all viewports, direct date/calendar and 2:1 repetition, one suggestion rail, inline contacts/shares and exact rest/save guard.
- [x] Fresh web typecheck, E2E build and 73 affected unit tests in six files. No financial write, undo or lock boundaries changed.
- [x] 30 dialog browser/setup cases across desktop, Chromium mobile and WebKit iPhone, including five exact split/edit scenarios, keyboard/dirty guards, light/dark Axe, 44px targets and actual viewport bounds; 30 refreshed synthetic screenshots. [Evidence](evidence/booking-lines/README.md).
- [x] Broader capture/register regression run: 53 passed; two adapted save-guard/footer cases passed in a separate five-case desktop/mobile/setup run. Changed-file lint/format and CSS scale passed.
- [x] Final-head CI and Linux snapshot workflow passed without baseline changes; main CI 38711473445 and automatic Deploy 38713559449 succeeded. Public health returned exact merge `514ed362ea7cbb422c60667003a5296e76904084`; tested-head ancestry verified. #463 closed after this evidence.
- [ ] Physical-iPhone owner acceptance remains separate.

## UX DS1 — signed-value palette and colour roles (#472)

- [x] Exact owner teal/orange inks in generated light, system-dark, explicit themes and print; legacy signed-ink aliases retained.
- [x] Signed CSS amounts/series use dedicated roles; available-money/OK green and act-now red stay distinct. No layout or money logic changes.
- [x] Signed text reaches 4.5:1 on the five normal surfaces; role model and later single-hue heatmap/direct-label requirements documented in DESIGN.md.
- [x] Colour-vision guard: Machado severity 1.0, CIE Delta E 1976 ≥ 25 between plus and minus (dark protanopia 29.12 is the minimum; retired red/green 7–18). Spending views map "less spent" to plus.
- [ ] Green full check, browser acceptance and Linux CI snapshot refresh; no Windows baseline regeneration.

## UX Q1 — control and metadata contrast (#464)

- [x] Generated boundaries, secondary lines and positive dark fills meet 3:1; text and positive-button foregrounds meet 4.5:1, including print.
- [x] Tinted hover/selection metadata uses stronger ink; the full DS1 palette remains separate.
- [x] Focused desktop/mobile/WebKit, light/dark Axe and synthetic evidence verified.
- [x] Required PR CI and live revision verified: PR #496, main CI 38702486658, Deploy 38704422686, exact health/ancestor `684495d3`.

### UX Q3 — Today attention — #466 (2026-10-14)

- [x] One nonempty Zu tun block with at most four source summaries, urgent sources first, existing account review and month-close destinations, and no duplicate savings proposal list.
- [x] One nonempty Fällig 14 Tage list for recurring payments and planned one-off events; compact Finanz-Check tile and hidden empty funding notes.
- [x] Decision 3B retained; short other-month return line and explicit Stand heute labels for current-only information.
- [x] Synthetic red/green component regressions (4 files / 16 tests), changed-file lint/format/CSS scale and E2E build under the owner's scoped-check exception. [Evidence](evidence/heute-attention-q3/README.md).
- [x] Six focused desktop/Chromium-mobile/WebKit-iPhone scenarios, current/other-month light/dark Axe, 44px changed-section targets, no horizontal page overflow and synthetic evidence images.
- [x] Committed and pushed PR #494; fresh web typecheck, changed-file checks and prior required CI passed.
- [ ] Required final-head CI after current-main integration, Linux visual baseline review, deployed revision and physical desktop/phone owner acceptance.

### Z1 — Plan month grid in Zerosum arrangement — #448 (2026-10-13)

- [x] Spaced rounded group bands, group/overall checkboxes (including mixed selection), header creation shortcuts and retained C/G forms, alternative views and multiple months.
- [x] Cent-exact spending status with underfunded-target suffix; hatched spent/solid remaining green bars, red overspending and retained available pills. Class remains in the inspector.
- [x] One scrolling sticky phone chip line; compact name/available, status/assigned and bar rows, 44px label/name/pill targets, existing inspector edits and same-line cover/suggestion actions.
- [x] Fresh web typecheck, changed-file lint/format/CSS scale, 19 unit tests and 28 affected E2E/setup cases. Final compact-grid rerun: 6 desktop/Chromium-phone/WebKit cases with light/dark Axe, actual viewport-width guard and both touch dimensions at least 44px. Global checkbox/select correction integrated and six synthetic images refreshed. [Evidence and PR body](evidence/plan-zerosum-grid/PR.md).
- [ ] Required final-head CI, Linux snapshot review, deployed revision and owner device acceptance. No local Linux baseline generation; Z2/Z3 and phone action layout remain separate packages.

### UX S1 — search overlay palette — #484 (2026-10-14)

- [x] Context-preserving native search dialog, phone full-screen sheet, actions first, grouped results and validated session recents without the empty catalog dump.
- [x] Reuse existing navigation/actions and keyboard selection; Escape/focus return, all-results query/source links and reload-safe type filtering on `/suche`.
- [ ] Reverify inherited component regressions and browser evidence on current main before delivery; [WIP notes](evidence/search-overlay/PR.md).
- [ ] Required CI, Linux visual review and physical desktop/iPhone owner acceptance.

### Account register: upcoming captures and next recurrence — #453 (2026-10-13)

- [x] Remembered `Kommend · N` section in account and All Bookings registers, collapsed on phones; all future captures and only the next unbooked schedule occurrence, ascending date hints and distinct calendar/repeat icons.
- [x] Today balance divider, native cent projections and historical balances excluding future captures; editable future captures and date rollover without automatic booking.
- [x] Payment-detail links and explicit atomic book/link and existing skip actions with undo/redo; read-only deduplication shared with account preview, rollback/duplicate guards and synthetic financial tests.
- [x] Focused type/lint/format/CSS/unit checks and desktop/390px browser evidence for weekly dialog repetition, 201 far-future captures, exact balances, actions/undo, expansion persistence, light/dark Axe and touch/overflow/text width. [Evidence](evidence/register-upcoming/README.md).
- [ ] Required CI and physical desktop/phone owner acceptance; existing schedule materialization horizon and explicit FX capture remain unchanged.

### Z4 — sidebar accounts in Zerosum arrangement — #451 (2026-10-13)

- [x] Navigation icons without 01–05; KONTEN create/account-settings actions using the existing form and route, including an empty ledger.
- [x] Uppercase account groups with chevron, icon and total, without subtitles; typed rows, right-aligned balances, red negatives and shared active navigation treatment. Existing light/dark tokens and footer retained.
- [x] Existing grouping, closed-account filtering, drag/keyboard ordering, audit/undo and remembered group/sidebar collapse retained.
- [x] Focused web typecheck, changed-file lint/format, 15 affected unit tests, desktop 9 passing browser/setup cases and mobile 7 passing/1 desktop-only skip. Synthetic desktop 1440/collapsed/mobile 390, light/dark Axe and screenshots: [delivery notes](evidence/sidebar-accounts-zerosum/PR.md).
- [ ] Required CI, Linux visual baseline review and owner acceptance.

### Plan #446 — month and category inspector — owner 2026-10-12

- [x] Sticky 320px right inspector from 1180px; collapsible below the grid at smaller widths. Move temporary Monatsdetails into five keyboard disclosures, only Monatsüberblick open by default.
- [x] Category-name selection, Escape/outside dismissal, target progress, existing assign/move/cover forms, expected-payment context, history URL and category lifecycle menu.
- [x] Single/multiple selection quick values reuse the existing ordered server action and grouped undo; other Plan registers retain their existing styling.
- [x] Focused web typecheck/lint/format/CSS scale, 48 unit tests and 23 desktop/mobile E2E cases; synthetic 1440px/390px light/dark evidence. See [delivery notes](evidence/plan-inspector/PR.md).
- [ ] Required CI, pinned Linux visual review and owner acceptance; phone action layout remains package 3.

### Plan #441 — compact grouped grid — owner 2026-10-12

- [x] Groups are the default; selectable waterfall, time, classes and overspent-only views. Compact category/group rows, aligned cent sums and keyboard-accessible collapse controls.
- [x] Sticky top bar with existing Zu verteilen derivation, overspent count, unfunded total, uncategorized count, distribution and month-close entry. Cover controls live in the chip disclosure; summaries start closed under Monatsdetails.
- [x] Visible + Gruppe at the grid head/end and + Kategorie in each open group; C/G reuse the existing forms outside editable fields.
- [x] Desktop 1440 × 900 fold (14 category rows, 120 px before the grid), mobile 390 touch/overflow and light/dark Axe evidence, focused typecheck/lint/format/unit/E2E verification. See [delivery evidence](evidence/plan-compact-grid/README.md).
- [ ] Required CI and owner acceptance.
- [x] Package 2 inspector implemented in #446; package 3 phone action-only expansion remains separate.

### Booking dialog layout and input stability — #438 (2026-10-12)

- [x] Status next to account, repeat next to date, contact before the direct Split action next to category; retain Heute/Gestern and existing contact-split persistence.
- [x] Booking-only native calendar and German date shorthand, real-day validation, filled forest-green confirmation and modifier save through open dropdowns.
- [x] Guard shared dialog backdrop clicks by pointer origin and position; keep desktop suggestions inside the form scroller.
- [x] Focused typechecks, lint/format, 55 affected unit tests and desktop/390px keyboard, native-picker/dropdown, exact-cent split, 44px touch/overflow and light/dark Axe evidence. Delivery notes: [#438](evidence/capture-dialog-layout/PR.md).
- [ ] Required CI and owner physical-phone/desktop acceptance; no local baseline regeneration.

### Register: continuous history, save latency and dialog recurrence — #439 (2026-10-12)

- [x] Account history without the current-month boundary; account and All Bookings load existing cursor pages on scroll, retaining complete server-side filters/search, running balances and the separate month movement.
- [x] Replace quadratic balance readback with one chronological account pass; POST/PATCH duration-only Server-Timing and a <500 ms assertion on 10,000 synthetic bookings. Save settles before background reads; cursor refresh starts at page one and active financial figures remain fresh.
- [x] Reproduce weekly/monthly credit-card capture through the real dialog, verify expected schedule and Plan/Heute visibility, and retain shared audit/undo/idempotency semantics. Existing recurrence works; no speculative behavior change.
- [ ] Required CI, final PR integration and physical-device owner acceptance. Scoped checks, measurements and limitations: [evidence](evidence/register-439/README.md).

### Today: unchecked account reminders and planned one-off events — #428

- [x] Shared pure reminder rule: inclusive 35-day default, latest reconciliation/value date for P2P/other assets, opening-date fallback for never checked accounts; ignore closed, empty and not-yet-open accounts.
- [x] Derived Heute and Posteingang hints link to the account's existing reconcile/value form. Audited 1–365-day preference in Einstellungen › Profil with undo; no migration or persisted duplicate inbox warning.
- [x] Enabled one-off events from today through day 35 appear with signed cents/date in “Was steht an?” and link to Plan › Jahr. Existing recurring-payment horizons remain unchanged; no booking is created.
- [x] Focused typechecks, changed-file lint/format, 48 affected tests, one E2E build and desktop/mobile functional, touch-target, overflow and light/dark Axe evidence passed under the package memory exception.
- [ ] Required CI, pinned Linux visual review and owner desktop/phone acceptance. Scoped local results and synthetic screenshots: [evidence](evidence/account-reminders-428/README.md).
### Bank inbox package — #424 (2026-10-11)

- [x] Collapsed candidates and bank bookings; assignment/match requests start on expansion.
- [x] Selection, select all loaded rows (bounded to 100), explicit count preview and bulk dismissal/prepared confirmation with one audit group/undo.
- [x] Source-scoped date sort/filter before pagination; balance mismatch links to the account.
- [x] Focused type/lint/format/unit checks and all five changed desktop/mobile scenarios. [Evidence](evidence/bank-inbox-bulk/README.md).
- [ ] Commit/push/PR (Git index lock permission denied), required CI and owner phone acceptance.

### Reports package P - history, cell links and full-width summaries (2026-10-09)

- [x] #335/#336: payslip history/details subpage and existing capture/edit/upload form dialogs, with month context and audited-write reuse.
- [x] #337: linked income/expense cells, exact existing source selection and report-filter return context through the existing booking view.
- [x] #344/#345/#347/#348: remove the remaining secondary content columns; preserve numeric tables and #411 category trend/source links.
- [x] Focused web typecheck, changed-file lint/format, 49 unit tests and one E2E build; package memory override applies. [Evidence](evidence/report-panels-1009/README.md).
- [x] Six functional desktop scenarios across targeted reruns and final 9-test mobile run at 390 px, including navigation, audited edit/undo, cancellation/focus, geometry and Axe.
- [ ] Required CI, integration after #411 and owner desktop/phone acceptance.

### Contacts, search and developer surfaces without side panels — #321/#322/#338/#339/#340

- [x] Contact statements at `/konten/kontakte/:id`, legacy contact links, retained overview history and existing receipt/settlement/audit/undo paths.
- [x] New contact in the shared FormDialog, with cancellation, fresh reopening and focus return.
- [x] `/suche` with URL query/source context, Ctrl K, arrow/Enter navigation, existing provider/ranking/privacy and shortcut help.
- [x] Dev-only `/dev/details`; remove the example panel entry and use detail routes plus input dialogs in the gallery/harness.
- [x] Synthetic component regressions, including preventing detail IDs from becoming capture account IDs; scoped verification is recorded in [package evidence](evidence/contacts-search-dev/README.md).
- [ ] Required CI, Linux visual baseline review, integration after #406 and owner/device acceptance.

### P2 #316 / #317 / #328 / #329 / #341 — Today and Expected detail pages — 2026-10-09

- [x] Move only Today's account/wealth dimensions to `/heute/details/:kind`, reusing the existing valuation, account grouping and source links with month/period context.
- [x] Route Expected income to the existing Plan income page component with an Expected breadcrumb/back link, month, originating view and kind filter.
- [x] Show expected payment details, unchanged versions and occurrences on `/plan/erwartet/:id`; preserve explicit single-occurrence skip/unskip and audited write/undo paths.
- [x] Put creation, editing, version capture, booking linking and deletion confirmation in FormDialog; navigation never confirms a booking.
- [x] Keep the three Today answer cards and put secondary monthly sections below them at full width.
- [ ] Required CI, Linux visual baseline review and owner/device acceptance. Scoped local results and limitations: [delivery evidence](evidence/today-expected-detail-pages/README.md).

### Booking dialog acceptance — 2026-10-09 (#309 #314 #315)

- [x] Focused synthetic desktop/390px checks for German date, arithmetic/defaults, exact-cent save, bounded height, visible Save and phone touch targets; dark Heute/dialog review with screenshots and contrast evidence.
- [x] Reproduce and correct booking-only Tab boundary and discard-question focus; verify labelled focus order, continue/discard/opener return and reduced motion.
- [x] Clean source/test commit `d22965013c108ed3f8abf53a5c6cd3d2123fd445`: desktop/mobile each pass 6 browser/setup cases; SHA and clean worktree captured with viewport/ARIA evidence.
- [x] Branch pushed and normal [PR #412](https://github.com/Grabman1987/budget/pull/412) opened; initial index/authentication errors cleared on normal retries.
- [ ] Required CI at the exact final PR head; physical-device and actual screen-reader owner acceptance remain open. [Local results and evidence](evidence/booking-acceptance-1009/README.md).

### Portfolio package D — #297–#301, #346 — 2026-10-09

- [x] Label securities-market-value, net allocation and gross risk bases; explain signed cash and negative/over-100% shares without changing formulas.
- [x] Collapse the complete unheld-instrument catalog with its count and existing detail/edit routes.
- [x] Link unclassified instruments to the shared dated class editor and cash to account settings; retain distinct estimated/stale status and provisional optimisation guards.
- [x] Explain the optional portfolio-only benchmark setup state; preserve explicit persisted selection and clearing.
- [x] Separate held classes at the displayed stand from historical/unused classes; retain dated class histories, return-window/method labels and lifetime realised gains.
- [x] Stack report 4.2 legend/sources and report 4.5 summary below content at full width; retain numerical columns and direct links.
- [x] Focused type/lint/format checks, 5 Vitest files / 30 tests, affected desktop/mobile browser checks, Axe/overflow/touch checks and synthetic visual evidence; [scope and verification](evidence/portfolio-package-d-1009/README.md).
- [ ] Exact-head CI, integration, physical iPhone and owner acceptance.

### P1 #269 / #270 / #274 / #275 / #276 — Today hints — 2026-10-09

- [x] Label Plan's actual 50/30/20 denominator, withhold a completed-month verdict for open months and link to the last completed One-Pager; preserve allocation calculations and expected-income separation.
- [x] Put payday room first within the existing three answer cards, with the planning boundary and expected receipt separately visible; retain month and wealth access.
- [x] Show unevaluated rule counts beside the other statuses and link to missing-input explanations; suppress an all-clear when inputs are missing.
- [x] Describe empty additional steps consistently with attention points already shown above.
- [x] Preserve PR #226's result-first rule grouping; deep-link and focus the concrete finding, keeping its value, threshold, action and secondary settings accessible.
- [ ] Exact-head CI, PR integration, visual baseline review and owner/device acceptance. Scoped local evidence: [Today hints](evidence/heute-hints-1009/README.md).

### Liquidity package #283 / #290 / #291 / #292 — 2026-10-09

- [x] Plan registers reach the existing liquidity report without a report number; no new report route or household calculation.
- [x] Upcoming payments link their account and due date to its existing preview; envelope reserves and household totals do not promise account coverage.
- [x] EUR budget-account previews reuse the selected liquidity horizon, recurring dates, income pauses and applicable levers. Native previews and their configurable day limit remain available; unassigned variable plans/events/payments are explicitly excluded and mark the projection partial. Transfers affect each account on the booking day and remain neutral in household cash.
- [x] The verdict exposes the exact day of its existing deciding low and names its unchanged six-month end, even when the selected chart covers a different horizon.
- [ ] Exact-head CI, integration/deployment, physical-device and private financial acceptance remain open. Local verification follows the owner package override: scoped type/lint/format/unit checks and only the changed browser specs; no full local check or snapshot regeneration.

### Reports and search package — #303–#308 (owner 2026-10-09)

- [x] Qualify the inflation headline at the number; distinguish prices, CPI category proxies and trailing average expenditure in both basket views, retaining sources, common comparison month and coverage.
- [x] Name per-position first/last observations, rolling twelve-month windows and contribution comparisons; retain the existing reconciled hundredth-Pp calculation.
- [x] Name report 1.11 Prognosegenauigkeit and report 2.2 Budgettreue consistently in the catalog, search and heading; preserve both published slugs.
- [x] Add bounded everyday search synonyms for existing planning, liquidity, savings, debt and cost functions; separate content matches from global actions and retain month-close navigation.
- [ ] Required CI, mobile browser verification (local bootstrap blocked by host ENOMEM), Linux review of the affected report-catalog baselines and owner desktop/phone acceptance. No new keys, consents or configuration required. [Scoped verification and review images](evidence/reports-search-1009/README.md).

### F2 — Guided month close, plan next month and review (owner 2026-10-04)

- [x] Step 4: expected income and shared bank-day payday, recurring dues, prior plan/actual and up to twelve completed-month average; group/all draft actions and explicit existing-API assign.
- [x] Need/want/future against 50/30/20, cent-exact remaining money and zero-based completion; repeated step applies share one audited, undoable group and never book forecast income.
- [x] Step 5: reused full One-Pager and shared factual verdict fallback, three largest signed plan/actual deviations, remaining rule findings and audited close date without a data lock.
- [x] Synthetic domain/API/component coverage and all-five-step desktop/phone E2E scenario; [contract](month-close.md).
- [x] Final local typecheck/lint/format/unit gate (358 files / 3308 tests, host test deadline 30 seconds), production/E2E builds and desktop/phone browser evidence; [results and host limits](evidence/month-close-f2/README.md).

### F2 Linux preflight — 2026-10-09

- [x] GitHub Actions run [37874069963](https://github.com/Grabman1987/budget/actions/runs/37874069963) succeeded. Verified task parent: `400dc4ff91f8dc2890ae692a19bbf13c66c514ad`; helper `017af6dea4bb221bd59ba2663922ea07219ae345` is workflow-only, with no application-source changes.
- [x] Focused gate: 4 files / 24 tests in 6.64 s. Full gate: 382 files / 3,519 tests in 149.57 s; TypeScript, lint and format green. Production and E2E builds passed.
- [x] Desktop/mobile browser preflight: 5 passed including 3 setup cases in 33.3 s; current plan/review screenshots and hashes are recorded in [evidence](evidence/month-close-f2/README.md).
- [x] Final prepared #281-parent union: [37875468357](https://github.com/Grabman1987/budget/actions/runs/37875468357) passed 4 focused files / 24 tests, the full 382 files / 3,519 tests, both builds and 5 desktop/mobile browser cases. All 2,149 frozen file hashes stayed unchanged; the helper workflow is excluded from the PR.
- [ ] Exact-head PR CI, integration/deployment, real financial Gate 4 comparison and physical iPhone Safari acceptance remain open. The full preflight ran on Linux; no additional Windows full run was performed for this update.

### Current source and acceptance baseline — 2026-10-08

- [x] Reconcile README and STATUS with verified main/live `5193b0a`, connected workflows and all 34 report bodies; preserve historical audit evidence.
- [x] Add [ACCEPTANCE](ACCEPTANCE.md) separating source, PR/checks, deployment and financial/device/owner acceptance, with the ordered small-task queue.
- [ ] Required checks and independent documentation PR review/integration; this baseline is not the later post-stack refresh #352.
- [ ] Reconcile historical FEATURES/TASKS/requirement and per-task roadmap details as their concrete tasks are reviewed; no blanket gate/owner acceptance.

Older CI/publication checkboxes below describe their original deliveries. Current integration evidence is in [STATUS](STATUS.md); private/device acceptance stays open unless independently recorded.

### P0 #282 — Request cache integrity

- [x] Reproduce and repair shared Explorer/history mutations and nested-savepoint stale valuation; four focused files / 29 tests pass, including real API mutation/undo/redo and rollback checks. [Evidence](evidence/cache-integrity-282.md).
- [x] Pre-integration full `npm run check`: 372 files / 3,410 tests, exit 0 (Vitest 970.12s); see [evidence](evidence/cache-integrity-282.md).
- [x] Full check on the #250 + verified-main union: 376 files / 3,476 tests, exit 0; E2E build and focused desktop/mobile inbox and One-Pager checks passed (18 passed, one desktop-only skip). [Evidence](evidence/cache-integrity-282.md).
- [ ] Complete PR integration.

### P0 #293 — Debt terms completeness — 2026-10-08

- [x] Keep an unknown monthly fee `null` distinct from an explicit zero; a loan baseline is withheld until all required stored inputs are known.
- [x] Show stored debt rates, kind, installment, fees, type-specific limits and unknown terms freshness separately from editable preview inputs; retain dated rate changes and the existing account settings route.
- [x] Reproduce the API, UI and mixed-currency explanation gaps with synthetic RED cases, then pass the API test (23 tests), E2E build, and combined desktop/mobile/WebKit-iPhone browser checks (22 tests across five specs); targeted Axe and no-overflow checks pass. Existing PR225 loan fixtures now explicitly store zero fee, preserving the 33-month / 1,094.05 EUR baseline. [Evidence](evidence/debt-terms-293/README.md).
- [x] Full repository `npm run check`: typecheck, lint, formatting and 378 Vitest files / 3,488 tests passed at frozen source union; see [evidence](evidence/debt-terms-293/README.md).
- [x] Independent source review finding on mixed-currency progress was corrected and covered by a passing browser regression.
- [x] Independent final visual review confirmed the stored terms and model values are distinguishable in the refreshed captures.
- [ ] PR integration and owner acceptance remain pending.

### Reports / Vermögen #426 — Report polish — 2026-10-11

- [x] Stronger shared pastel heatmap maximum in light/dark/print, preserving direction and row normalization.
- [x] Report 2.6 displays existing credit lines with native-currency limits, exact annual rates, usage and separately labelled monthly interest estimates from the shared integer-cent function.
- [x] Product detail displays stored price history with 1M/6M/1J/Max, exact micro-unit prices and shared chart inspection; checking/card creation and editing expose the existing interest-rate field.
- [ ] Owner visual acceptance and CI gate. Focused verification and affected captures: [PR evidence](evidence/report-polish-426/PR.md).

### P0 #295 — Bank-cost coverage disclosure — 2026-10-08

- [x] Preserve the existing bank-cost known subtotal while stating its coverage beside the headline; distinguish current unknown-rate usage and nonzero modeled account/month periods without dated EUR conversion, with the current-conditions date separate from closed-month dates.
- [x] Keep known zero distinct from missing FX and keep TER/spread excluded; the portfolio cost report and existing cost formulas remain unchanged.
- [x] Reproduce each API gap with synthetic RED cases; focused report API/DB regressions pass, E2E build succeeds, and final existing plus new desktop/mobile bank-cost report checks pass with literal nonzero booked/estimated amounts, Axe and overflow checks. [Evidence and captures](evidence/bank-cost-coverage-295/README.md).
- [x] Full repository check: 378 files / 3,491 tests, exit 0. Afterward, shorten the verdict metric label and clarify the DTO comment; scoped lint/format, E2E build and final 9-case desktop/mobile run pass on that copy-only follow-up.
- [ ] PR integration and owner acceptance.

### #349 — Honest Heute warm-up count — 2026-10-08

- [x] Reproduced the warm-up count mismatch: the test expected two cacheable Heute responses but observed three because `/inbox/count` was included. The real inbox badge route is intentionally uncached; after the correction it returns successfully and performs a fresh database transaction on each of two requests.
- [x] Focused response-cache and inbox API checks pass: 2 files / 12 tests; server typecheck passes. Historical performance timings remain historical, not a new measurement. [Evidence](evidence/warmup-349.md).
- [x] Final full repository check passed type/lint/format and 379 files / 3,504 unit tests; the frozen 2,108-file manifest was unchanged both after checking and after normally unioning the actual #279 main merge.
- [ ] Exact-head CI, integration/deployment and owner acceptance remain pending.

### #280 — Reproducible Heute cold/warm baseline — 2026-10-09

- [x] Add bounded handler/browser measurement scripts using an explicitly selected prepared synthetic dataset, fixed today/month, ten samples per state, current-navigation response and complete usable content gates.
- [x] Run 40 handler and 20 browser observations on integrated main after #349 was verified live; preserve raw samples, medians/ranges, runtime/source metadata and the rejected initial preparation. All timed samples and 180 browser GETs succeed; cold/warm JSON parity and before/after finance fingerprints pass. [Protocol and raw evidence](evidence/heute-measure-280.md).
- [x] Separate startup/auth preparation and warm-up from observed request/navigation durations; local browser timing is not server CPU or production latency. No infrastructure recommendation; #281 owns the next profile.
- [x] Independent source/raw-data review has no concrete findings; final repository check passes type/lint/format and 379 files / 3,504 tests, with the frozen 2,114-file manifest unchanged.
- [ ] Exact-head CI and integration/deployment.

### #281 — One Heute request and renderer profile — 2026-10-09

- [x] Extend the existing bounded synthetic harnesses with opt-in `--profile`: process CPU and observed SQLite statement work around the payday request, renderer main-thread CDP counters and DOM counts around complete usable content. Keep default measurements and financial-data guards unchanged.
- [x] Complete ten cold and ten warm samples in each layer, with matching payload hashes, 180 successful browser GETs, unchanged finance fingerprints and session cleanup. Independently retain sanitized raw JSONL samples and distinguish overlapping counters from wall time and full rendering. [Results and limits](evidence/heute-profile-281.md).
- [x] Production build, dedicated strict harness typecheck, scoped lint/format and real repository-file rejection checks pass. The reviewed rule-book baseline/doc parent follow-up preserves the measured harness and production bundle hashes.
- [x] Independent final source/raw-data review has no concrete findings; frozen full repository check passes typecheck, lint, formatting and 380 files / 3,508 tests, with all 2,128 recorded file hashes unchanged.
- [ ] Exact-head CI and integration/deployment.
- [ ] Physical iPhone Safari and private financial acceptance remain separate; this local synthetic profile supplies no infrastructure bottleneck or Fly-scaling recommendation.

### #302 — Dated historical class exposure — 2026-10-08

- [x] Add a synthetic two-version API case with literal EUR cents, effective dates, January and February month-end index levels, and hand-derived class TTWROR; the prepared case and existing full portfolio API / exposure-repository regressions pass (2 files / 19 tests). No calculation defect was reproduced and no production formula was changed. [Evidence](evidence/dated-exposure-302.md).
- [x] Full repository `npm run check`: 378 files / 3,492 tests, exit 0. Scoped lint, formatting and `git diff --check` also pass.
- [ ] Independent review and issue/owner acceptance remain pending.

### #286 — Income pause domain amount — 2026-10-08

- [x] Add a pure shared-domain amount adapter for a matching scheduled EUR inflow inside a caller-validated inclusive interval; preserve the original occurrence and all other sources, kinds, currencies, and dates.
- [x] Reproduce RED (6 failed / 1 passed) and focused GREEN (4 files / 42 tests), including feeding the adjusted occurrence stream to the shared liquidity forecast and report; see [evidence](evidence/income-pause-286.md).
- [x] Full check on the verified main + checked #284/#285 union: typecheck, lint, formatting, 377 test files / 3,483 tests, exit 0.
- [x] DB/UI forecast integration and the #287 salary-marker adapter are covered by the #287 work; the integrated full check and owner acceptance remain separate.

### #287 — Income pause persistence and forecast adapter — 2026-10-08

- [x] Phase A stores one source and inclusive interval as an audited, undoable row; same-source overlaps are rejected on create, edit, and undo/redo.
- [x] The shared cash forecast and Heute salary cash marker apply the zero override before FX. Normal expected-income reporting, occurrence rows, payday horizon, bookings, and matching retain the original schedule.
- [x] The liquidity report UI supports inclusive past-start intervals, source/date edits, delete, and undo; chart assumptions and six-month verdict coverage are labeled separately. Deleted, foreign-currency, and zero-EUR cases remain explicit.
- [x] Focused API/domain tests, desktop/mobile browser acceptance, Axe, overflow, touch-target, and DB/server/web typechecks pass; final four light/dark captures are recorded in [#287 evidence](evidence/income-pause-287.md).
- [x] Main `73a4a397` union and frozen full `npm run check`: workspace typechecks, lint/formatting, 379 files / 3,503 tests, exit 0. The older 0039 migration test now isolates its target migration while retaining strict predecessor assertions.
- [ ] PR/CI, deployment, real-device behavior, and owner acceptance remain pending.

### #272 — Expected income is not free surplus — 2026-10-08

- [x] Label a positive expected-income/target remainder as a planning difference; retain the existing expected-income label and note that it is unavailable until received. Leave all calculations and negative `Zu verteilen` status unchanged.
- [x] Add literal component and isolated-ledger regressions for expected income €3,000, targets €2,000, cash €1,000, and `Zu verteilen` −€500, with desktop/mobile light/dark browser evidence; see [synthetic evidence](evidence/income-targets-272/README.md).
- [x] Focused component regression, web typecheck, scoped ESLint/Prettier, E2E build and isolated desktop/mobile browser checks pass on integrated HEAD `9922b6a6`; no owner data or live ledger used.
- [x] Full repository check passes (373 files / 3,448 tests), and independent final review found no issue-specific findings.
- [ ] Owner iPhone/device acceptance remains tracked separately under #310.

### #272 CI readiness follow-up — 2026-10-08

- [x] Add dialog-closed and settings-URL readiness waits after rename and archive; focused desktop, mobile and WebKit U02–U12 checks passed (6 tests), with evidence in [asset-class panel CI follow-up](evidence/asset-class-panel-ci-1008.md).
- [x] Full `npm run check` passed at the frozen branch head: 373 test files and 3,448 tests; no application code or screenshot baselines changed.
- [x] Final independent review found no actionable findings.
### #285 — Income pause contract — 2026-10-08

- [x] Record the owner decision: exactly one active recurring income source natively denominated in EUR before FX contributes 0 cents during a required inclusive pause interval; no calendar-day proration, schedule rewrite, or envelope/balance change.
- [x] Contrast replacement with additive `planned_event`, define stable schedule identity, effective/shifted occurrence boundaries, same-source overlap rejection, undoable persistence seam and shared future-cash consumers; see [income pause contract](income-pause.md).
- [x] #286 pure calculation and literal occurrence tests; #287 audited persistence, forecast adapter, and UI are implemented as separate tasks. Integrated full check and owner acceptance remain tracked in #287.

### E1 — Report verdict sentences (owner 2026-10-06)

- [x] Pure typed fact detectors, strongest-fact selection, 230 German templates, deterministic period variation and previous-template exclusion; no new dependency or second ledger calculation.
- [x] All catalog reports in sections 1–5, Heute fold, One-Pager print header and Gesamtübersicht use existing read-model values and amount privacy; incomplete histories stay explicit. Fed fact families: records, savings/budget/wealth streaks, category streaks, comparisons, wealth marks, debt reduction, market/effort, rules, equivalents.
- [ ] Not yet fed: `emergency` (Notgroschen reach in months) — no read model keeps a monthly history of it; its templates stay until one does. Heute shows only the primary figure (one running month, no history).
- [x] Synthetic template/placeholder snapshot, determinism, non-repetition, edge values and privacy tests; extension contract in [report verdicts](verdicts.md).
- [x] Full local check: 355 files / 3,286 tests; two workers, 30-second test/hook deadlines and one allowed retry. Production build and 17 desktop/mobile browser checks passed, including light/dark, privacy and print.
- [ ] Required CI and owner language/design/device acceptance; no keys, consents or migration required.

### Pace line reduction — owner 06.10.2026

- [x] Move Pace below Kontoprognose; default Ist / Hochrechnung / Deckel, scheduled Plan bis heute dot, optional faint Einnahmen/Vormonat, complete tooltip and unchanged model/footnote.
- [x] Synthetic component regressions and desktop/phone light/dark browser assertions for legend, keyboard toggle, line styles and label bounds.
- [ ] CI, pinned Linux visual review and owner acceptance (Heute and shared One-Pager).

### UX-5a — Debts: result first (owner 2026-10-05)

- [x] Stored loan/card terms and actual balances feed an immediate payoff date, remaining interest, principal progress when original amounts are complete, and compact account rows.
- [x] Live monthly extra repayment, explicit missing/invalid terms, native-currency guards and collapsed Rechenweg; existing dated planning/scenarios/undo retained.
- [x] Synthetic cent/limit/progress unit cases and desktop/phone browser regression specs; [scope and visual list](ux-debts-1005.md).
- [ ] CI, Linux visual review and owner acceptance.

### UX-3d — Phone booking filters (owner feedback 2026-10-05)

- [x] Konten › Buchungen: phone search beside Filter (n), draft bottom sheet with reset/apply, removable active-filter chips and short sorting labels; desktop inline controls retained.
- [x] Synthetic filter-count unit regression and phone 390 / desktop browser specs; existing account-filter specs adapted to the sheet.
- [ ] CI, Linux visual review and owner phone acceptance; [scope and baseline list](ux-mobile-ledger-1005.md).

### UX-4b - Plain wording and calmer controls (owner 2026-10-05)

- [x] Plain action/view labels; neutral inbox resolution; actual-history label and separated payment markers.
- [x] Running One-Pager shows existing amounts without allocation shares; one shared German date input preserves ISO form values and validity.
- [x] Empty annual planning keeps only Zu verteilen and the planning action; populated scenarios use plain labels with hover/focus explanations.
- [x] Synthetic component and affected desktop/mobile browser regressions added; no baseline regeneration.
- [x] Local check phases (352 files / 3,257 tests), production build and affected desktop/mobile browser checks; see [verification](ux-clarify-1005.md).
- [ ] CI, pinned Linux screenshot review and owner acceptance.

- [x] Owner 2026-10-06: implied gross trade prices before valuation cost fallback; estimate hints only for positive as-of holdings without a quote or trade price, with synthetic domain/DB/API/UI regressions. CI and owner acceptance remain open.

### Warenkorb settings simplification — owner 2026-10-06

- [x] Plain intro/current-effect copy and summary, one inclusion choice, collapsed official price groups with automatic CPI selection and validated autosave/undo; payee exceptions remain collapsed. API and domain rules unchanged.
- [x] Synthetic component/browser regressions, full local check (353 files / 3,274 tests), production/E2E builds and desktop/375 px visual review; [verification evidence](evidence/basket-simple-1006/README.md).
- [ ] CI and owner acceptance; no keys, consents or migration required.

### UX-6 - Typography and radii (owner task 2026-10-05)

- [x] Off-scale CSS values mapped to DESIGN.md tokens, preserving chart/emoji geometry.
- [x] Dependency-free CSS scale lint in CI, synthetic unit and desktop/phone theme regressions; [scope and affected baselines](ux-typeset-1005.md).
- [ ] Pinned Linux visual review, CI and owner acceptance.

### F1 — Guided month close, steps 1–3 (owner 2026-10-04)

- [x] Monthly route, persisted stepper, live inbox/reconciliation/overspending status and reasoned exceptions; reuse audited actions and manual account valuations.
- [x] Heute entry on the first/last five days, Plan entry and provisional global-search entry; phone has one active step and sticky continuation.
- [x] Synthetic API status/resume/undo/validation and stepper coverage. [Plan and contract](month-close.md).
- [x] Typecheck, lint, production/E2E builds and two desktop/phone browser runs with synthetic [evidence](evidence/month-close-f1/README.md).
- [x] Full local unit gate (354 files / 3272 tests), lint, typecheck, build:e2e and month-close E2E (desktop + mobile) verified on the final tree.
- [ ] CI and final rebase before merge.
- [ ] Job E palette/verdict integration (absent from the fetched main baseline), F2 steps 4–5 and owner parallel-operation Gate 4 acceptance.

### UX-4a — One definition of overspent (owner 05.10.2026)

- [x] Shared `overspentEnvelopes(month)`: negative available after existing carry rules; Heute, Plan, live inbox tasks and common badge agree, without duplicate stored warnings or card-account debt.
- [x] Synthetic cent/carry, cash/card, duplicate-warning, cover/undo and consumer API regressions; desktop/mobile count and repair-link E2E spec.
- [ ] CI, affected Linux screenshot review and owner acceptance; [scope and baseline list](ux-overspent-1005.md).

### #237 — Top-bar overspending link and Plan triage

- [x] Keep the top-bar overspending chip a direct, read-only link to current-month Plan triage; cover and undo remain on the Plan page. Pending data makes no zero claim, query errors (including failed cached refetches) use a neutral Plan link, unsafe cent totals remain unknown, and amount privacy/accessibility labels are preserved.
- [x] Synthetic isolated-ledger API cover/undo regression and desktop/mobile browser checks; final focused run passed five tests including setup, with eight original Windows light/dark captures. Linux preflight run [37879767925](https://github.com/Grabman1987/budget/actions/runs/37879767925) passed the full repository check (383 files / 3,526 tests), production and E2E builds, 15 desktop/mobile behavior tests, and 23 Linux visual-comparison tests covering 26 screenshot assertions without baseline updates. Eight Linux top-bar/covered-triage captures were collected in [run 37880079988](https://github.com/Grabman1987/budget/actions/runs/37880079988) from an app-identical source tree.
- [ ] Exact PR-head CI, integration/live proof, physical-device and private-data acceptance remain open.

### UX-3c - Phone chart/table overflow (owner feedback 2026-10-05)

- [x] Local Liquidity/flow/year table scrolling with visible phone affordance and sticky first columns; existing Plan year stacked layout retained.
- [x] Simplified vertical Geldfluss phone variant, width-aware Liquidity ticks, full-width Portfolio allocation tracks and complete mobile report headings.
- [x] Synthetic component and 390 px browser regressions; [scope and baseline review](ux-mobile-overflow-1005.md).
- [x] Full local check (351 files / 3,250 tests), production/E2E builds and focused browser checks (22 passed / 9 intentional desktop skips).
- [ ] Required CI/Linux visual review and owner phone acceptance (see PR evidence).

### Plan › Monat quick assignment — owner 05.10.2026

- [x] Zero-assignment ghosts from existing target need or three-month median spending, with source tooltip; no automatic booking.
- [x] Leere füllen and selected Wie letzter Monat / Ø 3 Monate / Ziel via existing assignment/audit/undo path, capped in displayed sort order with exact shortfall.
- [x] Synthetic cent/source, partial-fill, validation, rollback, stale-fill, undo/redo and German-copy regression tests; [contract](plan-ghost-1005.md).
- [ ] CI, pinned Linux visual review and owner acceptance.

### UX-5c — Violated rules first (owner feedback 2026-10-05)

- [x] Regelwerk starts with violated rules, shared current values, stored thresholds and correction links; met rules follow and disabled rules start collapsed.
- [x] Current main-union keyboard regression preserves focus for OFF/ON group transitions, Undo and settings Escape. All rules desktop/mobile preparation passed: 13 cases including three setup checks, four intentional viewport skips; four current captures were reviewed. [Current evidence](evidence/rules-focus-226.md).
- [x] Final union full check: 380 files / 3,508 tests, exit 0; all 2,125 frozen paths/hashes unchanged. The history-only union with main `410d2cd0` preserved the same checked source files.
- [x] Original PR #226 updated; diagnosed stale main-integration screenshots, generated only four rule-book Linux baselines with five passing scoped cases, and reviewed all four before copying them. Application source remains the fully checked version.
- [ ] Fresh exact-head Linux CI after the reviewed baseline update, integration/deployment and owner acceptance.
- [x] Warnings and unavailable evaluations stay explicit under Noch offen; every registered rule has its code, a plain explanation, switch and Einstellen. Stage checklist items retain their own S-codes.
- [x] Synthetic unit and desktop/mobile browser regressions cover grouping, correction navigation, keyboard expansion, parameter validation and undo; no local baseline regeneration.
- [x] Full local typecheck, lint/format, unit coverage (three load timeouts passed targeted reruns), production/E2E builds and affected browser specs; [results and baseline list](ux-rules-first-1005.md).
- [x] Pinned Linux rule-book visual review; approved differences and all four image hashes are recorded in current evidence.
- [ ] Required final-head CI and owner acceptance.

### Heute three answer cards — owner 05.10.2026

- [x] Three current answer cards reuse Vermögen, Gesamtübersicht, One-Pager, Leitmaß and Pace sources; nearest unfinished Sparziel reuses saved/missing cents and date ordering.
- [x] Preserve UX-2 attention, Pace, net-worth chart, source drilldowns and remembered further details; replace the large top Leitmaß and duplicate compact wealth figures.
- [x] Synthetic unit/API/component and six desktop/mobile E2E verifications, phone cards at most 120 px, production/E2E builds and lint.
- [x] Full local check on the current branch; the earlier Windows worker failure and clean unchanged retry are recorded in the issue 264 evidence below.
- [ ] CI, pinned Linux baseline review and owner acceptance; [scope and evidence](evidence/heute-cards-1005/README.md).

### Heute plan-rest distinction — issue 264

- [x] Synthetic red/green browser regression: 100,000 cents planned, 60,000 spent, 40,000 plan-rest; 40,000 available in Bedarf/Wunsch less 50,000 open outflows gives −10,000 cents until payday. Keep the existing lead derivation available.
- [x] Keep the concise relationship note visible at 390 px and 1440 px in light and dark; [scope and screenshots](evidence/heute-budget-copy-264/README.md).
- [x] Full local check; Windows first-run fork spawn error and clean unchanged retry are recorded in the evidence.
- [x] Review the four pinned Linux Heute baselines; no application source or unrelated image changed.
- [ ] Required final CI and deployment; physical iPhone acceptance remains a separate task.

### Heute pace under-plan / over-cap distinction — issue 265

- [x] Add a literal September 15 case with a 10,000-cent cap, 7,000-cent plan-to-date, 3,500-cent actual, and one unpaid 4,000-cent fixed target due that day; the existing model yields an 11,000-cent month-end forecast without a formula change.
- [x] Verify both Heute and Monats-One-Pager from a real synthetic isolated ledger, including the shared chart's separate Ist/Plan/Hochrechnung, keyboard tooltip and over-cap styling; retain desktop/mobile light/dark captures in [evidence](evidence/pace-over-cap-265/README.md).
- [x] Focused checks: 27 tests across two files, scoped lint/format, E2E build and seven desktop/mobile browser tests passed.
- [x] Linux preflight run [37880079988](https://github.com/Grabman1987/budget/actions/runs/37880079988) passed the focused check (2 files / 27 tests / 2.71 s), full repository check (383 files / 3,528 tests / 239.51 s), production and E2E builds, and nine browser tests in 1.0 minute. Eight Linux captures are recorded with the workflow-only helper `025fac1e499cd8f3ef681b58dc5192b8b3ce033f`; after the #237 docs merge, the diff against the checked source outside `docs/` is empty. [Evidence](evidence/pace-over-cap-265/README.md).
- [x] Final combined-source full check [37881562030](https://github.com/Grabman1987/budget/actions/runs/37881562030) passed on `29f7fdbecfd5ac8d0238c5bc9b0f5053d62db770` with helper `36f0c3be1b4acf95c2a79b1aae10d77923b34c2b`: 383 files, 3,528 tests, 250.66 s; typecheck, lint, format and early/late cleanliness checks passed. Builds and browser tests were not rerun on this final source; the nine browser tests and builds above are the separate pre-Globals run.
- [ ] Exact PR-head CI, integration/live proof, real-ledger reconciliation and physical iPhone Safari remain open. The separate Heute mobile account-forecast label overlap has been assigned to open #292 for verification.

### Pace time marker and projection header — owner 05.10.2026

- [x] Shared Heute/One-Pager header, cent-exact pro-rata expectation, existing forecast, Ist / Erwartet / Deckel / Hochrechnung and shared tooltip; legends list drawn series only.
- [x] Labelled current-month time marker on the pace chart and Plan › Monat variable category bars; no marker in other months.
- [x] Synthetic domain/API/component coverage and one desktop/mobile E2E scenario; no local baseline regeneration.
- [ ] Pinned Linux visual review, CI and owner acceptance. Affected screenshots: Heute, Plan › Monat and Monats-One-Pager (desktop/mobile, light/dark); One-Pager print layout also needs review.

### Unterseiten statt Seitenpanels — owner decision 2026-10-05

- [x] Complete web inventory with a replacement decision and explicit open scope ([inventory](no-side-panels-1005.md)).
- [x] Plan › Monat: envelope detail and monthly income URLs, breadcrumb/back, legacy category links, full-width inline summary.
- [x] Envelope assigning/moving/covering uses the existing input dialog; financial guards and undo remain intact.
- [x] Synthetic red/green unit and browser-back/scroll, direct-link and dialog-focus regressions.
- [x] Sidepanels-2a: Vermögen instrument/savings URLs with breadcrumb/back/scroll restoration; metadata, quote, schedule and trade FormDialogs; full-width `.vview` composition. Existing money/validation/audit/undo guards retained.
- [x] Final Linux #248 preflight on merged head `aba6740923969c3a402d2ca4ab958819f320b498`: focused 7 files / 41 tests, full check 382 / 3,519 tests, builds and 43 Desktop/Mobile E2E tests passed ([captures and evidence](evidence/no-side-panels-wealth-1006/README.md)).
- [x] Settings package #330–#334: account create/edit, owner-triggered reconciliation and class/group/target/archive forms reuse FormDialog; rule status uses `/einstellungen/regelwerk/:code` with a separate threshold form. Existing writes, dirty/save blockers and atomic audit/undo remain in place. [Scoped verification and synthetic captures](evidence/settings-dialogs-1009/README.md).
- [x] Plan panels #323–#327: category detail and shared goal history routes, category/group/goal/event FormDialogs, preserved month/source/hidden-category context and existing audit/undo writes ([evidence](evidence/plan-panels-1009/README.md)).
- [ ] Linux snapshot-baseline review, exact-head PR CI and remaining inventory; owner desktop/phone acceptance, physical iPhone Safari, private financial Gate 4 and live acceptance remain separate open gates.

### UX-3b — Shared touch controls (owner feedback 2026-10-05)

- [x] Shared 44 × 44 px control floor for coarse pointers and phone widths, including separate booking-row selection/flag areas.
- [x] Phone tab/segment typography above 13 px; named flag and close actions with visible touch labels.
- [x] Synthetic unit and bounding-box/hit-test phone regressions; [scope and baseline list](ux-tap-targets-1005.md).
- [x] Final local check phases (336 files / 3,175 tests), production build and affected Chromium/WebKit browser checks; [verification evidence](ux-tap-targets-1005.md).
- [ ] Pinned Linux screenshot review and owner phone acceptance (see delivery evidence).

### Heute daily budget — owner 05.10.2026

- [x] Daily line below the Leitmaß from its existing cent-exact source and shared payday; today included, one day on payday itself, nonpositive alarm copy, hover/focus formula and phone wrapping.
- [x] Synthetic domain/API and component regressions plus one desktop/mobile E2E scenario; no local screenshot baseline regeneration.
- [ ] Pinned Linux visual review, CI and owner acceptance.

### Heute / R07 horizon — owner 05.10.2026

- [x] Shared period-bound balance/low read, 14-day actual lookback, two-day boundary tail and short payday extension; remembered period and R07 chart in Finanz-Check-Verlauf.
- [x] Synthetic boundary, cent/low-point and desktop/mobile browser regression tests; [scope and baseline list](heute-horizon-1005.md).
- [x] Full local check: 336 files / 3,179 tests, production/E2E builds and focused desktop/mobile browser verification; see the contract above.
- [ ] Pinned Linux visual review, CI and owner acceptance (see PR evidence).

- [x] UX-2b (owner 2026-10-05): free-money caps for individual/bulk cover, pending/recurring dedup, account/used-credit line and missing-money carry option; synthetic regressions, CI and owner acceptance pending.

### UX-3a — Phone shell (owner feedback 2026-10-05)

- [x] One floating booking action; existing search in the phone header, theme switch in the profile menu, 44 px header controls.
- [x] Shared page padding clears the safe-area-aware tab bar and FAB by 16 px.
- [x] Synthetic unit and phone touch/search/clearance regressions, including WebKit; [scope and baseline list](ux-mobile-shell-1005.md).
- [ ] Original avatar interception reproduced on the owner's phone, Linux screenshot review and owner acceptance. The prior tree's avatar was tappable in local Chromium and WebKit; no blocking overlay was found.

### Full page width — owner feedback 2026-10-05

- [x] Shared unbounded page-width token, existing gutters and narrow text/form/dialog/A4 exceptions.
- [x] Responsive Heute, account overview, wealth and catalog grids; Allocation charts beside source tables; compact numeric columns.
- [x] Owner decision in DESIGN.md and one width/viewport E2E spec; [scope and baseline list](full-width-1005.md).
- [ ] Local browser matrix, full local checks, Linux baseline review and owner acceptance (see PR evidence).

- [x] Owner feedback 04.10.2026: report 5.6 Gesamtübersicht, income-scale 50/30/20 overflow, One-Pager panel swap/income list and shared pace income, bounded valuation notes and dated headers; owner acceptance and CI remain open.
- [ ] UX-2 (owner 05.10.2026): Heute/Plan distill, source rest, bulk cover/undo, shared wealth and device fold implemented; full-check rerun, publication and owner/Linux acceptance pending ([synthetic evidence](evidence/ux-distill-1005/README.md)).

- [x] Owner feedback 04.10.2026: reports 4.1–4.4, four stored benchmarks, positive allocation layers, daily/monthly reconciliation and shared Heute/R07 35-day horizon; see [scope and owner steps](portfolio-reports-1004.md).

### Claude Code project automations (2026-10-04)

- [x] Preserve Impeccable configuration; add offline cross-platform formatting and protected-file hooks with synthetic stdin tests.
- [x] User-invoked PR shipping/operator skills and read-only migration/money reviewers; see [Claude Code setup](claude-code.md).
- [x] Windows full check (291 files, 2,808 tests) and build; local run used two workers and a 30-second test timeout without changing repository defaults. Delivery uses a separate git directory/bundle because the worktree commit could not create index.lock.
- [x] Linux/Windows CI; owner acceptance in the next Claude session.
- [ ] #649: reuse the pinned local Prettier API without npm/CLI startup; deterministic startup-failure, config, ignore and privacy regressions added. Exact-head Windows CI and independent hook review remain required.

### Owner directive PR3 — Allocation quality and scope (2026-10-04)

- [x] Shared explicit account/instrument policy universe; signed investment cash, scope defaults and audited editable API metadata (Drizzle 0033).
- [x] Central unclassified value/share/count and exact/estimated/incomplete valuation details; provisional rebalancing and safe rule actions, suppressed provisional/out-of-scope savings optimisation.
- [x] Distinct Umschichtungsabstand and single-class Neues Kapital bis Soll with exact integer arithmetic.
- [x] Synthetic R07/R08, inclusion/exclusion, estimate/missing-FX, formula and metadata/undo/migration/restore regressions.
- [x] Final local typecheck/lint, all 2,797 unit/API tests (load-timeout files rerun alone), production/E2E builds and 81 affected desktop/mobile browser tests; details in the contract below.
- [ ] Draft PR/CI review and owner acceptance. PR4 settings, dynamic tiers and PR5 real-iPhone panels remain separate.

Contract and pre-change matrix: [allocation quality/scope](allocation-quality-scope.md).

### Owner directive PR2 — Risk policy unification and leverage (2026-10-04)

- [x] One stored R13/R14/R15 resolver across rule evaluation, Portfolio, rebalancing, report 4.2, savings recommendations and Heute/finance check; schema defaults only for missing values.
- [x] Central kind/leverage/optional-override classification, leveraged ETF risk, distinct market/gross cents and exact weighted gross splits.
- [x] Correct R13 standard wording and stored class-band precedence, including report month ends.
- [x] Synthetic R01–R06 and audited risk-policy undo/redo; existing 1× money/region/history invariants retained.
- [x] Final local check (286 files / 2,716 tests), production/E2E builds and affected desktop/mobile browser evidence (31 passed / 4 planned skips).
- [ ] Draft PR, Linux visual/CI review and owner acceptance remain separate.

Contract and baseline matrix: [risk policy](portfolio-risk-policy.md). PR3 quality/scope, PR4 settings and PR5 mobile panels remain separate.

### Owner directive PR1 — Historical asset exposure foundation (2026-10-04)

- [x] Drizzle schema/migration and explicitly labelled legacy seed-date assumption; preserve original storage and class cents.
- [x] One dated exposure resolver across allocation, report 4.2, class performance, R13, rebalancing, savings proposals and exports; exact weighted cents and unchanged regions.
- [x] Atomic validated replacement API, dated single-class instrument save, grouped audit/undo and same-day replacement regression tests.
- [x] Synthetic A01/A02/A03/A08, full-main-schema migration, FK, repeat migration and snapshot restore coverage. A07 target-policy changes are outside PR1.
- [ ] CI review and owner pre/post-production snapshot/count/value reconciliation. No deployment or real-iPhone acceptance is claimed.

Scope, baseline matrix and operational gate: [historical asset exposure](asset-exposure.md). PR2 risk, PR3 quality, PR4 settings and PR5 mobile primitives remain separate.

Packages and gates from `SPEC.md` §11. Each task below is one cloud session and one pull request. Ready-to-paste prompts: `docs/prompts/`. Tick the boxes in the PR that completes them.

Current implementation and owner/operations evidence: [`STATUS.md`](STATUS.md). Completed boxes record implementation, not full product acceptance or immunity to later defects. Next work is the ordered follow-up below; existing checklists remain the record of completed work.

Gate 1 (specification and designs accepted by the owner): **pending owner sign-off.**

Central coverage and the remaining work beyond the mockups: [FEATURES.md](FEATURES.md).
Requirement details to close before their corresponding tasks: [REQUIREMENTS-GAPS.md](REQUIREMENTS-GAPS.md).
The owner authorized completing and rolling out all agreed V1 pages/functions
on 2026-10-01. Independent implementation tasks can proceed while private-data
or device acceptance is pending; each task still needs its own reviewed PR and
passing required checks. A route, prototype or backend alone is not a completed
user workflow, and does not pass a private migration or cut-over gate.

## Current work — 2026-10-01 follow-up

Source: [`audit/2026-10-01-follow-up.md`](audit/2026-10-01-follow-up.md). First real import is **EUR only**; full FX support remains later scope. One task per branch/PR; verify each fix against an independent expected result and required checks.

Owner scope update, 2026-10-01: remove import as an app feature. Provide a fresh-step-up ZIP export of all accounts/portfolios with stored financial history; previous import UI/parser checkboxes record historical implementation, not current product scope. One-time migration remains a separate owner-authorized Codex/Claude task using existing exports and the PP file in private storage.

- [x] Record owner-confirmed retirement of the prototype-only Fly app; keep the versioned prototype and leave legacy staging unchanged.
- [x] Align README, PRODUCT, SPEC and cloud setup with implementation and acceptance status.
- [x] Record no-import app scope and CSV-only export contract.
- [x] Select and document local project skill profiles for concise communication, existing-design UI review, verified delivery and security review; see [`skills.md`](skills.md). Original upstream packages/commands are not installed by these adaptations.
- [x] Remove app upload/wizard/import-report entry points and obsolete import navigation; provide a step-up authenticated ZIP of allowlisted account, ledger and portfolio CSVs. Migration engine/server modules remain for the separate private transfer task.
- [ ] Verify deployed commit, health, phone/desktop passkeys, recovery and real encrypted restore (owner/runbook; deployed status alone is insufficient).
- [x] Intended pinned-browser Linux CI, including full E2E and visual comparisons, passed for the updated A09 tree ([CI run](https://github.com/Grabman1987/budget/actions/runs/36884718261)); no existing baselines changed. The local mobile Regelwerk difference is byte-identical on the reviewed unchanged parent; this does not claim the entire local browser suite is green or replace owner design acceptance.
- [x] A07 exact lead amounts: format once and split for display; literal expected-value tests plus rendered cents/grouping/sign boundaries on all three pages, desktop and mobile. Pinned-browser visual acceptance remains a CI requirement.
- [x] A06 categorized income: allocation/rules include allowed income categories; distinguish transfers, refunds and contact repayments.
- [x] A01 trade settlement integrity: generic update/delete/bulk/reconcile/undo cannot detach a trade from its cash flow.
- [x] A08 booking currency invariant: amount/currency match account, original currency explicit; shared contract in create/update/transfers/import.
- [x] A05 payment lifecycle: edit/delete/rematch/undo recompute status, links, amounts and related totals.
- [x] A03 EUR-first guard: unsupported on-budget foreign currencies never enter EUR sums silently; create/update/import/existing accounts covered.
- [x] A03 account overview aggregation: keep native balances in the account DTO and expose shared EUR account/total values; overview totals, changes and closed residuals use the shared valuation, with explicit missing-rate behavior.
- [x] Follow-up FX detail implementation: account lead reuses the overview's EUR value; native cash, booking/running balances, daily charts and reconciliation show explicit currency and dated EUR valuations with stored rate provenance. Shared conversion/formatting, missing-rate states, native audited reconciliation/undo and synthetic unit/API/desktop/mobile coverage; see [currency contract and evidence](fx-account-detail.md).
- [ ] FX detail owner design/device acceptance and private native/EUR reconciliation; pinned Linux CI remains required before merge.
- [x] A04 persisted Gate-2 reconciliation: each mapped account/month-end and category checked; structural missing-account/currency/opening-data differences reported explicitly; one-cent added/missing/changed/deleted cases detected, including non-budget and closed accounts.
- [ ] Separate agent-assisted EUR migration/Gate 2 after corrections and operational acceptance; establish private file access and transfer procedure; never commit exports/mapping or include them in CI/logs.
- [x] A02 investment costs use historical account-currency FX at each trade/snapshot date; current price valuation, fees/income and typed missing-rate behavior are consistent before Gate 3.
- [x] A09 realized gains persist independently of live holdings and later snapshots; moving average is the default, FIFO is persisted via Einstellungen › Depots & Kryptos; source transactions and broker-withheld taxes are preserved.
- [x] A10 broker/risk aggregation preserves account/institution for securities at multiple brokers. Both portfolio summaries and rule inputs use account ownership, retaining one security/class total and the existing Crypto/P2P limits; six independent synthetic regression cases verified.
- [x] Missing-quote browser scenario uses a fresh real server, database and passkey session per test attempt; desktop/mobile, repeats and retries cannot share unpriced holdings. Existing valuation, history, undo/redo and accessibility assertions remain unchanged.
- [x] Manual-price API writes have an atomic user audit group, support insert/update undo and redo, and refuse stale undo conflicts; refreshes retain their external-series behavior and manual-price protection. The complete wealth capture UI remains open.
- [x] First successfully stored network quotes record their actual write timestamp atomically; seeds/imports, failed/empty fetches and protected manual rows do not claim a refresh. Unchanged reruns retain the same history. Initial manual-entry time and live-source acceptance remain separate.
- [ ] Live adapter validation and complete manual valuation workflows before accepting those wealth workflows.

After EUR acceptance: complete Heute/contacts/inbox daily workflows, PP commit/matching and Gate 3, remaining wealth/source/report/PWA scope and Gate 4. Prototype-host removal is separate from retiring still-used finance tools.

## Future feature candidates — owner inspirations

Backlog: [`inspirations.md`](inspirations.md). These are possible later improvements, not accepted implementation scope. The ordered audit corrections, EUR migration and operational/product gates retain priority. All six source links are collected; source contents remain unreviewed because access is policy-blocked.

- [x] Create a durable collection of owner-submitted inspiration links with stable IDs, access status and existing feature overlaps.
- [ ] Review I01–I06 when source access or excerpts are available; extract specific useful interactions before scheduling implementation.
- [ ] Evaluate multiple goals per category (I02) against P3.4 savings goals, including allocation without double counting.
- [ ] Evaluate distribution preview in a side panel (I03) against the existing waterfall/rules; bank reconnect reminders depend on P4 connections and reliable expiry data.
- [ ] Evaluate debt-payoff strategy comparisons (I04/I06) against existing debt/Sondertilgung scope, shared calculations and explicit assumptions. Plannrr (I05) needs a demo or description first.

## P1 Fundament

### P1a — Repo scaffold and stack spike (`docs/prompts/P1a.md`)
- [x] npm workspaces: `apps/web`, `apps/server`, `packages/domain`, `packages/db`, `packages/ui`, `packages/fixtures` (worker later)
- [x] TypeScript strict, shared tsconfig, ESLint, Prettier, Vitest; `npm run check` = typecheck + lint + unit tests
- [x] `apps/server`: Hono app with `/health`, serves the built web app, strict CSP (`script-src 'self'`), HSTS
- [x] `apps/web`: Vite + React + TanStack Router + Query, one route rendering "Budget" in the blueprint fonts
- [x] `packages/domain/money`: cents type, de-AT formatter (`1.234,56 €`, real minus, sign option, no-cents option), arithmetic amount parser (`12,50+8,20`, `1.576`, `× ÷`, no eval) with tests ported from `design/prototype/app.js` behaviour and `reference/finance-hub/money-input.mjs`
- [x] `npm run proto` serves `design/prototype` on port 5180
- [x] Playwright set up (`npm run test:e2e`) with one smoke test
- [x] Dockerfile (Node 22, multi-stage), `fly.toml` (region `fra`, volume mount `/data`, app name from env/placeholder)
- [x] GitHub Actions: `ci.yml` (check + e2e on PRs), `deploy.yml` (on push to `main`: `flyctl deploy --remote-only`, skipped when `FLY_API_TOKEN` is not set)
- [x] Chart spike: render the Heute pace chart and one Sankey from prototype data with own SVG + d3-scale/d3-shape; note the decision in `docs/adr/0001-charts.md`

### P1b — Design tokens and blueprint primitives (`docs/prompts/P1b.md`)
- [x] Tokens from `.impeccable/design.json` / `DESIGN.md` → CSS custom properties + Tailwind theme; light and dark (`prefers-color-scheme` + manual toggle), print tokens
- [x] Self-hosted fonts from `design/prototype/fonts/`
- [x] Primitives in `packages/ui`: TitleBlock (Schriftfeld), Registers, DimensionChain (inline, with balancing of rounded parts), PartsList (Stückliste with groups and positions), RevisionTable, AmountInput (uses domain parser), Segmented, Switch, SidePanel / BottomSheet, Toast with undo, Status stamps, class swatches (need/want/future hatching)
- [x] Chart primitives: axis/graticule, line (solid/dashed/dash-dot), bars around zero, step line, band, elevation mark
- [x] Dev page `/dev/bauteile` showing every primitive in light and dark
- [x] Own regression baselines for every primitive on `/dev/bauteile` (light and dark, 1440 and 390): screenshots of our own output, **not** a comparison with `design/screens`
- [x] Title block, register row and shell chrome compared with crops of `design/screens` (masked text; `e2e/reference.spec.ts`, audit D9)
- [x] Keep the topbar geometry comparison on the prototype’s explicit nine-item fixture; real zero/error/live inbox counts remain independently tested. Reuse retry-aware account/payee names in ledger browser tests so retained partial attempts do not cause ambiguous selectors or duplicate-name conflicts. Capture instrument screenshots after Undo/Redo checks so capture time does not consume the toast lifetime. No reference images, masks or tolerances changed.
- [ ] Primitives without a matching crop in `design/screens` (amount field, panels, toast, revision table, parts list, charts, drawn Maßkette) are not compared with the prototype yet

### P1c — App shell and routing (`docs/prompts/P1c.md`)
- [x] Desktop: sidebar "Planliste" 01–05 with collapse, top bar (search Ctrl K, Posteingang with counter, + Buchung), theme toggle, profile
- [x] Connected global search: session-protected queries (2–200 characters), at most five results each for bookings/payees/categories/accounts/contacts, existing destinations with reload-safe booking/contact links, loading/empty/retry states, Ctrl K/arrow/Enter/Escape and mobile bottom sheet; synthetic API/browser verification. Owner acceptance remains open.
- [ ] E3 command palette (implementation and focused tests present): reuse header/mobile search with fuzzy pages/full report catalog (position/slug/name), open accounts, categories/contacts/payees and latest 200 bookings (payee/memo/native amount); recent IDs in session memory with fresh server validation, capture/inbox/privacy actions, month-close entry through account reconciliation and shared `?` keyboard help. Empty query offers recent bookings; no close wizard, dependencies or automatic bookings added. Full local verification, owner/device and Linux visual acceptance remain open; [results/evidence](evidence/palette-1005/README.md).
- [x] E3 CI repair 2026-10-07: month-close regression selects the palette command and still verifies resume at step 4. Full local typecheck/lint, 3,437 unit tests, production/E2E builds and 18 search/month-close browser cases pass. Required CI and owner acceptance remain open; [verification](palette-ci-repair-1007.md).
- [x] Mobile (< 768 px): header, tab bar, floating + button; same routes and order
- [x] Routes for all areas and registers (SPEC §3) with placeholder pages built from TitleBlock + Registers; every view has its own URL
- [x] Side panel (desktop) / bottom sheet (phone) pattern wired to a route param
- [x] Shell regression screenshots at 1440 and 390 (own baselines, `e2e/shell.spec.ts`)
- [x] Shell compared with `design/screens` (layout, not data): sidebar, top bar, title blocks and register rows at 1440, phone header at 390 (`e2e/reference.spec.ts`; the phone title strip and register row are not compared because they differ on purpose: labels are shown, 44 px touch targets)

### P1d — Database, fixtures and domain core (`docs/prompts/P1d.md`)
- [x] Drizzle schema v1 for the entities in SPEC §5, migrations, repositories; soft delete; audit log with undo; idempotency keys for imports
- [x] `packages/fixtures`: deterministic TypeScript port of the sample ledger generator in `design/prototype/reports-core.js` producing real bookings (not monthly sums) for Okt 2023 – 17.09.2026
- [x] Dev seed script loads the fixtures into SQLite
- [x] Domain: account balances from bookings, envelope month (assigned / activity / available, rollover), `alloc` (50/30/20 as twelfths), net worth series
- [x] Tests reproduce prototype figures (e.g. net worth 17.09.2026 = 84.730 €; August 2026 allocation Bedarf/Wunsch/Zukunft/Rest as in the One-Pager)

### P1e — Passkey login, security, deploy (`docs/prompts/P1e.md`)
- [x] SimpleWebAuthn registration and login, several passkeys, ten recovery codes, session cookie (HttpOnly, SameSite=Strict, 30 days), step-up for sensitive actions
- [x] First-device bootstrap via one-time setup token from an environment secret; no open registration
- [x] Rate limiting on auth endpoints; audit of logins
- [x] Litestream backup to object storage (config + restore instructions in `docs/ops.md`)
- [ ] Operational acceptance: target reported deployed; compare `/health` revision with the successful deployed CI SHA, then verify phone/desktop login, recovery and real encrypted restore (owner checklist in `docs/ops.md`)

## P1f Audit fixes (`docs/audit/2026-09-29-p1-audit.md`)

Order: P1f-1 → first deploy (after P1f-2 B1–B3) → P1f-3 before P2; P1f-4 in parallel. B5 (encrypted backup) before any real data.

### P1f-1 — Deploy, CI and build (`docs/prompts/P1f-1.md`)
- [x] A1 deploy only after green CI on `main`, `workflow_dispatch`, branch protection documented
- [x] A2 actions pinned to SHAs, token only in the deploy step
- [x] A3 `--ha=false`, single-machine guard, first-deploy order in docs
- [x] A4 lockfile in sync (jsdom)
- [x] A5 `BUDGET_REPLICATE=1`, health grace period
- [x] A6 rollback runbook, additive migrations rule, Litestream commands verified
- [x] A7 Windows paths (`fileURLToPath`), `.npmrc ignore-scripts`, engines, working `npm run dev`, e2e container
- [x] A8 Dependabot, digest pins, unused deps, SIGTERM
- [x] A9 README/SPEC drift

### P1f-2 — Auth and backup (`docs/prompts/P1f-2.md`)
- [x] B1 audit-log flood bounded
- [x] B2 recovery sessions revocable, "Alle anderen Sitzungen beenden"
- [x] B3 body limit
- [x] B4 recovery codes with pepper
- [x] B5 client-side encrypted backup (**blocker for real data**)
- [x] B6 rate limiter IPv6 /64 and capped
- [x] B7 low-severity hardening
- [ ] B8 second, independent storage target for the encrypted backup with its own credentials (owner decision 29.09.2026: yes, later; until then monthly manual download per `docs/ops.md`)

### P1f-3 — Data model and domain (`docs/prompts/P1f-3.md`, before P2)
- [x] C1 envelope rollover per concept §5.3
- [x] C2 "Zu verteilen" by on-budget status
- [x] C3 income categories and income types
- [x] C4 split-level transfers, idempotent transfer import
- [x] C5 one opening-date rule
- [x] C6 account type and on-budget flag
- [x] C7 foreign-currency fields
- [x] C8 undo keeps invariants
- [x] C9 extended CHECK enums
- [x] C10 holdings per account, FIFO, FX, cash-flow returns
- [x] C11 read models, Vienna date module, rounding
- [x] C12 cheap model gaps
- [x] C13 stronger figure tests and fixture coverage
- [x] C14 model needs of the YNAB import (card payment kind, flag, staging tables, mapping per run)

### P1f-6 — Credit card overspending by YNAB's rule (owner decision 30.09.2026)
- [x] Funded card spending, credit vs cash overspending, covering later in the month, refunds and payments in `budgetMonths` (`cardRule: 'ynab' | 'concept'`, default `'ynab'`); worked examples and the P2d export cases in `docs/migration/ynab-export.md`

### P1f-4 — Frontend (`docs/prompts/P1f-4.md`)
- [x] D1 PartsList keyboard
- [x] D2 toast live region and in-dialog
- [x] D3 route titles, search params, panel state
- [x] D4 page frame as in the prototype
- [x] D5 full Maßkette primitive
- [x] D6 dev routes not in production
- [x] D7 AmountInput a11y
- [x] D8 details as listed for PR 1, `eslint-plugin-jsx-a11y`, axe on every route
- [x] D8 remainder: TitleBlock "Stand" long/short pattern (`StandValue`)
- [x] D8 remainder: ElevationMark shelf under the label, Sankey class nodes not solid for want/future (P1f-5)
- [x] D9 honest visual comparison against `design/screens`
- [x] D10 phone layout: bottom padding under tab bar and + button, title-block fields with label, header title, register scroll cue, recovery-code sheet (owner screenshots)

Process from P1f on: one branch per task, PRs ≤ ~1.500 changed lines, tick only what the repository proves.

### P1f-5 — Prototype fidelity (owner review 30.09.2026, side by side with `design/prototype`)
- [x] Theme button as in the prototype: names the target ("Dunkle Blaupause" with moon / "Heller Zeichenfilm" with sun), follows the system until the first switch
- [x] Phone title strip compact as in the prototype: values only, labels kept where the value alone is ambiguous (Einnahmen, Bank-Sync); no empty strip
- [x] Reports catalog as in the prototype: Stand and Datenbasis, one table with quiet assembly rows, chart form in technical caps, Steuerung with print mark, row chevron, whole row clickable; stacked rows on the phone
- [x] Motion as in the prototype: solid chart lines plot in 900 ms (optional 260/520 ms stagger), annotations fade in (500 ms after 380 ms); the Maßkette plots only its result line
- [x] ElevationMark shelf under the label; Sankey want/future nodes hatched with outline

### Plan year follow-up — read-only overview (2026-10-02, PR #133)
- [x] Connect Plan › Jahr to all twelve existing budget-month reads; category and group detail, signed assigned/activity annual sums and December available balance (never sum rollover balances).
- [x] Sticky category column on desktop; all metrics, month selector and category annual values on a 375px phone, with read-only year navigation.
- [x] Independent literal domain regression cases and real-server Playwright behaviour tests; no schema or financial mutations.
- [x] Y14: category/month event calendar, audited side-panel create/edit/switch-off/remove and undo/redo; once/monthly/quarterly/yearly/specific-month recurrences shared by report 3.1 and R07.
- [x] Unsaved selected-event mit/ohne scenarios: stored monthly Zu verteilen plus cumulative future event delta, month comparisons and December stock; no booking, assignment or extrapolated income.
- [ ] Owner visual/device acceptance of the annual planning workflow.

## P2 Kern und Migration

Starts after P1f-3 is merged. Source: YNAB export (`docs/migration/ynab-export.md`); Actual is not migrated. YNAB's categories and habits are evaluated and adapted via an owner-approved mapping, not copied. The export and mapping stay in the owner's authorized private migration environment, never in the repo, CI or logs. No app import UI. **Gate 2:** balances per account and month match YNAB to the cent; Available per target category matches the mapped YNAB categories before the rules month.

Order: P2a → P2b and P2c in parallel → P2d (parser can start right after P1f-3) → owner's import on the deployed app (after P1f-2 B5).

### P2a — Accounts and bookings (`docs/prompts/P2a.md`)
- [x] #422: reconciliation for every open booking-based account in Konten and month close; stored review/value dates in the overview with a 35-day warning; shared account-page manual value entry with undo and explicit save blockers; running-month dates capped at today. [Evidence](evidence/reconcile-all-accounts/README.md).
- [ ] #422: required CI and owner daily-session/device acceptance after integration.
- [x] API and repositories: accounts (type, on-budget, terms, closed), bookings with splits and transfers, payees; validation, audit, undo (`docs/api-ledger.md`, PR `p2a-api`)
- [x] Konten › Übersicht, Einzelkonto (balance line, bookings, flags, status), Alle Buchungen (filter, search, bulk edit) (PRs `p2a-ui`, `p2a-ui-2`)
- [x] Kontostand prüfen with "doppelt" / "fehlt" and Ausgleich booking (reconciliation snapshot) (PRs `p2a-api`, `p2a-ui-3`)
- [x] P2a review follow-ups (PR `p2a-followups`):
  - [x] Tests: undo and redo of a transfer edit, redo of a transfer, single-leg undo refused
  - [x] Payee merge skips reconciled bookings unless unlocked, reports `skipped`
  - [x] Opening balance/date locked once a Kontostand prüfen is stored, unless unlocked
  - [x] Check day at most today (Europe/Vienna); future bookings are never stamped
  - [x] `createApp` refuses the ledger without auth
  - [x] Einzelkonto: month bounded to its last day, "Weitere Buchungen laden" instead of a cut at 200
  - [x] Account sort in one transaction
  - [x] UI: failed "Wiederholen" toast, bulk delete confirmation, "Umbuchung (beide Seiten)", URL filters validated like the server
  - [x] Moving a booking to an account in another currency is refused (the cents would change meaning)

### P2b — Capture dialog (`docs/prompts/P2b.md`)
- [x] Buchung, Split, Umbuchung (Konto → Konto) on desktop panel and phone sheet; amount field with arithmetic; payee autocomplete with default category; keyboard flow; undo toast (PRs `p2b-capture`, `p2b-capture-form`, `p2b-capture-split`)

### Booking capture and account register polish (#425, owner 2026-10-11)
- [x] Note always visible in a growing one-line field; split button/editor directly available.
- [x] Desktop account register note column with truncation/full hover text; mobile payee note retained.
- [x] Overview sparkline accessibility label matches its 90-day range.
- [x] Icon-only status checkmark beside date, accessible state/tooltip and pending defaults including cash.
- [ ] Required CI and owner desktop/phone design acceptance; local targeted evidence in [delivery notes](evidence/capture-note-split/PR.md).

### P2c — Categories and Plan › Monat (`docs/prompts/P2c.md`)
- [x] Einstellungen › Kategorien: groups, classes, kinds, stages, targets, hide, merge (with re-assignment of bookings), drag sort, split-off, monochrome emoji icons (PR `p2c-categories-ui`)
- [x] Budget API: month summary, assign, move, cover overspending through `budgetMonths` (cardRule `'ynab'`); categories API incl. merge and split-off; property tests stock = flow and merge keeps totals (PR `p2c-categories`)
- [x] Plan › Monat: waterfall with 9 stages, views (Stückliste, Zeit, Triage), Geld verteilen, overspending and card payment per concept §5.3 (cash overspending red, credit overspending as new card debt; PR `p2c-plan`)

- [x] P2c review follow-ups (API, domain, fixtures): Decken from "Zu verteilen" capped unless confirmed (`allowNegative`), card payment keeps kind and card, split-off only on live bookings and stores the new category's target, waterfall ties by group then category order, fixture targets without double counting (periodic 2026 amount on its due day, several dates as a monthly twelfth), sample plan funded by R03, tests for merge undo (tree, targets, opening envelopes, payees) and card rule (rollover, two cards)
- [x] P2c review follow-ups (UI):
  - [x] Decken from "Zu verteilen": "Nur x decken" or the explicit "Trotzdem ganz decken (Zu verteilen wird negativ)"; a refusal shows as a toast
  - [x] Assign fields: the pre-filled (also negative) figure is absolute; + / − is relative only when typed first; Enter or Escape never commit twice or on Escape
  - [x] Card payment: kind and card read-only
  - [x] Merge: never into income or card payments; notes for a hidden target and an overspent source
  - [x] Zeit view: periodic and by-date targets due on their own day
  - [x] Sorting: repeated ↑ / ↓ builds on the last move (focus stays); phone ↑ / ↓ buttons, one undo per move

### P2d — YNAB import with mapping (`docs/prompts/P2d.md`)
- [x] Parser for Register.tsv / Plan.tsv incl. CESU-8 emoji repair, splits, transfer pairing; synthetic fixture export in the real format
- [x] Mapping document (zod schema), `applyMapping` to the target model (opening balances and Available at the start month, n:1 merges, drop, rules), source-to-mapped-target reconciliation — `packages/import-ynab`; persisted account/month checks remain open in A04
- [x] Import review follow-ups: all bracket-note forms, cash advance (card → budget account) in `budgetMonths`, scheduled rows after the export date, one `card_payment` target per on-budget card, Ready to Assign from the export's own budget status, rules never on transfers or tracking accounts, problems by index/hash, account proposals (closed, paid-off loan), trimmed account names, hidden categories under their original group, split payees, start-month income, hand-computed card expectations; deployed owner-import acceptance remains below
- [x] Raw staging, dry run with side-by-side structure, commit as one reversible import run, idempotent re-import (PR `p2d-wizard`)
- [x] Import wizard in Einstellungen › Datenquellen (step-up), reconciliation report page (Gate 2) (PR `p2d-wizard-2`)
- [ ] Owner: category evaluation and mapping done, real import on the deployed app, Gate 2 report without difference

## P3 Planung und Steuerung

Expected payments, contacts with receivables, savings goals, rule set registered rules (`RULE_CODES`) + stages, Heute page, Posteingang basics.
- [x] P3.3 `p3-kpi-domain`: pure KPI, pace, free-until-payday and liquidity-forecast functions in `packages/domain/src/{kpi,forecast}`
- [x] Shared budget/category/goal/inbox write toasts report refused undo/redo and connection failures in German; rejected actions preserve stored/query state, successful audited chains retain refresh behavior
- [x] P3.4 `p3-goals`: savings goals domain (`packages/domain/src/goals`), repo and `/api/goals` (audit, undo, adopt as category target), Plan › Sparziele page (parts list Offen/Erreicht, bars, panel)
- [x] P3.5 `p3-rules-api`: rule engine `packages/domain/src/rules` (registered rules (`RULE_CODES`) with zod params, `evaluateRule`, Finanz-Check summary), `ruleInputs` / `evaluateRules` / `financeCheck` read models, `ensureDefaultRules` at start, stage checklist with owner confirmation, additive `rule` migration, `/api/rules`
- [x] P3.7 `p3-regelwerk-ui`: Einstellungen › Regelwerk (`apps/web/src/rules`): stage checklist in three columns with owner confirmation of non-computable items, rules registered rules (`RULE_CODES`) with typed threshold panel (status, next step, undo), switches and thresholds as audited PATCH with undo toast
- [x] P3.9 `p3-heute-api`: `GET /api/heute?period=month|payday&month=` (one request: stand, lead with chain and drill-down, balance actual and forecast with salary jump and low point, pace, pinned envelopes, upcoming 14 days, Finanz-Check, net worth with delta and 12 month ends, last bookings, next steps), `packages/domain/src/heute`, `heute` read model, `category.pinned_at` (migration 0010) with `PATCH /categories/:id {pinned}`, pinned fixtures
- [x] P3.10 `heute-page`: Heute wired to its read model (month/payday URL, lead drill-down, balance and pace, pinned envelopes, upcoming payments, Finanz-Check, net worth, latest bookings and next steps); capture/budget/rule edits and undo/redo refresh Today, actions open the source month or uncategorized bookings through today, mobile urgent step follows the lead. Browser coverage includes capture/undo/redo, actual navigation, negative lead in both themes, retry, empty states and settled chart endpoints; owner visual acceptance remains pending.
  - [x] P0 #273: Upcoming payment status names only the Budgetrücklage/Envelope amount; its note explicitly says account balance and overdraft limit are not checked. The read model remains envelope-only; no account-coverage calculation or payment behavior is added. Synthetic API/component regressions and isolated desktop/mobile light/dark browser evidence pass; [evidence](evidence/payment-budget-273.md).
  - [x] Full frozen-tree `npm run check` passed on Windows (374 test files / 3,451 tests); lead and independent screenshot/source review found no remaining #273 issue-specific finding. Actual iPhone Safari acceptance is tracked separately under #310; [full check and evidence](evidence/payment-budget-273.md).
  - [x] Owner follow-up 2026-10-02: payday selection disabled outside the current month, URL/month fallback, Austrian business-day 15th planning rule, and month-specific Decken in multi-month plans; [behavior and calendar contract](month-navigation.md).
  - [x] P1 #266: Heute names household income by booking date and links to the current month's Plan income explanation. Plan separates matched expected receipts from budget-relevant booked inflows; next-month allocation keeps the existing calculation. Synthetic API/component regressions, desktop/mobile privacy and navigation, Linux visual comparisons and keyboard scrolling pass; [full check and evidence](evidence/income-scope-266/README.md).
  - [ ] Follow-up delivery acceptance: full check, desktop/mobile browser evidence and owner device review (PR #132).

- [x] Expected payments (P3.2): schedule domain (due dates, Austrian business days, versions, occurrences, matching), `date_shift` migration, repositories with audit and undo, `/api/expected`
- [x] P3.6 `p3-expected-ui`: Plan › Erwartet (next 90 days by week, Verträge und Abos / Alle parts list with monthly and yearly sums and original currency, payment panel with fields, versions, occurrences, link/unlink/missed), "Als erwartete Zahlung anlegen" on a booking, Einnahmen panel on Plan › Monat (`/api/expected/income`)

### P3 — Contact statements and settlement (owner decisions 2026-10-01)

- [x] #427: audited contact rename with active-name validation and undo/redo; Plan month adds categories at group ends and groups at the bottom through the existing forms. Empty groups remain usable in single/multiple month views. [Delivery evidence](evidence/contact-rename-plan-plus/README.md); CI and deployed owner acceptance remain pending.

- [x] Pure actual contact statement and oldest-outlay-first repayment allocation, editable before saving; expected occurrences excluded
- [x] Audited atomic settlement API with persisted excess contact credit, whole-action undo/redo and dependency checks (including forced undo)
- [x] Konten › Kontakte: nonzero overview, balanced-history toggle, contact creation, Kontoblatt and actual EUR cash repayment with editable allocation
- [x] Owner feedback 2026-10-05: cashless “Ausgleichen” in contact list/detail, partial credit to Zu verteilen or forgiven debt to category activity; confirmed zero booking, shared validation/audit/undo, separate report classification and synthetic API/component/browser coverage.
- [x] Synthetic acceptance: 30 + 70 outlays / 40 repayment, edited allocation, 100 owed / 120 receipt / 20 credit, balanced history retained, cash-only net worth through outlay/receipt
- [ ] Owner review of the contact workflow on the deployed app; foreign-currency contact statements remain outside this bounded EUR slice

### P3 — Posteingang basics

- [x] #437: exclude stored read-source movements from the inbox list and shared Inbox/Heute/navigation counts; keep titles starting with `Quellsaldo`. Show one source summary linking to Datenquellen, with title grouping/filtering, 100-entry pages and the existing resolve/undo actions. No migration or stored-data rewrite. [Evidence](evidence/inbox-read-source-summary/README.md); CI and deployed owner acceptance remain pending.

- [x] E4: learn assignments on owner confirmation by normalized counterparty + direction; prefilled **Übernehmen** / **wie zuletzt bei …**, view/remove in Einstellungen › Zuordnungsregeln, last-choice replacement and grouped audit/undo; synthetic learning/matching/deletion/direction tests. Existing rule JSON reused, no migration or dependency; owner acceptance remains open.

- [x] Actual queue and shell counter: one task per due nonzero unclassified budget booking plus unresolved stored warnings; no sample counter or legacy summary double count
- [x] Konten › Posteingang and global desktop/mobile panel: categorize in the existing booking editor, confirm pending bookings, acknowledge stored warnings with audited undo/redo
- [x] Shared ledger invalidation refreshes the queue, count and Heute reads after mutations/undo; safe empty/error/loading states and keyboard/touch actions
- [x] #279 global inbox pagination: 100-entry network pages, whole-queue task/kind counts, receipt-only badge scope, audited resolve/undo and complete month-close filtering beyond the first page. API regression, fresh E2E build, 42 affected desktop/mobile browser tests (one intended skip) and the final full check (379 files / 3,503 unit tests) passed. CI, deployment and owner acceptance remain pending. The endpoint still constructs the whole queue before slicing, so no database-query performance claim is made. [Evidence](evidence/inbox-pagination-279.md).
- [x] #277/#278/#319/#320 inbox package: month-based current/historical filtering before pagination with an unchanged total badge, repeated data checks grouped by source/cause with accessible individual tasks, direct header navigation and `/konten/posteingang/:id` warning details. Existing confirmation forms, resolve and audit/undo paths remain shared. Focused local verification (12 unit tests, 17 desktop/mobile functional scenarios, package typechecks, changed-file lint/format and E2E build) replaces the full check under the owner's parallel-job override. [Evidence](evidence/inbox-package-1009/README.md); CI and deployed owner acceptance remain pending.
- [ ] Bank/assignment suggestions and source repair workflows; acknowledging a warning does not repair its source
- [ ] Independent review, CI and owner acceptance of this workflow on the deployed app

### UX quick wins (`feat/ux-quick-wins`)

- [x] Device privacy toggle in header/profile and keyboard shortcut; monetary display/input/chart masking without changing stored values
- [x] Capture category available amount: retained existing grouped picker, warning ink and regression coverage
- [x] One authenticated storage-persistence request per device; status in Einstellungen › Sicherheit
- [x] Plan › Monat uncategorized/pending inflow, outflow and net row with booking links; no duplicate budget deduction
- [x] Rest verteilen fills an active populated split line with integer-cent remainder
- [x] Today attention links for overspending, monthly funding, inbox and sequential payment cover; hidden when empty
- [x] Mobile regression fixes: attention follows the urgent lead, privacy moves into the keyboard-accessible profile menu, and loaded zero account changes use the shared amount mask
- [x] Validated `/erfassen` draft links, safe login continuation, normal explicit save and documentation
- [ ] Delivery checks, draft PR and owner desktop/phone acceptance

### Y21 — Receipts

- [x] Content-addressed volume storage (`RECEIPTS_DIR`), additive receipt metadata and n:m booking links; audited upload/link/unlink/remove and guarded undo/redo
- [x] Session/origin guards, 15 MiB file limit, magic-byte MIME allowlist, JPEG/PNG/WebP metadata removal and safe authenticated download/thumbnail responses
- [x] German booking Beleg section and capture-first Posteingang list with explicit later booking assignment; no automatic booking
- [x] Nightly encrypted archive includes retained receipt blobs; legacy DB-only backup retention preserved; restore runbook and metadata limits in [receipts](receipts.md)
- [x] Synthetic file/API/encrypted-restore tests, additive migration upgrade preserving legacy links, and scoped browser checks with desktop/mobile light/dark [visual evidence](evidence/receipts/README.md)
- [ ] Owner: real-phone camera capture, directory/space checks and encrypted DB-plus-receipt restore after deployment; independent review/CI acceptance

## P4 Datenquellen
Enable Banking adapter, worker with nightly run and catch-up, inbox items, assignment rules and source status in Einstellungen › Datenquellen. Manual file imports are excluded from app scope; all-account/depot CSV export is available as a step-up authenticated ZIP.

### P4.1 — PSD2 bank sync into the inbox
- [x] #400: one connection card with scoped actions/messages, per-account daily request counters, visible manual cooldown/limit, account mapping explanations, persisted last complete results and source-filtered inbox links. New connections require confirmation; existing explicit/legacy policies remain unchanged. Synthetic desktop/mobile light/dark coverage; owner acceptance and CI remain delivery gates.
- [x] RS256 adapter, step-up/session-bound consent, encrypted session/account identifiers, owner-selected EUR account mapping.
- [x] Owner decision 41: BOOK transactions become unchecked, uncategorized bookings immediately; PDNG remains a candidate until confirmed. Per-connection confirmation-first override, stable-reference promotion/deduplication, bank balance warnings and separate replayable ledger audit; no automatic categorization or distribution.
- [x] Separate nightly worker on the same volume, catch-up, durable leases/backoff, queued manual refresh and consent reminders.
- [x] Datenquellen status/mapping UI and owner setup in `docs/DATA_SOURCES.md`; synthetic HTTP, domain, workflow and browser tests.
- [x] Review corrections: changed-reference updates/warnings, duplicate-reference fallback, isolated account failures, 21-day overlap and durable four-request/day limit; tolerant rows/undated balances, stable balance warnings, redacted auth/config failures, callback pruning and versioned encryption.
- [ ] Owner: register application, configure secrets, connect accounts, reconcile the first run and demonstrate 14 stable nights.
- [x] Assignment-rule engine and Einstellungen › Zuordnung: all/any payee/raw-text/regex/signed-amount/account/direction conditions; payee/category/percent-split/memo/flag/transfer actions, history preview, ordering, enable/disable, audit/undo and learn-from-confirmed-bank-row.
- [x] Source-specific bank payee cleanup and learned raw-to-payee aliases; raw evidence retained through memo edits, merge references updated with undo. Automatic rules prepare assignments; bank staging never posts without owner confirmation.
- [x] Explicit transfer actions preserve booking identity, pair unambiguous same-day/same-currency/opposite-amount bank candidates, and attach later bank evidence to generated counterparts without posting twice; ambiguous matches roll back. See [limits and validation](assignment-rules.md).
- [ ] Ambiguous bank history changes, broader transfer matching (including different posting days), and private owner/device acceptance remain separate work.
- [x] Bank follow-ups: closest +/-5-day manual-booking merge preserving memo/splits, confirmed mirror/selected-booking transfers with original dates, dated bank balance on Konten and guarded one-click reconciliation lock; grouped audit/undo, synthetic unit/API and isolated desktop/mobile coverage. Migration `0024_bank_followups` stores balance observations.
- [x] #423 reconciliation dialog: explicit fetched-balance takeover, optional bounded adjustment date/category, missing-booking capture through the existing dialog, and locks through the observed/fetch day including `XXX` sources. Existing defaults and grouped undo remain intact; targeted delivery evidence in [reconcile dialog](evidence/reconcile-dialog-plus/PR.md).
- [x] Einstellungen › Zuordnungsregeln merges the bank assignment rules and payee cleanup with the income budget-month defaults on one route (`/einstellungen/zuordnung`); migration `0032_assignment_rules`.

### Crypto read source (P4/P5)
- [x] Read-only current public API adapter; env-only key, paged resumable operation inbox, provider-ID deduplication and explicit investment/cash mappings.
- [x] Native balance warnings, audited page/cursor writes, existing nightly timer hook and step-up protected manual fetch/full replay in Datenquellen. See [owner setup and limitations](crypto-read-source.md).
- [x] Review fixes: mapping-independent acknowledgement/current display, row quarantine and categorized failures, tolerant balance reads with independent operations progress, unchanged-difference acknowledgement and bounded cursor history.
- [x] Automatic reconciliation of source operations against the existing ledger (trades, cash bookings, deliveries, informational stake moves), applied while staging and via the audited, undoable "Abgleich neu ausführen" in Datenquellen; summary erfasst / fehlt / ohne Zuordnung / informativ. See [Ledger reconciliation](crypto-read-source.md#ledger-reconciliation-abgleich).
- [ ] Owner key setup, private reconciliation and 14-day nightly acceptance; dedicated P4 worker and automated posting remain separate (the matcher never creates bookings or trades).
### Owner decision 42 — Income for the following budget month
- [x] Persisted per-inflow "für nächsten Monat" option in desktop/mobile capture and editing; retain cash date, category and income type, defer Zu verteilen across month/year boundaries through the shared budget calculation.
- [x] Einstellungen › Zuordnungsregeln: defaults per payee, income category or income type, specific precedence and explicit per-booking override. Apply to new owner captures/classification only; retain existing history. Audited rules and booking changes with undo/redo, bounded API validation and rejected transfer/contact/mixed-spend shapes.
- [x] Cash-flow/income reports keep booking dates; budget 50/30/20 uses the assigned month. Synthetic domain/API tests and fixed-clock isolated desktop/mobile browser scenarios cover save, edit, override, undo/redo, accessibility and both themes. Changed files, checks and the open Windows full-check blocker: [decision evidence](evidence/owner-decisions-41-42.md).
- [ ] Owner acceptance on actual bank feeds and the first month-end; ambiguous source identity changes still require manual review.

## P5 Vermögen
Price history (yfinance + Ariva, source per price), ECB rates, trades and holdings, portfolio performance, allocation, Sparpläne, debts with extra repayment, freedom number with Soll-Pfad. **Gate 3:** returns and holdings equal Portfolio Performance.

### P5.0 — Shared wealth arithmetic correctness
- [x] Exact half-up rounding for odd divisors and divisor one, including signed ties, single-month annualisation and zero progress; no extra cent or basis point from the rounding offset.

### P5.1 — Market data: price and FX sources behind adapters (`docs/market-data.md`)
- [x] `packages/market`: Yahoo chart (daily close, unadjusted by default, adjusted per security), Ariva CSV fallback (flag, off), ECB SDMX (inverted on integers), deterministic fixture sources; decimals parsed to micro-units without floats; fixed-text errors without URLs
- [x] Migration on `security`: `fallback_quote_id`, `quote_exchange`, `prices_enabled`, `quote_adjusted`
- [x] Jobs `refreshPrices` / `refreshFx` (backfill, fallback, manual prices protected, `stale_value` inbox item per security and error class), in-process daily timer `BUDGET_MARKET_DAILY=1`
- [x] Live prices in production: Ariva (public HTML table, verified live; CSV needs a login) as primary source, CoinGecko as the primary crypto source (cryptocalc fallback for coins without a coin id), Yahoo last resort; `security.quote_url` / `coingecko_id`; nightly 02:30 Vienna run (previous day's close, ECB in the same run) with catch-up; `market_run` log behind "Stand ... Kurse"; `fly.toml` switches (`docs/market-data.md`)
- [x] Daily sample prices (seeded Brownian bridge through the month-end prices) and a daily USD rate series; parity figures unchanged
- [x] API: `POST /market/refresh`, `GET /securities/:id/prices`, `PUT /securities/:id/prices/:date`, `GET /fx`
- [ ] Owner: Yahoo symbol, Ariva id and exchange per real security, adjusted or not as in PP, Ariva access (see `docs/market-data.md`)

### P5.10 — Portfolio Performance XML parser (`docs/migration/pp-export.md`)
- [x] `docs/migration/pp-export.md`: client version and scales, securities and prices, account and portfolio transaction types, units (fee, tax, gross value, forex), cross entries, XStream references, taxonomies, mapping table
- [x] `packages/import-pp`: XXE-safe XML reader (no DTD, size and depth limits), reference resolver, model builder with path-addressed problems, mapping to securities, prices, investment accounts, trades and bookings; integer conversion only
- [x] Synthetic PP file generator `packages/fixtures/src/pp` (`npm run fixtures:pp`, XStream shape, byte-stable); round trip ledger → XML → parse keeps trades, prices and holdings/cost (P5.2 functions)
- [x] P5.11 (operator CLI, no import UI by owner decision): mapping document, security matching, commit with one transaction per run, revert, `migrate-pp-cli.js`, Gate 3 report as data (`docs/ops.md` §13)
- [ ] Gate 3 stays open for the owner: real-data comparison with PP's own returns, cash-flow reconciliation, missing recent trades
### P5.2 — Performance: valuation series and portfolio performance (no UI)
- [x] `invest/series.ts`: daily valuation per position (units, carried-forward price, FX of the day, one rounding), cash flows of the "securities only" and "depot incl. reference account" views, semantics documented
- [x] `invest/performance.ts`: `periodWindow`, TTWROR over daily sub-periods, XIRR and the prototype's Modified Dietz, volatility, max drawdown, Sharpe (2,5 %), beta, best/worst month, share of positive months
- [x] `invest/cost.ts`: one `costOf` (FIFO default, average), `gainOf`, `terOf`, realised gains, income and fund costs of 12 months
- [x] Read models `valuationSeries`, `cashSeries`, `portfolioFlows`, `netWorthDaily` (own vs market); property tests against `holdingValuesAsOf` / `netWorthAsOf` on random days
- [x] Tests: prototype PERF per period, hand-computed Portfolio Performance cases, sample-ledger figures (+38,2 % since Oct 2023)

### P5.4 — Vermögen frame and Nettovermögen (`docs/api-ledger.md`, section Wealth)
- [x] API `GET /wealth/networth?period=` (daily series, bars per week up to 3M else per month, chain Anfang + Eigenleistung + Markt = jetzt, composition per account) and `GET /wealth/stand`; pure `netWorthWindow` / `bucketNetWorth` in `packages/domain/ledger`
- [x] Vermögen frame: Stand ("Do 17.09.2026 · Kurse 06:30"), Zeitraum 1M 3M YTD 1J 3J Alles in `?zeitraum=` (default YTD, kept between the registers), registers
- [x] Page `/vermoegen/nettovermoegen`: head with change, figure, daily line (plots 900 ms), own bar band (Eigenleistung ink, Markt pale), legend, Maßkette, "Woraus es besteht" (debts dashed); two columns on desktop, stacked on the phone
- [x] Tests: window/bucket unit tests, API tests (jetzt = Konten net worth = 84.730,00 EUR, chain adds up for every period), e2e on the sample server, layout comparison with `vermoegen-netto`, own baselines (Linux), axe
- [x] Stand shows the timestamp after the first successful network price write (`price_audit.ts`); seed/import prices without recorded fetch remain unstamped. Failures, manual protection, fallback, repeated refresh and transactional rollback have regression coverage.
### P5.5 — Invest API: securities, trades, savings plans, asset classes, portfolio summary (no UI)
- [x] Migration 0008 (additive): `savings_plan` (rows end and restart on a change, `valid_to` inclusive)
- [x] Repos: securities (ISIN unique, delete refused while in use), asset classes with versioned targets (sum = 10 000 bp per `valid_from`), trades of all kinds with unit sign rules and idempotent `import_key`
- [x] Every trade has a settlement booking on the investment account (buy -(amount + fee), sell amount - fee - tax, dividend/interest as income Kapitalerträge), one audit group per trade, undo
- [x] Domain `invest/savings-plan.ts` (`plannedExecutions`, `matchExecutions` +-3 days with fee tolerance, `planChanges`) and `invest/trade-rules.ts`; apply of a proposal ends and restarts rows from the next execution day and opens the inbox item "Sparplan bei der Bank ändern"
- [x] `/api/securities`, `/api/asset-classes` (+ `/targets`), `/api/trades`, `/api/savings-plans` (+ `/executions`, `/proposal`, `/apply`), `/api/portfolio?period=&view=`
- [x] Depot view: a plain booking on a reference account is an external flow (inflow = Einlage, outflow = Entnahme); interest, dividends, fees and taxes stay performance
- [x] Sample savings plans; tests incl. the 17.09.2026 portfolio figures of the prototype

### Missing-quote valuation guard
- [x] Explicit nullable current account/position values and missing-price metadata; known basis and CSV rows retained. Numeric helpers and held-day history reject missing quotes rather than inventing zero or gains; genuine domain zero quotes and zero units remain valid.
- [x] Today keeps budget/upcoming/bookings usable, with unavailable finance-check/net-worth sections and German reasons.
- [ ] Partial-history charts and separately available legacy summary fields; independent financial review and private reconciliation remain required.

### P5.6 — Current portfolio positions and instrument detail
- [x] `/vermoegen/portfolio`: original lead/chain and class-grouped positions, shared server value/basis/gain/shares, per-broker ownership and explicit unknown price/FX/basis; read-only instrument detail in `?produkt=` with actual account navigation
- [x] Manual quote capture with date/source/currency, exact micro precision, existing audited price API and undo; literal projection/mutation tests and desktop/mobile light/dark browser evidence
- [x] Basic instrument creation/editing (name, kind, currency, ISIN, symbol, existing asset class), empty-portfolio entry and instruments without holdings; existing audited API/undo, dirty/pending-save guards, validation and reload/error states. Source/cost settings and broker ownership are preserved.
- [x] Current-only class allocation/rebalancing hints using shared risk calculation, original Soll/Ist bands and revision rows; audited dated target editor and basic class creation with undo/redo, unknown/nonpositive valuation and dirty/pending navigation guards
- [x] Instrument metadata and manual quote forms protect dirty edits during browser Back and route changes; pending writes reject navigation, successful creation opens the saved instrument, and explicit close/discard prompts only once. Native unload protection remains browser-controlled.
- [x] Manual buy/sell creation and editing plus source trade history, including instruments without current holdings; exact units, account-currency gross/fees/withheld tax, atomic settlement and group undo/redo. Shared basis/valuation and per-broker ownership remain authoritative; no new oversell policy.
- [x] Savings-plan schedule list/create/edit/end in native investment-account currency; today's effective rate separated from future versions, source/history, inclusive end date, audited undo/redo, quote-independent reads and dirty/pending navigation protection. Saving schedules creates no trades, bookings or bank orders; changes at the bank remain manual.
- [x] Audited trade deletion with linked cash settlement and undo/redo; capture/edit of dividend/distribution, interest, fee/tax, deliveries and signed split deltas using the shared holdings/cost/cash rules. Synthetic unit/API and desktop/mobile light/dark keyboard/browser coverage.
- [x] Due monthly savings execution proposals in Heute/Posteingang, including overdue months; owner-entered actual units/gross/fees, atomic buy/settlement/audit confirmation, stale/duplicate guards and monthly identity across schedule versions with deletion/undo/redo. Schedule saves and proposals never book money automatically. See [workflow and owner steps](trades-execution.md).
- [ ] Extended instrument/source management and deletion, rate-optimisation proposal/apply UI and remaining performance/report bodies; owner design acceptance and Gate 3 private reconciliation remain open

### P5.7 — Current debts and unpersisted monthly repayment model
- [x] Schulden overview/chain from shared nullable current account values, actual account drilldown/history, explicit unsaved native-currency assumptions and existing server payoffPlan; typed limits/unknown states, no payment or contract writes
- [x] Literal projection/FX/safety/session/origin tests and desktop/mobile light/dark original-prototype geometry and browser evidence
- [x] Per-loan payment terms live in Einstellungen › Konten; on top: dated rate changes (variable conditions, versioned, audited, undoable, used by the payoff schedule), persisted scenarios per loan (one-off and recurring Sondertilgung, rate change, higher installment) compared with the baseline (payoff month, interest, interest saved, months earlier; shared integer-cent domain calculation, migration 0033) and an avalanche/snowball comparison for two or more debts (credit cards with a balance included) with an extra monthly amount; decision support only, no payments or bookings; German UI, light/dark, desktop/phone (form dialogs per docs/mobile-panels.md). Limits: monthly model, no prepayment penalties, strategies use the rate in force at the model start.
- [ ] Connected debt/card rules and private contractual reconciliation remain later

### Debt explanation and full-width package (#294 #296 #342 #343)
- [x] Explain negative net account values versus negative native-currency cash strategy candidates, including a positive-net depot with negative cash; preserve both existing calculations (#294).
- [x] Link the debt model to the existing liquidity forecast with its budget-account scope and an explicit no-transfer/no-affordability-claim boundary (#296).
- [x] Stack the calculation lead and model at full width; preserve numeric comparison columns (#342).
- [x] Audit the loan summary: baseline and scenarios already follow the model at full width; no remaining layout code change (#343).
- [x] Scoped local verification and synthetic desktop/390px browser evidence. See [delivery evidence](evidence/debts-scope-1009/README.md).
- [ ] Required CI and owner visual acceptance; pre-existing loan-dialog trigger-focus restoration remains a separate gap.

### P5.8 — Freiheitszahl: forecast from today
- [x] #615: current #507 Anlagebasis shared by Freiheit and R16, applied to dated history with the visible current-selection note; literal scope-save/undo, missing valuation and read-only preview regressions ([evidence](evidence/reference-adoption/wp-010-freedom-universe-615.md)).
- [ ] #615 required CI/live acceptance; historical Ist chart (#616) and persisted personal goal/assumptions (#617) remain separate.
- [x] Connected current R16 expense/investment sources and configurable multiple; explicit unknown quote/FX and short-history annualisation, original lead/chain/quarter progress and source navigation.
- [x] Explicit unsaved saving assumption and 5 % real-return default; shared monthly projection with +100 EUR comparison, bounded numeric errors, desktop/mobile light/dark and accessible values.
- [ ] Historical Soll-Pfad, chosen goal year and persisted assumptions await separate owner decisions; the complete freedom workflow and private acceptance remain open.

## P6 Reports und Umstellung

### Category trend — #385, owner decision 2026-10-09

- [x] Report 1.6 month values/chart points and report 2.1 heatmap cells drill into the exact category/calendar month; classified split/refund contributions reconcile in cents across booking pages.
- [x] One or more categories in report 1.6; detail follows the existing period control; category selection, period and optional previous-year month survive URL reloads.
- [x] Previous-year month uses dash-dot lines; absent months stay `–`, recorded zeros stay zero; existing consumption and Zukunft sources are reused.
- [x] Targeted typechecks in five affected packages, changed-file lint/format, 75 tests in eight affected Vitest files, E2E build; full check/full E2E omitted under the package's parallel-job memory override.
- [x] All six affected functional cases passed on desktop and 390 px mobile, including focused reruns; light/dark Axe, overflow, monthly touch targets, masking and image review. See [evidence](evidence/category-trend-385/README.md).
- [ ] Required CI, PR review and owner product acceptance after deployment.

### Report 3.1 — baseline and scenario clarity (#284)
  - [x] Label the forecast basis from existing payment assumptions and variable planning; show an event setup hint only when no active planned events are configured, and disclose events outside the selected horizon.
  - [x] Isolated synthetic browser evidence for no events, later events and recurring-event count, with desktop/mobile screenshots, light/dark Axe and overflow checks. See [evidence](evidence/liquidity-baseline-284.md) for the integrated browser and full-check results.

### Portfolio composition — owner feedback 2026-10-05

- [x] Additive parent/group migration; two-level lifecycle and audited moves; dated class targets and group Soll sums.
- [x] Explicit operator assetClassTree, idempotent dry-run/savepoint/audit behavior and operator-only P2P defaults; account assignment in settings.
- [x] One group/class sunburst, matching legend and group/class/product subtotals; shared segment inspection, no region chart and threshold-gated region table/editor link.
- [ ] Final local check/build/browser verification, draft PR and CI review; owner visual acceptance and private reconciliation.

Contract and operator/owner steps: [portfolio composition](portfolio-composition.md).

### Target classes without holdings — follow-up 2026-10-05

- [x] Positive dated targets remain in the composition and Soll/Ist tables at zero held value; empty legend swatches, assigned unheld product names/ISINs and instrument links.
- [x] Existing underweight rebalancing hints name assigned unheld securities; allocation flags security kind `other` for correction in the instrument editor.
- [x] Synthetic read-model regression preserves held values, shares and exact cent totals; desktop/mobile browser cases cover unheld products and rebalancing, without regenerating baselines.
- [ ] Owner visual acceptance and review of private instrument assignments/kinds after deployment.

Read-model and delivery details: [unheld target classes](allocation-unheld.md).

### Planning income and shared report ranges — 2026-10-03
- [x] Plan › Monat: expected household income versus all envelope monthly target requirements, source label, surplus/gap and keyboard-accessible unfunded-category details; reuse target/carry calculations and stored monthly holds. Live dated schedules take precedence; without schedules use the median of the preceding three complete months (before today for future planning). Missing amounts/currency/history remain unavailable. The existing payday rule defines a date, not a salary amount.
- [x] Shared quick choices on every implemented selectable period report, including Explorer saved views: current/previous month, 3/6/12 complete months, current/previous calendar year, all, custom inclusive calendar months. Legacy period URLs and segmented controls remain supported; partial current months stop at today. Month/year-only, fixed-source and forecast reports keep their existing controls.
- [x] Optional dotted linear fit of displayed actual time-series values, default off, URL-backed; no fit of forecasts, missing values or single points. Desktop/mobile light/dark, keyboard/Axe, synthetic fixed-clock unit/API/E2E evidence.
- [ ] Owner design acceptance; orchestrator review/commit/PR and pinned Linux CI. No migration or automatic booking. No existing Linux screenshot baseline is expected to change: modified report/Plan tests capture evidence images, while shell baselines show the unchanged report catalog/Heute. See [scope, checks and changed files](evidence/income-targets-report-ranges.md).

### P0 #271 — Empty monthly target inventory

- [x] Plan › Monat shows an unconfigured state when no effective monthly target exists; configured zero and reached targets retain the funded state. Use the selected month's effective target metadata, including hidden categories supplied by the existing all-rows read model.
- [x] Synthetic component regressions cover no rows, rows without an effective target, an explicit zero target, a reached positive target and an unfunded amount formatted from literal integer cents.
- [x] Add and run the isolated-ledger browser case for future-dated, hidden zero and reached targets through the real API; desktop and mobile passed with Axe, overflow checks and eight light/dark state captures. See [browser evidence](evidence/empty-monthly-targets-271.md).
- [x] Full repository check passed: typecheck, lint/format validation and 373 Vitest files / 3,447 tests. No target formula or booking write changed.
- [x] Lead review of all eight synthetic desktop/phone light/dark captures; no visual finding.
- [ ] Required CI, PR integration and live revision verification. Physical iPhone acceptance remains the separate #310 task. See [evidence](evidence/empty-monthly-targets-271.md).

### P6 — Static PWA baseline
- [x] Build-versioned static shell cache, install manifest/icons derived from the existing brand mark, offline fallback and opt-in update prompt. API/auth/export/health are network-only.
- [x] Offline reload has no financial figures; a connection loss retains unsaved form state and shows an offline/stale-data notice.
- [x] Y26/D07: IndexedDB capture queue with local edit/delete, Heute/Konten counts, cold offline capture from minimal form choices, FIFO online/focus/manual retry and atomic API idempotency (migration 0022). Retain session/reference conflicts; uncertain delivery must be checked before editing/deleting. Synthetic unit/API and desktop/mobile offline browser coverage.
- [ ] Physical phone installation/passkeys and Gate 4 acceptance remain separate. Month-close write locks have no current server model; the queue retains/explains typed lock rejections when provided, without inventing a month-close policy.

### Report 5.4 — Kontakte-Abrechnung
- [x] Fixed all-time EUR report with shared replay running balances/credit chain, nonzero overview, balanced history/deep links, per-person ledger/stair chart, pending metadata and real booking/contact source navigation. No sending/settlement duplication or month selector; unsupported currency makes the entire read unavailable.
- [ ] Independent financial review, owner design acceptance and private contact-ledger reconciliation; other report bodies and Gate 4 remain separate.

The 30 reports (SPEC §7), explorer, printable sheets, parallel run with reconciliation report. **Gate 4:** one month-end without difference, then retire remaining finance tools, including YNAB and PP. The prototype-only host was retired independently of this gate.

### P6.3 — Einzahlungen und Wert
- [x] `/reports/peinzahlungen`: opt-in monthly and calendar-year series from the existing securities valuation and flow read, with exact start + net flows + residual value change = end conservation; no duplicate valuation or flow formula.
- [x] Match the original report body with period control, value/cumulative-net-flow lines, monthly value-change bars and year rows. Label the securities-only scope and stored flow semantics; do not infer savings-plan or R12 attribution.
- [ ] Depot-inclusive flows and source-linked savings-plan/R12 attribution remain open until the source model supports them.

### P6.1b — Monthly table reports (1.5 to 1.8)
- [x] `GET /api/report-tables/months`: one read of the monthly ledger facts (income by type, spending and assigned per category from the shared budget calculation, Geldalter and net worth per month end); every figure is derived in `packages/domain/src/report-tables`.
- [x] `/reports/jahresansicht`, `/reports/kategorien`, `/reports/sparquote`, `/reports/gesamttabelle` with the prototype's sections, heat grid, previous-year comparison, Ist/Plan chart, Sparquote/Geldalter charts and CSV of the displayed table.
- [x] Owner decision 02.10.2026: Kapitalerträge are a visible memo row and never part of Einnahmen, Sparquote or income comparisons; Erstattungen (owner decision 29.09.2026) reduce the spending of the refunded category (payee's default category) in the month of the refund, only a refund without a category stays a labelled row.
- [ ] Owner/private acceptance against the real ledger; month-end net worth is withheld as a whole when a price or rate is missing.

### P6.4 — Rendite und Kennzahlen
- [x] `/reports/prendite`: selected-period summary from `GET /api/portfolio` in securities-only view (TTWROR, existing annualized metrics, netflows, period gain and end value) plus separately labelled lifetime realized gain/completeness; no new financial formula.
- [x] Suppress all report figures when the legacy portfolio summary returns `valuation_unavailable`; keep documented zero gains distinct from unavailable basis and preserve gains when open positions are empty.
- [x] Focused invest API cases, synthetic browser edge fixtures and read-only sample-ledger browser coverage on desktop/mobile; accessibility and horizontal overflow checked in light/dark mode. Evidence: [report 4.4](evidence/report-4.4.md).
- [x] Owner-selected benchmark security persisted via audited app_setting with undo/redo; stored-price comparison over the same period, explicit quote/FX gaps, historical asset-class comparison and accessible monthly returns heatmap. Shared TTWROR/Modified Dietz, synthetic domain/API/browser evidence; see [report 4.4 extension](../docs/performance-report.md).
- [ ] Depot-inclusive performance view, owner design acceptance and private performance reconciliation remain open.

### P6.5 — Empfänger-Analyse
- [x] `/reports/empfaenger`: connected closed-month recipient activity from shared budget `splitEffect` and Bedarf/Wunsch category rules, with explicit unclassified outflow disclosure and stable-ID/null-payee grouping
- [x] Signed refunds, distinct qualifying booking counts, live booking statuses, account opening dates, clamped 3J/all-history ranges and read-only recipient booking drilldown; no parent-amount duplication or purchase attribution
- [x] Literal API/domain boundaries and sample-backed desktop/mobile light/dark browser evidence; see [report 2.5 scope](payee-analysis-report.md)
- [ ] Full report-catalog acceptance, private-data reconciliation and any broader all-outflow report remain open

### P6.3.4 — Jahresvorschau Zahlungen (first source slice)
- [x] `/reports/vorschau`: twelve full future months from live stored expected-outflow contracts and all live amount versions, using the existing shifted due-date rules. Read-only `GET /api/expected/year-preview` requires a session and never materialises, matches or refreshes occurrences.
- [x] One pure projection feeds lead, chart and twelve-month payment calendar. Preserve native amount ranges/currencies, display unavailable contract amounts explicitly and overlay stored status/links once per payment/date. Linked actual bookings retain their own currency and remain separate from contract projection.
- [x] Literal domain/API cases, audited-write query invalidation and synthetic desktop/mobile light/dark browser evidence. See [report 3.4](evidence/report-3.4.md).
- [ ] Full original source coverage: independent investment savings plans, other future ledger transfers and their cross-source identity/dedup contract; no inferred category funding. Owner acceptance remains open.

### Security review — 2026-10-02

- [x] Time-bounded server source review, API no-store, production origin validation, debug authentication guard and safe unexpected/bulk errors; synthetic regressions and desktop/mobile browser checks. See [security audit](audit/2026-10-02-security-review.md).
- [x] S06-S08: default-off/non-production HTTP importer gate, per-owner/process export admission through stream cleanup, S3 full-request timeout and bounded/sanitized provider errors. Operator CLIs unchanged; synthetic regressions.
- [ ] S09: supported stable drizzle-kit upgrade remains unavailable (latest 0.31.11 retains vulnerable transitive esbuild); dependency unchanged, schema generation checked. Production verification and encrypted restore remain separate; no security certification claimed.

### P6.3.5 — Sparziele-Fortschritt (first source slice)
- [x] `/reports/sparziele`: stored goals at the existing API's server month; reuse progress, needed rate, last-three-month rate, forecast/status and bar geometry without a new money formula. Category sources mean month-end Available; account sources mean native cash balance, not securities value.
- [x] Guard unique live EUR sources; missing/deleted/dual/foreign/shared sources retain identity/date but no financial figures or status. Combined goal/category/account reads suppress cached figures during loading or failed refresh; no sums across goals.
- [x] Source table, read-only detail and filtered source-booking/Plan drilldowns; literal API/read-only and write/undo/redo refresh checks, real synthetic API browser, keyboard/Axe and desktop1440/mobile390 light/dark evidence. See [report 3.5](evidence/report-3.5.md).
- [ ] Original emergency-fund reach, Tagesgeld split, independently allocated money per goal, linear Soll path and owner acceptance remain open; I02 source allocation is not resolved by these guards.

### Y22a — Automatic payslip intake
Owner setup and limits: [payslip intake](payslip-intake.md); synthetic browser evidence: [verification](evidence/payslip-intake/README.md).

- [x] Optional recursive Dropbox scan with dynamic year folders, durable incremental cursor, content-hash/SHA-256 deduplication and shared manual PDF upload.
- [x] Server-only PDF password, bounded extraction, Austrian wage-line adapter with owner code mappings, separate reimbursements and signed tax/SV corrections; warning/retry, cent check and separate bonus/pension document handling.
- [x] Audited draft/receipt/inbox staging and owner confirmation/rejection, live salary-booking suggestions, grouped undo/redo and encrypted receipt-backup reuse; source status and setup documentation.
- [ ] Owner verification of private layouts/mappings, live read-only Dropbox authorization and encrypted restore after deployment.

### Y22 / Reports 1.2 and 1.9 — Captured payroll and side projects
- [x] PR #139 review fixes: separate tax-free reimbursements, signed SV/Lohnsteuer corrections with exact net conservation and signed ratios, live payslip-position deduplication including undo/redo, salary-split payout linkage and retained archived project choices. Synthetic domain/API/migration and desktop/mobile browser regressions; details in [payroll report scope](payroll-projects.md).
- [x] Manual EUR payslip capture/edit/remove: base gross plus typed additional earnings, SV-DN, captured Lohnsteuer, other deductions, controlled net; regular, 13th/14th and other special payments. Existing payout booking and optional stored receipt reference; no tax calculation or automatic booking.
- [x] Drizzle migrations, shared zod validation, header/line savepoint and audit group, soft deletion and grouped undo/redo. Combined payout links compare salary/special splits with the captured salary net sum, excluding reimbursements.
- [x] `/reports/gehalt`: monthly gross-to-net chain, deduction ratios, recorded calendar-year totals, same-month/kind prior-year comparison, fourteen recorded salary positions, missing-month chart gaps and payout consistency warnings/source links.
- [x] `/einstellungen/projekte`: create, rename, archive/reactivate and undo/redo; retained project attribution/history, active-only new booking attribution. `/reports/projekte`: closed-month split-level income/cost/result, signed refunds, prior-period comparison, monthly results and booking drilldown; side income stays a distinct household income type without adding project profit again.
- [x] Final local typecheck/lint/full unit and API suite (223 files, 2,166 tests), production build and four synthetic desktop/mobile browser scenarios; light/dark Axe and overflow checks. Local worker/timeout settings and screenshots: [verification evidence](payroll-projects.md#verification-evidence).
- [ ] Separate receipt object-storage/upload workflow, collective/step-raise metadata and inflation comparison, project hours/hourly rates; owner design/private-data acceptance and Gate 4 remain open.

### Owner configuration and Einstellungen › Konten — 2026-10-03
- [x] Operator `source-rebuild` (2026-10-04): staged crypto depot history, opening deliveries, monthly rewards, cash/units reconciliation, locks/unlock, dry-run/undo and synthetic domain/DB/CLI coverage; [ops §12.8](ops.md#128-rebuild-a-crypto-depot-from-staged-source-operations). Private platform verification remains an owner step.
- [x] Owner dry-run fixes (2026-10-05): separate asset fees, earn trades/fiat swaps, token migrations, external deliveries/reclaim, stored ECB conversion, wallet-plus-staked opening/verification and source-type diagnosis; synthetic per-case and combined regression coverage. Private rerun remains an owner step.
- [x] Second owner dry-run fixes (2026-10-05): visible staking-wallet reference and missing unstake-OUT correction, optional staking override, latest stored FX/recent EUR asset-price fallback, repeatable private monthly trace and operation-linked reward keys, unexplained snapshot changes; synthetic domain/DB/CLI regression coverage. Private rerun and reconciliation remain owner steps.
- [x] Third owner dry-run fixes (2026-10-05): zero-value splits from unexplained mapped balance changes, nearest stored ECB fallback with rate date, and strictly sub-cent/unpriced dust deliveries; synthetic threshold, dry-run, repeat and undo coverage. Private rerun and larger-difference reconciliation remain owner steps.
- [x] Operator `owner-trades` (2026-10-04): strict private add/delete file, PP-style cash settlement, income-in-kind rewards, idempotent adds, per-entry savepoints, run audit/undo and dry-run; review fixes protect reward legs, repair missing transfers, require reference cash accounts and respect owner deletions; synthetic regressions and [ops](ops.md) section 12.7.
- [x] Owner-config extension (2026-10-04): create securities, merge crypto mappings, re-categorise live splits; dependency order, one audit group per run, dry-run/undo and synthetic amount/balance regressions. Details: [ops](ops.md) §12.6.
- [x] Operator command `owner-config --file <json> [--dry-run]` (profile, rules, category stages, expected payments with skipped occurrences, bulk "vorgemerkt" to "bestätigt", security quote settings, asset class names): audited per entry, undoable, idempotent, exit code 3 on skips; schema in [ops](ops.md) section 12.6.
- [x] Einstellungen › Konten: accounts grouped like the sidebar, rename and retype, order, close/reopen, terms by type; loan terms (fixed or variable interest, installment, term start/end, original amount) read by the Schulden calculator (pre-filled) and the Kosten report (installment wins over expected payments). Drizzle migration 0030. Fix: an account edit that does not name the opening balance no longer resets it to 0.
- [ ] Owner acceptance of the page and of the private owner-config file on the server.

### Report and KPI correctness audit - 2026-10-03

Scope and shared definitions: [report correctness](report-correctness.md).

- [x] Explicit split-level loan fee attribution; opening, disbursement, principal and transfers excluded.
- [x] Project reports use the shared legacy/calendar range parser, including partial current months.
- [x] Nonpositive/cancelled assignment plans retain absolute deviation without misleading percentages.
- [x] Pace counts fixed/expected payments once and hides first-week/planless forecasts.
- [x] R08 missing-debt-rate guard and recorded minimum repayments; shared R07 chart horizon/low; monthly R01 units.
- [x] Shared household classification for yearly/overview/table/cashflow totals and Plan year summary.
- [x] Mobile Heute safe space and bounded project settings table; synthetic regressions.
- [ ] Owner design/private-ledger acceptance and pinned Linux visual CI; no private-data access, migration or deployment in this task.

### Report 3.6 — Vermögen & Schulden
- [x] `/reports/vermoegen-schulden`: assets and debts at every month end (`GET /api/assets-debts-history?period=`, default `Alles`), net worth line, header with Nettovermögen / Vermögenswerte / Schulden / Veränderung im Zeitraum (EUR and %), month selection (`?monat=`) with the accounts behind the month.
- [x] One valuation: months are read with `netWorthAsOf` (same as Vermögen › Nettovermögen); pure split in `packages/domain/src/ledger/assets-debts.ts`; estimated/missing prices flag the month and show `ValuationHint`.
- [x] Domain unit tests (loans, credit cards, negative cash accounts, zero start), API tests (controlled accounts, equality with `/api/wealth/networth`, valuation quality, no accounts), Playwright desktop/mobile with axe light/dark and overflow checks.
- [ ] Owner design acceptance on real data.
### Owner directive PR4 — Asset class settings (2026-10-04)

- [x] Replace `/einstellungen/anlageklassen` placeholder; shared server values/quality, desktop table/mobile stacked rows and URL-driven PanelHost details.
- [x] Create/rename/order, safe archive/restore and dated instrument-editor reuse; German field errors and audit/undo/redo.
- [x] One Settings target editor linked from Portfolio; complete exact-100% versions, unmanaged/null versus managed zero, standard/custom bands and optional label/reason.
- [x] Editable investment-sum tiers in the shared risk resolver; signed cash, inclusive cent boundaries and independent report month-ends.
- [x] Atomic replacement target version plus retirement, current/future/tier/history/cash dependency guards; undo cannot bypass them.
- [x] Drizzle-generated additive 0035, representative-main migration/backup regression, complete-policy ZIP export and release note.
- [x] Final local check/build and page-specific desktop/mobile/WebKit acceptance evidence (304 suites / 2922 unit tests; 95 browser tests).
- [ ] PR/CI review, Docker/encrypted restore gates, real-iPhone owner checklist and production reconciliation/deployment.

Contract and baseline matrix: [asset-class settings](asset-classes-settings.md).

### Owner chart/report feedback — 2026-10-04

- [x] Shared chart inspection with exact values, swatches, date/month, snapped crosshair, keyboard and touch; Sankey amounts/shares.
- [x] Catalog-order report arrows and shortcuts, desktop period controls in one row; remove report valuation banners and preserve approximation marks.
- [x] Opaque red negative bars; daily report 4.3 values from existing valuations/flows, monthly gain bars retained.
- [x] Final local check/build and browser verification: 309 suites / 2,967 tests; chart inspection, report regressions and desktop/mobile evidence.
- [ ] Owner acceptance, local Git alignment and Linux visual baseline review (no local baseline regeneration); draft PR/CI review.

Owner feedback 2026-10-04: spending/cost reports 1.4/1.10/2.3–2.6/3.4–3.5 and early Heute pace implemented on `codex/spending-reports-1004`; source-model limitations and evidence are recorded in [spending report feedback](spending-report-feedback.md).
- [x] Owner booking UX 2026-10-04: inline date/amount, status/flags, cash default, Wiederholen/weekly schedules, no capture Budgetmonat, ranged account forecast and 0–365-day display setting; CI/owner visual acceptance pending.

### PR #190 money review — 2026-10-05

- [x] Reuse 1.6/1.8 monthly spending and Zukunft set-aside for 1.10; disclose uncategorised spending and assert the exact Netto/Übrig identity.
- [x] Shared typed household-income definition across monthly tables, One-Pager, Sankey and allocation/rules; typeless inflows remain visible and uncounted.
- [x] Inclusive contract binding shared with R10/history; future-ended loan rates count, one-offs and ended payments do not; foreign refunds are not payments.
- [x] Inflation booking-id weights/coverage and same-month successors; separate labelled modelled bank interest, checking-interest suppression, missing booking FX and one-to-one dividend settlement deduplication.
- [x] Early planless pace withheld; Sankey pool heading and signed half-cent rounding covered by synthetic regressions.
- [x] Final local check (322 suites / 3,081 tests), production/E2E builds and affected desktop/mobile browser checks; delivery on the existing PR branch.
- [ ] PR CI/Linux baseline review, private/physical-device owner acceptance and refresh of the protected worktree index (`git reset --mixed HEAD`); no new keys or consents.

### Report 2.4 — inflation basket settings, part A (owner 2026-10-05)

- [x] Settings page with grouped expense categories, Automatic / Always / Never, existing trailing-mean method, per-payee exclusions and bulk Always selection; report edit link and override note.
- [x] Automatic need-class fixed/periodic obligations; want/future only by explicit Always. Repeated quarterly, half-yearly and yearly charges become implicit contracts with integer-cent monthly equivalents; yearly price steps count at the second bill.
- [x] Exclusions precede contract derivation and trailing means, including weights. No name/memo guessing or real-data presets. Audited app_setting plus existing category method, atomic bulk writes and undo; no migration or dependency.
- [ ] Owner review of category choices and debt-interest payee exclusions in the running application; CI is required before merge. The other parts of the owner report request remain separate tasks.

### Report 2.4 — inflation basket by year, part C (owner 2026-10-05)

- [x] Warenkorb toggle “Seit Basis” / “Je Jahr”; category-grouped items, calendar-year columns, observed monthly price means in integer cents, same-month prior-year mean changes and chained-index contributions in hundredth Pp.
- [x] Shared index attribution and rounding with the headline; yearly contribution sums equal “Je Kalenderjahr”, including signed changes, annual reweighting and successors. Missing prices/comparisons remain unavailable; running year names its last closed month.
- [x] Final local check (327 suites / 3,107 tests), production/E2E builds and desktop/mobile light/dark browser evidence; no baseline regeneration.
- [ ] PR/CI review against main; part A was merged in PR #199 while C was being verified.
- [ ] Owner acceptance of report 2.4 and local protected-index refresh (`git reset --mixed HEAD`); no keys, consents or settings changes are needed for this read-only view.

### Report 2.4 — CPI sub-index method, part B (owner 2026-10-05)

- [x] VPI-Teilindex with one/two searchable classes and validated exact-100% split; audited persistence reuses part A and preserves payee exclusions.
- [x] Existing VPI loader/refresh extended to detailed monthly COICOP classes; synthetic recorded-layout responses, class-specific base linking and separate total benchmark.
- [x] Public price relatives weighted by own base-year spending through the existing annual chain; index units and source/household-weight labels in both basket views, explicit missing-history/publication boundary.
- [x] Evening extension (part B2): distinct category explorer with multi-select, category price/reference histories since budget start, difference/quantity details, owner interpretation note and two-category/fallback E2E.
- [ ] PR/CI and owner mapping/design acceptance. No private data, baseline regeneration, migration, provider credentials or automatic bookings.

Method, limits and owner steps: [inflation basket](inflation-basket.md#cpi-sub-index-method-part-b-2026-10-05).

### UX-3e — Booking dialog polish (owner 2026-10-05)

- [x] Replace tiny calculator keys in booking capture with an arithmetic hint; preserve the existing cent parser and no-numpad decision.
- [x] Bounded payee suggestions above the input; Enter accepts exactly one suggestion. Read the selected payee's latest booking through the existing API; fall back to capture memory/current account context and ignore stale answers after further input.
- [x] Native Mehr disclosure for splits, repetition, notes and the existing project field; summary preserves visibility of set options. Editing and prefilled optional content open it automatically.
- [x] Markieren/Schließen tooltips, Heute/Gestern/Datum… chips and Bezahlt von expense label; targeted synthetic unit and desktop/phone browser regressions.
- [x] CI repair 2026-10-07: full local typecheck/lint, 3,389 unit tests, production build and affected Chromium/WebKit browser run pass. The phone sheet retains the shared 88dvh cap and 44px controls; date checks use the German display. Fresh [phone evidence](evidence/astra-ci-repairs-1007/README.md).
- [ ] Draft repair PR/required CI, pinned Linux visual review and physical-phone owner acceptance. No local screenshot baseline regeneration; shared AmountInput only gains a default-preserving opt-in. Delivery and actual verification: [UX-3e](ux-booking-dialog-1005.md).

### Owner planning hit rate — 2026-10-05

- [x] Report 1.11 Prognosegenauigkeit: additive `plan_snapshot`, shared Pace capture, nightly idempotence/retry and conservative per-month backfill status.
- [x] Closed-month forecast/actual, exact 5% hits, six-calendar-month summary, monthly deviation bars, category drilldown and Heute copy after three comparable months; synthetic unit/API/component/E2E coverage.
- [ ] Required CI, Linux visual review and owner month-end/data acceptance. See [planning hit rate](planning-accuracy.md).

### Report 2.4 — category explorer, part B2 (owner 2026-10-05, evening)

- [x] Separate Warenkorb vs. VPI and Kategorie-Explorer; multi-select defaults to basket categories and does not change headline membership. Category lines and neutral pp differences use October 2023 = 100; missing baseline/reference stays unavailable.
- [x] Reuse the shared per-contract chain and stored CPI sub-series. Editable one/two-class comparison mapping remains independent of the basket method; unmapped categories show “Gesamt-VPI (kein Teilindex)”.
- [x] Booking-average/unit price relatives and additive count/unit effects where supported; explicit purchase-mix caveat, volume share denominator and fixed owner-interpretation note. No automatic better/worse verdict.
- [x] Synthetic domain/API/component tests; two explorer E2E cases on desktop/mobile with light/dark accessibility and review evidence, without baseline regeneration.
- [x] Local verification: all workspace typechecks and ESLint; the one full check stopped on a late E2E formatting edit, corrected and checked in isolation. Full unit suite: 331 files / 3,121 tests; final affected regression run: 37 tests. Production build passed.
- [ ] Stacked Draft PR/CI and owner mapping/design acceptance. No keys, consents, migrations or automatic bookings.

### E2 glossary tooltips — owner 2026-10-05

- [x] Small German glossary and report-only `<Term>`: dotted underline, one-sentence native popover, keyboard/touch, Escape/outside dismissal and 44 px targets; report headings/columns and estimate marks reuse it, with plain print labels.
- [x] Final local check: all workspace typechecks, lint/format and 354 files / 3,286 unit tests; production build passed. Ten synthetic desktop/mobile/WebKit browser checks passed, including light/dark accessibility, keyboard/touch and print; desktop 1440/mobile 390 review images in `docs/screenshots/glossary-*.png`, without baseline regeneration. Windows sandbox verification used an ignored `os.userInfo` fallback plus one test thread and a 30 s harness timeout; assertions and repository configuration remain unchanged.
- [ ] Required CI and owner desktop/phone acceptance; no keys, consents or migration needed.

### Transitive dependency advisories — 2026-10-08

- [x] Pin `concurrently`'s exact `shell-quote` dependency to patched 1.11.0 with a narrow npm override; update `source-map-js` to patched 1.2.2 within existing ranges. Keep `concurrently` 9.2.4 and the Node version unchanged. Record why the override is needed and when to remove it in [advisory evidence](dependency-advisories-2026-10-08.md).
- [x] Clean install, dependency-tree inspection, quoted-command and source-map round-trip smoke checks; full audit now has 4 moderate / 0 high / 0 critical findings, production audit has 0.
- [x] Full local check passed with one Vitest worker and required age setting: 370 test files / 3,385 tests; the local log is retained outside the repository.
- [ ] Required final-head CI, main integration and actual deploy/health verification; remaining moderate development advisories are separate work.

### Login and account page — #311 / #312 / #313 (2026-10-09)

- [x] Bound a hanging passkey browser ceremony; preserve native WebAuthn cancellation, retry and recovery, and reject late credentials before verification.
- [x] Bind sidebar and settings profile labels to the current server session method; preserve recovery/step-up restrictions.
- [x] Separate account-specific source/observation state, stored owner check and technical retrieval dates; missing metadata stays explicit. No connection or sync action.
- [ ] Required CI/PR integration after #405, Linux visual baseline review and physical-device/cloud owner acceptance. Targeted verification and task-scoped auth review: [evidence](evidence/auth-account-1009/README.md).

### UX V1 — Vermögen, #480 (2026-10-14)

- [x] Compact portfolio performance, chart-local period controls, total debt/history, collapsed scenarios, historical freedom default and savings execution/purchase details.
- [x] Fresh web typecheck, changed-file ESLint/Prettier/CSS scale, 21 targeted unit tests and E2E build after integration. Existing calculation tests and write/undo assertions remain.
- [x] Final 14-case desktop/Chromium-phone/WebKit run: all five pages, light/dark Axe and chart-label roles, 44px controls, actual viewport-width guards, debt models and audited actions. Synthetic desktop/phone images and the wider 53-pass regression run are recorded in [delivery evidence](evidence/ux-v1-vermoegen/README.md).
- [ ] Required final-head CI, Linux baseline review, deployed revision and owner physical-device acceptance.
### P525-A — Portfolio value/return chart, part 1 (#525)

- [x] One value/TTWROR chart and shared period control; securities-only daily cents and gross flow markers, selected benchmarks only, and a link to the existing empty selection setting.
- [x] Align benchmark comparison to valued portfolio months; literal unfunded-January, March-funding and 100 + 100 → 220 / +10% regressions.
- [x] Remove Modified Dietz from report figures and glossary; retain the still-used domain approximation and its tests.
- [x] Read issue #525 and all four comments through the connected GitHub app after the CLI returned HTTP 401.
- [x] Final three-browser Portfolio spec: 9 feature cases plus 3 setup cases, including light/dark Axe, privacy, exact hover and no horizontal scroll. [Evidence](evidence/portfolio-chart/README.md).
- [x] Full local check: 436 files / 4,006 tests passed, no failures or skips; final Portfolio browser spec 12/12 and E2E build passed.
- [x] Round-1 delivery committed by the project lead; main merged into the branch, existing [PR #536](https://github.com/Grabman1987/budget/pull/536).
- [x] Round-2 money review: benchmark boundaries follow daily funded stretches (including within-month gaps), resume from the last daily level, preserve missing bases and classify signed opening transfers consistently. Added gross-flow/start-boundary and actual depot-cash/selected-benchmark regressions. [Evidence](evidence/portfolio-chart/README.md).
- [ ] Round-2 publication: `git add` blocked by `index.lock: Permission denied`; changes left uncommitted without a workaround.
- [ ] Required PR CI and the remaining #525 packages; private PP reconciliation remains Gate 3.

### #616 — actual Anlagebasis history (2026-10-19)

- [x] Reuse #615's current selected universe retrospectively for exact calendar month ends since October2023, with explicit pre-ledger coverage and missing valuation gaps; preserve the shared current resolver and financial formulas.
- [x] Display contiguous actual segments and the unchanged separate forecast, exact dates/values, keyboard/touch inspection, privacy and the existing forecast-table switch.
- [x] Independent financial/source and coordinator-owned #618 test-delta review; all nine canonical WebKit cases, 390/1440 light/dark and strict native touch evidence passed. Age-required full check passed 491 files / 4,415 tests; production build passed with all twenty frozen hashes unchanged. [Evidence](evidence/reference-adoption/wp-011-freedom-history-616.md).
- [ ] Exact-head Chromium/Windows CI, #615 parent integration and serial deployment/live revision. No issue closure or live acceptance from local evidence.


## Personal freedom goal (#617) — local validation, 2026-10-19

- [x] Private versioned goal-year setting, complete-DOB calendar-year age conversion, audit-head goal/DOB CAS before no-op, atomic undo/redo and ABA/rollback protection; malformed/future values remain unavailable without overwriting their bytes.
- [x] Persist year/age, reload and clear with grouped undo; preserve dirty drafts through background refresh/conflicts and fence pending reload mode changes. Reuse unchanged January/minimum-cent formulas, canonical selected investment basis and local unsaved return assumption; no raw DOB output or invented forecast/history samples.
- [x] Display the current required monthly saving and January deadline with existing amount privacy, actual light/dark WebKit 390/explicit1440 layout, strict paint proof, Axe, 44-pixel controls and no horizontal overflow. Five current native cases passed; four unchanged #618 cases passed separately on identical production bytes. Phone full-page fixed-navigation capture and Chromium coverage limits remain documented.
- [x] Independent whole financial/migration/security and runtime/image reviews; focused types/lint and five new unit files (21 tests) passed before mechanical main refreshes. Required age-enabled full check at `4ffca1a9`: 519 test files / 4573 tests passed, followed by normal production build exit 0; all 24 owned files, 12 protected files, HEAD and status unchanged.
- [ ] Final documentation-delta review, exact-head required CI including Chromium/Windows, serial integration and exact deployed health/live acceptance. No #617 completion or parent #528 acceptance is claimed before those gates.

Evidence: [personal goal validation](evidence/reference-adoption/wp-personal-goal-617.md).


## #578 — Account review deadlines and one Heute source

Owner decision: [#467, 16 October](https://github.com/Grabman1987/budget/issues/467#issuecomment-6209941680); task [#578](https://github.com/Grabman1987/budget/issues/578). Budget accounts and credit cards use an inclusive fourteen-day deadline; loans and supported Investments use a clamped calendar month. Quiet actually checked accounts stay checked. A shared batched read-only model drives overview due badges, reminder details and Heute's one account source/count; real audit chronology covers same-day/backdated creation/restoration and preserves original check undo/redo boundaries. Legacy unsupported receivable hints/settings remain; no money, booking/check/lock, schema or undo writer changes. General account-list layout and #566 inbox grouping are outside this change.

Local evidence: pre-merge Node 22 typecheck/lint exit 0 and six focused files **74/74 PASS** (17.27s); fresh E2E build exit 0 at `b6a03490`, followed by canonical real WebKit **5/5 PASS** (two new scenarios + three setup, 71.090s), both themes at actual 390 × 664 and a separate true 1440 × 900 desktop layout context. Independent whole financial/source, Root-owned four-existing-test delta, mechanical Main inheritance and actual eight-image/runtime reviews are clear. Runtime reports observed phone `maxTouchPoints: 0`; no native-touch or unobscured-hit guarantee. Fixed-nav/FAB full-page photo occlusion is explicitly qualified. See [evidence](evidence/account-review-578.md).

**Required aggregate completed:** at frozen `2342ffc7`, Node 22.23.3 / age 1.2.1, `BUDGET_REQUIRE_AGE=1 VITEST_MAX_WORKERS=2 npm run check` passed **530 test files / 4,656 tests** (387.00s), followed by normal `npm run build` exit 0. All 32 owned / 3,370 tracked / 14 protected files, the four Root-owned existing tests, HEAD and clean status stayed exact; wrapper, postguard and lock-release checks exited 0. Existing lint/JSDOM/chunk-size warnings remain documented. Final changes are results-only in this block and the evidence document; all thirty other owned blobs remain exact.

**Pending:** exact-head Chromium desktop/mobile CI (including the two old E2E specs not selected by WebKit), reviewed PR, serial integration and exact live revision. No completion of #467/#566 or deployed #578 behavior is claimed.
## #606 — Recorded payment history and future read projection

- [x] Reproduce the synthetic stale-detail false-empty path before product edits, distinguishing explicit refresh and the separate end-day28 boundary; historical production cause remains unverified.
- [x] Preserve signed recorded-history/currency provenance, default3 future projection, sparse/unknown data, existing calendar/version rules and unchanged GET/write/ledger/undo policy. Independent whole financial and Root-owned old-test review remain clear.
- [x] Preserve historical focused31 results, original native6/6 and failed first aggregate; Root-only router-mock correction retained all original bodies/oracles. Historical required ce54 recheck533files/4687tests385.88s and normal production build0 precede the later scoped CSS correction and do not claim current repaired full readiness.
- [x] Preserve canonical f659 visual evidence: only mobile panel baseline differed20,661pixels/7%,1failed/17pre-existing skips/119passed. Targeted snapshot workflow39345877984 reported actual15passed, but its single bot5ec baseline was visually rejected for a real phone wrapped-date defect. No approval follows from workflow success or `|| true`.
- [x] NEW real-API EUR-occurrence/backdatedUSD regression proves phone date4fragments/27.83px under old CSS. A separate NEW desktop oracle incorrectly sampled hidden0×0obstacles; corrected without removing visible navigation/text/control bounds. Exactly one scoped minmax two-column declaration fixes layout, without financial/oldtest/config changes.
- [x] Actual repaired source448e: freshE2Ebuild0 and whole canonical WebKit8/8PASS59.5s(original3+NEW2+setup3), strictAxe0/44px/rawfinance/undo/containment; all3381/20/22/head/status/index/octal+full-lstat modes and169compiled files exact. Four NEW actual legacy images plus additive safe proof retain four original PNGs/runtime immutable. Newphone390×844 and original390×664 remain distinct; sampledpositiveFABrectangle is not confirmed visibleFAB/hittest, desktopstickyheading framing limit remains.
- [ ] Corrected baseline actual-image approval and required final exact-head aggregate CI with every configured static/Linux/Windows unit/visual/browser/restore check, final PR and serial exact live revision. Local full533/4687 and normal production build0 remain historical; scoped CSS/lint/format and whole native8 cover the CSS-only local follow-up, without a new local full claim or any CI waiver. #606 and parent #482 remain unaccepted until their own gates pass.

Evidence: [payment detail history](evidence/payment-history-606.md).

## #590 — checkbox-free phone selection (current local proof; delivery pending)

- [x] Phone checkbox-free category/group/all selection, explicit keyboard/menu entry, real hold and readonly exit remain distinct from ordinary inspection, collapse/add and unchanged financial callbacks.
- [x] Historical26/26 component tests passed9.48s with affected types/lint/CSS/format/discovery0; compatibility-click shielding and deliberate fresh gestures remain protected.
- [x] Root committed source5 at9cb82f44 and inherited verified LIVE Main9c509fae at167983. Root-only existing phone-UI adapters now preserve every logical category/membership, cent/source/undo oracle and original geometry limits.
- [x] Current working freeze312a: clean85302 fresh REGULAR production build0, then canonical20/20PASS3.6m (NEW590four + existing481ten/588two/Compactone + setupthree); all18/3427/source modes/index/head and158freshcompiled bytes/modes exact, native/wrapper/guard/lock0. Original Compact public-scroll/sticky-toolbar assertion passes with phone/Plan-only actualroot scroll-padding64+56; ineffective targetmargin removed, no added stickybar.
- [x] Literal4000/6000 assignment, actual undo0/0/TBA10000, existing cent/refusal/cover/keyboard flows and trusted703ms original-button/capture/touch identity, explicit cancel/move plus final noPOST/budget/accounts all reached/PASS. Native accepted compatibilityclick, automaticOS-pan and physical-phone proof are not claimed.
- [x] Six actual current unedited images: NEWphone390×664/390×844 and EXISTING481 manual1440×900/noMobile/noTouch, both themes; source-specific profile/DPR/framing limits retained. Geometry boxes5/4 per measured band/parent are not logical category counts; phone inclusive70/72.78125/149.78125 within unchanged76/76/152.
- [x] Historical40944seven-case proof/build39305reuse,84121two failures,6621targetmargin failure and isolatedprotocol controls remain qualified. First71913log20PASS was interrupted by environment restart without wrapper/postguards; current85302 is the completed independent clean rerun. Generatedlegacy481PNG preserved outside then exact originalHEADbytes/mode restored, not a baseline approval.
- [x] Required `BUDGET_REQUIRE_AGE=1 VITEST_MAX_WORKERS=2 npm run check` at clean46767a26:538 files/4739 tests passed408.20s; normal production build0; all3429 source/full-mode/index/HEAD/process/wrapper/lock guards0. Only this evidence note and the matching README were added afterward; all product/tests/images/runtimeJSON remain byte-exact.
- [ ] Exact-head canonical Chromium/remainingCI including protectedghost/inspector projects, serial integration and verified live revision. #590 remains open.

Evidence: [phone selection590](evidence/phone-selection-590/README.md).


## #511 — valuation quality and local provenance (candidate; delivery pending)

The reviewed candidate (Main9c) preserves nullable EUR totals/native cash and existing valuation/FX/fallback policies while adding source/date/quality facts from the same memoized computation, local accessible≈ disclosures on Heute/Konten (including the TOP KPI with preserved phone right-column layout) and one current quote-work row. Exact integer safe operands/final ranges and individually rejected lossy PP quotes retain the approved scales/sign/rounding semantics. Root alone adapted four existing test files (PPmodel, two UI flows and the strict additiveHeute response-key oracle) under explicit owner decisions; the aggregate follow-up did not alter them.

Local history remains qualified: initial financial RED23/8PASS15assertFAIL, reviewed coreGREEN23/neighbors88 and additive116 at their earlier checkpoints, manual-branch14+unchangedhint5, affected types/lint/CSS/format, and historical genuine WebKit77855 at clean667/Main9c: fresh E2E build0/whole5PASS49.094328s/setup3+OWN2, manual quote34000→36000→undo34000/count3→2→3/privacy and eight original phone390×664/true desktop1440×900 light/dark captures. All168 compiled bytes/modes and source/process guards stayed exact; actual actions are click/focus/keyboard, not observed physical touch. Fixed-nav/FAB full-page images do not prove unobstructed hit targets.

The first requiredAGE full failed543files/4770tests (3failed/540passed suites;3failed/4767passed tests;401.77s); normalproductionbuildNOTRUN. Reviewed typed boundaries and Root's one exactHeute-key adaptation restored existing portfolio422/debt-safe-native200-null without weakening strict unsafe-native rejection. Focused130 and separate repeated6API cases are not136unique. The subsequent requiredAGE1/two-worker baseline at clean5973 actually passed543files/4777tests414.64s, followed by normalproductionbuild0 and all38/3435/18/full-mode/index/HEAD/process/lock guards0.

Final whole financial review then found a material inherited Number-sum gap. NEW literal DB/API tests first produced actual55cases/38PASS17FAIL5.54s on unchanged production (all23 prior cases passed): real account/holdings/cash cancellation1vs2 and missing final-range rejection. Bounded exact BigInt final-field accumulation now preserves cancellation, missing masks, cash-only−0/seeded+0 and private debt sign/200-null semantics. NEW private-mode/helper controls plus original invest24/debts9 passed in actual five files/116cases9.74s; affected four workspace types/lint6/format6 and allsource/mode/index/lock guards0. No old test changed; raw RED and unreached assertions remain qualified.

**Required final local checks passed:** at clean5565f653, AGE1/two-worker full543files/4820tests395.46s and normal production build0; all3435/38/protected18/full-mode/index/HEAD/source/process/wrapper/lock guards0. Only this own Roadmap note and matching evidence Markdown were added afterward; all other3433 tracked bytes/modes remain exact.

**Pending:** exact-head Chromium/Windows CI, original two browser flows and serial exact live revision. Prior green baseline and historical native results are not relabeled as current post-aggregate delivery proof. See [valuation-quality evidence](evidence/valuation-quality-511.md).


### #511 current UI compatibility follow-up (historical full retained; delivery pending)

- [x] Preserve the pre-UI clean5565 AGE full543/4820/395.46s and normal production build0 as historical financial/source evidence; every financial/domain/API byte remains805e. The following four display corrections do not claim a repeated post-UI local aggregate.
- [x] Reproduce actual Q3 six-versus-four source rows and duplicate two-versus-one amount selectors with NEW RTL RED12/10PASS2FAIL3.35s; preserve all original actions and amounts. Genuinely combine reminder/quote/loan work into one account row, retain a unique actual amount plus adjacent local≈ and the original phone column/order/44px amount-link.
- [x] Six selected UI files42PASS10.54s; retain the later two test-fixture type errors and exact type-only corrections. Remaining webtypes/lint5/CSS-scale/format10/discovery exited0. Root-only old UI adapters retain all monetary/undo/Axe/geometry/timing oracles and yield seven unique old files overall, not an arbitrary financial rewrite.
- [x] Root session22624: freshE2Ebuild0 and actual canonical11/11PASS95.898754s (setup3+OWN2+OLD582four+OLDloan2),0skip/flaky/unexpected/errors. Source41/current3435/protected18/full-mode/index/HEAD/status/process/168compiled/archive/lock guards and wrapper0; real quote34000→36000→undo34000/count3→2→3/privacy/source/actual44px amount-link remain strict.
- [x] Add eight byte-identical current phone390×664/true1440×900 light/dark originals plus sanitized actual runtime proof, keeping all eight historical images/runtime immutable. Root and independent reviewer opened every current image; rawSYSTEMlight/maxTouch0, full-page sticky-shell/skiplink/nav/FAB photography limits and no physical-touch/unobstructed-hit/fullDBdiff claims remain qualified. [Current proof](evidence/valuation-quality-511.md#current-ui-compatibility-correction-after-exact-head-ci).
- [ ] New exact-head Chromium desktop/mobile/Windows CI (including excluded missing-quotes/heute-cards and old582 desktop-only branch), only reviewed targeted mobile Heute shell baselines, serial integration and exact deployed health. No issue closure before LIVE; no blanket baseline refresh or extra local monetary full run inferred.


### #511 final account/group figure containment — local proof, delivery pending

- [x] Real desktop geometry RED88625 at unchanged product:1440 viewport/1461 document,132px cell with140.6195px unavailable label plus44px hint. Literal2468/9155/unavailable state already passed; later controls/profiles were unreached.
- [x] Existing overview-only right-aligned wrapping figures preserve whole known money and allow unknown status/source buttons to wrap for accounts AND groups; no financial/column/global CSS change. NEW mixed and known-only123456789-cent fixtures strictly check large1.234.567,89€ one-line text, cell/document bounds,44px controls/popup/Escape in true1440 and configured390 WebKit, both themes.
- [x] Actual90381: types/lint/format/AST/discovery/freshE2Ebuild0, canonical13/13PASS103.558092s (setup3+NEWgeometry2+OWN5112+OLD582four+loan2), all3455+NEW/source/index/head/full-mode/168compiled/process/archive/lock/wrapper0. Root separate65252 old attention5/5PASS32.243291s reuses exact build; overlapping setups not counted as18 unique. Two controlled old attention PNGs were regenerated/archived/restored byte/mode-exact, not unchanged throughout.
- [x] Keep all prior tracked image/runtime checkpoints immutable; add curated8 original figure scenes plus safe full48 geometry/currentOWN8 profile inventory. Root-owned two extra count/group-link adapters preserve every original amount/action/undo/Axe/44px/geometry/timeout and expand the documented existing-source-test authority to nine files. [Final figure evidence](evidence/valuation-quality-511.md#final-accountgroup-figure-containment-after-desktop-ci).
- [ ] Exact final-head Chromium desktop/mobile/all required CI and serial deployed revision/health. Prior Chromium launch/403 and ENOSPC attempts are pre-scenario failures, not geometry acceptance; WebKit does not replace Chromium. Historical5565 required full/normalbuild remains separately qualified; no issue closure or extra local financial full inferred.


### #585 — unabhängiger Cash-/Bankstatus bei neuen Umbuchungen (lokal geprüft, Lieferung offen)

- [x] Nur neue manuelle ganze Umbuchungen Bargeld↔Giro/Tagesgeld: Bargeld bestätigt/read-only mit Begründung, Bank zunächst vorgemerkt und vor dem Speichern tatsächlich bestätigbar. Bestehende Buchungen/Importe/Operator-/Split-/Karten-/Editpfade bleiben erhalten; keine neue Tabelle oder Migration.
- [x] Optionale Bankabsicht ohne Schema-Default/Legacy-Hashänderung; Replay vor Kontoeligibilität, explizite nicht passende Absicht422 ohne Teilwrites, Queue-Bytes und Kontowechsel getrennt geprüft. Literale±12345-Cent-/Salden-/Undo/Redo-/echte Second-leg-Rollbackfälle.
- [x] 79 neue und215 unveränderte Unitfälle über dokumentierte Checkpoints bestanden; betroffene Typen/Lint/Format/Discovery grün. Frischer E2E-Build0, kanonisch echte WebKit5/5PASS53.619470s (3Setup+2eigene), unveränderte30s-Grenzen,1440/390 hell/dunkel/Axe44/Keyboard/Salden/Undo. Wrapper47 war ausschließlich externer JSON-Kopienzähler; separate Byte-Reconciliation0, Quell-/Compiled-/Prozess-/Lockguards0.
- [x] Bei Quellcheckpoint605bd679 mit eingefrorenem19-Pfad-Evidence-Kandidaten: `BUDGET_REQUIRE_AGE=1 VITEST_MAX_WORKERS=2 npm run check`548Dateien/4927TestsPASS405.77s, danach regulärer Produktionsbuild0. Alle11 tatsächlichen Exitdateien0;3477Arbeitsdateien/19eigene/12Quellpfade, volle Dateimodi, HEAD/Index/exakter Evidence-Dirty-Status und gesamter205490-Byte-Roadmap-Präfix+eigener Anhang unverändert. Danach nur eigener Ergebnisnachtrag.
- [ ] Exakte Chromium/Windows-CI, serielle Integration und tatsächliche LIVE-Health noch offen. Fotos/Rawtouch0/Stickyfooter-Grenzen und vollständige Historie: [Evidence](evidence/cash-bank-transfer-585.md). Keine rückwirkenden Checkbox- oder Abschlussänderungen.


## #512 / WP-004 — partial UI explanation stage (local evidence; acceptance open)

- [x] Explain XIRR actual/365 and nonexclusive unavailability; retain existing Term/popover behavior. Existing Report and compact Wealth disclose only their SAME returned method/cost/period/scope and request-note bounds, separately from current allocation-as-of reasons. No calculation, resolver, API/DTO/router/CSS or existing-test change.
- [x] Retain meaningful NEW-unit RED10/2PASS8FAIL8.32s; after bounded implementation, actual4files14/14PASS10.54s (NEW10+unchangedTerm4), WEBtypes/lint/format/AST/strict discovery/source/process/lock all0. Literal11400/1400/+14%, exact allocation versus historical bounds, privacy and real navigation remain strict.
- [x] Actual43904: one freshE2Ebuild0, canonical WebKit6/6 firstPASS45.951220s (setup3+own3), default30/1worker, all17exitfiles0/source3482/fullmodes/index/HEAD/status/compiled168/process/container/archive/lock exact. Eight byte-identical originals plus safe profiles preserve390×664/true1440×900/both themes and explicit nav/FAB/skiplink/off-frame/closed-popover limits; Report-only Axe/privacy and configured-only empty503 scopes are qualified. [Evidence](evidence/investment-explanations-512.md).
- [x] Actual5562 at frozen6757085d/HEAD208/sourcea29a: `BUDGET_REQUIRE_AGE=1 VITEST_MAX_WORKERS=2 npm run check`551files/4937testsPASS439.88s, then normal `npm run build`0. All8exitfiles0; all3492working/19owned/source8/fullmodes/index/HEAD/exactstatus/whole207308-byte incoming Roadmap prefix+append/process/lock stayed exact. Native safeJSON pending flags retain their earlier checkpoint meaning; afterward only this own result block and evidence result text change, other3490bytes/modes immutable.
- [ ] Exact-head Chromium/Windows CI, final independent publication review and serial exact deployed health.

**This is PARTIAL, not complete #512 acceptance:** all four public ACs remain unchecked. SPEC-008 AC-008-01/02 selected-performance historical-source/as-of/FX/look-ahead transport and corresponding consumer proofs remain OPEN. Inherited #511 current account/Heute provenance is not historical performance metadata. No old checkbox or original Roadmap byte is rewritten.


### #481 follow-up — separate multi-category headings (2026-10-20)

- [x] Owner 6285882335 explicitly accepts “Klare Trennung priorisieren; 44 Zeilen / 20 % akzeptieren”: retain 36 category rows and 11 single-category bands, restore 8 separate multi-category headings (44 content rows versus 55; 20% fewer). This supersedes the 19 October fusion extension; historical 36-row evidence stays qualified.
- [x] One presentation predicate restores independent parent/category roles; cent/write/lock/Undo and #590 gesture handlers are unchanged. The later bounded desktop-only trailing-space CSS correction is documented below. Coordinator-owned four existing-test structural adapters and DESIGN/PRODUCT retain all financial oracles, original limits and single-category7A.
- [x] NEW RTL 5/5 and scoped static pass. Fresh E2E build + canonical WebKit 29/29 (3 setup +26 feature) pass 5.3m at Main 208cf9d1 plus reviewed working freeze 34cbc6a8; all 3479 source/168 compiled/index/mode/process/archive/lock guards 0. Native 601/Undo, 4000/6000→Undo 0/0/TBA 10000 and trusted gesture/no-write guards reach PASS.
- [x] [Four current original desktop/phone captures and compact six-profile proof](evidence/plan-separated-headings-481/README.md) are personally reviewed. Phone NAV/FAB occlusion, desktop focus/ellipsis, rawTouch 0 and logical-versus-physical height limits remain explicit.
- [x] Historical required-age full check at freeze d13759cb: `BUDGET_REQUIRE_AGE=1 VITEST_MAX_WORKERS=2 npm run check` passes 549 files / 4932 tests (452.08s Vitest duration); separate normal production build 0. All seven exits/guards 0; all 3485 working paths / 16 owned paths, modes, HEAD 208cf9d1, index/status and process/lock checks preserved. Before commit7fb274b only factual result documents changed. The later post-CI source below requires a new full check; the original PNG/profile JSON checkpoints remain exact.
- [x] Post-CI desktop selection boundary: only `.pgroup` added to the existing inside-selection selector. Meaningful NEW RTL first-Space RED, then all6 PASS5.71s with keyboard/mouse/outside/no-write checks. Existing old-test oracles, CSS and finance/590 callbacks unchanged.
- [x] Actual fresh-E2E whole run39125:31PASS/2NEW outside-fixture FAIL5.2m, including all prior29 and both diagnostic768 cases PASS. Corrected failure-only run58516:5PASS26.1s (3setup+2themes), full outside-clear/budget/writes reached, exact168 prior compiled files reused/no newbuild. These runs are not one whole33PASS. Raw references and original four PNG/six-profile limits remain in [evidence](evidence/plan-separated-headings-481/README.md).
- [x] Current selection-corrected source6171: `BUDGET_REQUIRE_AGE=1 VITEST_MAX_WORKERS=2 npm run check`549files/4933tests PASS427.89s Vitest duration; separate normal production build0. All7 exits/guards0,3485 working paths/16owned +modes/head7fb274b/index/status/process/lock unchanged at9244130d. This is Main208cf9d1-based validation, not subsequently LIVE d8bc8d34/combined-Main proof; afterwards only factual README/Roadmap results change.
- [x] Ordinary inheritance of LIVE d8bc8d34 produced reviewed joint e8a08498. Exact jointCI39406413753 failed only strict old481768 boundary in both themes/retries: natural table579.421875, integer maxscroll105, header739.421875>739 despite explicit clamp. All other shards passed; no tolerance/font waiver or old-test edit.
- [x] Controlled NEW width579.421875 first produced meaningful44013 RED3setupPASS/2endpointFAIL22.6s after width/hit/36IDs/44rows/document/fullbudget/writes checks. Header739.4375 is1/64px different from naturalCI, not an identical natural reproduction. Only desktop≥768 single-month trailing padding4px was added; phone/multi-month/financial handlers stay intact.
- [x] Actual17855 CSS checks/freshE2Ebuild0/selected5PASS23.8s: unchanged forcedwidth579.421875, maxscroll109/header735.4375≤739. Actual59692 wholecanonical35/35PASS5.1m includes those controlled2 (not40unique), original natural896, selected-desktop keyboard/outside and all financial/Undo/590 contact/no-write oracles. Exact17855fresh168 reused/no newbuild; all3500/17/modes/head/index/status/compiled/process/container/archive/lock guards0. Two new original desktop captures +six compact current profiles supplement immutable original4PNG/profiles; current manual390×844 phone captures byte-equal original tracked phones. [Current proof](evidence/plan-separated-headings-481/README.md#current-trailing-space-correction--local-acceptance-exact-head-ci-pending).
- [x] Preserve615 CI39412809115 shard2/7 NEW input failures before endpoint (Chromium intrinsic592.578125>requested579.421875), and intermediate97768 raw-style/CSP3setupPASS2fixtureFAIL. Only NEW controlled input becomes ceil(finitepositive natural)+literal.421875 using original CSSOM; exact actual fulltarget before/after and actualfraction remain strict, no CSP/product/old-test/timing change.
- [x] Actual2056 targeted canonical5/5PASS21.5s (3setup+2themes), allstatic/AST/list/source3503/20/modes/head615/index/status/168compiled/process/archive/lock0. Two actual raw records reach full controls/budget/writes;579.421875/header735.4375≤739. Exact17855fresh168 reused/no newbuild. Earlierwhole35 and historical549/4933full remain separate checkpoints, not new35/40unique/newfull; originalmedia/proofJSON immutable.
- [ ] Exact new-head all-required Chromium/WebKit/Windows CI, coordinator merge/deploy/public-LIVE acceptance. Historical549/4933 AGE full is Main208-based; no post-CSS/joint full claim. Keep #481 open.


## #512 / WP-004 — selected closing-valuation metadata stage (local evidence; acceptance open)

- [x] Add explicit valuation-v1 opt-in at original daily observation seams; preserve numerical order/rounding, legacy JSON/errors/cache and actual sold/negative/zero/window semantics. Report and compact Wealth reuse selected historical quote/execution/cost/FX facts; allocation context stays separate. No second resolver or invented historical source.
- [x] Preserve setup-only60310 and genuine2954 RED2PASS/8FAIL; final36 NEW and55 unchanged neighbors pass across distinct documented checkpoints (not a single91/91 claim). Four affected types/lint12/format12 pass; strict256-run/64KiB prefix counters, missing/unknown labels, legacy/cache/no-write fixtures remain literal.
- [x] Native55607: one freshE2Ebuild0, canonical8/8 firstPASS71.777407s (setup3+old512three+NEWtwo), defaults30s/1worker, all18exits0/source3497/current690d/compiled168/process/container/archive/lock exact. NEW8 original images+safe8 profiles preserve CSS390/DPR3→PNG1170 andtrue1440/DPR1, both themes, with actual fixedshell/nav/skiplink/off-frame occlusion and scoped ReportAxe/privacy/11-table/request-observer qualifiers. Root-only oldnative two-selector adapter retains every financial/action/timing oracle. [Evidence](evidence/investment-explanations-512.md#selected-closing-valuation-metadata-stage--local-evidence-delivery-pending).
- [x] Actual53760 at current690d/HEADd8: required `BUDGET_REQUIRE_AGE=1 VITEST_MAX_WORKERS=2 npm run check`555files/4973testsPASS;437.97s Vitest duration, then normal production build0; all10actualexits0/source3497/fullmodes/index/head/status/process/lock exact. Native168 beforebaseline retained; normalprod159 output snapshot is separate, not repeated browser proof. SafeJSON fullpending remains historical atnative55607; prior PR722 full remains historical.
- [ ] Exact-head Chromium/Windows CI, final publication and serial actual LIVE proof. No local aggregate/browser result completes the excluded-input contracts or all four public ACs.

**All four public #512 ACs remain unchecked.** Only security closing valuations are observed; flows/their FX, fees/taxes, benchmarks, cash and class-sleeve provenance are excluded. No whole-return/SPEC008 completion or old checkbox/prefix rewrite.


## #724 — account capture/date input; account bank review (#477 partial)

- [x] Retain explicit account context through payee suggestions; preserve manual/outside defaults. Allow German date punctuation and actual native calendar touch/focus without showPicker.
- [x] Show unresolved bank candidates by real account UUID before counts/paging, after account identity/balance and before history. Global review work precedes reminders; posted pending bookings and existing write/Undo rules remain. Wider #477 stays open.
- [x] Required AGE full check: 562 files / 5,000 tests passed (506.15s); normal production build passed. Independent whole-source and Root-only existing UI test reviews completed.
- [x] New WebKit scenarios9 passed in initial21/22 batch. Existing mixed-theme Axe failure corrected with two exact theme-color checks before unchanged Axe; separate old case/setup4/4 passed. No blanket22/22 rerun or baseline adoption. [Eight reviewed originals and limits](evidence/account-capture-724/README.md).
- [ ] Final exact-head Chromium/Windows/static/recovery CI, serial merge/deploy and public health revision verification; keep #724 open until verified.

### #725 correction validation

- [x] Hide successful empty account review without unmounting its learning state; the new real-UI/synthetic-HTTP lifecycle case retains the learning offer after the last confirmation. NEW unit cases now22.
- [x] A measured phone scroll clamp is corrected with one touch-row of account-only bottom padding. Original register/Toast tests are unchanged; corrected canonical WebKit7/7 passed55.2s, focused rendered5/5 plus types/lint/format passed and corrected production build passed. The initial AGE full5000 checkpoint remains5c8cd732; final-head CI revalidates the correction.
- [x] Root-only existing-test adapters now cover four files: generic payee fixture enters outside an explicit account; native internal Tab steps may retain only the same date host before exact Wiederholen. All subsequent financial/focus/Axe/Undo checks remain.
- [ ] Final exact-head CI and LIVE verification remain required.


## #512 / WP-004 — visible historical-basis cue (current layout checks passed; delivery pending)

Report TTWROR and compact Wealth qualify same-response selected security closing observations beside the result and open/focus existing source details. Carry, estimated cost, later execution, missing and unknown/truncated facts remain distinct; unrelated current cash FX cannot qualify fresh history. Original amounts/verdict/method/navigation, financial APIs/formulas/resolvers and existing tests stay unchanged.

Current focused36/36 (NEW22+old14),14.30s Vitest; types/lint/check5 and two-UI AST0. The NEW unchanged-sample default1440×900 geometry case reproduced1002.375>900, then measured884.875<900 atscroll0 with fully visible44px source action/centre hit/Enter focus. One fresh E2E build, canonical9/9 firstPASS101.832271s (setup3+OWNfive+unchanged Wealth), all30 physical exits0. Seven old Wealth JPG outputs were archivedraw then exactprebytes/fullmodes restored; no unchanged-throughout/new-baseline claim. Eight current originals/profiles preserve both themes/configured390/true1440 and actual fixed-shell photo qualifications. [Evidence and8 originals](evidence/investment-explanations-512/visible-quality/README.md).

Prior local36819 (B414+A540f, incoming tree equivalent to LIVE84bb) AGE1/workers2 full563files/5023PASS472.72s **Vitest duration** +normal build0 predates this layout correction; earlier failed/checkpoint archives remain historical. Current-layout normal production build0/all12 exits0/source3545 exact; native166→normal157 are distinct checkpoints, without a post-normal browser claim. Final exact-head CI and serial LIVE are pending. All four public512 ACs remain unchecked. Selected-closing scope excludes flow-FX/fee-tax/benchmark/cash/class provenance; parent508/privateGate3 remain open separately. Incoming Main Roadmap prefix and all earlier checkboxes are preserved.


### #726 — Account-local statement PDF intake

- Added protected original-PDF intake, bounded shared extraction and a private
  read-only script, account-local document review, explicit unknown debit dates,
  SHA deduplication, revision/hash/account checks and grouped document Undo.
- Statement review creates no booking, payment, obligation, forecast or bank
  order; financial settlement remains separate. Existing receipt-reference and
  backup rules cover these documents, with synthetic migration-copy rollback and
  source-backup/restore tests. Actual production-volume restore is unverified.
- Focused units and canonical WebKit checks passed at separate checkpoints. The
  final five-case statement batch includes real Undo activation, explicit reload,
  normal-scroll footer access, dialog Axe and scoped privacy/conservation checks.
  [Guide and synthetic originals](statement-intake.md).
- First required AGE full: 5,064/5,067 tests passed across 568 files, including
  all 44 new cases; 539.79s Vitest duration with two workers. Two unchanged
  account-filter API tests timed out at 5,000 ms, then passed unchanged on both
  selected source trees (four cases); the timeout cause remains unproven. An
  existing migration-44 fixture assumed it was still the latest migration; its
  expressly approved isolated setup correction preserves all assertions and
  passed its selected test in 2.48s. The first full was red and did not run a build.
- Before the Windows CLI correction, checkpoint `15aa5a8` passed the required
  AGE full: all 568 files/5,067 tests with one worker, 833.67s Vitest duration,
  followed by a successful normal production build.
- Windows CI showed that POSIX mode bits did not establish private CLI output
  there. The CLI now refuses Windows execution before source/password/output
  access. Focused Linux integrity6/6 passed (6.17s Vitest duration), with server
  types, lint and format checks; the guard-ordering probe and real POSIX private
  output cases passed. Actual Windows refusal and fresh exact-head aggregate CI
  and serial LIVE remain pending. Actual production receipt-volume/owner
  backup-restore verification is still open; #726 remains a partial delivery.
