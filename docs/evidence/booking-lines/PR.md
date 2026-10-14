# Buchungsdialog: Zeilenmodell (B1)

Refs #463

This delivers the first coherent part under the owner's one-hour scope rule: a pure contact-share allocator and optional gross booking lines that map to the existing create/patch split payloads. The booking dialog itself still uses its existing UI. Issue #463 remains open.

Percent shares use integer basis points of the gross line and the existing largest-remainder allocator. The category receives the remaining cents and wins equal fractional remainders. For 33.33% of 100.01 EUR, the contact receives 3,333 cents and the category 6,668 cents. Fixed amounts and percentages can coexist, each category can have several contact shares, and invalid/overallocated shares cannot produce a valid save payload.

The mapping retains split order, signed refund rows, contact/category identity, memo and income type during edit round trips. Retained contact split income types now survive the existing serializer. No database migration, endpoint, undo flow or reconciled-lock policy changes. The domain package export is the only shared change.

## Verification

Synthetic domain and payload tests were written and observed failing before implementation. An additional metadata regression was observed producing an unwanted split patch before restoring contact income-type preservation.

Final model tree, 2026-10-14:

- `npm run typecheck -w @budget/web` and `npm run typecheck -w @budget/domain`: exit 0.
- Changed-file ESLint: exit 0.
- Changed-file Prettier, including this note and the roadmap: exit 0.
- `git diff --check`: exit 0.
- `npx vitest run packages/domain/src/ledger/booking-lines.test.ts apps/web/src/ledger/booking-lines.test.ts apps/web/src/ledger/booking-model.test.ts apps/web/src/ledger/split-rest.test.ts apps/web/src/ledger/capture-form.test.tsx --maxWorkers=1`: 5 files / 66 tests passed, exit 0 (38.35 seconds).

Windows commands used the standard `npm.cmd` / `npx.cmd` launchers because PowerShell script execution is disabled. The removed UI experiment is outside these final results; the final tree retains no UI file changes.

## Remaining acceptance

- Integrate the line model into `capture-form.tsx` / `split-editor.tsx`, including category/contact search and contact creation, 50% sharing controls, multiple categories, editable row amounts and visible rest/save guards.
- Implement the 2/3 date + 1/3 repeat layout, remove date chips and the separate contact/Split controls, and use one slim suggestion-chip row.
- Verify exact edit round trips through the real dialog and preserve keyboard, offline capture, legacy transfer rows and lock behavior.
- Add/update and run the affected desktop, mobile and WebKit iPhone browser scenarios, Axe light/dark, 390px overflow/touch checks and synthetic screenshots.
- Required CI and owner desktop/phone acceptance.

There are no screenshot baseline changes in this first part because the UI files are unchanged. The complete UI part will need an explicit affected-baseline review; no baselines were regenerated locally. No E2E build or browser run was performed for this model-only part. The task's memory exception applies; no full local check was run.

## Owner steps

No keys, consents, provider access or migration are needed. The first part does not resolve the reported dialog usability problem; review the complete UI and browser evidence when the remaining work is delivered.

## Delivery status

Branch: `feat/booking-lines`, based on `3d164f93`. Normal Git restore and staging attempts failed because Git cannot create the worktree `index.lock` (permission denied). The requested `git push -u origin HEAD` also failed with `schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS`. No task commit, successful push or PR was produced. The task changes remain unstaged; the index has no staged task changes and the working tree is not clean. Commit/push/PR delivery needs normal worktree index write permission and usable Git credentials. No merge or deployment was performed.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
