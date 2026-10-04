# Assignment rules and bank recipient cleanup

This slice extends the existing `assignment_rule` and PSD2 staging/confirmation paths.
It adds no manual file-import UI. All fixtures and browser/API tests are synthetic.

## Owner workflow

Einstellungen › Zuordnungsregeln (`/einstellungen/zuordnung`, group Automatik; the same page also holds the income budget-month defaults of decision 42) manages ordered rules, enable/disable, removal, history
preview and cleanup per linked bank source. Each write is one audited action with
undo/redo. The same source label and raw payee/memo remain available as evidence.
Cleanup strips selected SEPA prefixes, card numbers, dates and reference labels,
collapses spaces and optionally uses the memo or additional literal prefixes.
An owner correction of a bank recipient remembers its raw name (or raw memo when
no name was supplied) for that source. Alias creation/correction shares the booking's
audit group. Recipient/category merges also update aliases, condition references
and split-template categories in the merge's undo group.

Rules combine all or any conditions: existing recipient, raw bank payee/memo text contains,
regex, inclusive signed amount range, account and inflow/outflow. Actions set an
existing recipient, category or percent split, memo, flag or transfer account.
Percent splits use integer basis points and largest-remainder cent rounding.
The preview counts bank history and staged rows once and returns at most 20 examples.
It does not apply changes to that history.

In the inbox, an owner can inspect rule actions, select a suggestion, reject it and
choose a manual recipient/category, then confirm the bank row. Existing unchecked
bank bookings also expose suggestions in the inbox and booking editor. Reconciled,
manual, contact and existing transfer rows cannot take those suggestions.
After categorizing a bank row, **Regel daraus erstellen** opens a draft editor;
it never creates a rule without saving. Mixed-direction/contact/transfer splits
cannot become learned templates; shares smaller than 0.01% require a manual rule.

The first matching enabled rule has priority. **Automatisch übernehmen** prepares
that rule by default on bank candidates; accepting the staged bank row is still an
explicit owner action. Fetching and merely reading suggestions never create ledger
bookings. Manual assignment overrides the prepared rule. Rule and candidate
revision checks reject changed evidence before confirmation writes anything.

## Bounds and transfer behavior

- At most 100 active/retained rules, 12 conditions and 20 split shares per rule.
  Patterns and contains strings are at most 200 characters; bank text is bounded.
- Regex is a deliberately small JavaScript dialect: no groups, backreferences,
  lookaround or counted repetition; at most one `*`, `+` or `?`, only with a start
  anchor and without alternation. Fixed patterns support anchors, character classes
  and alternation. Invalid/unsupported patterns are rejected
  by the shared server/client contract.
- Transfers need two distinct open accounts in the same currency and follow the
  existing budget/tracking category rules. Exact date, currency and opposite
  amount can link one unclassified bank counterpart or staged row. Several
  matches refuse the complete mutation. Different booking days and broader
  fuzzy/ambiguous transfer matching remain open.
- Without bank evidence for the other account, confirmation creates the paired
  ledger leg. A later unique same-day/currency/amount candidate attaches to that
  generated leg rather than adding a second booking. Both staged decisions and
  ledger legs share audit/undo when confirmed together.
- Missing/closed/deleted rule targets are unavailable; a stale suggestion cannot
  silently fall back to a different rule. No source credentials enter rule APIs.

## Storage and API

Migration `0031_assignment_rules` extends the existing rule and bank-candidate
tables, preserves raw bank evidence on bookings and adds soft-deleted source
cleanup/alias tables. The task checkout matched the cached `origin/main` revision;
the orchestrator owns fetching, migration renumbering and all git writes.

Session/origin-protected `/api/assignment-rules` provides CRUD, `/order`, `/preview`,
`/cleanup`, `/candidates/:id`, `/bookings/:id`, `/bookings/:id/apply` and
`/bookings/:id/learn`. Bank posting still uses the existing
`/api/bank-sync/candidates/:id/confirm`. Mutations use zod and the existing SQLite
savepoint, ledger invariant and grouped audit/undo helpers.

## Changed files

- Domain: `packages/domain/src/assignment-rules.ts`, its unit tests, `bank-sync.ts`
  and `index.ts`.
- Storage: `packages/db/src/schema/{system,bank-sync,bookings}.ts`,
  `repos/{assignment-rules,bookings,categories,payees,inbox,index}.ts`, migration
  `0031_assignment_rules.sql`, its Drizzle snapshot and journal; `assignment-migration.test.ts` and the existing
  receipt/payroll migration regression tests.
- Server: `apps/server/src/api/{assignment-rules,bank-sync,index}.ts`, assignment
  API tests and `bank-sync/{service,enable-banking}.ts`; adapter tests preserve
  separate creditor/debtor names.
- Web: `apps/web/src/assignment/{api,assignment-page,rule-editor,review}.tsx/ts`
  and `assignment.css`; `inbox/{api,bank-candidate,inbox-page}`,
  `ledger/{booking-panel,capture-form,types}` and `router.tsx`.
- Browser tests: `e2e/{assignment-rules,bank-sync,shell}.spec.ts`; the shell's panel
  example host moves to the remaining Anlageklassen placeholder.
- Documentation: this contract, `FEATURES.md` and `ROADMAP.md`.

Owner/private-data acceptance, pinned Linux visual acceptance, deployment and a
PR remain separate from local verification. No commits, pushes or other git writes
are part of this task.

## Local validation (2026-10-03)

- `npm ci` completed; no dependency files changed.
- Final `npm run check`: typecheck, ESLint, Prettier and all **235 test files / 2,249 tests** passed, without skipped tests.
- `npm run build:e2e` and the final production `npm run build` passed.
- Targeted Playwright run: **21 passed** with desktop/mobile projects and one worker. It covers the rule editor on the real API, preview/save/toggle/undo, focus restoration, Axe, visible dialog controls, bank suggestion rejection/confirmation/learning, bank source review, all 61 routes, moved panel hosts and dark Heute. Light/dark editor screenshots for both viewports were inspected. No baseline images changed.
- `git diff --check` passed. No git writes, commits or PRs were performed.

The Windows runner's `os.userInfo()` failed with `uv_os_get_passwd` / `ENOMEM` in tsx tooling. Final check and browser runs used an ignored process-local preload supplying synthetic user metadata via `NODE_OPTIONS`; application code was not changed for that environment. The full unit run used `VITEST_MAX_WORKERS=2`; browser tests used `--workers=1` and a longer timeout after initial parallel-run timeouts.

Repository screenshot comparisons target pinned Linux rendering and are annotated as skipped on Windows. The local browser result and inspected screenshots do not replace that Linux pixel comparison or owner/device acceptance.
