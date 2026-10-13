Refs #438

Move confirmation beside the account, repetition beside the date, and contact selection before the direct Split action beside category. Preserve the existing advance split model and integer-cent save paths; each contact split names its outlay or repayment explicitly.

Booking capture accepts German date shorthand with single-digit day/month, a two-digit year or the current Vienna year, and rejects impossible dates. Clicking the text field or calendar control opens the native picker. Pending has a light outline and no fill; confirmed has a forest-green fill and retains its tooltip and aria-pressed state.

Ctrl/Cmd+Enter reaches save even through an open category dropdown. Existing global shortcuts stay disabled while the booking dialog is open. The minimal shared overlay change requires a pointer gesture starting on the dialog backdrop and a final click outside its bounds, preventing keyboard-generated or retargeted interior clicks from requesting discard. Suggestions stay within the booking body scroller.

Validation:

- Web and UI TypeScript checks passed. Changed-file ESLint passed with zero errors and one pre-existing unused-disable warning in the shared overlay; changed-file Prettier, CSS scale and git diff checks passed.
- Four affected Vitest files passed: 55 tests covering capture form/model, booking model and shared overlay. The final component/overlay rerun passed 12 tests. RED cases reproduced date shorthand rejection, incorrect field placement, interior discard, swallowed Ctrl+Enter and the extra native-input Tab stops before their fixes.
- One full `build:e2e` passed. Web-only E2E rebuilds followed the real 42px calendar target and keyboard/layout findings; the final rebuild passed. Existing dependency annotation, mixed-import and chunk-size warnings remain.
- Scoped desktop regression passed 12 cases including three setup cases. After the final split-remove touch-target adjustment, the three critical desktop scenarios passed again (6 cases including setup). The same nine scoped mobile scenarios passed at 390px (12 cases including setup). No final browser failures.
- The browser checks cover actual native-picker opening/dismissal, calendar value binding, date shorthand, select/category/payee/flag interactions, letter/modifier input preserving the amount, allowed discard triggers, contact split persistence, keyboard/focus return, save/undo/redo, 44px controls including third-row removal, page/body overflow and light/dark Axe. Native operating-system day selection still needs physical-device acceptance.

The package memory exception replaces the full local check and full browser suite; CI remains the final gate. No dependencies or migration. Shared changes are limited to the overlay backdrop guard and the existing ledger combobox modifier guard; no financial persistence or calculation changes.

Visual baselines: none expected to change. Capture specs use review images, not pinned screenshot baselines. No baseline regeneration. Synthetic desktop 1440 and phone 390 light/dark evidence is saved in this directory.

[Desktop light](dialog-desktop-light.png), [desktop dark](dialog-desktop-dark.png), [phone light](dialog-mobile-light.png), [phone dark](dialog-mobile-dark.png).

Publication blocker: Git staging and commit both failed with `Permission denied` creating the shared worktree `index.lock`. No new commit, push or PR was created; the index is unchanged and the validated changes remain in the worktree. No alternate-index, transport or permission workaround was attempted. Because commits cannot be created, the requested clean worktree and PR body inside the last commit cannot be delivered from this sandbox.

Owner steps: commit the validated changes and evidence from a shell with access to this worktree's Git metadata, push `feat/capture-dialog-layout-1012`, and open a normal PR using this body and the requested title. Review the dialog and native calendar on desktop and a physical phone after required CI passes. No keys, consents or migration needed. Do not merge before CI and owner review.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
