# Report 3.4: first connected source slice

`/reports/vorschau` follows the layout of `design/prototype/reports-zukunft.js`
(lead, dimension chain, stacked monthly bars and payment calendar). Coverage is
explicitly limited to stored expected-outflow contracts. Twelve full months after
the server's `asOf` day replace the prototype's fixed Oct 2026–Sep 2027 window.
Independent savings plans, other future ledger transfers and cross-source dedup
remain open. No category funding, reserve coverage or future FX is inferred.

`GET /api/expected/year-preview` is session-protected and read-only. All live
versions feed the existing `occurrences`/`versionOn` rules. Stored status and valid
booking links overlay exact payment/date identities. A changed schedule's
stored-only date is retained with an unavailable contract amount. Stored expected
amounts lack currency history; their raw cents never appear in the UI. Linked
actual bookings use their own stored currency, separately from forecast totals.

The shared pure result supplies the chart, calendar, lead, monthly average and
first most-expensive base-amount month. Native currency totals and base/upper
ranges remain distinct. A mixed-currency or unknown contract cannot yield a
complete EUR total. Unsafe aggregate cents fail the read instead of rounding.

Focused evidence:

- Domain: literal Nov 2026–Oct 2027 total 170000 cents (10000 ×2, 12000 ×10,
  annual 30000 in March), shifted-version day/window edges, leap/month ends,
  quarterly anchors, inclusive start/end, future first version, ranges, currency
  changes, multiple contracts per category, stored dedup, unavailable amounts,
  first tied maximum, empty state and unsafe aggregate rejection.
- API: absent materialised dates still project the full window; repeated GETs
  leave occurrences/audit byte-for-byte unchanged; authentication, deleted
  payments/versions, inflows, native ranges and protected links are covered.
- Shared audited-write tests observe both expected queries and the preview after
  writes, undo and redo. Expected/version writes use `useBudgetWrite`, which
  invalidates EXPECTED and LEDGER; the report is under LEDGER alongside booking,
  account and market invalidation paths. No FX assumptions are cached.
- Browser: literal values, all twelve month columns, keyboard scroll, foreign
  ranges and unassignable expectation currency, separate actual booking, exact
  annual USD 9007199254740990-cent display, empty
  and error/retry; real synthetic sample API compared with every EUR calendar
  month and lead while asserting no API writes. Axe serious/critical findings
  and page overflow checked in light/dark at 1440 and 390 pixels.

Reproduce focused checks with `npx vitest run
packages/domain/src/schedule/payments-preview.test.ts
apps/server/src/api/payments-preview.test.ts
apps/web/src/budget/use-category-writes.test.tsx`, then `npm run build:e2e` and
`E2E_PORT=4820 npx playwright test e2e/payments-preview-report.spec.ts
--project=desktop --project=mobile --workers=2`. Screenshot output defaults to
Playwright artifacts; `BUDGET_PAYMENTS_PREVIEW_EVIDENCE` selects an external
artifact directory. Full repository checks and integration belong to the lead.
