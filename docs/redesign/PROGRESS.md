# Redesign checkpoint

Date: 2026-10-30 (Europe/Vienna). Scope: Phases A and B completed; STOP 2 accepted and Phase C plus implementation in branches/PRs explicitly authorised on 2026-10-30.

## Integration continuation — 2026-10-31

- T0's owner-exception merge is verified and documented in [#819](https://github.com/Grabman1987/budget/issues/819). The subsequent #882/#884/#883 integrations used `--hold-release`; main `1469c40ae681dd0694b3579a50b7fb88323fccc5` passed CI [41148006581](https://github.com/Grabman1987/budget/actions/runs/41148006581). This is integration evidence, not publication or financial acceptance.
- The later standing held-merge grant applies through the authoritative [queue process](../queue/README.md), recorded by documentation PR [#890](https://github.com/Grabman1987/budget/pull/890). Its exact-head CI is still pending at this checkpoint. Releases and all protected approvals retain their separate gates.
- Phase 6 applied 136 of 140 planned dependency edges and the authorized WIP reconciliation; four outgoing edges on the protected Waiting cards remain withheld. [Report E #891](https://github.com/Grabman1987/budget/issues/891) records the actual results and legacy-card proposals. No issues were closed to change readiness labels.
- T1 ([#820](https://github.com/Grabman1987/budget/issues/820), [#876](https://github.com/Grabman1987/budget/pull/876)) is the next technical slot after verified T0; S1 follows its merge. T1's existing literal reference tests remain unchanged. Its branch is refreshed locally, while the final current-main update, pre-push gate and fresh exact-head CI are pending. Owner preview and financial/UI parity remain separate acceptance criteria.

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
