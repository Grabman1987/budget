Bank inbox: collapsed rows, bulk actions, date sort, balance warning links account (#424)

## Changes

Refs #424

- Collapse bank candidates and unchecked bank bookings; show transaction date, payee/text and amount, and load assignment/match checks on opening. Prepared suggestions remain visible after collapse.
- Add checkboxes, select all loaded bank rows, explicit count previews and bulk dismissal/prepared confirmation. Skip and count unprepared rows. Reuse single-row paths in one transaction/audit group with one undo toast; stale input rolls back the entire batch.
- Add newest/oldest sort and inclusive from-date filter before pagination in the bank-source view, retained in the URL.
- Link balance mismatch warnings to their account.

No dependencies or migration. Minimal shared changes expose preparation in assignment review and allow candidate confirmation to reuse the batch audit group.

## Validation

See [verification evidence](docs/evidence/bank-inbox-bulk/README.md). Web/server/db TypeScript, changed-file ESLint/Prettier and focused server/DB/component tests passed. All five changed desktop and all five mobile browser scenarios passed. Focused checks under the owner's memory override; CI is the final gate. Synthetic regressions cover five-row confirmation/dismissal/merge, grouped undo, stale rollback, skipped rows and auth/origin guards. The browser scenario covers 65 rows, request count, prepared confirmation/undo, date controls, account links, 390px geometry, touch targets and Axe in light/dark.

No snapshot regeneration. Affected baseline areas: inbox, global inbox and month-close inbox bank rows. Evidence screenshots: [desktop light](docs/evidence/bank-inbox-bulk/desktop-light.png), [desktop dark](docs/evidence/bank-inbox-bulk/desktop-dark.png), [mobile light](docs/evidence/bank-inbox-bulk/mobile-light.png), [mobile dark](docs/evidence/bank-inbox-bulk/mobile-dark.png).

## Review fixes (money-invariants review)

- "Nicht übernehmen" never deletes ledger bookings: the server rejects `dismiss` for booked rows (400, nothing written); the preview lists selected booked rows as kept and counts them as skipped.
- Required `sourceId`: every candidate's `sourceId` and every booked row's `bankSourceId` must equal it, and booked rows must satisfy the inbox predicate (on-budget account, bank source, not reconciled, dated up to today, no transfer, an unclassified split); otherwise the whole batch is rejected unwritten. The UI offers bulk actions only in the bank-source view.
- A prepared rule is refused for a candidate that has merge or link targets (409 "Passende Buchung vorhanden"), like the single path; the client prepares nothing while the match query is pending or refetching.
- A rule on a booked row confirms it only when no unclassified split remains, otherwise it stays an open, pending task.
- Two selected rows with the same prepared merge target: the first keeps it, the others are skipped and shown in the preview.
- Rows apply with the revisions validated before the loop; payee-alias and inbox-rule learning is deferred (`deferLearning`) until after the last row, inside the same transaction and undo group. Without this, learning from row 1 changes row 2's candidate revision and suggestion.
- `expectedChanged` (the preview's count) must equal what the server would change, else 409 unwritten.

Tests: server (synthetic literal cents) cover rollback after a successful first row, dismissal of a booked row, foreign-source candidate and booking, missing/unknown source, changed count, rule with an existing merge target, mixed merge + rule rows with ledger sum before, after and after undo, an unfinished rule leaving a pending booking, and deferred alias learning; web tests cover the preview planner (kept bookings, shared merge target) and the pending-match case.

## Owner steps

Local commit creation was blocked by permission denied creating the worktree Git index lock. Commit/push the preserved changes and create this PR from an environment with Git-index write access. Await required CI and review on a phone. No keys, provider calls, consent changes or migration needed. Do not merge until accepted.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
