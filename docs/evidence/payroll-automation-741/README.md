# Deterministic payroll upload — #741

This is the payroll continuation of the separately delivered card packet (#752).
Base: verified live `1c19a465649490417f174787a9806b3347b7b7a6` after #754. Only
synthetic documents, accounts and amounts are used. No private archive operation,
scheduled posting, bank order or production financial rewrite is performed.

## Source correspondence

Archive `ddba1ccc379eb09d7ebc0523c2ba057845090a2a` is preserved byte-for-byte in
`docs/handoff/741-payroll` (42 files; its 41-entry outer manifest was independently
verified). [Archive copy hashes](archive-copy.json) and [adoption hashes](adoption.json)
record the exact source chain. The eight continuation files plus four new validation
files supersede the original patch alone. Five existing specialist files matched
the original patch bases; the shared Domain barrel received only the payroll export.
Formatting changed no intended behavior. Historical preparation-only and unexecuted
notes remain provenance, not claims about this delivery.

One additional product correction subscribes the expanded payroll view to the
existing amount-privacy store. A new regression first failed because the displayed
literal `2.975,00 €` remained visible after privacy was enabled. The corrected view
immediately masks/restores the figures without refetching, writing or losing its
persisted payout link. Separate whole-product HIGH and test-adapter/delta reviews
found no open source defect; final runtime evidence review subsequently passed.

Actual WebKit image inspection also found the automatic-result Undo label extending
past its shrunken button and toast background. A button-box check alone passed and
was insufficient; a DOM text Range check reproduced the defect (`342.96 > 310.10`
CSS pixels). The shared toast now has intrinsic content width capped by its unchanged
viewport maximum, and its action cannot shrink. No focus, expiry, layer or
Undo code changed. The same phone-dark test then passed with the complete label
inside the button and toast. The 15 existing Toast/Layer tests passed; final combined
browser coverage below subsequently passed.

The first full CI then exposed a page-level Toast/FAB collision. The narrow mobile
shell now places page feedback above its existing safe-area-aware capture action;
all dialog descendants are excluded from that rule. [Diagnosis and regression](ci-toast-fab.md)
retain the failing CI and the independently reproduced `756 > 706px` overlap.

## Financial contract and focused runtime evidence

The independent fixture is `400000 - 68000 - 44000 - 500 + 10000 = 297500` cents:
salary `287500`, reimbursement `10000`. Existing signed one-cent rounding semantics
are unchanged. Automatic matching requires a complete unique configured source,
printed period and payout evidence, EUR, exact cents, sender, date and full splits.
Unknown or conflicting facts remain in review.

- New pure/domain 30, DB 8 and API 8: **46/46 passed** in one run. Actual migrated
  databases and authenticated PDF workers verify exact payouts, immutable original
  downloads, persisted associations, financial group Undo/redo, no replay after
  Undo, exact existing payout preservation, config/source ABA and late rollback.
  Concurrent identical/different-byte uploads rendezvous after both actual PDF
  workers and original file writes, before staging: precisely one payout commits.
  Reanalysis of a consumed source returns a conflict with unchanged records/history.
- New UI: **7/7 passed**, including the reproduced privacy defect and its correction.
  HTTP transport is mocked at this layer; it is not PDF or financial proof.
- Initial existing-regression run: **68 passed / 1 failed** across seven files.
  The upload mount lacked the existing ToastProvider now required for financial Undo.
  The next UI/parser run passed 16 and failed one because the provider adds a second
  status region. After scoping the lookup to the upload region, old UI **6/6 passed**.
  Unchanged LGV parser **11/11 passed** in the preceding run. These are separate runs,
  not a claim of a single combined passing suite.

## Per-file test changes

- NEW `packages/domain/src/reports/payslip-automation-741.test.ts`: literal-cent,
  exact matching, incomplete/ambiguous evidence and economic-slot decisions.
- NEW `packages/db/src/repos/payslip-automation-741.test.ts`: real writers, source
  association, existing-row preservation, full financial Undo/redo and late failure
  rollback after an observed payout INSERT.
- NEW `apps/server/src/api/payslip-automation-741.test.ts`: real AuthStore/createApp,
  real PDF worker/bytes, replay and consumed-source guards, actual concurrent uploads,
  source/config races, strict boundary and persistent result reads.
- NEW `apps/web/src/reports/payslip-automation-741.test.tsx`: financial-group Undo,
  actual component query invalidation, reload association, source configuration and
  live privacy; bounded mocked HTTP only.
- NEW `e2e/issue-741-payroll-automation.spec.ts`: actual upload/retained PDF, full Undo-label/button containment, literal
  account balance `62345 → 359845 → 62345`, salary/refund splits, existing booking
  preservation, financial Undo, duplicate protection, privacy and result navigation. The initial 27-case run passed 24 and failed only the
  three newly prepared route cases: the existing route filters the booking list and
  does not open its editor automatically. The correction checks the exact single
  booking and opens its editor through the existing row action, again after reload.
  Its new amount check was aligned with the existing grouped `2.975,00` display;
  integer-cent and full original booking/audit expectations are unchanged.
- EXISTING `apps/web/src/reports/payslip-intake.test.tsx`: only ToastProvider around
  the isolated upload mount and `within(drop)` for its original status lookup. All
  rejection, exact request-count and financial expectations remain unchanged.
- EXISTING `e2e/payslip-intake.spec.ts`: two readiness selectors use the approved
  pending-result text. Both fixtures remain manually reviewed without a configured
  automatic employer; financial/confirm/Undo/reject/download/mapping assertions and
  existing waits remain unchanged.
- NEW `e2e/issue-757-toast-fab.spec.ts`: actual booking save, literal balance,
  visible Undo feedback, no Toast/FAB overlap, ordinary second FAB click and amount
  focus. Its initial post-click layer assertion incorrectly expected page placement;
  the unchanged host resolver correctly returns a capture-origin toast to the same
  reopened capture host. The new expectation was corrected to that existing contract;
  reachability, geometry and money assertions were retained.

## Browser and delivery status

Complete workspace typecheck, scoped lint/format and fresh E2E builds passed.
The initial combined browser run passed **30/30 in 3.8 minutes**, without retry:
three setup cases, twelve automatic source/payout/Undo profile/theme cases,
three actual booking-link/reload cases, nine existing manual intake cases and
three unchanged toast/dialog interaction regressions. Final independent whole-diff
HIGH review was CLEAR, including all15 source hashes, all30 original browser artifacts
and42 archived source files. After the CI layout correction, the expanded browser
run passed **62 cases** (all 32 unchanged capture cases plus the original 30) and
failed only the three new cases at their mistaken post-click layer assertion.
All three had already passed geometry, actual FAB click and amount focus. That
assertion is corrected as described above; the focused final run passed **6/6 in 33 seconds** (three setup plus all three
engine/profile cases), without retry. These are separate runs, not a single 65/65
run. The refreshed payroll artifacts below come from the 62 passing cases.
[Toast/FAB images](toast-fab-manifest.json) are the three original final captures. Exact-head CI and normal protected
merge/live verification remain pending.

[Original-image manifest](browser-manifest.json) records twelve PNG/runtime-JSON
pairs and three actual-destination PNG/JSON pairs, copied without image editing.
Representative results: [Chromium desktop light](desktop-desktop-light.png),
[Chromium phone dark](mobile-phone-dark.png),
[WebKit phone light](webkit-iphone-phone-light.png),
[WebKit phone dark](webkit-iphone-phone-dark.png), and
[actual persisted destination](webkit-iphone-booking-destination.png).
All original logs, failed diagnostics and full test-results are retained locally.
The initial 27-case run and subsequent focused diagnostics above are retained,
not represented as a passing combined run. Explicit browser contexts
cover 1440px desktop and 390px phone, light/dark, with runtime engine/profile data.
Geometry uses ordinary assisted scrolling. While retaining financial Undo focus,
the result link has a dimension check only; a separate scenario dismisses the toast
and actually opens/reloads the persisted booking. No physical-device claim follows
from browser emulation. Runtime metadata records WebKit's reported maxTouchPoints
as actually measured (zero on this Windows host), despite configured touch/coarse
emulation; no physical iPhone claim is made. The project Impeccable adapter and
manual source/image checks were used; no unavailable upstream engine run is claimed.
PR #719 remains stopped.
