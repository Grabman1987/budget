# Issue #272 — synthetic income and target evidence

Status: the copy change and isolated-ledger desktop/mobile browser checks pass on the integrated tree. All amounts and records below are synthetic. No owner data, production ledger, or live account was used.

The scenario keeps a planned income estimate distinct from actual account cash:

| Value | Synthetic amount | Source |
| --- | ---: | --- |
| Expected income | €3,000.00 | Recurring expected inflow |
| Monthly target | €2,000.00 | One synthetic category |
| Account balance after booking | €1,000.00 | €1,500.00 opening balance less an uncategorized €500.00 outflow |
| Available to assign | −€500.00 | Existing assignment is €1,500.00; the outflow is unassigned |
| Planning difference | +€1,000.00 | Expected income less monthly target |
| Target still unfunded | €500.00 | Target less existing assignment |

The component regression supplies independent literal values to the real card consumer. In the integrated file it is the sixth test; the five existing #271 tests remain present. The browser scenario creates an isolated synthetic ledger, then checks the actual account and budget read models before checking the visible card and negative `Zu verteilen` warning. It captures desktop and mobile layouts in light and dark themes and checks axe violations and horizontal overflow. `isolated-ledger` creates the disposable database and session under the operating-system temporary directory and removes them on teardown.

Verification on branch `codex/plan-difference-272-1008`, integrated HEAD `9922b6a6ffd5604007560c2968d409b9dddc87a8`:

```powershell
npm test -- apps/web/src/budget/income-targets-card.test.tsx
npm run typecheck --workspace @budget/web
npx eslint apps/web/src/budget/income-targets-card.tsx apps/web/src/budget/income-targets-card.test.tsx e2e/income-targets-272.spec.ts
npx prettier --check apps/web/src/budget/income-targets-card.tsx apps/web/src/budget/income-targets-card.test.tsx e2e/income-targets-272.spec.ts docs/ROADMAP.md docs/evidence/income-targets-272/README.md
npm run build:e2e
npx playwright test e2e/income-targets-272.spec.ts --project=desktop --project=mobile --workers=1
```

The temporary red reproduction changed only the component's positive label from `Planungsdifferenz` to `Überschuss`. The targeted title test failed because it could not find `Planungsdifferenz`; after restoring the exact source, all six component tests passed. Web typecheck, scoped ESLint and Prettier passed. The E2E build passed. The first browser attempt exposed a strict-mode ambiguity because the expected-income text matched the heading, `<dt>`, and explanatory note. Selecting the exact `<dt>` label resolved it without changing the timeout. The repeated desktop/mobile run passed 5/5 tests (three setup tests plus desktop and mobile). Both browser projects verified account balance `100000`, `Zu verteilen` `−50000`, expected income `300000`, targets `200000`, planning difference `100000`, and unfunded target `50000` cents. Axe reported no violations and neither viewport had horizontal overflow.

The following are the original PNG files from that successful run, copied byte-for-byte from Playwright output (SHA-256 verified). Desktop screenshots are 1440 px wide; mobile screenshots are 390 px wide.

| Viewport | Light | Dark |
| --- | --- | --- |
| Desktop, 1440 px | [desktop-light.png](desktop-light.png) | [desktop-dark.png](desktop-dark.png) |
| Mobile, 390 px | [mobile-light.png](mobile-light.png) | [mobile-dark.png](mobile-dark.png) |

The full `npm run check` then passed on the same frozen tree with `VITEST_MAX_WORKERS=1` and `BUDGET_REQUIRE_AGE=1`: 373 test files and 3,448 tests passed; typecheck and repository-wide lint also passed. Exit code was 0. The complete console log is `%TEMP%\budget-plan-difference-272-full-check-2026-10-08.log`. The lead visually reviewed all four screenshots and the independent final review reported no findings. Owner iPhone/device acceptance remains tracked separately under #310.
