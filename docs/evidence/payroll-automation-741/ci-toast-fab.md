# CI follow-up: keep the mobile capture action reachable

Initial PR head: `aa3eee811b67d3f0885b2cff2dd2a3bb706da162`.
CI: [39776381532, browser shard 6](https://github.com/Grabman1987/budget/actions/runs/39776381532/job/119816277964).

The unchanged mobile `capture.spec.ts:44` completed its first booking, row flash,
dialog close, saved feedback and literal `979,30 €` balance checks. Its second
ordinary FAB click timed out: the trace repeatedly identifies `.toast-body` as
intercepting pointer events. Intrinsic toast width fixed the payroll action label
but exposed a page-level overlap with the FAB. The retry's category-focus failure
was secondary: the successful first save had already taught that payee's category.

The new `issue-757-toast-fab.spec.ts` reproduced the geometry defect before the fix:
toast bottom `756px`, FAB top `706px` at a `390 × 844` viewport. It saves an actual
synthetic booking, verifies the literal `480,00 €` balance, focuses the existing
Undo action to preserve the real toast, checks the free click center and clicks the FAB
normally. It then verifies the second capture dialog and its amount focus, the
retained capture-origin toast and unchanged balance. No forced click, dismissal, added wait,
deadline change or financial expectation change is used.

An intermediate correction moved page feedback above the FAB. Although its focused
checks passed, [CI39781069801](https://github.com/Grabman1987/budget/actions/runs/39781069801)
on `a19d3e7a308ac7e35a879ed7dc221a4a41f5f7b4` exposed new page-action collisions:
mobile plan quick assignment, payroll-project editing and instrument editing.
The plan trace explicitly identifies the toast action as the click interceptor;
the unchanged plan test also reproduced the timeout locally.

The final correction removes that page displacement and restores every general
page-toast rule and `shell.css` exactly to the verified base. Only `dialog .toast`
receives intrinsic width and only its button receives the nonshrinking action.
This keeps the proven payroll label correction in its modal context. Toast
positions, duration, focus handling, layers and Undo implementation are unchanged.
The original capture and newly implicated page tests are unmodified.

The new regression checks a click center outside the toast body, an actual
`elementFromPoint` center hit, at least 44px button bounds and the ordinary FAB
click. Vertical-only and then whole-rectangle separation proved unnecessary layout
assumptions: the original page layout has slight edge overlap while its center is
reachable. The original failure intercepted that center and is caught by these
checks. Literal balance, visible Undo, second dialog and focus checks remain.
No claim of a completely uncovered circular-button rectangle is made.

The expanded run passed all 62 prior cases, including the unchanged failing CI
scenario. The three new cases passed geometry and actual clicks, then failed an
incorrect assumption that this capture-origin toast stayed on the page after its
original host reopened. The existing host resolver returns it to that same host;
the new expectation was corrected without changing product layer handling.

Validation and independent delta review are recorded with the final delivery
evidence; the initial failing CI is retained and is not presented as green.

The same second CI exposed an independent category-shortcut readiness race in
`checkbox-appearance.spec.ts`. In retry1 the `c` key was sent at321153.006ms while
the budget request completed at approximately321295.849ms; the snapshot still
showed loading. `PlanBody` and its shortcut effect mount only after those data
arrive. The technical adaptation waits for the visible, enabled category button,
then retains the same single keypress and all original style/touch assertions.
There is no sleep, repeated keypress, changed timeout or reduced expectation.
