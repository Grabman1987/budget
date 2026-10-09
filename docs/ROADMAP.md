# Roadmap

### Portfolio package D — #297–#301, #346 — 2026-10-09

- [x] Label securities-market-value, net allocation and gross risk bases; explain signed cash and negative/over-100% shares without changing formulas.
- [x] Collapse the complete unheld-instrument catalog with its count and existing detail/edit routes.
- [x] Link unclassified instruments to the shared dated class editor and cash to account settings; retain distinct estimated/stale status and provisional optimisation guards.
- [x] Explain the optional portfolio-only benchmark setup state; preserve explicit persisted selection and clearing.
- [x] Separate held classes at the displayed stand from historical/unused classes; retain dated class histories, return-window/method labels and lifetime realised gains.
- [x] Stack report 4.2 legend/sources and report 4.5 summary below content at full width; retain numerical columns and direct links.
- [x] Focused type/lint/format checks, 5 Vitest files / 30 tests, affected desktop/mobile browser checks, Axe/overflow/touch checks and synthetic visual evidence; [scope and verification](evidence/portfolio-package-d-1009/README.md).
- [ ] Exact-head CI, integration, physical iPhone and owner acceptance.

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

- [x] Pure actual contact statement and oldest-outlay-first repayment allocation, editable before saving; expected occurrences excluded
- [x] Audited atomic settlement API with persisted excess contact credit, whole-action undo/redo and dependency checks (including forced undo)
- [x] Konten › Kontakte: nonzero overview, balanced-history toggle, contact creation, Kontoblatt and actual EUR cash repayment with editable allocation
- [x] Owner feedback 2026-10-05: cashless “Ausgleichen” in contact list/detail, partial credit to Zu verteilen or forgiven debt to category activity; confirmed zero booking, shared validation/audit/undo, separate report classification and synthetic API/component/browser coverage.
- [x] Synthetic acceptance: 30 + 70 outlays / 40 repayment, edited allocation, 100 owed / 120 receipt / 20 credit, balanced history retained, cash-only net worth through outlay/receipt
- [ ] Owner review of the contact workflow on the deployed app; foreign-currency contact statements remain outside this bounded EUR slice

### P3 — Posteingang basics

- [x] E4: learn assignments on owner confirmation by normalized counterparty + direction; prefilled **Übernehmen** / **wie zuletzt bei …**, view/remove in Einstellungen › Zuordnungsregeln, last-choice replacement and grouped audit/undo; synthetic learning/matching/deletion/direction tests. Existing rule JSON reused, no migration or dependency; owner acceptance remains open.

- [x] Actual queue and shell counter: one task per due nonzero unclassified budget booking plus unresolved stored warnings; no sample counter or legacy summary double count
- [x] Konten › Posteingang and global desktop/mobile panel: categorize in the existing booking editor, confirm pending bookings, acknowledge stored warnings with audited undo/redo
- [x] Shared ledger invalidation refreshes the queue, count and Heute reads after mutations/undo; safe empty/error/loading states and keyboard/touch actions
- [x] #279 global inbox pagination: 100-entry network pages, whole-queue task/kind counts, receipt-only badge scope, audited resolve/undo and complete month-close filtering beyond the first page. API regression, fresh E2E build, 42 affected desktop/mobile browser tests (one intended skip) and the final full check (379 files / 3,503 unit tests) passed. CI, deployment and owner acceptance remain pending. The endpoint still constructs the whole queue before slicing, so no database-query performance claim is made. [Evidence](evidence/inbox-pagination-279.md).
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

### P5.8 — Freiheitszahl: forecast from today
- [x] Connected current R16 expense/investment sources and configurable multiple; explicit unknown quote/FX and short-history annualisation, original lead/chain/quarter progress and source navigation.
- [x] Explicit unsaved saving assumption and 5 % real-return default; shared monthly projection with +100 EUR comparison, bounded numeric errors, desktop/mobile light/dark and accessible values.
- [ ] Historical Soll-Pfad, chosen goal year and persisted assumptions await separate owner decisions; the complete freedom workflow and private acceptance remain open.


## P6 Reports und Umstellung
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

- [x] Report 1.11 Budgettreue: additive `plan_snapshot`, shared Pace capture, nightly idempotence/retry and conservative per-month backfill status.
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
