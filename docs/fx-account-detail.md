# Account detail currency contract

Account detail retains integer native cents. EUR display valuations reuse the existing
`toEurCents` domain conversion and stored on-or-before ECB lookup used by account
overview cash valuation. No rate fetch or booking is triggered by a read.

- The lead is `valueEurCents`, exactly the overview account value, including securities
  where present. Native cash is shown separately; native cash is never added to EUR
  securities values. The history charts show cash only.
- A booking uses the stored rate on or before its booking date. Its running native
  cash balance is valued on the same day. Native cents, currency, valuation day,
  actual rate date, EUR-per-native-unit rate and source remain separately available.
- Daily history returns native cash and EUR valuations for every day. EUR lines
  break at missing rates; native history remains visible. An expandable daily table
  provides both exact amounts and rate provenance, also on mobile.
- A single-account filtered movement sum uses the EUR valuation of each matching
  booking, with signed cent rounding per booking, across all pages. It is withheld
  if any matching rate is missing. It is a movement sum, not a converted current
  balance or a sum of running balances. Multi-account `sumEurCents` is null.
  The account-filtered booking drilldown uses the same movement formatter. Without
  one account filter, a ledger containing foreign accounts offers an account
  selection instead of presenting a mixed native sum as EUR; day groups retain
  separate native currency totals.
- Reconciliation compares and writes native cents. Booked/pending/statement/difference
  display valuations use the selected check date. Duplicate movements retain their
  booking-date rate. EUR values do not decide equality or the adjustment amount;
  rounding may make a displayed EUR difference differ from subtracting two rounded
  EUR balances. Missing FX does not prevent a valid native check.
- Active foreign tracking accounts can open the native cash reconciliation panel;
  foreign budget-account creation remains unsupported under the existing EUR-first
  guard. Closed accounts remain read-only.

`CashValuation` (`packages/domain`) is a pure display projection; `cashValuer`
(`packages/db`) caches stored rate lookups per read. `valuedCurrency` is the shared
de-AT display formatter for booking rows, history and reconciliation. No client
conversion formula is present. Missing rates, including a rate only available
after the requested day, produce **Kurs fehlt**, never native cents relabelled EUR.
Native zero without an FX rate also has no display conversion; the overview's
existing zero-value account convention is preserved.

The API adds `cashValuation`/`pendingValuation` to account reads, `currency` and
point `valuation` to account series, `amountValuation`/`balanceValuation` and
single-account `sumEurCents` to booking reads, and native `currency` plus named
`valuations` to reconciliation previews. These are read projections, without
schema changes or additional audit writes. Existing audited reconciliation,
native adjustment, rollback and undo/redo paths remain authoritative.

Verification uses only synthetic USD/CHF accounts, fixed dates and artificial
rates. Domain/formatter tests cover signs, cent rounding, EUR identity and missing
or future rates. API tests cover current/overview equality, historical rate
selection, pagination-independent sums, unavailable values, native adjustment,
undo/redo and session rejection. Real-server Playwright cases cover desktop 1440
and mobile 390, light/dark, Axe, overflow and missing-rate native reconciliation.
Account and dialog Axe checks are scoped to the changed surfaces; the existing
mobile shell capture button has an unrelated landmark finding. Evidence images
are emitted into each test's output directory; existing visual
baselines are not regenerated. Owner device/design acceptance and private ledger
reconciliation remain separate from these implementation checks.

Local reproduction (Windows uses `npm.cmd` / `npx.cmd`):

```sh
npm run check
npm run build:e2e
npx playwright test --config=e2e/fx-detail.config.ts
npm run build
```

The isolated FX configuration starts only per-test synthetic servers and avoids
the shared sample ledger. `E2E_PORT` can select an unused port range. No dependency
installation is needed when the checkout's `node_modules` is already healthy.
On a loaded Windows machine the complete check can limit test concurrency without
changing repository configuration:

```sh
npm run check -- -- --maxWorkers=2 --testTimeout=30000 --hookTimeout=30000
```

Verified locally on 2026-10-04 with Node 24.12.0 on Windows: full typecheck/lint
and 260 unit/API test files (2,500 tests) passed; production and E2E builds passed.
The isolated desktop/mobile scenarios passed in both themes. The first concurrent
unbounded run hit timeouts in existing import/export cases and was stopped; the
complete two-worker run above passed. No dependency install was performed.

Synthetic visual evidence, with reduced motion and unchanged Linux baselines:
[desktop light](evidence/fx-detail/desktop-light.png),
[desktop dark](evidence/fx-detail/desktop-dark.png),
[mobile light](evidence/fx-detail/mobile-light.png),
[mobile dark](evidence/fx-detail/mobile-dark.png),
[desktop reconciliation](evidence/fx-detail/desktop-reconciliation.png),
[mobile reconciliation](evidence/fx-detail/mobile-reconciliation.png),
[desktop missing rate](evidence/fx-detail/desktop-missing-rate.png),
[mobile missing rate](evidence/fx-detail/mobile-missing-rate.png).
