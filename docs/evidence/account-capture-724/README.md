# Account capture and bank review — #724 / #477 (partial)

Capture retains an explicitly viewed account through payee suggestions. Manual account choices and outside-account defaults remain. German date entry accepts punctuation; the labelled native calendar input receives touch and keyboard focus without requiring `showPicker()`.

Accounts show their own unresolved bank candidates, filtered by account UUID before counts and pagination. Account identity/balance remains first; bank review precedes history. Global Prüfen work precedes account reminders. Existing posted pending bookings remain separate. Candidate writes, financial rules, parsers and Undo handlers are unchanged. The broader weekly-review redesign in #477 remains open.

## Validation

- Required `BUDGET_REQUIRE_AGE=1 npm run check`: **562 test files / 5,000 tests passed; required AGE check exit 0 (Vitest 506.15s)**.
- Normal production build: **normal production build exit 0**.
- Fresh E2E build passed. Canonical WebKit 27.2 (Playwright 1.64.1), configured phone and real 1440×900 desktop contexts: all nine new scenarios passed, including account entry points, payee/manual context, native date interaction, scoped bank visibility, genuine merge/dismiss and Undo. Existing pending-account and generated booking-line cases passed.
- The initial selected run was 21/22: an existing strict Axe check sampled mixed button colors during a theme transition. Retained trace frames show the mixed and settled states. Root added two exact theme-color checks before the unchanged Axe assertion. The corrected case plus setup passed 4/4 in 33.6s. These are separate runs; no final 22/22 rerun is claimed. Test-generated historical images were preserved outside and restored byte-for-byte; no baseline update was adopted.
- Independent Codex whole-diff and existing-test reviews completed. Exact-head Chromium/Windows/recovery CI and live revision verification follow PR creation; this record alone does not establish LIVE.

## Existing-test authority

Owner's 20 October capture/date request, 17 October equivalent-UI test policy and #694 authorize these Root-only adapters. No finance, locking, Undo, tolerance or timeout assertion was weakened.

| Existing file | Equivalent coverage |
| --- | --- |
| `capture-form.test.tsx` | Native input/focus/value replaces the hidden-picker spy. Generic manual/delayed-account fixtures use remembered Giro outside explicit account context and restore memory; account/date assertions remain. |
| `booking-acceptance.spec.ts` | The calendar Tab target is the actual native input; surrounding focus/cancel/financial checks remain. |
| `capture-dialog-layout.spec.ts` | Direct text focus and native activation replace text-click popup activation. Date, short forms, draft, geometry, Axe and save checks remain. Exact theme-color checks synchronize the existing contrast test without sleeps or disabled animation/rules. |

## Original screenshots and limits

All eight originals were opened by Root and an independent reviewer. Only synthetic data is included.

| Context | Capture | Account bank review |
| --- | --- | --- |
| Phone, light | [Capture](capture-phone-light.png) | [Bank review](bank-phone-light.png) |
| Phone, dark | [Capture](capture-phone-dark.png) | [Bank review](bank-phone-dark.png) |
| Desktop, light | [Capture](capture-desktop-light.png) | [Bank review](bank-desktop-light.png) |
| Desktop, dark | [Capture](capture-desktop-dark.png) | [Bank review](bank-desktop-dark.png) |

Desktop capture images are 960×740 dialog crops from a 1440×900 context. Phone capture crops are 1170×1755; bank viewport images are 1170×1992 from CSS 390×664 at scale 3. Desktop bank images are 1440×900. Phone bank screenshots retain fixed bottom navigation masking the lower action; action size alone does not prove an unobscured hit target. Later successful normal actions are separate evidence.

Headless native touch/focus and date filling do not prove selection in a physical iPhone OS picker. Fresh-candidate confirmation is not covered by this isolated browser fixture because its BankSync service is unconfigured; genuine merge-confirmation/dismissal and audited Undo are covered. No mocked success or configuration bypass was used.
