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

## Owner steps

Local commit creation was blocked by permission denied creating the worktree Git index lock. Commit/push the preserved changes and create this PR from an environment with Git-index write access. Await required CI and review on a phone. No keys, provider calls, consent changes or migration needed. Do not merge until accepted.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
