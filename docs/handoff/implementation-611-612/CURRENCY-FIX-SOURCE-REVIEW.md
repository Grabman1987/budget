# #611/#612 currency guard correction source review

Delta `e0aaabf2c7219fd07f0ef60a4164503e0e9d0dcf` versus `45b756eaf31763ad2566c63e1ec7c4e3680507b3` in `/workspace/impl-debt-611-612`. Source only; no tests, checks, build, browser or runtime validation.

The prior P2 is resolved in this narrow delta. `fetchSeries` now declares the `currency` already emitted by the account-series server endpoint, and `usableSeries` requires exact equality with `plan.value.currency` alongside the existing account ID/current-balance guards. For equal numeric balances in different currencies, `usableSeries` becomes false, history is emptied, and `historyMismatch` activates the existing warning/reload path. Matching-currency behavior and `simulateLoan` calculations are unchanged. The two GETs remain non-atomic; this source review makes no runtime claim. No new finding in this delta.
