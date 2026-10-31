# Redesign checkpoint

Date: 2026-10-30 (Europe/Vienna). Scope: Phases A and B completed; STOP 2 accepted and Phase C plus implementation in branches/PRs explicitly authorised on 2026-10-30.

## S1 integration continuation — 2026-10-31

- T1 [#876](https://github.com/Grabman1987/budget/pull/876) is held-integrated: exact-head CI [41189431712](https://github.com/Grabman1987/budget/actions/runs/41189431712) passed, and main `1e6d1dee49938f7ba91f031f41c66ba9a08e5391` is verified by CI [41190699786](https://github.com/Grabman1987/budget/actions/runs/41190699786). This satisfies S1's technical prerequisite, not publication or Owner financial acceptance.
- Existing S1 [#878](https://github.com/Grabman1987/budget/pull/878) now incorporates that verified main by normal merge. The current shard/leaf selection, required aggregates, pre-push gate and financial reference content are retained. The inherited plan conflict takes the exact reviewed main plan; S1 adds no plan change. The old heading-readiness test is already identical on main and needs no duplicate edit.
- The flag, production-OFF/preview-ON Docker wiring and disposable two-artifact build/PWA smoke retain their original implementation. Application/package/build inputs are unchanged from S1's original T1 parent; historical local evidence below remains limited to that unchanged content. The final composed diff still needs independent review, the actual configured push gate and fresh exact-head CI, including real smoke and default/preview Docker builds.
- The 2026-10-31 coordination grant is effective through the Owner's instruction; its paired Queue/plan update is a separate bounded [#897](https://github.com/Grabman1987/budget/issues/897) change. S2/T4/T6 implementation waits for actual verified S1 integration. Production stays OFF; release, deployment, protected semantics, real data and Owner previews retain separate gates.

## Integration continuation — 2026-10-31

- T0's owner-exception merge is verified and documented in [#819](https://github.com/Grabman1987/budget/issues/819). The subsequent #882/#884/#883 integrations used `--hold-release`; main `1469c40ae681dd0694b3579a50b7fb88323fccc5` passed CI [41148006581](https://github.com/Grabman1987/budget/actions/runs/41148006581). This is integration evidence, not publication or financial acceptance.
- The later standing held-merge grant applies through the authoritative [queue process](../queue/README.md), recorded by documentation PR [#890](https://github.com/Grabman1987/budget/pull/890). It is integrated in main `795fa48b8cb811b4122920d9a73ed2ad2135835c`, verified by CI [41150511567](https://github.com/Grabman1987/budget/actions/runs/41150511567). Releases and all protected approvals retain their separate gates.
- Phase 6 applied 136 of 140 planned dependency edges and the authorized WIP reconciliation; four outgoing edges on the protected Waiting cards remain withheld. [Report E #891](https://github.com/Grabman1987/budget/issues/891) records the actual results and legacy-card proposals. No issues were closed to change readiness labels.
- The first current-head T1 CI [41151052400](https://github.com/Grabman1987/budget/actions/runs/41151052400) failed an inherited Shell fixture contract; its separate Savings case was flaky. Independently reviewed test-only repairs [#892](https://github.com/Grabman1987/budget/pull/892), [#893](https://github.com/Grabman1987/budget/pull/893) and [#894](https://github.com/Grabman1987/budget/pull/894) are held-integrated in main `ff533743aac5d886b61dc019721af8c135438d16`, verified by CI [41163082113](https://github.com/Grabman1987/budget/actions/runs/41163082113). Existing financial expectations, timeouts and retries remain unchanged.
- The subsequent T1 CI [41173260053](https://github.com/Grabman1987/budget/actions/runs/41173260053) failed a different inherited Forecast geometry condition: date top 738.875 versus amount bottom 739.875 in both attempts. The bounded font-readiness repair [#895](https://github.com/Grabman1987/budget/issues/895) / [#896](https://github.com/Grabman1987/budget/pull/896) preserves every existing geometry, financial and Undo assertion and all limits. Its exact-head CI [41188596194](https://github.com/Grabman1987/budget/actions/runs/41188596194) passed, including all 15 selected browser tests; held main `6ebd427dd0b90acdebfd1766388f8ceeba86f6b9` is verified by CI [41189035799](https://github.com/Grabman1987/budget/actions/runs/41189035799).
- The owner's 2026-10-31 CI-first grant authorized [#886](https://github.com/Grabman1987/budget/pull/886) and [#887](https://github.com/Grabman1987/budget/pull/887), both held-integrated before the font repair. Their selected checks preserve the required check names, branch protection and nightly/manual full regression. Later orchestration changes are recorded by the dated owner grant; their paired queue/plan documentation remains a separate small change.
- T1 ([#820](https://github.com/Grabman1987/budget/issues/820), [#876](https://github.com/Grabman1987/budget/pull/876)) remains the next technical slot after verified T0; S1 follows its merge. T1's literal reference tests remain unchanged, and its branch now incorporates the verified font-repair main for one cause-targeted continuation. The two preceding failed runs had different causes; this is not a third attempt at the same job failure. Read the final configured pre-push and fresh exact-head CI evidence on that PR for each pushed candidate. Owner preview and financial/UI parity remain separate acceptance criteria.

The records below are historical planning and verification checkpoints at their stated revisions. Later integration authority comes from the queue process and dated owner grants, rather than the older individual-OK wording.

## Planning state — 2026-10-30

- A1: Source and instruction discovery complete. Current comparison revision: `50c0016560ee634c6ee8ede8180169bc60cb29a6`.
- A2: GitHub board, all PR states, remote branch inventory, current main CI and public health inspected without remote changes.
- A3: Active Claude Design entry files and their implementation sources read through the native connector; owner decisions compared with app contracts.
- A4: `00-bestand.md` drafted with the 54-route baseline, owner overrides, N1–N8 evidence/limits and STOP 1 questions. `branches-2026-10-30.md` records all 392 remote Codex branches individually.
- A5: Count/privacy/link checks passed: 54 route rows, 392 branch rows, dispositions 190/1/3/198, no implementation plan created. All 43 inspected design-file ETags were unchanged on re-list.
- A6: Independent read-only reviewer completed the full document review. Its three findings (private onboarding scope, D8 boundary and current 35-day forecast precedence) were corrected; the reviewer rechecked them and returned CLEAR.
- A7: Markdown was formatted explicitly with the existing Prettier installation, overriding the repository's Markdown ignore list for these three files. Final checks are recorded below.
- Existing checkout and other worktrees preserved. This isolated documentation branch is `docs/redesign-bestand-20261030`.

## Next action

Phase C conversion is complete (50 planning IDs mapped to 56 issues). Finish the reviewed T0/T1 PRs and prepare S1 fail-closed build wiring after the verified T1 reference baseline. Production merges, releases and real-data changes require a separate owner OK.

## Open questions

- Private optional onboarding is in the latest planning scope behind the redesign flag; public registration/publication under #490 stays deferred. No renewed scope question.
- D8 budget-month income is settled for Plan; actual cashflow/account/report booking dates retain their separate SPEC contract. No blanket financial rewrite or renewed Plan-income question.
- Board and dated STATUS/ROADMAP snapshots differ. Preserve live board state and expose the discrepancy at STOP 1.
- N1: propose a visible closed-account remainder rather than an automatic financial correction; implementation still needs separate owner approval.

## Gates

- STOP 1: accepted as the basis for Phase B by the owner's explicit follow-up: “Ja, Phase B ist freigegeben. Erstelle den vollständigen Umsetzungsplan auf dieser Grundlage und lege ihn mir bei STOPP 2 zur Freigabe vor.”
- B1: Current source/process and route contracts checked. Remote main/live SHA, zero open PRs, board totals and the latest red CI are unchanged at the Phase B refresh.
- B2: `01-umsetzungsplan.md` drafted with 50 bounded redesign/delivery slices, seven gated Moonshot extensions, flag/build/rollback policy, meaningful fixture/acceptance contracts and complete parity tables (54 baseline routes, 16 reports, 23 existing aliases, 7 panels, 8 URL-dialog states, 44 local workflow entries).
- B3: Independent review completed. Alias formatting and the final dependency gate were corrected. The current-main-only release contract now has an explicit separately approved activation commit and reviewed forward rollback commit; the reviewer rechecked the final change and returned CLEAR.
- B4: Saved-file verification passed: 50 unique slice IDs with Must/Should/tests/owner acceptance, defined acyclic dependencies and all 50 transitively required by G1; 54 baseline rows with unmarked implementation/preview/release boxes; 16 stable report IDs/order, 23 aliases, 7 panels, 8 URL-dialog states, 44 local workflow entries, 13 fixture cases, seven future slices and all required sections.
- B5: The 42 pinned design-manifest entries plus README retain their ETags. Relative links, Markdown whitespace and focused privacy checks passed. Final explicit Prettier verification follows this checkpoint update.
- Phase B / `01-umsetzungsplan.md`: complete as a planning deliverable; no code, tests or proposed interfaces implemented.
- STOP 2 / implementation-plan approval: accepted by the owner on 2026-10-30. Exact grant: “Ich gebe den Plan, Phase C und die Umsetzung in Branches/PRs frei. Produktions-Merges, Releases und echte Datenänderungen nur nach meinem separaten OK.”
- Phase C / GitHub issues: 56 bounded issues created (#819–#874); all include owned scope, dependencies, acceptance and common gates. Project item IDs, issue numbers and statuses were verified directly: 2 In Arbeit (T0/T1), 54 Warteschlange, none archived. See 03-issue-map.md.
- At the start of Phase C: no production code, data, design, issues, PRs, merges or releases changed. Subsequent changes are recorded below.

## Verification record

- Explicit Prettier check of all three Markdown files, with `--ignore-path NUL` because the repository normally excludes Markdown.
- New-file whitespace checks through `git diff --no-index --check`, which includes these untracked documents.
- Relative links, 54 unique sequential route IDs, 392 unique branch names and per-disposition totals checked directly from saved files.
- Focused privacy scan found no copied private account names/balances or credential patterns; the independent reviewer also found no private financial data.
- This worktree has only `docs/redesign/` as new content and remains on `docs/redesign-bestand-20261030` at the source revision. The original checkout retains only its pre-existing untracked directory.
- Application tests were not run: this is documentation-only inventory. The separately observed latest main CI remains red; no application fix or passing application check is claimed.

These records are checkpoints for this audit, not a second task board. Work items remain in GitHub Project 1.

## Phase B verification boundary

Additional owner request: created `02-antigravity-gesamtprompt.md` as a copyable handoff for Antigravity with the requested Gemini Argon model. The prompt references the full local plan, preserves the pending STOP 2 and distinguishes later Phase C from implementation and release authorisation. No provider/session was contacted or started; no new execution approval is inferred from requesting a prompt.

Handoff verification: independent read-only review returned CLEAR. Explicit Markdown formatting, source-path existence, required scope/gate checks, new-file whitespace and credential-pattern scans passed.

The validation above checks the saved plan's structure, dependencies, references, formatting and privacy; it does not execute the future financial/GUI tests described by the plan. Application tests, feature-flag builds, staging publication and owner acceptance have not run in this planning session. Current production and the observed red CI are unchanged.

Contact alias/merge/archive and encrypted-backup download are explicitly identified as incomplete backend contracts, not claimed existing features. Their protected identity/security/migration rules remain separate gates. N1 financial correction, production activation/release, credentials and external AI data sharing are not granted by Phase B.

## Authorised execution checkpoint

- Owner approval above supersedes the historical pending STOP 2 in the original handoff prompt. Branches, PRs and bounded issue creation are authorised; production merges, releases, activation and real-data edits remain gated.
- Refreshed source: main still `50c0016560ee634c6ee8ede8180169bc60cb29a6`; no open PRs observed. Latest main CI is red in the legacy inbox mobile-browser flow. A read-only independent local agent is investigating T0 before any retry or fix.
- Main coordinator owns issue reconciliation and documentation. Independent diagnosis owns no shared files. No external AI provider/session has been started.

## Phase C conversion checkpoint

- Re-read 45 open pre-existing issues and current board metadata. Existing epics contain broader mixed or partly delivered work, so bounded new redesign child scopes were created without replacing their bodies, closing them or duplicating active #563/#741/#762/#818 features.
- R3 and E2 were decomposed before executable issue creation into eight owned children (56 boundaries total); the independent reviewer verified defined acyclic dependencies and that G1 transitively requires all 56. The current grant, prompt and decomposition re-review returned CLEAR.
- GitHub connector created issues #819–#874. Project-board mutations use the GitHub CLI/GraphQL fallback because the connector exposes no Project field/item tools. The immutable ID mapping is in 03-issue-map.md. Seven future Moonshot extensions were not dispatched.
- T0 #819: CI traces confirm a successful redirect with auto-selected Aufgaben (0 transactions, 4 account tasks); the existing unseeded test always expects the other segment heading. An implementation agent owns only e2e/inbox.spec.ts plus bounded synthetic evidence in fix/redesign-t0-inbox-20261030. No timeout, retry or financial expectation changes are permitted. Root owns planning docs; independent final diff review is still required.
- No production merge, release, activation, real-data edit, source sync or external provider run.

## T1 reference preparation

- Added literal F05 October/November budget-month versus booking-date cashflow coverage to apps/server/src/api/income-month.test.ts and F09 net-refund/short-history coverage to packages/db/src/repos/freedom.test.ts. Existing financial expectations and production formulas are unchanged. Execution and independent full-diff test review are still pending; no passing numeric result is claimed yet.
- Documentation checks passed: explicit Prettier, staged whitespace, relative links, credential-pattern scan, 50 planning IDs/56 unique issue mappings, complete acyclic dependency graph, 13 reference cases, 54 baseline routes and 392 branch rows. The first count script used a numeric branch-row pattern against a branch-name table; the corrected matcher confirms 392 rows.
- T0 mobile RED reproduced with deterministic task data and the unchanged 5,000 ms assertion. GREEN and independent review remain pending.

## T0/T1 verified implementation checkpoint

- T0: independent final-diff review CLEAR; PR [#875](https://github.com/Grabman1987/budget/pull/875), branch fix/redesign-t0-inbox-20261030, current head 84c291e5255e8e024a3c5802ce602fc016f6306e. Full exact-head CI [41065065297](https://github.com/Grabman1987/budget/actions/runs/41065065297) is pending; superseded initial-head CI was cancelled by concurrency. Issue #819 is CI / Review, not Live.
- T0 local evidence: complete inbox desktop/mobile file 13 passed (3 setup + 10 browser cases), existing segment/source API files 4 passed; web/server builds, ESLint, Prettier and whitespace passed. Financial assertions/timeouts/retries unchanged.
- T1 final local reference suite: 6 files / 54 tests passed (44.85 s) under supported bundled Node v24.22.1: apps/server/src/api/income-month.test.ts, packages/db/src/repos/freedom.test.ts, packages/db/src/repos/freedom-universe-615.test.ts, apps/server/src/api/liquidity-35d-568-569.test.ts, packages/domain/src/income-month.test.ts and packages/domain/src/wealth/freedom.test.ts. Command: node node_modules/vitest/vitest.mjs run FILES --maxWorkers=1.
- T1 F05 initially requested period=Alles at 2026-11-01, which correctly excludes the running November. Traced existing cashflowWindow/lastFullMonth; the new case now explicitly requests 2026-10..2026-11 and asserts both window months and literal 0/10000 amounts. Existing tests/oracles and the production period contract are unchanged. Independent delta re-review CLEAR.
- T1 negative control: temporarily mocked only the annual metric export as actual+1 cent in the owned test file. Both F09 literal cases failed at 118001/120001; original test bytes were restored and SHA-256 checked before the final passing suite. Production source was never changed.
- Per-file test rationale: income-month.test.ts adds the approved F05 October/November booking-date versus budget-month distinction; freedom.test.ts adds the approved F09 net-refund/short-history literals against real SQLite readers. Existing financial expectations stay intact. Independent full test/doc diff review returned CLEAR; tests-change-approved and risk:high recorded on #820.
- A machine-readable reference/route manifest is still a Should item; the complete human-readable F01–F13 and 54-route contract is frozen in the plan. No generic specification engine or source-grep test was added. Actual owner preview, full required exact-head CI and financial/UI parity remain separate pending criteria. T1 is prepared against T0; no final T1 product acceptance is claimed.
- S1 may prepare build isolation using this locally verified contract; broad area layout acceptance still requires the named owner preview. Current-main-only hosted preview/release guards are preserved. Production merges/releases/activation and real-data edits remain unapproved.

## T1 PR and final verification

- Draft PR [#876](https://github.com/Grabman1987/budget/pull/876) targets the T0 branch in #875 so its full candidate includes the inbox fix. Main and production remain unchanged. This is a prepared contract/reference PR, not final owner acceptance.
- Scoped DB/server typechecks passed with node node_modules/@typescript/native/bin/tsc -p packages/db/tsconfig.json and -p apps/server/tsconfig.json. The repository aliases tsc to @typescript/native; the initial attempt at the conventional typescript/bin/tsc path was a launcher-path error, corrected without dependency changes.
- Typechecking found nullable freedom in the new F09 access. Replaced only that new assertion with toMatchObject({ annualSpendCents: 118000 }), which still rejects null and preserves the exact cents. Independent re-review CLEAR.
- The final income file passed all 7 tests. Concurrent scoped typechecking left about 300 MB free RAM; five freedom fixture hooks exceeded the existing 10000 ms setup limit. After typechecks completed, unchanged freedom.test.ts alone passed all 11 tests (4.19 s). No timeout, retry, oracle or skip changed. The earlier six-file suite passed all 54 tests; untouched reference files retain that evidence.
- T0 exact-head CI currently has successful Docker, restore, Windows aggregate, static/unit/visual and tested inbox shard evidence; remaining browser shards still run. No aggregate success or merge approval is inferred early.

## Historical S1 preparation records — 2026-10-30

The following records retain the original stacked preparation and handoff evidence. Their pending states and older individual-approval wording are historical; the dated current integration checkpoints and authoritative queue process take precedence.

## S1 isolated implementation started

- Ticket #822, branch feat/redesign-build-flag-20261030, base 0acbcd284f9ab0fd74fef707e4be4be965762f7d (T1 draft #876, stacked on T0 #875). The clean T0 checkout was reused on this new branch to keep its installed workspace dependencies; original T0 branch and PR head remain unchanged.
- One local implementation agent owns only the flag/module unit cases, shell root attribute, bounded real-build smoke, Docker build inputs, required existing CI job wiring and its synthetic evidence file. Root owns this checkpoint; independent reviewer is separate. No concurrent local heavy tests or typechecks.
- Initial TDD RED: exact 1 activation fails against the current OFF stub; seven invalid/missing flag cases remain OFF. Actual two-artifact shell/PWA smoke and final verification are in progress.
- T1 current PR head is 0acbcd284f9ab0fd74fef707e4be4be965762f7d; exact-head CI 41067792958 is running. Superseded initial-head CI failed before the nullable-test fix. Local final tests/typechecks and independent review are green; owner preview/full current CI are still pending.
- No production merge/release/activation, live source setup, data change or external model run. Existing preview/release guards and STOP files remain intact.

## T5 evidence-only preparation

- Ticket #821, branch docs/redesign-freedom-reconciliation-20261030, base T1 0acbcd284f9ab0fd74fef707e4be4be965762f7d. Root reused its clean documentation checkout on a separate branch; T1 remote branch/PR remains unchanged.
- Only docs/redesign/04-freedom-expense-reconciliation.md is added: canonical reference-period/source chain, net need/want consumption, neutral internal transfers and actual category boundary for principal/investment, F09 literal evidence and limits. No universal principal exclusion, financial formula correction, production/test/fixture change or private-data acceptance is inferred.
- The concrete documentation-only diff is risk:low under the queue's routine-documentation rule. Any later classification/formula change retains High/protected approval and full review. Existing T1 results are reused only for unchanged relevant source/tests. Independent source/document review is pending.

## Reviewed candidate checkpoint

- T0 PR #875: exact-head CI 41065065297 passed all four required checks at 84c291e5255e8e024a3c5802ce602fc016f6306e. Main remains 50c0016560ee634c6ee8ede8180169bc60cb29a6 with its previously red observed main run; PR success is not integration or publication. No merge/release was attempted.
- T5 independent source/doc review returned CLEAR. PR [#877](https://github.com/Grabman1987/budget/pull/877), head b3fb2e517b293f1ae1c33684cb8f38893a0274c5, targets T1 #876. It changes only the bounded evidence note; documentation-lane required CI is pending. Issue #821 is CI / Review, not complete.
- S1 final local verification: actual two-build OFF/ON/PWA upgrade smoke passed desktop/phone; five targeted unit/regression files passed 81 tests; web/smoke typechecks, scoped ESLint, explicit Prettier and whitespace passed. Broad browser result: 46 passed, 2 unchanged 120-second route-sweep timeouts (desktop/mobile), 9 existing profile skips. Latest trace navigations occurred near 119.4/117.1 seconds; one direct control command against the same fresh candidate artifacts and copied synthetic DB passed both destinations (2943/880 ms). No timeout, assertion or skip changed. Independent executable and final evidence reviews returned CLEAR; the reviewer also matched both recorded artifact hashes. This is not a fully green local broad run. Actual Docker/default+preview compilation, full required exact-head CI and owner preview remain pending.

## Manual Antigravity division authorised

- The owner explicitly requested sharing work with Antigravity and a copyable prompt. Antigravity receives only T6 #826 (Finanz-Check history restoration) in its own branch/worktree after the reviewed S1 base is published. No Antigravity/Gemini session has been started or contacted here.
- Antigravity owns router.tsx, reports/report-search.ts, pages/reports-pages.tsx, minimal existing Finanzcheck report reuse and only related tests/evidence. Root retains shared flags/build/CI/PROGRESS and coordination. No second writer on these scopes.
- Root retains S1 delivery/CI and the next T2 forecast/offline scope, then T3 as dependencies permit. T4 is a possible subsequent Antigravity slice only after explicit dispatch and a fresh branch; no bulk delegation of the remaining plan or later Moonshot extensions. At most one implementation package per environment plus independent review.
- The handoff preserves the original grant: branches/PRs allowed; production merges, releases, activation and real-data changes need separate owner OK. T6 is distinct from the new health-score feature #814 and must reuse the existing rule-history body without changing R-rule evaluation.

## S1 delivery and handoff base

- Draft PR [#878](https://github.com/Grabman1987/budget/pull/878), feat/redesign-build-flag-20261030, targets T1 #876. Executable code/evidence commit c0bdf71c0291d66b5d4343f429ea030c331701fa is independently reviewed; the following checkpoint-only commit records the high-risk CI context and handoff. Full exact-head CI/default+preview Docker builds remain pending. No merge or deployment.
- Manual Antigravity T6 worktree: C:/Users/fabia/budget-antigravity-t6-20261030, branch feat/redesign-t6-finanzcheck-20261030, to be created from this published S1 dependency. No external provider is started. The owner receives a standalone current assignment prompt in the FinanzApp workspace; generic handoff 02 remains available.
