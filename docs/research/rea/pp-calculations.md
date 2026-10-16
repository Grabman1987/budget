# Portfolio Performance calculations and model audit

Retrieved 2026-10-15. Static source inspected at commit 805c20dff5d999e987675181b4f1d82f81df10c0 (master 0.89.1-SNAPSHOT). Official download version supplied for comparison is 0.89.0; this describes pinned Java core and does not establish release/UI parity. No source executed, dependencies installed or private PP file read. Tests inspected, not run.

## Return convention

ClientIndex calculates daily TWRR as (V_t + O_t)/(V_(t-1) + I_t) - 1, where I is inbound external flow and O outbound, converted to reporting currency on transaction date. This treats deposits at day start and withdrawals at day end. Returns link geometrically: A_t=(1+A_(t-1))*(1+r_t)-1. If prior valuation plus inflow is zero, daily return is forced to zero; unexplained change adds a warning. First day return is zero. Client period end is clipped to today.

Account DEPOSIT/REMOVAL and portfolio DELIVERY_INBOUND/DELIVERY_OUTBOUND are external. BUY/SELL, dividends, interest, taxes, fees are not neutralized; these have separate reporting arrays. Classification matters.

Material Budget comparison: prior value 100, deposit 100, end 220 yields PP 220/(100+100)-1=10%. Budget code described by lead calculates (endValue - signedNetFlow)/prevValue-1 and gives 20% for the same +100 flow if treated at end of day. Methods differ by timing. Do not claim parity or silently replace either. Explicitly name selected method/scope. PP withdrawal example: prior 100, end 130, withdrawal 20 -> (130+20)/100-1=50%. Annualized cumulative return is (1+A)^(365/actual interval days)-1.

Factories support client, account, portfolio, portfolio plus reference account, classification, investment and security. SecurityIndex is a quote-driven price/benchmark path, anchored to client accumulated return on first data date, with zero flow arrays. Its getPerformanceIRR uses only negative start and positive end quote valuations. This is distinct from held-security IRRCalculation: it collects portfolio buy/sell/delivery/transfer cash flows, dividend payments, start/end valuations, and applicable account fees/refunds.

## Valuation, quotes, and FX

ClientSnapshotIterator applies transactions through each calendar date, then values account balances and shares. Security.getSecurityPrice uses exact quote or latest prior quote; before first quote it returns the first quote. Thus quote gaps carry stale data, and prehistory is forward-filled. If resolved quote value is zero, value falls back to last applied transaction gross price per share, an estimate rather than current market data.

FX lookup uses exact/latest prior rate, but before first rate returns the first observation (future look-ahead). EmptyExchangeRateTimeSeries itself returns constant 1 dated LocalDate.now() on every lookup; CurrencyConverterImpl also uses unit fallback when lookup is empty. Absent FX data can silently assume parity. A null series object throws. Cross-currency security valuation converts at requested date even when quote is older (weekends). No stale-age threshold found.

Stored precisions are Money=2, Share=8, Quote=8 (Values.java; use definitions rather than stale comments). Example: 10 shares bought at USD 10 with USD/EUR=.90 have EUR 90 basis. At USD 12 and .95 they are EUR 114: EUR 18 price gain at entry FX plus EUR 6 FX gain. Term/security currency bases are retained; minor-unit rounding affects outputs.

## IRR, cost, risk

NPV uses actual elapsed days/365. IRR brackets from last-flow sign and undiscounted sum; bisects only when signs differ, otherwise starts Newton at 5%. Newton stops at step delta <=1e-5 or 500 iterations without convergence status. No-root, multiple-root, negative-root, zero-derivative or divergent flows may throw or return invalid/poor results; tests establish selected Excel cases only. Held-security IRRCalculation includes dividend value plus dividend tax units, incorporates tax units on portfolio trades, ignores account TAXES/TAX_REFUND transactions for the single-security calculation, and includes account fees/refunds. It returns NaN when no cash-flow rows remain (for example, only tax refunds).

FIFO and moving average support charges included (transaction monetary amount) or excluded (gross value). FIFO BUY/inbound delivery creates lots; SELL/outbound delivery relieves earliest eligible lots, prorating and rounding basis. Moving average adds basis and removes rounded basis*sold/held. Term and security currency bases support separate FX gain attribution. Ownership matching, transfer links and partial-lot rounding need tests.

Drawdown uses accumulated-return wealth and tracks high peak, max decline, duration/recovery. Volatility uses log(1+daily return), sample-style scaling, semi-deviation below mean log return; PerformanceIndex skips holidays and dates whose current/prior valuations are zero.

## Existing tests found (not run)

PerformanceIndexTest covers volatility, first data point and first-day invested capital. PortfolioSnapshotTest covers valuation with missing prices and with forex. IRRTest compares Excel cases and convergence; held-security IRRCalculationTest dividend/tax case expects 0.412128788. RiskTest covers drawdown, recovery, invalid inputs, skipped volatility, constant/single/empty inputs.

## Evidence boundary and test gaps

PP-018 is an evidence-boundary metadata row, not a product feature. PP-005/006 describe quote-only SecurityIndex behavior; PP-019 describes held-security cash-flow IRR. This is not complete product coverage. UI defaults, warning display, provider freshness, reports, tax-jurisdiction semantics, and corporate actions beyond inspected cost paths are unverified. No assertion that alpha/beta/tracking-error are absent elsewhere. Add tests for flow-timing parity; no/multiple/negative IRR roots; empty and pre-first FX; stale/pre-first quotes; weekend quote with requested-day FX; zero quote with held shares; same-day timestamps; fractional FIFO; cross-owner deliveries; FX decomposition with fees/taxes.
