# Category picker groups (#734)

Bank review categories use the existing category groups and IDs, with a fallback
for ungrouped categories. Capture keeps categories before contacts, including
filtered results, and makes all matching entries reachable beyond the default
60-result limit. Other combobox consumers retain their previous defaults.
The popup follows the actual viewport and dialog clipping area. Fine-pointer
rows are compact; coarse-pointer targets retain at least 44 pixels. Scrolling the
list does not reset its position to the highlighted option. An offscreen field
hides its popup; Enter reveals the field without choosing an invisible option.

## Current browser evidence

Canonical WebKit passed **7/7**: four feature cases (both themes, true desktop
1440 × 900 and configured phone 390 × 664) plus three setup cases. Each feature
case reached grouped IDs, contacts last, 63 entries, manual list scrolling,
keyboard traversal beyond entry 60, twelve upward steps below the sticky heading,
viewport resize, active-option visibility,
offscreen/reopen behavior, overflow checks, Axe and real capture/save/share/Undo.
Desktop DPR is 1 with a fine pointer. Phone DPR is 3 with a coarse pointer;
`maxTouchPoints` was 0. This is browser emulation, not physical-device evidence.

The initial desktop popup was 466 pixels high; phone was 320 pixels. The phone
capture below follows the resize/reveal stress and has a confined 146-pixel
popup. These captures show the scrolled list tail, not every option at once.
The sticky availability heading can cover the preceding partly scrolled row;
the active contact remains visible. The popup overlays lower form fields. A wrapped
contact name retains its full text.
The underlying empty-amount warning is expected at this intermediate capture.

| Context | Light                         | Dark                         |
| ------- | ----------------------------- | ---------------------------- |
| Desktop | [Original](desktop-light.png) | [Original](desktop-dark.png) |
| Phone   | [Original](phone-light.png)   | [Original](phone-dark.png)   |

The images are byte copies of the four reviewed synthetic originals. Exact
viewport, clipping bounds and hashes are in [profiles.json](profiles.json).
No private ledger, provider, account number or owner screenshot was used.

## Financial scope and verification limits

Bank transport is deliberately unconfigured in the isolated native ledger. The
bank confirmation response is **synthetic**: the test checks the exact category
ID, candidate revision and actions sent by the real UI, and proves actual balance,
active bookings/splits and audit remain unchanged. It does **not** prove a real
bank confirmation or bank-confirmation Undo. The later capture branch uses the
real API: −1000 cents, split −500 category / −500 contact, followed by the public
Undo restoring the original active rows and balance.

The original NEW unit baseline had one pass and three intended feature failures.
Focused checks subsequently passed the corrected NEW cases, existing generic
combobox/split tests, affected types, lint, CSS scale and formatting at their
recorded checkpoints. Native history retains the incorrect Axe selector and
unavailable bank transport fixtures. Stronger visibility checks then exposed a
sticky-heading occlusion and an actual 0.9375-pixel fractional under-scroll.
The product now uses the actual heading boundary and outward-rounded list-only
scroll targets; no visibility tolerance was added. Twelve real ArrowUp steps to
literal category 49 and twelve ArrowDown steps back to the same contact pass.

At a fixed phone height of 450 pixels the anchor legitimately leaves the dialog
clip. The test explicitly requires hiding and Enter recovery with the same draft,
selection and no extra POST. Desktop retains the visible-resize assertion; both
contexts also retain the later deliberate manual-hide/reopen checks.
The current **7/7** reuses the exact 166 compiled files from the fresh E2E build
of the final product source after this NEW-test-only phone fixture correction.
Historical pass totals are not added together. An earlier full check was
intentionally stopped when review found the heading defect; it has no completed
unit aggregate or normal-build result. The final required full check on base `9baa582f` with this feature's reviewed
source (freeze `4a22a00d`) passed **578 files / 5,162 tests** (832.22s
Vitest duration) with AGE1 and one worker. `npm run check` and the subsequent
normal `npm run build` both exited 0. Only factual result text in this guide and
the Roadmap changed afterwards; exact-head CI and LIVE remain pending.

- [x] Independent source review and four original screenshot review
- [x] Canonical local WebKit 7/7, no skips, retries or flaky cases
- [x] Required AGE full check and normal production build on final source
- [ ] Exact-head Chromium/required CI
- [ ] Serial merge and verified LIVE revision
