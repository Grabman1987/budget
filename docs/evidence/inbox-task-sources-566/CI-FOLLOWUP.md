# CI compatibility follow-up — validation in progress

The receiving local integrator owns the branch after the explicit cloud handoff.
Initial remote head33814b8d failed CI39780991173. The normal conflict-free merge
of verified Main7adb8f01 is43e869b8. No history was rewritten.

## Reproduced defects

The unchanged receipts API case expected one detached receipt but counted two
items because the newly included due Giro review was also pending. Local RED:
one failed/five passed. Recent synthetic review checkpoints isolate the fixture;
all original count, financial, receipt, security and Undo assertions remain.

A separate real UI regression prevented opening receipt intake when no unlinked
receipt existed: the new source row disabled its button at count zero. The added
component regression first failed on disabled=true. Only the receipts source now
stays openable at zero so its existing uploader remains reachable. Both suites
then passed8/8. No receipt or financial writer changed.

## Per-file technical adaptations

| File | Reason and retained coverage |
| --- | --- |
| `apps/server/src/api/receipts.test.ts` | Recent synthetic account checkpoints isolate receipt counts from newly counted review reminders; every original expectation retained. |
| `apps/web/src/inbox/task-source-summary-566.test.tsx` | Adds the reproduced empty-receipt-source regression, requiring enabled action and actual selection callback; existing source-count assertions retained. |
| `e2e/pruefen-part.ts` | Adds ordinary source navigation and expanded-state verification for the authorized grouped tasks UI; existing segment helper remains available. |
| `e2e/a11y-strict-q2.spec.ts` | Opens the real nonempty task source before the unchanged all-impact Axe, populated-row and strict touch checks. |
| `e2e/account-reminders.spec.ts` | Opens Konten after entering the task overview; exact dates, existing dialogs and setting Undo retained. |
| `e2e/global-search.spec.ts` | Palette destination readiness follows the actual task overview region instead of the removed unconditional queue wrapper; navigation/history/actions retained. |
| `e2e/inbox-context.spec.ts` | Opens Weitere Aufgaben on entry and return before the same period, grouped expansion, complete counts and resolution/Undo assertions. |
| `e2e/inbox-pagination.spec.ts` | Opens the source before original bounded paging, counts, order, duplicate-request prevention and Undo assertions; overview and source requests are verified separately. |
| `e2e/inbox-read-source-summary.spec.ts` | Opens Weitere Aufgaben before the same real source-summary, raw counts, filtering and paging assertions. |
| `e2e/issue-747-savings-task-navigation.spec.ts` | Opens Plan after the original Heute→Aufgaben navigation; all real no-write/money assertions retained. |
| `e2e/portfolio-trades.spec.ts` | Opens Plan before the original keyboard-confirmation and full actual execution/Undo/redo assertions. |
| `e2e/payslip-intake.spec.ts` | Opens Gehaltszettel before the same proposal and post-Undo rows; literal payout/splits/absence assertions retained. |
| `e2e/receipts.spec.ts` | Opens the receipt source before the original upload/link/split/Undo flow. |
| `e2e/trade-confirmation.spec.ts` | Opens Plan on entry/reload before the original trade confirmation, money and Undo flow. |
| `e2e/undo-feedback.spec.ts` | Opens Weitere Aufgaben on entry/reload; original source-conflict redo refusal and retained state checks unchanged. |

CI portfolio failure: first attempt could not focus the hidden savings action.
Its retry found two identically named proposal rows left by those two attempts;
the log explicitly reports a strict-mode duplicate, not a wrong financial result.
The source-opening repair addresses the first failure. No money oracle or
financial implementation was changed in response to this secondary symptom.

Independent preliminary review identified two missed callers and an adapter
that clicked an already-active segment, clearing the existing `gruppe` search
parameter. Final correction, browser results and independent clearance remain
required. No final green CI or live claim is made by this checkpoint.

## Final local verification

- Initial navigation run:54 passed,6 failed,1 pre-existing desktop-only skip in5.8min.
  The six failures were the two group-return cases and the additional source
  request on both Chromium profiles. The corrected helper preserves the active
  segment/group; the paging test explicitly checks one overview request and the
  same four100-item source requests at offsets0/100/200/300.
- Final affected group/paging/trade-confirmation/redo-refusal run:17/17 in1.7min,
  desktop and mobile, no retry. All original financial/conflict/count assertions
  remain. These results are separate from the54 passes above.
- Final acceptance matrix:20 passed,1 failed in2.7min. All six strict all-impact
  Pruefen Axe cases passed. One Windows WebKit phone-light test reached context
  cleanup after its successful last assertion, then exceeded the unchanged30s
  deadline; browserContext.close reported Test ended and directory cleanup EPERM.
  Original trace/log retained outside the repository. No source or limit changed.
- The diagnosed focused native rerun passed7/7 in1.2min (four feature scenes and
  three setup), without configured retries. This does not make the initial
  matrix retry-free. Chromium desktop/mobile and native WebKit,1440/390 and both
  themes, have successful recorded acceptance; no physical-device claim.
- Fresh build, scoped ESLint, formatting and diff checks passed. Unit RED-to-GREEN
  is8/8, as above. Independent final source/adapter and incoming Main review
  CLEAR; final evidence review and new exact-head CI remain required.

[Final original artifacts and source hashes](final-browser/proof.json) retain
eight PNG/JSON pairs: Chromium from the first matrix's passing scenes and WebKit
from the focused successful run. Root inspected phone-light WebKit and
desktop-dark Chromium: labels and actions remain legible, no horizontal overflow.
Full-document phone captures show fixed navigation at its viewport position;
actual hit/44px checks follow ordinary scrolling. Old native artifacts retain
their original revision and are not relabelled as these new runs.

## Register synchronization found during final CI review

CI39793656282 on5e4c30e8 reported a retry-PASS in the unchanged
`e2e/issue-581-account-register.spec.ts` inline-write case. An unchanged local
desktop run reproduced it (three setup passes, one120s timeout). Its retained
trace shows the category click resolving a row labelled16.10 after API Undo,
then the row regrouping to17.10 during that click; the category editor is gone
before selection. The API and unchanged balance alone did not prove that the
date-grouped UI had finished refreshing.

The sole adapter adds an exact visible17.10 date assertion after date Undo and
before opening the category editor. It strengthens UI synchronization; every
existing cent, category, Undo, reconciliation lock, timeout and tolerance
assertion is retained. Register production code is unchanged. A fresh complete
CI on the resulting head is required; the older run is historical evidence.

The focused corrected run passed6/6 in48.1s: three setup cases and the unchanged
inline-write contract on desktop, Chromium mobile and native WebKit, without
retries. Independent trace, adapter and documentation review is CLEAR.

That older run also contained two retry-PASS PWA update cases. PWA source/test
and configuration match Main, and an unchanged local focused run passed5/5
including setup in31.7s. Successful CI jobs uploaded no traces, so the original
90s timeouts have no proven precise cause; indirect timing effects cannot be
excluded. Two other jobs exhausted their30min job limit after unusually slow
APT installation (one without reaching tests, one after23min installation).
Their diagnosed failed-job rerun did not change code, limits or CI settings.
