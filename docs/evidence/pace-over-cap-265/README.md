# Heute pace: under-plan actual, over-cap forecast (#265)

This is synthetic regression evidence for the shared Heute and Monats-One-Pager pace chart. It is not a product-formula change or an owner acceptance claim. The original Windows browser captures were made from frozen source head `c00831841133db4fae240170490cd5edc732f61a` using a fresh isolated ledger and ordinary API writes. Linux preflight results and captures are recorded below.

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

## Linux preflight

GitHub Actions run [37880079988](https://github.com/Grabman1987/budget/actions/runs/37880079988) succeeded on the pre-Globals source `ca6791486c9d1cae5c081be43bb7d85969d27298` using workflow-only helper commit `025fac1e499cd8f3ef681b58dc5192b8b3ce033f`. The current source `29f7fdbecfd5ac8d0238c5bc9b0f5053d62db770` adds the Globals package update in `package.json` and `package-lock.json`; its #265 application, domain-test and E2E-fixture files remain unchanged from `ca679`. The final combined full-check run [37881562030](https://github.com/Grabman1987/budget/actions/runs/37881562030) succeeded using workflow-only helper commit `36f0c3be1b4acf95c2a79b1aae10d77923b34c2b`.

- Focused check: two files, 27 tests, 2.71 seconds.
- Earlier full repository check on `ca679`: 383 files, 3,528 tests, 239.51 seconds.
- Production and E2E builds passed on `ca679`.
- Earlier browser run on `ca679`: nine tests passed in 1.0 minute.
- Final combined-source full check on `29f7`: 383 files, 3,528 tests, 250.66 seconds; typecheck, lint and format passed, with early and late source/index cleanliness checks. This run did not rerun builds or browser tests; those results above are from `ca679`.
- The eight Linux captures below are copied from run `37880079988`'s Playwright results; checked-in screenshot baselines were not updated.

The Linux screenshots show the configured 390 px mobile browser, not a physical iPhone. This pace regression does not verify the separate Heute mobile account-forecast label overlap (`965 €`, 15.09. vs “30 Tage bis Gehalt 15.10.”); that issue remains assigned to #292. Exact PR-head CI, deployment/live validation, real-ledger reconciliation and physical iPhone Safari acceptance remain open.

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

Linux captures from run 37880079988:

| View                              | Light                                               | Dark                                               |
| --------------------------------- | --------------------------------------------------- | -------------------------------------------------- |
| Heute, desktop 1440 px            | [PNG](linux-37880079988/heute-desktop-light.png)    | [PNG](linux-37880079988/heute-desktop-dark.png)    |
| Heute, mobile 390 px              | [PNG](linux-37880079988/heute-mobile-light.png)     | [PNG](linux-37880079988/heute-mobile-dark.png)     |
| Monats-One-Pager, desktop 1440 px | [PNG](linux-37880079988/onepager-desktop-light.png) | [PNG](linux-37880079988/onepager-desktop-dark.png) |
| Monats-One-Pager, mobile 390 px   | [PNG](linux-37880079988/onepager-mobile-light.png)  | [PNG](linux-37880079988/onepager-mobile-dark.png)  |

SHA-256:

```text
4D508D7CB56D9DDD6BBEDE9524AE93CA7757025A63590E6641A766586CCF7ABA  linux-37880079988/heute-desktop-light.png
72742566A4C61A9F7C3C29F5260AF2E4391586941841213FBC1212E6595272DE  linux-37880079988/heute-desktop-dark.png
07DD268C6EE8EE3A426FD244FEDB6244BC233ECE3506AD6C54F8E296330BB893  linux-37880079988/heute-mobile-light.png
3D11E515DDEB680B4CF6ACAE42FDF0F824A572D1DA90FBD679B2A176CB10E3FB  linux-37880079988/heute-mobile-dark.png
F8A2D4D57767A13F820F02EC0B094357E7E2D0BE41571C98BC626A9FC81C320C  linux-37880079988/onepager-desktop-light.png
18CBFFECFB4C0C2E35EEEF6B4A0FF008CA5D531F1D0F3D197E48EA4A7E27ABB1  linux-37880079988/onepager-desktop-dark.png
A4AA97B626FC4F5D063E3CB488CDE547D5084E426712F5FBDC2C67B1AF7075E3  linux-37880079988/onepager-mobile-light.png
A53DB805E16C0FF4052D17DBE76200AB6E601AFCFDFA53BEECBDDBCAFC6778FD  linux-37880079988/onepager-mobile-dark.png
```

## Separate follow-up

The Heute mobile capture also shows an existing overlap between the account-forecast low-point label (`965 €`, 15.09.) and the “30 Tage bis Gehalt 15.10.” label. That is outside #265 and has been separately assigned to open #292 for verification; this change does not adjust either label.
