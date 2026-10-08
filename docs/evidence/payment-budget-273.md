# P0 #273 — Upcoming payment reserve wording

The existing `covered` value in `GET /api/heute` compares the scheduled outflow with the category's available envelope amount, reserving earlier payments in due-date order. It does not inspect the payment account balance or overdraft limit. Heute labels this status `Budgetrücklage reicht` / `Budgetrücklage reicht nicht` and explains: “Die Budgetrücklage vergleicht nur das Verfügbar im Envelope mit der Zahlung. Kontostand und Überziehungsrahmen werden nicht geprüft.” Other upcoming rows retain their expected/received/deviating/missed status. No account-coverage formula, payment action, booking, or stored-data change was added.

## Synthetic regression evidence

- `apps/server/src/api/heute.test.ts`: an isolated API test uses a synthetic checking account at −€200.00 and a Miete envelope with €1,000.00 available. The scheduled €500.00 payment returns `covered: true`; API assertions independently check the negative account balance and positive envelope amount. Focused run: 1 passed, 20 skipped.
- `apps/web/src/heute/upcoming-payments.test.tsx`: renders the actual Heute `Upcoming` consumer with synthetic `covered: true` and `covered: false` values. Both reserve-specific labels and the account-balance/limit explanation are asserted, the former unqualified `nicht gedeckt` copy is absent, and the prior empty-state treatment remains.
- The component test was temporarily run with only the positive label reverted to `Rücklage voll`. It failed at the expected `Budgetrücklage reicht` assertion; the original source was restored, then both component tests passed.
- `e2e/payment-budget-273.spec.ts`: an isolated synthetic ledger has a −€200.00 account and €1,000.00 in the payment envelope. The first €500.00 payment on the 5th is covered. A later €600.00 payment on the 6th is uncovered because only €500.00 remains. API and rendered UI assertions check both statuses, the explanatory note, and each link to Plan › Erwartet.
- Browser checks assert the configured 1440 × 900 desktop and 390 × 844 mobile viewports, no page-level horizontal overflow, and each status's painted text rectangles within its row and section. The test uses `Range.selectNodeContents(...).getClientRects()` rather than the status element's bounding box, checks a 0.5 px tolerance and `scrollWidth <= clientWidth`. A diagnostic run also logged the literal rectangles. The upcoming section passes axe in both themes. The test forces the stored `budget-theme` and root `data-theme`, then asserts distinct resolved theme colors before capturing each image. The current CSS passes the text-boundary checks; no overflow was found and no CSS change was needed.

A diagnostic run also recorded the painted text ranges. The complete labels fit: their right edges matched the section bounds at 1400 px on desktop and 374 px on mobile; scroll width equalled client width for both statuses. The lead read the successful runtime log and reviewed all four captures. The independent reviewer withdrew an initial clipping suspicion after checking the complete labels and text-range evidence; no issue-specific finding remained.

## Screenshots

These are the original PNG captures from final passing run `payment273-e2e-final4.log`, copied byte-for-byte and SHA-256 checked. The images are section crops (not full viewport captures): desktop crops are 1124 × 209 px and mobile crops are 358 × 350 px; the browser viewport dimensions are asserted separately above.

| Viewport | Light | Dark |
| --- | --- | --- |
| Desktop, 1440 × 900 | [desktop-light.png](payment-budget-273/desktop-light.png) | [desktop-dark.png](payment-budget-273/desktop-dark.png) |
| Mobile, 390 × 844 | [mobile-light.png](payment-budget-273/mobile-light.png) | [mobile-dark.png](payment-budget-273/mobile-dark.png) |

The first accessibility-enhanced browser attempt passed a Playwright `Locator` to AxeBuilder’s selector-based `include()` method and failed during serialization. The test now passes the exact section selector string; the final desktop/mobile run passed 5/5 tests (three setup tests plus both viewports). Focused and final browser logs, each with an exit-code marker, are in `%TEMP%`:

- `payment273-component-red.log` (expected assertion failure, exit 1)
- `payment273-api-focused.log` (exit 0)
- `payment273-component-focused.log` (exit 0)
- `payment273-build-e2e.log` (exit 0)
- `payment273-e2e-final.log` (first axe-selector attempt, exit 1)
- `payment273-layout-red.log` (initial status-boundary check against unchanged CSS; all passed, exit 0)
- `payment273-e2e-final4.log` (final text-rectangle and accessibility run, 5/5, exit 0)

`npm run build:e2e` passed. The lead reviewed the screenshots and final diff; independent review found no remaining issue-specific findings. Actual iPhone Safari acceptance is separate under #310; this browser evidence does not claim physical-device sign-off. No owner data, production ledger, deployment, or private account/month comparison was used.

## Full frozen-tree check

After the browser evidence and review, the frozen tree passed `npm run check` on Windows with `VITEST_MAX_WORKERS=1` and `BUDGET_REQUIRE_AGE=1`. Exit code 0; 374 test files and 3,451 tests passed. Typecheck, CSS scale check, ESLint and full Prettier check also passed. Vitest printed five existing “Not implemented: Window's scrollTo() method” notices; they did not fail tests. The full output is `%TEMP%\payment273-full-check-1008.log`; the explicit exit marker is `%TEMP%\payment273-full-check-1008.exit`. No source changes were made during verification. Lead and independent review of the four browser captures and final source diff found no remaining #273 issue-specific finding. Physical iPhone Safari acceptance remains separate under #310.
