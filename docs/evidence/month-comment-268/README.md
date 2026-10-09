# Running-month commentary (#268)

This evidence covers the distinction between the booked month-to-date result and income that is
still expected. It uses a synthetic ledger only; no real financial data is present.

## Synthetic acceptance case

At 18 March 2026, the isolated ledger has no booked income, €600 of booked spending and a €3,000
salary expected on 31 March. The One-Pager API reports `earnedCents: 0`, `consumptionCents: 60000`,
`savedCents: -60000` and a separate pending-income value of `300000` cents with due date
`2026-03-31`. The current-month verdict calls the €600 deficit an intermediate booked result and
shows the expected €3,000 separately with its due date. When the same month is read after it has
closed, the intermediate commentary is absent and the existing R04 behavior remains unchanged.

## Verification

- Captures taken at source revision `a517fcfe052c70388f51042d72ba0f648bedfcdf`. After merging main (`904114bd`, which includes #267) the checks were re-run on the merged tree: type checks for web, server, domain and db clean; 81 tests in 7 files passed (report month API, verdict facts, verdict line, domain reports); the isolated browser case passed on desktop (12.3 seconds) and mobile (11.1 seconds).
- The isolated browser case checks the API's cents and due-date fields, Today and One-Pager copy,
  equal verdicts where the two One-Pager placements appear, hidden amounts and restoration, mobile
  Escape/focus return, both color themes, Axe violations, and horizontal overflow.
- These are Windows browser captures and test results. They do not establish Linux screenshot
  parity, physical iPhone Safari behavior, owner financial acceptance, or deployment.

## Captures

The eight full-page PNGs were copied from `test-results/functional/` and SHA-256 verified against
their source files. They show the amount-visible state after the test also exercised privacy mode.

| View | Light | Dark |
| --- | --- | --- |
| Heute, desktop 1440 px | [desktop-heute-light.png](desktop-heute-light.png) | [desktop-heute-dark.png](desktop-heute-dark.png) |
| One-Pager, desktop 1440 px | [desktop-onepager-light.png](desktop-onepager-light.png) | [desktop-onepager-dark.png](desktop-onepager-dark.png) |
| Heute, mobile 390 px | [mobile-heute-light.png](mobile-heute-light.png) | [mobile-heute-dark.png](mobile-heute-dark.png) |
| One-Pager, mobile 390 px | [mobile-onepager-light.png](mobile-onepager-light.png) | [mobile-onepager-dark.png](mobile-onepager-dark.png) |

SHA-256:

```text
AC21B6D8FDCADA46BC6450A61F22827266CC1F1A75585B0BAB75CA5CC3A2F0B9  desktop-heute-light.png
8B18F10394AF7D52D3052C2285CD37B984C42812331E2779E2AD8D020C3BEE7C  desktop-heute-dark.png
404A7560FF32192412333E97E65167C2B725E787484FA1DDFE35C31A324B2AB0  desktop-onepager-light.png
03A8F65F3232F767ACE4BD85A552B24C80AFB6D29E458D1B12FABE1E99F7770E  desktop-onepager-dark.png
15B514EEB92F33A372CA38532374D0BA601985F33920C92698A3CF0C162CF703  mobile-heute-light.png
5B73BB647AE971A2AC2A8DF34D38D29715B0D51AACB63BA19A5D4515CAAFB09A  mobile-heute-dark.png
E60A00D4B987B2F51C3F5232F098F1E23633828B5D7D777201341C7A451B5FD2  mobile-onepager-light.png
3B4C0CA15AD9571AC75E581258FEBC2B4DF9446A9C4B0C130A9A9401DBEE7725  mobile-onepager-dark.png
```

## Existing Linux screenshot assertions affected by the Today verdict

The existing shell visual test captures Heute; the new verdict may alter all four of its Linux
baselines:

- `e2e/shell.spec.ts-snapshots/shell-heute-light-desktop-linux.png`
- `e2e/shell.spec.ts-snapshots/shell-heute-dark-desktop-linux.png`
- `e2e/shell.spec.ts-snapshots/shell-heute-light-mobile-linux.png`
- `e2e/shell.spec.ts-snapshots/shell-heute-dark-mobile-linux.png`

The One-Pager has no existing `toHaveScreenshot` baseline assertion. Its new screenshots above are
evidence captures, not snapshot comparisons. Any later Linux baseline update should be limited to
the four Heute files and should be reviewed against the visual diff before acceptance.
