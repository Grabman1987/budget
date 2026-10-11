# Reconciliation dialog #423

Implementation is on `feat/reconcile-dialog-plus`. All figures and account/source identities in tests and screenshots are synthetic. No private data or real provider API was used.

## Verification

- Final targeted Vitest: 6 files / 98 tests passed (`api.test.ts`, `bank-followups.test.ts`, `ledger-api.test.ts`, `reconcile-panel.test.tsx`, `reconcile-model.test.ts`, `panel.test.tsx`). The shared-dialog regression first reproduced parent dismissal and then passed with the native close-event fix.
- Typechecks for DB and Server passed; final UI/Web repeat checks after the shared-dialog correction also passed (exit 0).
- Changed-file ESLint had zero errors; the shared Panel file has one existing unused-disable warning. Prettier and `git diff --check` passed.
- One `npm run build:e2e` passed, followed by a Web-only rebuild for the observed nested-dialog close-event defect.
- Browser run before the final shared-dialog correction: 6 passed (desktop and mobile, both affected specs), one worker. It includes explicit balance takeover without booking, categorized/date-bounded adjustment and undo, missing-booking prefill/save/recalculation, previous-day/fetch-day lock boundaries, light/dark Axe and mobile overflow/touch checks. The final shared-handler transition is checked separately below.
- Final shared-handler browser regression: 2 passed (desktop and mobile, 3.2 minutes). Missing-booking save keeps the reconciliation dialog open and refreshes its preview before the previous-day lock.

The existing Bank E2E config now includes the new reconciliation spec. It uses the existing isolated-ledger fixtures and avoids the default config's additional shared servers. Final command (the installed Playwright CLI, equivalent to `npx playwright`):

```powershell
$env:E2E_PORT='4920'
$env:E2E_START_TIMEOUT='300000'
node node_modules/@playwright/test/cli.js test e2e/reconcile-dialog-plus.spec.ts e2e/bank-followups.spec.ts --config=e2e/bank-followups.config.ts --workers=1 --project=desktop --project=mobile --timeout=120000
```

Final shared-handler repeat used the same settings with only `e2e/reconcile-dialog-plus.spec.ts` and `--grep='takes an undated'`.

Earlier default-config runs hit load-related timeouts while Axe opened a browser page; the final isolated-config run passed with the assertions retained. The mobile save test also exposed and now covers the nested-dialog close event. Full check/full E2E and local snapshot regeneration were omitted as instructed; CI remains the final gate.

## Delivery blocker

`git add` and `git commit` failed because the worktree's Git metadata refused creation of `index.lock` (`Permission denied`). The requested `git push -u origin HEAD` failed with Schannel `SEC_E_NO_CREDENTIALS`. No workaround was attempted. No implementation commit or PR was created; the index remains unstaged and the implementation/documents remain as working-tree changes. A clean working tree cannot be produced without committing or discarding the requested work.

The ready PR description is [PR.md](PR.md). After restoring Git write access and authentication, commit these changes, push the branch, create the normal PR titled "Reconcile dialog: take bank balance, dated/categorised adjustment, missing booking, lock with previous-day balance (#423)", and review CI plus physical-phone acceptance. No new keys/consents are required by this feature.

## Images

- [Desktop light](desktop-light.png) / [desktop dark](desktop-dark.png)
- [Mobile light](mobile-light.png) / [mobile dark](mobile-dark.png)

These are review artifacts, not regenerated visual baselines.
