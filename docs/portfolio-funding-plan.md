# Portfolio funding plan

Owner request, 2026-10-25: represent the private spreadsheet workflow inside the current portfolio application. Split the previously configured gold sleeve equally between gold and direct Bitcoin. Exact provider names, identifiers, personal holdings and the tax review remain in the private project folders.

## Contract

The portfolio savings section contains an explicitly editable six-sleeve funding scenario. It persists through the existing audited `app_setting` mechanism, with a revision based on audit insertion order, conflict refusal and grouped undo/redo. No migration, account opening balance, trade, existing schedule, tax basis or global class target is changed by saving. The existing allocation resolver and its month-end buffer remain authoritative for class-based risk/report views; this instrument-level snapshot is separately labelled.

The template starts with zero cash, zero monthly rate, no instrument assignments and no quotes. Its final fixed stage is selected explicitly. The owner template has these weights in order Global / Efficient Core / equity booster / gold / Bitcoin / managed futures:

| From EUR | Weights (%) |
| --- | --- |
| 0 | 65 / 25 / 10 / 0 / 0 / 0 |
| 10,000 | 60 / 20 / 10 / 5 / 5 / 0 |
| 50,000 | 50 / 20 / 10 / 5 / 5 / 10 |

All thresholds and weights are editable. A fixed stage holds regardless of wealth movements. Optional automatic selection evaluates this scenario's current position values plus all new money; it does not mutate the global dated target policy. These are supplied planning preferences, not advice, a backtested optimum or an automatic production seed.

## Amounts and execution

- Input position **market values**, monthly rate, one-off new money and free settlement cash separately. Each cash amount enters once; reserves are excluded.
- The explicit take-over action copies current known market values of selected instruments, across all their depots, from canonical portfolio positions. Missing/estimated valuations block the entire copy. Unheld assigned instruments are zero. Other instruments and cash are excluded and disclosed. Quotes remain manual EUR ask-price assumptions.
- Monthly rates split the recurring amount by target weights with exact largest-remainder cents. One-off and settlement cash never inflate standing monthly rates.
- Total purchase budget is monthly + one-off + free cash. Target values include this budget. Allocate new money proportionally to positive target deficits. No sales are generated; disclose overweights.
- Whole units or eight-decimal fractional units are floored. Gross consideration and proportional fees round upward to cents; fixed and proportional fees fit inside each assigned budget. Missing quotes, unaffordable units or exceeded fee ratio retain their budget as cash, with zero fee. No redistribution of skipped orders.
- The amount identity is purchases + fees + remaining cash = total budget. No return forecast, tax deduction, spread or historical backtest is implied.
- Preparing a savings plan passes the assigned instrument and **normal monthly rate** into the existing guarded dialog, restricted to EUR accounts. The owner chooses account, source and dates and explicitly saves. Existing open schedules are linked conceptually through the retained list rather than automatically duplicated. Actual broker orders remain external.

## Persistence and stale data

Saved amounts and prices are an editable snapshot, not live financial balances. After execution the owner updates positions, clears one-off money and records remaining cash once. Invalid fields suppress the output and save; duplicate instrument assignments and invalid stage sums are rejected at the server too. A concurrent write or undo changes the revision and rejects stale saves; corrupt saved settings are visible and cannot be overwritten through this editor. Unsaved navigation asks before discarding.

## Acceptance evidence

- Domain: literal six-sleeve 400 EUR rates, 10,400 EUR cash, stage boundaries, overweight suppression, odd-cent distribution, fractional assets, fee limits and invalid input.
- Real API/database: persistence, actual undo/redo, stale revision/ABA refusal, malformed input, corrupt settings, session/origin gates and no booking/trade/schedule/target writes.
- Browser: desktop and phone, light/dark, saved reload, invalid fields, exact rates, schedule prefill/cancel, scoped accessibility and viewport overflow. Screenshots use synthetic data only.
- Full repository check and independent review are required before delivery. Record actual results in the PR; no live claim without deployment evidence.
