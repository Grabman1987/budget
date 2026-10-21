# Compact contact statement and source bookings (#738)

The contact statement keeps its existing current-month, older-open, remaining
history and closed-history sections. Rows show the date, actual split description
(or movement type), signed contact movement and outstanding amount. The contact
movement is distinct from the whole bank payment. No contact allocation, balance,
settlement, write-off or audit calculation changed.

Each section has an explicit **Abschnitt kopieren** action. Its plain-text lines
include the section/period, exact signed EUR amounts and relevant open amounts.
The final line labels the **overall balance as of the statement date**, rather
than suggesting it is the sum of the copied section. Copy uses the current privacy
state, including amounts embedded in descriptions. Unavailable or rejected
clipboard access offers selectable text; no message is sent.

Every source-backed row opens its actual booking through a fresh booking-ID GET.
The existing editor retains the complete payment and all splits. Cancel saves
nothing; explicit Save and audited Undo refresh the usual views. The synthetic
mixed-payment case changes an unallocated contact share into a normal gift expense:
whole payment −55.00 EUR, contact share −40.00 EUR and unrelated share −15.00 EUR.
Bank account/date/amount, both split IDs and the unrelated share remain unchanged;
Undo restores the contact receivable. Allocated outlays remain protected. The exact
existing contact-edit refusal now has a fixed German explanation; other technical
errors retain their existing sanitization.

## Validation

- NEW feature regression reproduced missing copy/source controls before product
  changes. Real API tests cover gift Save/Undo/Redo, allocation and later-write-off
  rejection, including byte-for-byte database conservation for reads/refusals.
- Contact UI regressions, scoped web/server types, lint, CSS scale and formatter
  semantic checks passed. Exact-copy/privacy/fallback and deferred same-source
  reopening are covered by NEW tests. Existing test files are unchanged.
- The first canonical run reached layout, Axe, copy/privacy and read-only opening
  in all four scenes, then failed its NEW English-error expectation. The actual
  refusal was a generic German alert. The narrow German explanation and NEW exact
  matching/sanitization controls passed; the next canonical 7/7 run passed all
  four complete gift Save/Undo scenes plus three setup cases.
- The new outstanding column has its own numeric style class, preserving the
  existing signed-movement `.num` contract and the unchanged #598 sign assertions.
- Final combined canonical WebKit: **8/8 first-attempt passes** (83.657s reporter
  duration): four NEW desktop/phone-theme scenes, the unchanged #598 signed-movement
  scenario and three setup cases. No skips, flaky results or retries. The fresh E2E
  build produced 166 files; source, Git, compiled and owned-runtime guards passed.
  Ordinary rows measured 50px on desktop and 60.328px on phones; repayment rows
  including their touch-sized allocation disclosure measured 74px and 104.328px.
  These are current measurements, not a measured before/after percentage.
- Required AGE-enabled full check (two Vitest workers) and normal production build
  are pending at this evidence checkpoint. Their exact-head results, required CI
  and delivery status are recorded in the pull request; this document does not
  claim a full check or LIVE acceptance in advance.

## Original synthetic browser evidence

| Scene         | Viewport   | DPR | Pointer | Original                           |
| ------------- | ---------- | --- | ------- | ---------------------------------- |
| Desktop light | 1440 × 900 | 1   | fine    | [Desktop light](desktop-light.png) |
| Desktop dark  | 1440 × 900 | 1   | fine    | [Desktop dark](desktop-dark.png)   |
| Phone light   | 390 × 844  | 3   | coarse  | [Phone light](phone-light.png)     |
| Phone dark    | 390 × 844  | 3   | coarse  | [Phone dark](phone-dark.png)       |

Images are unedited browser captures of the contact region, copied from the final
passing run. Only synthetic accounts, categories and Contact Alpha appear. Full
page captures and geometry remain in the run archive. Phone full-height captures
include the fixed shell navigation overlay; they do not show every lower row
unobscured in one viewport. These are headless WebKit scenarios, not physical
phone/OS clipboard or external WhatsApp/email evidence. Native copy coverage
exercises the real manual fallback with clipboard support deliberately unavailable;
the unit tests separately verify `writeText` success and denial.
