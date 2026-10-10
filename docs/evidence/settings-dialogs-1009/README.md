# Settings dialogs — #330–#334

Account create/edit and owner-triggered reconciliation now use the existing native
FormDialog through one small settings wrapper. Account detail remains on
`/konten/:id`; no account write or reconciliation runs on navigation.

Rule status lives on `/einstellungen/regelwerk/:code`. Breadcrumbs, the return link,
browser Back/Forward and month context are covered. `?bearbeiten=true` opens only
threshold input; direct-link close replaces the URL and in-app close returns through
history. Current values, action guidance and supplemental rule details stay on the
status page. Parameter validation and the existing audited write/undo/redo hook are
unchanged.

Class/group/target/archive forms retain the existing `?panel=` URLs, dirty discard
prompt, pending-save blocker and atomic target replacement plus retirement. No
instrument detail page is added. Shared infrastructure changes are limited to the
rule route, history marker and Regelwerk scroll restoration. The existing Freedom
E2E consumer is updated to open the separate threshold form.

## Verification

Only scoped checks are run, as required by the package's memory-limit override.
The full local check and full E2E suite are deliberately omitted; CI is the final
gate. No snapshot baselines are regenerated.

- Web TypeScript: exit 0.
- Affected web Vitest: 4 files / 21 tests passed, including the rule-link red/green regression.
- Asset-class settings persistence/atomic undo regressions: 1 file / 6 tests passed.
- E2E build: exit 0, once. Existing Zod annotation, mixed-import and chunk-size warnings remain.
- Changed-file ESLint and Prettier: exit 0; `git diff --check`: exit 0.
- Final affected desktop/mobile E2E: exit 0, 26 passed / 3 intentionally skipped (desktop-only shared-ledger write cases), 3.8 minutes, one worker. Includes all new settings-dialog cases, existing account/class/target flows, rule threshold save/undo and the Freedom consumer.

Final browser command (PowerShell environment assignments):

```powershell
$env:E2E_PORT='4910'; $env:E2E_START_TIMEOUT='300000'; $env:E2E_LEDGER_PORT_OFFSET='120'
npx.cmd playwright test e2e/settings-dialogs.spec.ts e2e/rules.spec.ts e2e/asset-classes-settings.spec.ts e2e/accounts-settings.spec.ts e2e/freedom.spec.ts --grep 'account forms|rule status|asset group|target save|R15 off|book rules|groups can|U0|lists, orders|refuses a term|actual capture refreshes' --workers=1 --project=desktop --project=mobile
```

Initial browser failures identified stale dialog-status expectations, a malformed
return-link selector and an existing asynchronous rule-evaluation read. Expectations
now address the status page; the same complete derived-result assertion polls until
the existing refresh finishes. The pending-save test enters the form via in-app
navigation so it exercises the router blocker rather than leaving the document for
the browser's initial blank page, and expects the originating class form after save.
Sheet geometry is measured after finishing its entrance animation, matching the
existing UI tests. No production financial logic was changed for
these test corrections.

Concurrent jobs occupied the default isolated-ledger port band. The shared E2E
helper has one optional `E2E_LEDGER_PORT_OFFSET` override (default remains 20),
allowing this package to use offset 120 while keeping `E2E_PORT=4910`. Occupied
ports are still rejected before any bootstrap call; no foreign process is stopped.

## Captures and open gates

All captures use disposable synthetic ledgers. Desktop is 1440 × 900; phone is
390 × 844. Browser checks cover modal bounds, no horizontal page scroll, 44px close
targets, focus return, accessibility, discard/save guards and explicit reconciliation
plus undo. Existing asset-class tests cover both themes, scrolling and rotation.

| Surface | Desktop | Phone |
| --- | --- | --- |
| New account | [capture](desktop-account-create.png) | [capture](mobile-account-create.png) |
| Edit account | [capture](desktop-account-edit.png) | [capture](mobile-account-edit.png) |
| Reconciliation | [capture](desktop-reconciliation.png) | [capture](mobile-reconciliation.png) |
| Rule status | [capture](desktop-rule-status.png) | [capture](mobile-rule-status.png) |
| Rule thresholds | [capture](desktop-rule-threshold.png) | [capture](mobile-rule-threshold.png) |
| Group | [capture](desktop-asset-group.png) | [capture](mobile-asset-group.png) |
| Class, light | [capture](desktop-class-light-0.png) | [capture](mobile-class-light-0.png) |
| Class, dark | [capture](desktop-class-dark-0.png) | [capture](mobile-class-dark-0.png) |
| Targets | [capture](desktop-asset-targets.png) | [capture](mobile-asset-targets.png) |

Affected pinned Linux baselines: `e2e/rules.spec.ts-snapshots/regelwerk-light-desktop-linux.png`,
`regelwerk-dark-desktop-linux.png`, `regelwerk-light-mobile-linux.png` and
`regelwerk-dark-mobile-linux.png`. Review them in CI; local captures are evidence,
not replacement baselines.

The committed desktop/phone captures were visually inspected after the passing run.

Exact-head CI, pinned Linux visual review, owner desktop/phone acceptance and
physical iPhone Safari remain open. No migration, credentials, bank consent,
deployment or real-ledger reconciliation is required or performed by this package.

## Delivery blocker

Local `git add` and `git commit` both failed with exit 1 because Git could not
create the worktree's `index.lock` in the shared Git directory (`Permission denied`).
The implementation and evidence remain uncommitted on
`codex/pkg-o-settings-dialogs-1009`; the index has no staged changes. Push and PR
creation cannot deliver this working tree until Git writes are permitted. No
sandbox workaround was attempted. The ready-to-use English PR body is in
[PR.md](PR.md).
