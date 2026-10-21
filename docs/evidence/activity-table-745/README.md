# Compact category activity table (#745)

The category/month detail now presents date, booking, account, status and signed category contribution in a semantic table. Source actions open the existing booking editor. Source totals are labelled separately from individual split contributions; the authoritative category total, pagination and derived card explanations remain unchanged.

At 390px the table uses two visible columns. Date/status and account remain in the booking cell, keeping the date unbroken and the amount alongside the description. Desktop retains five columns. Existing design tokens, keyboard access, amount privacy and 44px actions remain.

## Actual validation

- Product checkpoint `ad4a34dac18f00d3dd36f3e9dcbf1286b54bba54`.
- Initial targeted run: 18/18 (six new component cases, seven unchanged activity UI cases and five unchanged activity API cases), with Web typecheck and scoped static checks passing. After the phone correction, the six affected component cases and scoped static checks passed again.
- Fresh E2E build and canonical WebKit: 7/7 including three setup cases, zero failed/skipped/flaky/retried. Four scenarios cover 1440x900 desktop and configured 390x664 phone, light/dark themes.
- The real synthetic ledger contains two category contributions from the same purchase plus a refund. The category total, source total, account balance, correct editor origin, read-only open/cancel, restored focus and unchanged database/audit state are checked. This adds no new browser Save/Undo claim.
- Current phone example rows are 107–126px high, with a 204px booking column; dates remain on one line. Native touch-target/hit tests, horizontal overflow, privacy and scoped Axe checks pass. The original three-column phone experiment passed functional tests but failed personal visual review; it was replaced before acceptance.
- Independent source reviews and personal original-image review completed. These are browser-emulated profiles, not physical iPhone certification.
- Required `BUDGET_REQUIRE_AGE=1 VITEST_MAX_WORKERS=2 npm run check`: passed; 590 test files, 5219 tests, zero failed/skipped. Check wall time 703.129s. Normal `npm run build`: passed in 8.337s. Source and process guards passed.
- Existing activity native test: its one combined date/account assertion needs the separately reviewed two-assertion adapter; specific owner approval is pending. All original financial/Undo oracles remain untouched.
- Canonical Chromium CI and LIVE verification: pending. No production financial data changed.

## Original screenshots

These are unedited table captures from the four current browser scenarios, not visual baseline replacements. Full-page originals and geometry are retained in the external execution archive.

| Desktop light | Desktop dark |
| --- | --- |
| ![Desktop light](desktop-light.png) | ![Desktop dark](desktop-dark.png) |

| Phone light | Phone dark |
| --- | --- |
| ![Phone light](phone-light.png) | ![Phone dark](phone-dark.png) |
