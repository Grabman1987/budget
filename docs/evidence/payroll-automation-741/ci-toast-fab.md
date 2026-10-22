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
Undo action to preserve the real toast, checks separation and clicks the FAB
normally. It then verifies the second capture dialog and its amount focus, the
retained capture-origin toast and unchanged balance. No forced click, dismissal, added wait,
deadline change or financial expectation change is used.

The correction uses the shell's existing safe-area-aware tab-bar height, FAB gap
and FAB size plus `16px` for the page toast's bottom offset. The selector explicitly
excludes toast descendants of every `dialog`; modal payroll and statement feedback
retain their existing placement. Toast duration, focus handling, layers and Undo
implementation remain unchanged. The original `capture.spec.ts` is unmodified.

The expanded run passed all 62 prior cases, including the unchanged failing CI
scenario. The three new cases passed geometry and actual clicks, then failed an
incorrect assumption that this capture-origin toast stayed on the page after its
original host reopened. The existing host resolver returns it to that same host;
the new expectation was corrected without changing product layer handling.

Validation and independent delta review are recorded with the final delivery
evidence; the initial failing CI is retained and is not presented as green.
