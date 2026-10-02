# Market data (P5.1)

Prices and ECB rates come through adapters in `packages/market` (injected `fetch`, no database).
The jobs are in `apps/server/src/market` and are plain exported functions, so the P4 worker can call
them: `refreshPrices(db, sources, { today })`, `refreshFx(db, sources, { today })`,
`refreshMarket(db, sources, today)` (both, rates first).

## Sources

| Source | Used for | Notes |
| --- | --- | --- |
| Yahoo chart (`yahooChartSource`) | Daily close (`security.symbol`); primary, or fallback when `BUDGET_ARIVA=1` | The endpoint yfinance reads, no key. Unadjusted close unless `security.quote_adjusted`. A bar of a session that is still open is dropped. A quote currency other than `security.currency` is refused (`currency_mismatch`) |
| Ariva CSV (`arivaSource`) | Primary when switched on (`fallback_quote_id` is the Ariva security id, `quote_exchange` the exchange; the column name is historic) | **Off by default**, switched on with `BUDGET_ARIVA=1`; then Yahoo is the fallback (owner decision 02.10.2026: Ariva has the European exchange prices in EUR). The URL and the CSV columns (`Datum;...;Schlusskurs`) are built from memory and not verified against the live service, the parser is tested against a hand-made sample only. A login page instead of a CSV is reported as `parse` |
| ECB SDMX CSV (`ecbSource`) | `fx_rate`, `EXR/D.{CUR}.EUR.SP00.A` | No key. ECB: units of currency per EUR; stored: EUR per unit, `10^12 / x` on integers, rounded half up once |
| Fixture sources | Seed, dev server, tests, e2e | Deterministic and synthetic, never the network |

`BUDGET_MARKET_SOURCES=fixture|live`: default `live` when `NODE_ENV=production`, else `fixture`.
Fixture mode on a running server continues the stored series with a seeded random walk.
`BUDGET_MARKET_DAILY=1` starts an in-process timer (22:30 Vienna, once per day) until the P4 worker
owns scheduling.

## Rules of the jobs

- Window: the day after the newest `yfinance`/`ariva` price up to today; first run: from
  min(first trade, 2023-10-01) minus 7 days. ECB: full history from 1999-01-04 on the first run.
- Primary first, fallback on error or empty answer. Every write goes through `upsertPrice` (source
  stored, `manual` never overwritten, changes audited), so a second run writes nothing.
- All sources failed: one open `stale_value` inbox item per security (or currency) and error class
  (`detail` = `Fehlerklasse: <class>`). An empty answer counts as a failure only on the first fetch
  or after five weekdays without a quote (weekends and holidays are no news). The item closes when
  data flows again.
- Logs and inbox items carry the error class only, never URLs, headers or response bodies.

## Open for the owner

Per real security (entered in the app, never in the repo): Yahoo symbol, Ariva id and exchange,
adjusted close or not (as Portfolio Performance uses it). Whether Ariva's historic CSV needs a login
(credentials would go only into Fly secrets); until then the fallback stays off.
