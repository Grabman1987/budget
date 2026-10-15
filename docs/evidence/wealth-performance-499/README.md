# Wealth #499: signed composition and daily portfolio index

This evidence uses the repository's seeded synthetic sample account (reference date 17 September 2026).
It records signed account composition around one shared zero and the daily time-weighted portfolio index.
The daily line uses stored valuation dates; a stored quote can be carried forward until the next stored quote,
so the chart does not imply fresh daily market quotes. Dates represent valuation inputs, not a promise of a new quote each day.

Screenshots are fresh captures from this change; existing screenshot baselines were not overwritten:

- `networth-desktop-light.jpg` — desktop, light theme.
- `networth-webkit-iphone-dark.jpg` — iPhone WebKit, dark theme.
- `portfolio-desktop-light.jpg` — desktop, light theme.
- `portfolio-webkit-iphone-dark.jpg` — iPhone WebKit full page, dark theme.
- `portfolio-chart-webkit-iphone-dark.jpg` — iPhone WebKit viewport focused on the chart, with readable axes and both endpoint dates visible.

Focused verification:

- Domain, model, and API unit tests: 28 passed, including literal signed-zero geometry, one-sided values, empty values, exact daily window endpoints, subwindows, unchanged monthly index expectations, and tiny index-axis ranges.
- Web TypeScript typecheck passed.
- E2E production build passed.
- Wealth UI browser coverage passed in desktop Chromium, 390px mobile Chromium, and iPhone WebKit: 8 tests including setup in the combined net-worth composition and wealth chart run. It checks chart label spacing and non-overlap at 1M, 1J, and 3J, rendered SVG text size, keyboard chart exploration, mobile overflow, and light/dark Axe.
- A fresh iPhone WebKit evidence capture passed separately: 4 tests including setup.
- Targeted ESLint and Prettier checks passed.
- Earlier full `npm run check` passed (433 test files, 3,934 tests), but it preceded the final small index-axis padding, chart-copy, and responsive SVG-width refinements. The integrated final-head full check remains with the lead; this earlier result is not claimed as final verification.
