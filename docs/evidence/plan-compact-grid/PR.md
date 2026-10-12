Plan opens as a compact grouped worksheet. The sticky top bar retains the existing cent-exact Zu verteilen chain and exposes overspending, unfunded targets and uncategorized bookings as chips. Category metadata moves to tooltips/details, while monthly summaries start closed below the grid. Waterfall distribution, covering, audit/undo and multiple months reuse the existing paths.

Visible + Gruppe buttons at the grid head/end and + Kategorie buttons in every open group reuse the current forms. C/G open those forms outside editable fields. Native group buttons retain aria-expanded and keyboard activation; group sums use the existing shared view model.

Refs #441

Validation: web typecheck, changed-file ESLint/Prettier, 42 affected unit tests and the E2E build pass. The broader changed-spec run had 62 passes and 4 device skips; all five initial failures were resolved and passed in the final targeted desktop/mobile rerun (15 passes, 2 device skips). The 1440 × 900 fold shows 14 category rows, 120 px before the grid, 34 px category rows and 28 px group rows. Phone controls meet 44 px, with no horizontal page overflow and no light/dark Axe violations.

Synthetic desktop/mobile screenshots and exact commands: [delivery evidence](https://github.com/Grabman1987/budget/blob/feat/plan-compact-grid/docs/evidence/plan-compact-grid/README.md).

No migrations or dependencies. Production changes stay in Plan; the existing frame is tightened only through Plan-scoped CSS. Existing E2E selectors now open the new disclosures/menus before interacting with their contents. No tracked visual baselines were regenerated; the repository has no pinned Plan-month baseline. Existing Expected, goals, reports and shell baselines retain their page layouts.

Owner steps: review the desktop grouped grid and phone forms after required CI passes. Package 2 inspector and package 3 phone action-only expansion remain separate. No credentials or financial setup are required for this package.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
