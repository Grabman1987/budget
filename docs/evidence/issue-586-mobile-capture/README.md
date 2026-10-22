# Phone capture sheet — #586

Base: `6420676d` (origin/main when this worktree was created). Synthetic data only.

The phone capture fills the visible viewport. Its body scrolls independently from the save
bar. Capture-scoped VisualViewport resize/pan listeners keep that bar above a software keyboard;
the existing sheet safe-area padding remains in effect. Shared FormDialog behavior, desktop
layout, cash-confirmed/bank-pending defaults, validation, writes and Undo are unchanged.

## Existing-test adaptation

| File | Old check | New check and authorization |
| --- | --- | --- |
| `e2e/booking-acceptance.spec.ts` | Phone height at most 88% of 844px. | Assert exact top zero and exact current visual-viewport height on phone widths, retaining all cent/status/focus/save/Axe/target assertions. Root authorized this #586 UI contract adaptation; no financial oracle or tolerance change. |
| `e2e/mobile-panels.spec.ts` | Capture classified as an 88% sheet; its M04 case required an exposed backdrop. | Classify capture as full-screen for the existing strict geometry/visibility/Axe checks. Retain its M04 case with a real inside tap and close control; retain all actual-sheet backdrop interactions and every existing scenario. Root authorized the #586 structural adaptation; no skip, timeout, focus or discard change. |
| `e2e/capture-dialog-layout.spec.ts` | Click `(2, 2)` as an outside click on desktop and phone. | Keep the genuine desktop scrim check. On phone, assert the full-screen bounds and click the real close control, retaining the same discard/continue/draft assertions and all existing Escape coverage. Root authorized this structural UI adaptation for #586 under the standing owner test-change policy. No deadline, tolerance, skip or financial assertion changes. |

`e2e/issue-586-mobile-capture.spec.ts` adds six-line valid/invalid save-bar checks, cash/bank
status controls, light/dark strict Axe, 44px targets, no overflow, actual save hit testing and
phone full-screen/desktop width assertions. A separate case resizes the browser viewport
and explicitly simulates keyboard-sized VisualViewport bounds and pan events. This is browser
emulation, not proof of a physical iPhone keyboard or nonzero hardware safe-area insets.

## Verification

- Capture form/model unit regressions: **26 passed** across two unchanged existing suites.
- Changed-file ESLint, Prettier, CSS design-scale check and web typecheck: **passed**.
- E2E build: **passed**.
- Independent source/test review: **CLEAR**, including the six-file delta and both original
  phone captures. `source.sha256` records the reviewed source/test freeze; coordinator review
  record: `/workspace/.budget-tools/cloud-control/586-independent-review.md`.
- Canonical Chromium 1248 / Chrome 156 is absent locally. The official installer failed with
  HTTP 403 `Domain forbidden`; no alternate engine is claimed as canonical Chromium acceptance.
- Initial native host WebKit launch failed before page creation because its dependency check
  reported missing `libGLESv2.so.2`. The established pinned container runtime initially failed
  before tests because the shared Docker filesystem was full. Neither failure is behavior proof.

Canonical WebKit 2370 / Safari 27.2, pinned same-host container, unchanged `webkit-iphone`
project, one worker: **all nine existing capture/layout cases passed** on the first run, alongside
the new many-line/light/dark/targets/Axe case. The new keyboard simulation case initially failed
only because its new draft assertion expected raw `120` after blur; the existing amount control
correctly formats that value as `120,00`. Its exact formatted-value oracle was corrected, without
changing product behavior, tolerances or existing tests. The final focused run passed **5/5**
(three API setup cases and both new capture cases). Product source and the existing adapted test
were byte-identical across both runs; only that new assertion changed. First failure log and
trace remain in coordinator records; the two PNGs here are from the final passing run.

Commands:

```sh
run-webkit-relocated-deps.sh /workspace/backlog-586-mobile-capture test e2e/issue-586-mobile-capture.spec.ts e2e/capture-dialog-layout.spec.ts --project=webkit-iphone --workers=1
run-webkit-relocated-deps.sh /workspace/backlog-586-mobile-capture test e2e/issue-586-mobile-capture.spec.ts --project=webkit-iphone --workers=1
```

The helper uses image `sha256:4cb1535ccc6d606b3662a4be5465a607fb9b130eeb974837fa58e024ab5e058e`
and Node 22.23.3. Its extra mounts make the worktree's private relocated dependencies visible;
project configuration and browser engine remain unchanged. `source.sha256` records the final
six-file source/test freeze, including the two audited existing mobile geometry consumers. [Light](phone-light.png) shows the lower scrolling body;
[dark](phone-dark.png) shows its top. Both show the fixed save bar. These captures use the iPhone
profile's 390 CSS px viewport (1170 physical px at its device scale factor).

The final retained capture M04 inside-tap/actual-close case also passes: **4/4**, including
three API setup cases. This supplemental run used the same native engine/device, a read-only
common Git metadata mount and `GIT_OPTIONAL_LOCKS=0`. The runtime has no Git executable, so it
explicitly did not run `booking-acceptance` (whose evidence helper invokes real Git). That existing
geometry consumer remains for the genuine canonical CI runner; no Git metadata was fabricated,
no helper changed and no test skipped in source. The approved external configuration only added
that file to the WebKit test selection; it changed no device, timeout or engine setting. The
actual executed fallback was:

```sh
playwright test e2e/mobile-panels.spec.ts --project=webkit-iphone --workers=1 --grep='M04: Buchung erfassen'
```

Raw output is retained for the [initial layout run](webkit-layout-first-run.txt),
[final focused cases](webkit-focused-final.txt) and [supplemental close case](webkit-consumer-close.txt). Trailing whitespace is removed from the
checked-in text copies; coordinator originals remain unchanged. Desktop/Chromium 390 light/dark proof, CI and live verification
remain pending. No existing screenshot baseline captures an open BookingPanel: all changed
capture screenshots are evidence captures. The seven baseline-spec callers render other views,
so no snapshot regeneration is expected or dispatched. Per the coordinator's resource direction, full-check coverage is delegated to
required CI after focused local verification. The issue stays open.
