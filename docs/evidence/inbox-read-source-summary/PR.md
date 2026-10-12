Read-source movement items no longer flood the inbox or its shared badge, navigation and Heute counts. Balance warnings whose titles start with `Quellsaldo` remain individual inbox decisions. One summary per source links to the existing Datenquellen section.

The source section now lists unresolved movements grouped by title, with title filtering before 100-entry pagination. It reuses existing source details and audited resolve/undo actions. All stored items remain intact; there is no migration, automatic booking or new dependency.

Refs #437

Validation: DB/server/web TypeScript checks, changed-file ESLint/Prettier, 51 focused unit/API tests and the E2E build passed. All 14 scoped functional scenarios passed across desktop/mobile, including title-filtered pagination, resolve/undo, light/dark Axe and no horizontal scroll at 390 px. The mobile package run finished with 10 passes; the corrected new-flow desktop rerun finished with 4 passes (both include setup). Details and synthetic screenshots are recorded in `docs/evidence/inbox-read-source-summary/README.md`. The Windows runner used the documented temporary OS metadata fallback and required cleanup of its own test servers after assertions completed. The full local check and full E2E suite were omitted under the owner's parallel-job instruction; CI is the final gate. No visual snapshot baseline is affected or regenerated.

Screenshots: [desktop inbox](https://github.com/Grabman1987/budget/blob/feat/inbox-read-source-summary/docs/evidence/inbox-read-source-summary/inbox-desktop.png), [mobile inbox](https://github.com/Grabman1987/budget/blob/feat/inbox-read-source-summary/docs/evidence/inbox-read-source-summary/inbox-mobile.png), [desktop source movements](https://github.com/Grabman1987/budget/blob/feat/inbox-read-source-summary/docs/evidence/inbox-read-source-summary/source-desktop-light.png), [mobile source movements](https://github.com/Grabman1987/budget/blob/feat/inbox-read-source-summary/docs/evidence/inbox-read-source-summary/source-mobile-light.png).

Owner steps: after CI and deployment, review inbox counts, retained balance warnings and the source summary/filter/resolve flow on desktop and phone. No new credentials or consents are needed. No merge or deployment is included.

Local delivery note: this session could not create a task commit because the shared worktree's `index.lock` was denied. The normal push also failed with Windows Schannel `SEC_E_NO_CREDENTIALS`. Verified changes and evidence remain in the working tree; publication requires normal Git metadata write access and GitHub credentials. No publication workaround was used.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
