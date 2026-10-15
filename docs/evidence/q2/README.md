# Q2: Quiet historical signals, one inbox alert

All screenshots use the synthetic sample ledger pinned to 17 September 2026. Desktop captures are Chromium at 1440 px; `inbox-chromium-390-light.png` is Chromium at 390 px; `*-iphone-dark.png` are real WebKit iPhone 13 viewports. E2E checks exercised both light and dark theme on every changed report and the inbox, with no serious or critical Axe violations and no horizontal page overflow at mobile width.

- `inbox-desktop-light.png`, `inbox-desktop-dark.png`, `inbox-chromium-390-light.png`, `inbox-iphone-dark.png`: one live overspent summary with the summed EUR deficit and a secondary Plan triage link.
- `assets-debts-desktop-light.png`, `assets-debts-iphone-dark.png`: liabilities use dashed outline bars; values and API-derived totals remain unchanged.
- `cashflow-desktop-light.png`, `cashflow-iphone-dark.png`: historical negative cashflow is ink.
- `compare-desktop-light.png`, `compare-iphone-dark.png`: historical increases use ink.
- `savings-desktop-light.png`, `savings-iphone-dark.png`: negative historical savings rate uses ink.
- `projects-light-desktop.png`, `projects-dark-desktop.png`, `projects-light-mobile.png`, `projects-dark-mobile.png`: synthetic project loss remains signed and uses ink.

## Verification status before integration

Focused API/UI tests passed: 14 tests. The API test uses independent literal deficits of 1 and 2,345 cents and expects a 2,346-cent total with `limit=1`, while preserving individual IDs, full counts and historical-filter behavior. The shared bar regression retains default live-warning red.

Chromium inbox desktop/mobile run: 7 tests including setup passed. Real WebKit inbox check: 2 passed. Targeted historical report flows passed on Chromium desktop/mobile; the real WebKit report/inbox batch passed 7 tests including setup. Each changed report was checked in light and dark with Axe; screenshots listed above were visually reviewed. These development WebKit runs used an external scoped config with the iPhone 13 device. Repository WebKit matching is now expanded for the same specs; integrated CI remains required. No persisted console log was saved for those development runs.

The original Impeccable detector returned no findings (`[]`, exit 0) for the 12 changed UI/chart source/CSS files. Other source-based reviews and their limits are in [skill adoption](../skill-adoption-2026-10-15.md).

Q2-only integrated full check passed under Node 22.23.3 with required age: 433 files / 3,939 tests, no skips; all typecheck/lint/format checks passed. After that check, the related wealth slice was integrated and responsive header selectors were updated to use viewport width for the actual `webkit-iphone` project. The combined final full check, root-config WebKit run, exact-head CI and deployment/live proof remain pending.
