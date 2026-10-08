# Heute plan-rest distinction — issue 264

Synthetic data only. No financial calculation or read model changed.

The regression uses independent cent expectations: a 100,000-cent September plan less 60,000 cents spent leaves 40,000 cents of plan-rest. Bedarf and Wunsch have 40,000 cents available together; 50,000 cents of open outflows leave −10,000 cents available until payday. Heute explains that Plan-Rest is planned monthly spending less spending so far, not an account balance, while “Frei bis Gehalt” shows available Bedarf/Wunsch budget after open bills. The explanation is linked to the lead control for screen readers. The existing clickable lead still opens its Bedarf + Wunsch − open outflows derivation.

The browser case overrides only these relevant read-model fields to check display meaning; the rest of the page stays on the synthetic sample ledger. The viewport-sized screenshots focus on the card and its note instead of presenting unrelated sample chart values as part of this synthetic calculation.

The browser regression first failed on mobile because `.heute-answer-note` was hidden at widths below 768 px. After removing that hiding rule, the relationship note is visible at both 390 px and 1440 px in both themes. Screenshots are synthetic sample-ledger captures with the two figures set to this case:

- `mobile-light.png`
- `mobile-dark.png`
- `desktop-light.png`
- `desktop-dark.png`

The red proof failed on mobile before the CSS fix because the explanation was hidden. Focused green checks: `npx vitest run apps/web/src/heute/answer-cards.test.tsx` (1 file / 3 tests), `npm run build:e2e`, and `npx playwright test e2e/heute-cards.spec.ts --project=desktop --project=mobile --workers=1` (7 passed, including setup). The existing phone-card height check remains at 120 px and passes.

Full gate on Windows, Node 24.12.0 / Vitest 5.0.2, with `VITEST_MAX_WORKERS=1` and `BUDGET_REQUIRE_AGE=1`: the first `npm.cmd run check` exited 1 with one Vitest unhandled fork error for `packages/domain/src/forecast/report.test.ts` (`spawn UNKNOWN`, errno −4094) after 371 files / 3,433 tests passed. The file passed alone with the same environment (`npx.cmd vitest run packages/domain/src/forecast/report.test.ts`, exit 0, 1 file / 9 tests). A full retry on the unchanged source exited 0: 372 files / 3,442 tests, with workspace typechecks, CSS check, ESLint and Prettier passing. No pool or timeout settings changed. Existing Linux screenshot baselines were not regenerated; pinned Linux review remains open.

Captures: [390 px light](mobile-light.png), [390 px dark](mobile-dark.png), [1440 px light](desktop-light.png), [1440 px dark](desktop-dark.png).
