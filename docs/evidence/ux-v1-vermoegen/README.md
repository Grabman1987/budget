# UX V1 — Vermögen (#480)

This implements C-08, C-09, C-21, C-23, C-24 and C-27 with synthetic ledgers only. The local portfolio, debt and freedom audit images were reviewed. Figma financial values were not fetched or copied.

Portfolio starts with value, gain in EUR/percent, annualised time-weighted performance and history from the existing Reports query. Chart periods sit beside their chart. Debt starts with the total and actual monthly EUR history; payoff dates remain unavailable until the existing model has complete calculable terms. Explanations, stored terms and scenarios are disclosed on demand.

Freedom pre-fills an editable saving assumption from up to six closed Zukunft months using the existing allocation calculation, including refunds and safe integer-cent sums. Savings details resolve the next planned date against inclusive schedule versions and show recorded gross buys in the selected instrument/account since the earliest version, including manual buys. This is not confirmation of bank execution. Existing writes, guards, locks and undo remain shared.

## Regression corrections

The new trade table exposed implicit minimum grid widths. On a 390px phone the instrument page expanded to 739px, clipping its native metadata dialog and intercepting the save action. An independent viewport-width assertion reproduced the defect. Explicit `minmax(0, 1fr)` columns keep both instrument and savings-detail tables inside their own keyboard-scrollable regions; metadata save, persistence and undo pass again, including WebKit.

The two new chart components used an undefined label class, leaving SVG date labels black. A browser regression reproduced `rgb(0, 0, 0)` instead of the theme's ink role. Both now use the existing shared `svg-label` class; all three browser profiles verify the computed fill in both themes.

Existing tests open the new native disclosures before checking their original amounts and actions. Debt geometry checks retain full-width stacking, now checking the top-level result and the calculation's inner content separately. The full gross-exposure denominator explanation remains in its disclosure.

## Verification — 15 October 2026

- Fresh web TypeScript, changed-file ESLint/Prettier, CSS scale and E2E build passed. Targeted Vitest: **21 tests in three files passed** (`freedom` DB read model, `freedom-model`, `savings-model`).
- Final browser run: **14 passed**, including setup, desktop, Chromium phone and real WebKit iPhone. It covers all five changed pages, light/dark Axe, computed chart text roles, 44px phone targets, 390px page width, literal debt calculations, Zinsänderung save/undo/redo, error/retry and model geometry.
- The wider affected run passed **53 tests**, with one existing phone-specific freedom skip. Its four debt geometry failures used obsolete selectors; those cases were corrected and passed in the final run above. That wider run also contained a long local runtime interruption. Instrument/savings CRUD, held writes, failed-save draft retention, browser Back, exclusive dialogs, exact exposure/history, persistence and undo were covered, including the added WebKit exposure case.
- Linux workflow `38691829321` ran all seven screenshot-bearing specs: 120 passed and 17 existing project/setup skips in 3.4 minutes. Its four updated net-worth baselines were reviewed in desktop/phone light/dark; periods now sit beside the chart. No Linux baseline was generated locally.
- Local regression logs are outside the repository. The owner requires targeted local checks with one worker because of limited memory; no full local suite is claimed. Required final-head CI and deployed acceptance remain delivery gates.

## Final synthetic browser images

| Page | Desktop light | WebKit iPhone dark |
| --- | --- | --- |
| Portfolio | [Desktop](portfolio-desktop-light.jpg) | [iPhone](portfolio-webkit-iphone-dark.jpg) |
| Debt | [Desktop](debts-desktop-light.jpg) | [iPhone](debts-webkit-iphone-dark.jpg) |
| Freedom | [Desktop](freedom-desktop-light.jpg) | [iPhone](freedom-webkit-iphone-dark.jpg) |
| Instrument | [Desktop](instrument-desktop-light.jpg) | [iPhone](instrument-webkit-iphone-dark.jpg) |
| Savings | [Desktop](savings-desktop-light.jpg) | [iPhone](savings-webkit-iphone-dark.jpg) |
