# Plan compact grouped grid — #441

Owner package 1, 2026-10-12. Groups replace waterfall as the default; waterfall remains selectable and distribution still uses its existing suggestions. Existing budget reads, assignment/cover writes and undo paths remain unchanged. Unfunded cents use `groupStatus(rows).need`; the overspent count uses `overspentEnvelopes`, including credit overspending. No financial persistence change, migration or dependency.

The new isolated-ledger browser regression uses synthetic category targets and signed cent amounts. It checks group sums, the existing Zu verteilen figure, unfunded cents, overspending, category/group row heights, the desktop fold, native keyboard collapse, C/G input exclusion, form entry, two-month usability, phone touch targets, page overflow and light/dark Axe results. Screenshots are evidence captures, not regenerated comparison baselines.

## Verification

| Check | Result |
| --- | --- |
| `npm run typecheck -w @budget/web` | Exit 0 |
| ESLint on every changed TS/TSX file, including the new E2E spec | Exit 0 |
| Prettier on changed text files and evidence docs; `git diff --check` | Exit 0 |
| Vitest: plan-model, budget-ui, plan-form-dialogs, split-band, income-targets-card | 5 files, 42 tests passed |
| E2E web/server build and final web-only refresh | Exit 0 |
| Broader changed-spec run, desktop/mobile, one worker | 62 passed, 4 device skips, 5 failures subsequently resolved |
| Final focused rerun, desktop/mobile, one worker | 15 passed, 2 device skips, exit 0; covers all five preceding failures plus Pace and cover-protection regressions |

The preceding failures exposed hidden-selector focus, the removed Hero expectation, shared-ledger interference with cover protection, the desktop fold, and phone suggestion-button overlap. Menu-entry updates, an isolated ledger for the multi-month cover scenario, compact desktop registers and a stacked phone suggestion button resolved them without changing financial expectations.

The final fold capture contains 14 complete category rows at 1440 × 900. The table starts 120 px below the Plan body; measured categories are 34 px and group rows 28 px. The test includes overspent rows with cover buttons, signed activity and literal cent sums. At 390 px, interactive controls meet 44 px, the page has no horizontal overflow, and Axe reports no violations in light/dark.

- [Desktop fold](desktop-fold.png)
- Desktop: [light](desktop-light.png), [dark](desktop-dark.png)
- Mobile: [light](mobile-light.png), [dark](mobile-dark.png)

Final browser command (after the successful broader cases):

```powershell
$env:E2E_PORT='5010'
$env:E2E_START_TIMEOUT='300000'
npx.cmd playwright test e2e/plan-compact-grid.spec.ts e2e/month-nav.spec.ts e2e/plan.spec.ts e2e/pace-marker.spec.ts e2e/ux-cover-limits.spec.ts --grep 'compact groups|Pace reduces|cover limits|the arrow keys stay|2 and 3 months side|Decken writes|plan: assign, cover' --workers=1 --project=desktop --project=mobile
```

The package memory exception applies: no `npm run check` and no full E2E suite. The E2E build ran once; subsequent web-only builds refreshed the UI during the layout fixes. Existing Vite chunk/dynamic-import warnings and jsdom `scrollTo` notices are unrelated to this change.

## Visual review and remaining work

No existing tracked Plan-month screenshot baseline is present. Expected/goals/report/shell baseline page layouts are unchanged. Required CI and owner review remain pending; no local baseline regeneration. Package 2 inspector and package 3 phone action-only expansion are outside this package.
