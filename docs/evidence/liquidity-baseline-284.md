# Liquidity forecast baseline clarity — #284

The report labels the six-month low point as **Tiefpunkt im Grundplan** when there are no event marks. Its basis note identifies saved payments and variable planning, invites event setup only when no events are configured, and explains when configured events fall outside the selected horizon. Active variable-spending levers are disclosed as a preview.

The isolated synthetic E2E creates its own account, variable category and monthly target. It verifies the API's empty-event baseline, the no-event copy, inactive/active lever copy, an event outside the horizon, and a past-anchored recurring event with multiple forecast marks. No private financial data is used.

Verification on merge commit `02c7f26c7e5b223f4aa83b7987d9f7ce2cffa0f2` (base tree `07ba424046e0f13d18ad8c927ad377177bde568b`) plus this change:

- `npm run build:e2e` — exit 0.
- `npx playwright test e2e/liquidity-report.spec.ts --project=desktop --project=mobile --grep 'liquidity forecast labels the assumptions-only baseline|horizon and levers change the forecast like the API says' --workers=1` — exit 0, 7 passed (3 setup checks and both selected tests on desktop and mobile). The baseline case ran Axe in light and dark themes and checked horizontal overflow.
- `$env:VITEST_MAX_WORKERS='1'; $env:BUDGET_REQUIRE_AGE='1'; npm.cmd run check` — exit 0. Typecheck, CSS scale, ESLint and Prettier passed; Vitest passed 376 files / 3,476 tests (930.82 s).

The focused run generated the four screenshots below, and their SHA-256 hashes match the stored evidence files byte-for-byte:

| View | File | SHA-256 |
| --- | --- | --- |
| Desktop, light | [1440 px](liquidity-baseline-284/desktop-1440-light.png) | `65BF7870DA236C8D239C7B8A4F26EEF37CFBE7B7FC6B9505DD8F1972FB1AF03C` |
| Desktop, dark | [1440 px](liquidity-baseline-284/desktop-1440-dark.png) | `C7F84C1A4039A9AB7DDAF34D2D25BAE949140A2AC379585B6F44D221B6B9F293` |
| Mobile, light | [390 px](liquidity-baseline-284/mobile-390-light.png) | `4EF227816ABAA99B24D36E9B10FD8786FF8CCD05673B2D777AF51C933F7B6DAE` |
| Mobile, dark | [390 px](liquidity-baseline-284/mobile-390-dark.png) | `343FE4F051006BBBB2F450412DCA9DED4A3ABD2F353026CE58BEE2AAE751B081` |

Historical RED evidence was recorded before the #250 integration: the isolated desktop test failed on base `61aa041cf9ff8ec7adeb0d335ca3ae791504ec1d` because **Tiefpunkt im Grundplan** was absent. That provenance was not re-run on the merged tree. Browser emulation does not constitute physical-device testing.
