Vermögen now answers each page's main question first: portfolio value/gain and annualised time-weighted history, total debt and actual history, and a freedom projection with an editable historical saving default. Period controls sit beside charts. Savings details show the next version-aware planned date and recorded gross purchases; trade history uses a compact table. Explanations, repayment models and rate versions are native disclosures.

The portfolio reuses the Reports calculation, and the saving default reuses the existing Zukunft allocation. Integer cents, financial guards, writes, locks and undo remain shared. Recorded purchases include manual buys in the same instrument/account since the first version and do not imply bank execution.

The table's implicit grid minimum also caused phone pages to expand beyond 390px and clip native dialogs. Bounded grid tracks fix the underlying layout. Regression tests preserve metadata editing, persistence and undo, add real WebKit coverage, and verify chart label colours in both themes.

Validation: fresh web typecheck, changed-file ESLint/Prettier, CSS scale, 21 targeted unit tests and E2E build passed. The final 14-case Playwright run passed across desktop, Chromium phone and WebKit, including all five pages, light/dark Axe, 44px controls, no page overflow and the corrected debt calculations/layout/actions. A wider run covered 53 passing affected cases and one existing phone skip; its four obsolete debt geometry cases were corrected and rerun in the final pass. Linux screenshot specs passed 120 cases (17 existing skips); all four changed net-worth baselines were reviewed. Required final-head CI gates delivery.

[Synthetic desktop/iPhone evidence and exact checks](https://github.com/Grabman1987/budget/blob/feat/ux-v1-vermoegen/docs/evidence/ux-v1-vermoegen/README.md)

Refs #480
