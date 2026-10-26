# Review rows and report catalog (#771)

Owner feedback of 26 October 2026 takes precedence over the older catalog
presentation. The report catalog keeps numbers, names, questions, opening arrows
and routes. Chart-form descriptions and period/frequency rows are removed only
from the catalog; report controls and metadata remain. Group headings have equal
top spacing. Hover and keyboard focus tint the whole row.

Pruefen keeps desktop table cells as table cells. Flex layout now lives inside
those cells, so one separator spans the icon, description and actions. Candidate
accept/dismiss buttons share one action row. Opening the candidate uses the same
FormDialog primitive and booking head/body/footer classes as BookingPanel. Its
bank-specific assignment/match controls retain their guarded APIs; it does not
pretend the candidate is already a persisted booking. Opening or cancelling
writes nothing. Choices remain mounted after the first opening, while unopened
rows mount neither dialogs nor candidate queries. Successful explicit writes
close the popup; pending writes block closing. Existing actual-booking editors
continue to use BookingPanel.

## Scoped test adaptations

- `bank-candidate.test.tsx`: replace disclosure toggles with the actual dialog
  opener; preserve 65-row lazy-read and pending-match/merge-precedence assertions.
- `bank-category-groups-734.test.tsx`: open the dialog, retain the original grouped
  category/payload assertions, and prove cancel/reopen retains the choice without
  an early write.
- `account-bank-review-724.test.tsx`: use the dialog opener before the unchanged
  last-candidate confirmation and learning-offer assertions. These three unit
  files add native-dialog/media-query stubs required by the shared UI.
- `assignment-rules.spec.ts`: update the candidate opener; retain reject, explicit
  confirm, request revision and learning assertions.
- `bank-followups.spec.ts`: update three candidate openers; retain real merge,
  transfer, balance-lock and Undo expectations.
- `bank-sync.spec.ts`: use the opener and add cancel/focus/no-write proof, aligned
  desktop cells/adjacent actions, popup structure, both-theme Axe and screenshots.
- `issue-724-account-bank-review.spec.ts`: update the candidate opener before
  existing real merge, isolation and Undo checks.
- `issue-734-category-picker.spec.ts`: use the opener before the unchanged grouped
  category checks in the account queue.
- `shell.spec.ts`: replace the deliberately removed chart-form assertion with the
  retained question and absent catalog-only columns. Keep all counts, positions
  and row navigation assertions; verify aligned wide headings, continuous hover,
  no page overflow and both-theme screenshots.

No financial oracle, tolerance, timeout, retry count, security/lock guard or Undo
expectation is relaxed. All fixtures remain synthetic. Catalog implementation
used Luna; inbox implementation used Sol. The orchestrator independently reviewed
inbox source/tests; the inbox implementer independently reviewed catalog and shell
test changes. No additional reviewer session or duplicate full local suite was
started.

## Verification

Final affected component suites: **13/13 passed**, including lazy queries,
cancel/reopen and learning. Web typecheck, scoped ESLint, formatting, design-scale
check and E2E production build passed. The initial typecheck found unsupported
Testing Library `exact` options in six role queries; removing the options preserves
its default exact name matching. The final unit/typecheck run passed afterward.
The focused native browser run passed **7/7** (three setup cases plus desktop and
mobile catalog/candidate flows) without retries. Both-theme screenshots exposed
an inherited right alignment and mobile booking-kind order on the new popup
heading. A scoped CSS correction keeps title and close control on one row. The
rebuilt candidate flow then passed **5/5** (the same three setup cases plus both
candidate profiles), with both-theme Axe, header/cell/button geometry, no
overflow, no posting on open/cancel, focus return and explicit confirmation.
These overlapping counts are not added together. Screenshots were visually
inspected. Reviewed Linux baselines, required complete CI and publication remain
pending. The wider redesign in #619 remains open.
