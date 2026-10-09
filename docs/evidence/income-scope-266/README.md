# Booking-date and budget-month income scopes (#266)

This change clarifies two existing income scopes in Heute and Plan. It changes explanatory UI copy, makes the income dialog's scrolling body keyboard-focusable, and adds regression evidence; it does not change booking, budget, expected-payment, or cash-flow calculations. All browser data and screenshots are synthetic.

## Scenario

At the fixed date 2026-09-30, the isolated ledger receives a €1,000 income booking marked “Für nächsten Monat”. The cash balance and household income in Heute remain associated with the booking date. The assigned budget income belongs to October: on 2026-10-01, Heute reports €0 household income for October while the October budget read includes €1,000. A separate synthetic expected payment contributes €300 expected and €0 received for October; it remains a forecast and is not treated as cash or as another booked inflow.

The interface labels the Heute amount as household income by booking date, explains that “Für nächsten Monat” affects the following Plan month, and links to the income detail for Heute’s current calendar month. Plan distinguishes expected receipts from budget-relevant booked inflows. The explanatory text remains visible when amount privacy is enabled.

## Changed files and checks

The income-scope changes cover `apps/server/src/api/income-month.test.ts`, `apps/web/src/expected/income-panel.tsx`, `apps/web/src/expected/income-panel.test.tsx`, `apps/web/src/heute/answer-cards.tsx`, `apps/web/src/heute/answer-cards.test.tsx`, and `e2e/income-scope-266.spec.ts`. `packages/ui/src/components/panel.tsx` adds an opt-in focusable body, used only by the income panel; `e2e/expected.spec.ts` checks its actual mobile Tab/PageDown behavior. There is no formula, schema, or API behavior change.

- Run 37885255437: 11 functional browser cases passed in 58.3 seconds on source `1cd056b030a7159f98ac52409bbdeacd10175c5a`. Its application files are byte-identical to current source `5ee28a96021b1be644fe549dbb140d5583bb103f`; later changes were expected-test-only.
- Isolated-ledger browser runs: desktop 14.6 seconds and mobile 8.9 seconds, recorded separately. The scenario exercises the real booking, budget, expected-income reads, Today-to-Plan link and return navigation, both themes, accessibility/overflow checks, and amount masking.
- The E2E assertions use the actual heading and viewport-appropriate privacy control. Subsequent expected-test corrections are test-only; product source remained byte-identical to the functional run above. Earlier run artifacts and traces were retained outside this evidence folder.
- Eight Windows captures are retained below. They are focused synthetic captures at 1440 px desktop and 390 px mobile, not physical-device or general UI acceptance.

## Linux functional captures and verification limits

Run [37885255437](https://github.com/Grabman1987/budget/actions/runs/37885255437) passed 11 functional cases in 58.3 seconds, including the synthetic booking-date/budget-month scenario, Today-to-Plan navigation, privacy masking, Axe, and overflow assertions. This is a functional result only: overall visual verification failed on a 4 px scroll difference, so the run is not recorded as an overall pass. The eight Linux PNGs below are from the passing functional project, not from the later baseline regeneration.

The screenshot assertion captures the initial state before the mobile Tab/PageDown sequence. This preserves the actual keyboard and scrolling test while keeping the captured page state independent of the later focus/scroll position. Only the income panel opts into a focusable body for that keyboard/scroll behavior; other panels are unchanged. The previous eight Windows captures remain above and are preserved.

Final run [37886698795](https://github.com/Grabman1987/budget/actions/runs/37886698795) passed the E2E build, 9 regeneration cases, 9 subsequent cases without snapshot updates, and the full `npm run check`: 384 files / 3,531 tests in 233.35 seconds, with typecheck, CSS scale, ESLint and formatting also passing. The mobile income case retains Axe, actual Tab focus and PageDown scrolling assertions. The helper commit is a workflow-only direct child of frozen source `5ee28a96021b1be644fe549dbb140d5583bb103f`; source and clean-tree guards passed before installation and after testing. The lead reviewed and copied only the six allowlisted Linux baselines (four Heute themes/viewports and two dark income-dialog viewports). The Heute baselines also contain the already integrated #237 topbar/attention changes. Physical iPhone acceptance remains separate.

## Captures

| View                                | Light                                | Dark                                |
| ----------------------------------- | ------------------------------------ | ----------------------------------- |
| Heute, desktop 1440 px              | [PNG](heute-desktop-light.png)       | [PNG](heute-desktop-dark.png)       |
| Heute, mobile 390 px                | [PNG](heute-mobile-light.png)        | [PNG](heute-mobile-dark.png)        |
| Plan income detail, desktop 1440 px | [PNG](plan-income-desktop-light.png) | [PNG](plan-income-desktop-dark.png) |
| Plan income detail, mobile 390 px   | [PNG](plan-income-mobile-light.png)  | [PNG](plan-income-mobile-dark.png)  |

Linux functional captures from run 37885255437:

| View                        | Light                                      | Dark                                      |
| --------------------------- | ------------------------------------------ | ----------------------------------------- |
| Heute, desktop              | [PNG](linux-heute-desktop-light.png)       | [PNG](linux-heute-desktop-dark.png)       |
| Heute, mobile               | [PNG](linux-heute-mobile-light.png)        | [PNG](linux-heute-mobile-dark.png)        |
| Plan income detail, desktop | [PNG](linux-plan-income-desktop-light.png) | [PNG](linux-plan-income-desktop-dark.png) |
| Plan income detail, mobile  | [PNG](linux-plan-income-mobile-light.png)  | [PNG](linux-plan-income-mobile-dark.png)  |

Linux functional capture SHA-256:

```text
05B285655A39D36BCEC18A4FFFE6FB148D07131B8980B391033E7B5CC8308514  linux-heute-desktop-light.png
CC4397BC01436FE53BDF08FE3F05E280118AD2B8EB8702B56DF374577833039D  linux-heute-desktop-dark.png
3603A37D18E5AB391061BCFC37A690FF2926A449AD2F965BB9C086A7F1D3E907  linux-heute-mobile-light.png
1CB6EA04A72D50959901C6D57A9467F1AB6D227FE01D64EE0311B994233479EF  linux-heute-mobile-dark.png
3534D6872AAAB8B1B2042D1F0CCF9EAA619159AABBCD4212B593A052E8DED18B  linux-plan-income-desktop-light.png
C8C1E8CF91CBEAAF8B2F886AC1DC75756650BDDBAFDE7E1CF9C74901CAEE3555  linux-plan-income-desktop-dark.png
E6DDD226A2B1068E1E4FB0C03E09B459DD59882450636123D3D38C4AF48561B3  linux-plan-income-mobile-light.png
D4E960C8D1B40E6728A241E15B94996C6662DB2F193D87993B7F48BF3CA15A33  linux-plan-income-mobile-dark.png
```

Windows capture SHA-256:

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
