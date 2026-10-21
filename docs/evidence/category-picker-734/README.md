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

Canonical WebKit passed **9/9**: four feature cases (both themes, true desktop
1440 × 900 and configured phone 390 × 664), two unchanged capture-dialog
regressions, and three setup cases. Each feature
case reached grouped IDs, contacts last, 63 entries, manual list scrolling,
keyboard traversal beyond entry 60, twelve upward steps below the sticky heading,
viewport resize, active-option visibility,
offscreen/reopen behavior, overflow checks, Axe and real capture/save/share/Undo.
Desktop DPR is 1 with a fine pointer. Phone DPR is 3 with a coarse pointer;
`maxTouchPoints` was 0. This is browser emulation, not physical-device evidence.

The initial desktop popup was 466 pixels high; phone was 320 pixels. The phone
capture below follows the resize/reveal stress and has a confined 185-pixel
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

PR #736's first exact-head CI exposed capture interaction regressions despite the
historical focused 7/7 and full-check checkpoint. Two unchanged capture-dialog
cases reproduced locally: a newly focused second split was below the scroller,
and native scroll alignment left a suggestion chip partly clipped. Fresh focus
now reveals its anchor once; subsequent manual scrolling still hides an offscreen
popup. The viewport owns the root clip independently of document scrolling.
A one-pixel scroller scroll-padding reserves real alignment clearance: the measured
native scroll moved from 14 to 15 pixels and the unchanged strict visibility ratio
reached exactly 1. Ineffective target scroll-margin attempts are retained in the
outside diagnostic history, not the product. A NEW root-viewport regression fails
with only the old root clipping loop restored and passes with the correction.

After resizing to height 450px, the phone test first verifies unchanged body scroll,
then explicitly arranges and proves a fully offscreen anchor before requiring
hidden/Enter recovery with the same draft, selection and no extra POST. A partly
visible anchor may correctly retain its popup. Desktop retains visible-resize
checks; both contexts retain the later deliberate manual-hide/reopen checks.

The current **9/9** reuses the exact 166 compiled files from fresh E2E build 62562
on the corrected product. Combined run 42762 performs no rebuild. It includes the
previously failing unchanged capture-dialog cases and all four NEW feature cases;
historical and focused pass totals are not added together. The earlier full check
on base `9baa582f` plus feature freeze `4a22a00d` passed **578 files / 5,162 tests**
(832.22s Vitest duration, AGE1/one worker) and normal production build. That is a
historical checkpoint before these interaction corrections. An even earlier
interrupted check has no completed unit aggregate or normal-build result.
The pre-inheritance AGE1/two-worker check on base `9baa582f`, parent `a216d438` and
corrected source/evidence freeze `b8e60568` completed with **577 files passed /
1 failed** (578 total), and **5,162 tests passed / 1 failed** (5,163 total), in
521.57s Vitest duration.

The sole failure is the unchanged server test
`statement-settlement-727.test.ts:202` exceeding its existing 5,000ms limit; no
numerical mismatch was reported. The check exited 1, so its pipeline did not run
a production build. A separately invoked normal `npm run build` then exited 0
(Vite 7.57s; esbuild 547ms). This independent build does not make the required
check green.

Only factual result prose in this guide and the Roadmap changed afterwards; no
retry, timeout change or old-test edit was made. Exact new-head
Chromium/required CI and serial LIVE remain pending;
the failed first PR head is not represented as accepted.

## Main inheritance checkpoint

Verified LIVE Main `a83855c7` is incorporated by ordinary merge. It carries the
owner-approved four existing byte-comparison corrections for the #727 test and
the independent #735 changes. The #734 product, NEW tests, original images and
profiles carry forward byte-exactly. The failed check above remains historical;
it is not relabeled as a pass. The required AGE1/two-worker full check and normal
build on the joined immutable head are pending at this documentation checkpoint.
Their actual result and the exact-head required CI are tracked in
[PR #736](https://github.com/Grabman1987/budget/pull/736). No post-full product or
test change is planned. The combined local native9/9 evidence above predates
this Main join; no additional native run is claimed for the join.

- [x] Independent source review and four original screenshot review
- [x] Canonical local WebKit 9/9, no skips, retries or flaky cases
- [ ] Required AGE full check and normal production build on current corrected source
- [ ] Exact-head Chromium/required CI
- [ ] Serial merge and verified LIVE revision
