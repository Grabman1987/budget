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

Q2-only integrated full check passed under Node 22.23.3 with required age: 433 files / 3,939 tests, no skips. After integrating wealth and main `8b9dbe55` (including Playwright 1.64.1), the final serial `npm run check` passed on 15 October: **434 files / 3,951 tests, zero skips**, with typechecks, lint and formatting green. The one existing unused-disable lint warning in `panel.tsx` remains.

The production E2E build passed. The root-config current WebKit 2370 batch passed 36 of 37 cases; the salary-history reload timed out while another heavy check shared the four-core cloud runner. Its unchanged isolated rerun passed all four cases including setup. An initial concurrent unit run also hit the existing 10-second allocation-report seed hook; that suite passed unchanged in isolation, and the final serial full check above passed without skips. No timeout or assertion was weakened. Current Chromium download was blocked locally; the official exact-head CI browser matrix remains the final gate. Deployment and live revision proof remain pending.

After merging the subsequently verified payroll delivery (`4841e7eb`, PR #503), the final combined Node 22 full check passed **434 files / 3,962 tests, zero skips**. The fresh E2E production build and current root-config WebKit integration passed **7/7** including setup: encrypted PDF review/confirmation/undo/rejection, account-specific new payout via chooser and drag/drop, and wealth chart/layout/Axe coverage. A cloud launch with overlapping test ports was corrected before that successful run; no application code or assertion changed. Exact-head CI and delivery remain pending.
