Refs #451

The left account list now follows the Z4 arrangement: navigation icons without
sheet numbers, KONTEN with create and account-settings shortcuts, uppercase
groups with chevron/icon/total and no subtitle, and typed account rows with
right-aligned balances. Negative balances use the existing red token, including
cards and loans. Selected accounts share the active navigation CSS rule,
including while hovered. The precision-layer light and Prussian-blue dark
colours and the sidebar footer are retained.

The plus opens the existing account form, including in an empty ledger. Account
grouping, shared EUR valuations and existing compact amount formatting remain.
Drag/keyboard ordering, closed-account filtering, remembered group/sidebar
collapse and audited writes/undo are retained. Budget assigned, quick-assign,
move and cover writes are untouched. No new dependency, migration, provider
call or third-party screenshot is included. This is the Shell/Konten Z4 slice;
category bars and other Zerosum packages remain outside this PR.

## Verification

The owner's package memory exception applies: no `npm run check` or full E2E
suite was run. CI remains the final gate. All data and screenshots are synthetic.

- `npm.cmd run typecheck -w @budget/web`: exit 0.
- ESLint on all changed TS/TSX files: exit 0.
- Prettier on all changed source/test/docs files: all matched files formatted.
- `node packages/ui/scripts/check-css-scale.mjs`: CSS typography and radii match the DESIGN.md scale.
- `npx.cmd vitest run apps/web/src/shell/sidebar.test.tsx apps/web/src/shell/account-tree.test.tsx apps/web/src/ledger/account-order-model.test.ts --maxWorkers=1`: 3 files, 15 tests passed.
- `npm.cmd run build:e2e`: exit 0, run once. The frontend alone was rebuilt after two CSS cascade corrections. Existing dependency annotation, mixed-import and chunk-size warnings remain.
- Desktop filtered Playwright run: 9 passed (42.1 s), including 3 setup cases.
- Mobile filtered Playwright run: 7 passed, 1 expected desktop-only skip (30.8 s), including 3 setup cases.
- Axe WCAG A/AA: zero violations for the sidebar expanded/collapsed in light/dark, and for the mobile account page in light/dark. The retained reorder spec also checks editing mode for serious/critical violations.
- Exact-cent create through the sidebar stores 1,234 cents; Undo removes the account. Drag/keyboard ordering, Undo, reload persistence, active styling and collapse memory are exercised.
- Desktop sidebar remains 236 px, collapsed 72 px. At 390 px the sidebar remains hidden, visible shell touch targets are at least 44 px and the page has no horizontal overflow.

Browser commands (PowerShell, one worker):

```powershell
$env:E2E_PORT='5030'
$env:E2E_START_TIMEOUT='300000'
npx.cmd playwright test e2e/sidebar-zerosum.spec.ts e2e/accounts-sidebar-profile.spec.ts e2e/shell.spec.ts e2e/account-order.spec.ts --grep 'Z4:|accounts are grouped|layout metrics|sidebar collapses|sidebar: pencil' --workers=1 --project=desktop
npx.cmd playwright test e2e/sidebar-zerosum.spec.ts e2e/accounts-sidebar-profile.spec.ts e2e/shell.spec.ts --grep 'Z4:|accounts are grouped|tab bar with the same|touch targets in header' --workers=1 --project=mobile
```

The new unit expectations failed before implementation for the removed numbers,
subtitles, missing icons/actions and negative card/loan styling. Browser checking
caught both the precision-layer active-style mismatch and a later hover override;
both were corrected by sharing the active rule after the row state rules.

## Own screenshots

| Viewport | Light | Dark |
| --- | --- | --- |
| Desktop 1440 × 900 | [Expanded](desktop-light.png) | [Expanded](desktop-dark.png) |
| Desktop, sidebar 72 px | [Collapsed](collapsed-light.png) | [Collapsed](collapsed-dark.png) |
| Mobile 390 × 844 | [Phone](mobile-light.png) | [Phone](mobile-dark.png) |

Screenshots were inspected for account hierarchy, active selection, balance
alignment, preserved footer/colour grading and collapsed/mobile chrome.

## Visual baselines and remaining acceptance

No visual snapshot baseline was regenerated locally. The sidebar changes affect
the following existing desktop Linux baselines; review them in the pinned Linux
visual workflow before accepting any updates:

- `e2e/shell.spec.ts-snapshots/shell-{heute-light,heute-dark,reports-light}-desktop-linux.png`
- `e2e/expected.spec.ts-snapshots/expected-{light,dark,panel-light,income-dark}-desktop-linux.png`
- `e2e/goals.spec.ts-snapshots/sparziele-{light,dark}-desktop-linux.png`
- `e2e/networth.spec.ts-snapshots/vermoegen-netto-{light,dark}-desktop-linux.png`
- `e2e/rules.spec.ts-snapshots/regelwerk-{light,dark}-desktop-linux.png`

Phone baselines and standalone auth/component-gallery baselines are unaffected
by the desktop sidebar change. Required CI, Linux visual review and owner
acceptance remain open. No merge or deployment is included.

## Owner steps

Publishing is blocked in this session: `git push -u origin HEAD` failed with
`schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS (0x8009030e)`.
No transport, credential or sandbox workaround was attempted. The initial
index-lock permission error cleared on a normal retry; the local changes are
committed. This file is the prepared English PR body. Once normal Git transport
is available, push the branch and open a normal PR titled
**Seitenliste Konten im Zerosum-Aufbau (Z4)**. No PR was created here.

Review the expanded/collapsed desktop account list and its create/settings
actions in both themes. Confirm the intentionally red negative card/loan
balances. Review required CI and the affected Linux baselines. No keys,
consents, migration or account-data setup is required for this UI change.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
