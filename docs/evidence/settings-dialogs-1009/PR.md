Account settings, reconciliation and asset-class input forms now use the existing
FormDialog. Rule status opens as a deep-linkable settings sub-page, with thresholds
edited in a separate FormDialog. Existing validation, write APIs, audit/undo and
asset-class dirty/save guards are retained.

- Refs #330: account create/edit forms; `/konten/:id` keeps account detail ownership.
- Refs #331: reconciliation form; bank comparison never writes until explicit confirmation.
- Refs #332: `/einstellungen/regelwerk/:code`, breadcrumbs, return/Back/Forward and month context; separate threshold input.
- Refs #333: target form shell; pending/dirty guards and atomic undo retained.
- Refs #334: class/group/archive form shells; existing instrument pages retained.

Shared changes are limited to the rule route, history marker and scoped scroll
restoration, plus an optional isolated-test port offset to avoid concurrent jobs'
occupied ports (existing default and occupied-port rejection retained).
The Freedom E2E consumer follows the new threshold navigation. No
dependencies, migrations, financial calculations or provider calls are added.

Validation: web TypeScript, changed-file ESLint/Prettier, 27 affected Vitest tests,
one E2E build and 26 passing desktop/mobile browser tests (3 intentional mobile
skips for existing shared-ledger writes). Full local check and full
E2E deliberately omitted under the owner's memory-limit override; CI is the final
gate. See [verification and synthetic screenshots](https://github.com/Grabman1987/budget/blob/codex/pkg-o-settings-dialogs-1009/docs/evidence/settings-dialogs-1009/README.md) for exact results.

Affected baselines, unchanged locally:
`e2e/rules.spec.ts-snapshots/regelwerk-{light,dark}-{desktop,mobile}-linux.png`.
Pinned Linux visual review and exact-head CI remain open.

Owner steps: review the desktop/390px captures and input/navigation flows; physical
iPhone Safari acceptance remains separate. No keys, consents, migration or real-data
reconciliation steps are needed for this package. Do not merge before the CI gate.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
