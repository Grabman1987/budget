# Heute pace: under-plan actual, over-cap forecast (#265)

This is synthetic regression evidence for the shared Heute and Monats-One-Pager pace chart. It is not a product-formula change or an owner acceptance claim. The browser captures were made from the frozen source head `c00831841133db4fae240170490cd5edc732f61a` using a fresh isolated ledger and ordinary API writes.

## Scenario and result

The isolated ledger uses 2026-09-15 as both server and browser today. Its September budget is 10,000 cents: a fixed-category target of 4,000 cents due on the 15th remains unpaid, fixed spending is zero, and a variable-category booking of 3,500 cents is posted on the 15th. The independent domain case and both real read-model endpoints report:

| Measure                     |  Cents | Display |
| --------------------------- | -----: | ------: |
| Limit                       | 10,000 |   100 € |
| Plan through 15 September   |  7,000 |    70 € |
| Actual through 15 September |  3,500 |    35 € |
| Actual minus plan           | −3,500 |   −35 € |
| Open fixed payment          |  4,000 |    40 € |
| Month-end forecast          | 11,000 |   110 € |

The actual is below plan while the month-end forecast exceeds the cap. Both `/api/heute?period=month&month=2026-09` and `/api/reports/month/onepager?month=2026-09` return those values from the isolated database. The UI test checks the visible Plan/Deckel labels, separate Ist/Hochrechnung/Deckel legend, over-cap forecast styling, and keyboard tooltip at the current day and month end. The tooltip retains the explanation that open fixed costs are included. No formula, ledger endpoint, or production UI code changed.

## Verification recorded for the frozen source

- Domain and chart tests: 27 tests across two files, 29.94 seconds, passed.
- Scoped lint/format and the E2E build exited successfully.
- Browser run: seven tests in about two minutes, including three setup cases, the existing month-close desktop/mobile cases, and the new #265 desktop/mobile cases.
- The eight PNGs below are copies of the current browser-run outputs. They include keyboard focus/skip-link state and a scroll-dependent fixed shell; they are focused captures, not a general UI acceptance review.

No full repository check, PR/CI, deployment/live validation, real-ledger reconciliation, or physical iPhone Safari acceptance is claimed here. The captures show the configured mobile browser at 390 px; they do not represent a physical iPhone.

## Captures

| View                              | Light                             | Dark                             |
| --------------------------------- | --------------------------------- | -------------------------------- |
| Heute, desktop 1440 px            | [PNG](heute-desktop-light.png)    | [PNG](heute-desktop-dark.png)    |
| Heute, mobile 390 px              | [PNG](heute-mobile-light.png)     | [PNG](heute-mobile-dark.png)     |
| Monats-One-Pager, desktop 1440 px | [PNG](onepager-desktop-light.png) | [PNG](onepager-desktop-dark.png) |
| Monats-One-Pager, mobile 390 px   | [PNG](onepager-mobile-light.png)  | [PNG](onepager-mobile-dark.png)  |

SHA-256:

```text
8CA9EA45BDED147B76E5B10842A2525788E121A0F35AB45EFFAB6EF7A1634322  heute-desktop-dark.png
B83E5EF48BC6A9BB52E40C4D49702D12FE3842C5DEAA08A65AF4696382072DC6  heute-desktop-light.png
011E2769126CCF90310082B1CF79FA1A781F23DC94B6FEAC0FF6818FFD74F9F7  heute-mobile-dark.png
3E20E38E424991F98FF665939F1AF6940E688DC71EA1A668412A9DEAE38AC1D0  heute-mobile-light.png
D36772E9A2192A97643C5D4ACA9B1FA64181E413BF6C140BCDD4BAA8F0C46D33  onepager-desktop-dark.png
CCD79F5841BFC8DEAB20E7F8C2354969350A81D118F1F849C65EFA15E5D72902  onepager-desktop-light.png
50DFDF2DF487E7041E6AEB83B50DF934729143C72E22049E1B62CC40C6499FBE  onepager-mobile-dark.png
314F6ABE699461313599049B15BAD587B84F20B246D1B8DAADE28E786D6E9EC6  onepager-mobile-light.png
```

## Separate follow-up

The Heute mobile capture also shows an existing overlap between the account-forecast low-point label (`965 €`, 15.09.) and the “30 Tage bis Gehalt 15.10.” label. That is outside #265 and has been separately assigned to open #292 for verification; this change does not adjust either label.
