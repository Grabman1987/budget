# Portfolio funding plan acceptance

Synthetic-only evidence, 2026-10-25. The screenshots are original Playwright captures at 1440 x 900 and 390 x 844; the phone profile is Chromium emulation, not a physical-device or WebKit claim.

- Full workspace typecheck passed. Full lint/format passed with one pre-existing unused lint-directive warning in `panel.tsx`.
- New domain/API tests: 9/9 passed, including real database undo/redo and stale-write protection.
- Final e2e build passed. New browser spec: 9/9 passed (six acceptance cases plus three setup cases), light/dark on desktop/phone. Includes visible headers for both tables, scoped Axe accessibility, no viewport overflow, saved reload, conflict recovery, privacy and savings-form prefill/cancel.
- Before the final scoped table styling correction, the combined new and existing savings specs passed 23/23. Existing savings code did not change subsequently.
- Independent final full-diff review is clear. Exact-head required CI and serial deployment are recorded on the PR; local acceptance does not claim publication.

The only test files added are `funding-plan.test.ts` in domain/API and `e2e/funding-plan.spec.ts`. No existing tests, tolerances, timeouts or baselines were altered. Browser cases use isolated ledgers. Screenshot scrolling merely aligns the captured section; it does not replace behavioral assertions.

| View | Light | Dark |
| --- | --- | --- |
| Desktop purchase results | [image](desktop-light.png) | [image](desktop-dark.png) |
| Phone purchase results | [image](phone-light.png) | [image](phone-dark.png) |

[Desktop inputs](inputs-desktop.png) and [phone inputs](inputs-phone.png). The result table intentionally scrolls horizontally on narrow screens, retaining column headings and keyboard access.
