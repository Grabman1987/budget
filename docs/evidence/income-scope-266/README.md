# Booking-date and budget-month income scopes (#266)

This change clarifies two existing income scopes in Heute and Plan. It changes explanatory UI copy and adds regression evidence; it does not change booking, budget, expected-payment, or cash-flow calculations. All browser data and screenshots are synthetic.

## Scenario

At the fixed date 2026-09-30, the isolated ledger receives a €1,000 income booking marked “Für nächsten Monat”. The cash balance and household income in Heute remain associated with the booking date. The assigned budget income belongs to October: on 2026-10-01, Heute reports €0 household income for October while the October budget read includes €1,000. A separate synthetic expected payment contributes €300 expected and €0 received for October; it remains a forecast and is not treated as cash or as another booked inflow.

The interface labels the Heute amount as household income by booking date, explains that “Für nächsten Monat” affects the following Plan month, and links to that month’s income detail. Plan distinguishes expected receipts from budget-relevant booked inflows. The explanatory text remains visible when amount privacy is enabled.

## Changed files and checks

The six source-scope files are `apps/server/src/api/income-month.test.ts`, `apps/web/src/expected/income-panel.tsx`, `apps/web/src/expected/income-panel.test.tsx`, `apps/web/src/heute/answer-cards.tsx`, `apps/web/src/heute/answer-cards.test.tsx`, and `e2e/income-scope-266.spec.ts`. Only the two UI component files change product copy; there is no formula, schema, or API behavior change.

- Focused API/component checks: 3 files, 11 tests passed in 40.55 seconds.
- Isolated-ledger browser runs: desktop 14.6 seconds and mobile 8.9 seconds, recorded separately. The scenario exercises the real booking, budget, expected-income reads, Today-to-Plan link and return navigation, both themes, accessibility/overflow checks, and amount masking.
- The E2E assertions were corrected to use the actual heading and viewport-appropriate privacy control. Those corrections were test-only; no additional product changes were needed. Earlier run artifacts and traces were retained outside this evidence folder.
- Eight Windows captures are retained below. They are focused synthetic captures at 1440 px desktop and 390 px mobile, not physical-device or general UI acceptance.

## Linux preflight

GitHub Actions run [37883496011](https://github.com/Grabman1987/budget/actions/runs/37883496011) was still running when this evidence was prepared. No Linux result is claimed here; update this section only after the exact source run completes and its result is verified.

## Captures

| View                                | Light                                | Dark                                |
| ----------------------------------- | ------------------------------------ | ----------------------------------- |
| Heute, desktop 1440 px              | [PNG](heute-desktop-light.png)       | [PNG](heute-desktop-dark.png)       |
| Heute, mobile 390 px                | [PNG](heute-mobile-light.png)        | [PNG](heute-mobile-dark.png)        |
| Plan income detail, desktop 1440 px | [PNG](plan-income-desktop-light.png) | [PNG](plan-income-desktop-dark.png) |
| Plan income detail, mobile 390 px   | [PNG](plan-income-mobile-light.png)  | [PNG](plan-income-mobile-dark.png)  |

SHA-256:

```text
EC9E5CEEAD61ACDBCB92CC718E56DFD0663A493B76924167877B06B6A0F7928A  heute-desktop-light.png
6C390AE3968AD49E18B77DFB9DB656A14460B43776E83F47AEB962FFF4E9AA7B  heute-desktop-dark.png
FB243D0F8060B79CC012B6EB015C5C54EE7A1A57CC1FE4D036A8EE9F1035975F  heute-mobile-light.png
8D920B4202FEFD42C6309CD6E79CB9A6D62F34D3A547687F34E924CDCEEFBB7A  heute-mobile-dark.png
83411D52D705990C1F34703FCB9F86723D1087190C44FD68BA1417B2DE5EC2B6  plan-income-desktop-light.png
826C7C6FE1F2885EFFE63688214775EDF7733384E91B0CD565641A345208836E  plan-income-desktop-dark.png
6751524D97F919E9AF1B8EC43A783C5263F5914FF4EF78AD8E35301BE2CFD7DE  plan-income-mobile-light.png
2815133870FD0FB42DC98679F969ED62B1D55DBF30BF7585D2720F66A431C7BD  plan-income-mobile-dark.png
```
