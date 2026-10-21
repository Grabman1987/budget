# Compact Plan inspector and exact activity (#735)

The inspector keeps the goal, assignment and quick actions visible. Routine
**Geld verschieben** fields use a labelled disclosure with a chevron. Closing it
keeps the form and drafts mounted; overspending cover opens immediately. Existing
assignment, move, cover and Undo handlers are reused.

Activity amounts open the existing category/month route. The contributing
bookings appear first, with actual payment partner or description, date, account
and signed category split amount. Whole-booking amounts are distinguished from
split portions. Card reserve terms explain the existing balance coverage; monthly
unfunded adjustments are labelled separately with affected-category context.

An optional collector records terms at the existing budget accumulator, including
its final unfunded subtraction. Their complete sum must equal the canonical
activity before pagination. There is no second calculation, balancing residual,
new financial writer, schema or dependency. The GET reads one snapshot, enriches
only the current page's booking IDs, bounds pages at 50 terms and rejects stale
continuations. Tests check serialized database bytes and `total_changes()`.

Desktop links retain their actual month, including later multi-month columns.
Phones use the inspector activity link. Back preserves the source month/view,
selection, collapsed groups and existing router scroll restoration. Origins wait
for a fresh booking-ID GET before opening the existing editor, including future
bookings. Reading saves nothing; a later explicit Save uses that editor's existing
write path. Empty descriptions have a nonempty accessible fallback.

## Actual validation

- Meaningful API RED reproduced the missing route after the ordinary month
  already contained the expected −8767 cents. NEW domain6/API5/UI4 then passed.
- Three additional UI regressions reproduced stale cached origins, lost return
  selection and blank descriptions. Corrected UI7/API5 passed together (12 tests,
  8.23s Vitest duration). These overlapping checkpoints are not added together.
- Affected types, scoped lint, CSS scale and semantic formatter checks passed.
- The first feature-native run passed seven cases and failed two NEW fixtures:
  missing required booking type, and a nonexistent multi-table selector. Their
  correction retained every financial assertion.
- The final fresh-build canonical WebKit run passed **9/9 on the first attempt**
  (66.968s reporter duration): three setup cases and six feature cases. Four
  desktop/phone-theme scenes cover visible activity entry, draft preservation,
  exact total/item sums, source metadata, privacy, scoped Axe and Back state.
  Separate cases cover a future booking origin and multi-month navigation.
  There were no skips, retries or flaky results; reads emitted no writes.
- Before the byte-comparison follow-up below, the required **AGE-enabled full
  check passed all 579 files / 5,176 tests**
  (470.39s Vitest duration), with two workers and Node22, followed by a successful
  normal production build. It ran on source freeze `dea6bb3e` at base `9baa582f`;
  commit `438ace6c` retained that product source with only factual result notes
  after the check. The later four-comparison follow-up has its own checkpoint
  below. This is not validation of a later Main join. At this checkpoint,
  exact-head Chromium CI, merge and LIVE were pending. Local
  WebKit does not establish a physical iPhone keyboard or OS picker result.
- CI then reported four existing 5000ms test timeouts at complete SQLite Buffer
  comparisons, also present on the separate category-picker branch. A prior
  unchanged-test CPU profile measured costly generic Buffer equality; the exact
  cause of each CI timeout was not established. The owner approved exactly four
  native byte comparisons (details below). All three affected files passed
  **20/20 tests** afterward (7.609s command elapsed), with their original timeouts
  unchanged. Subsequent exact-head full/build/CI results are recorded in
  [PR #737](https://github.com/Grabman1987/budget/pull/737); this page records the
  targeted checkpoint and does not infer a new full pass from the earlier result.

The first required full attempt passed workspace types, lint and formatting, then
Root stopped it orderly after `/tmp` reached zero available bytes. Existing import
and statement-integrity fixtures had reported failures; aggregate error details
and the exact cause of individual failures were not established before the stop.
Source, compiled-file and process guards passed, and the lock was released. No
normal build ran. The aborted attempt is not a full-test result. The later
capacity-guarded continuation above passed; the first raw failure history is
retained separately.

## Original captures and limits

All fixtures and images are synthetic. These eight PNGs are unchanged browser
originals: inspector element screenshots and full-page activity screenshots.

| Profile       | Inspector                               | Activity                               |
| ------------- | --------------------------------------- | -------------------------------------- |
| Desktop light | [Original](inspector-desktop-light.png) | [Original](activity-desktop-light.png) |
| Desktop dark  | [Original](inspector-desktop-dark.png)  | [Original](activity-desktop-dark.png)  |
| Phone light   | [Original](inspector-phone-light.png)   | [Original](activity-phone-light.png)   |
| Phone dark    | [Original](inspector-phone-dark.png)    | [Original](activity-phone-dark.png)    |

Desktop contexts are 1440×900/DPR1; phone contexts are 390×844/DPR3 with coarse
pointer. Both themes were asserted in the actual contexts. The desktop inspector
content measured **790.578125px**, versus **1139.703125px** before the UI change on
the same synthetic fixture (scrollHeight 791 versus 1140). Phone content measured
751.265625px; no phone baseline or percentage reduction is claimed.

The first entire contribution was visible at initial scrollY0: its bottom was
520.640625px on desktop and 598.359375px on phone, above the phone navigation top
at 780px. Full-page captures still contain fixed navigation/FAB: the phone
inspector image masks lower history/category links, and the phone activity image
masks part of the retained availability summary. Element captures isolate the
inspector and do not show the surrounding Plan grid. They are not edited crops.

## Existing-test boundary

Two existing financial E2E flows need one ordinary **Geld verschieben** disclosure
click before their original `Nach` controls: `plan-inspector.spec.ts` and
`issue-481-single-category-band.spec.ts`. The owner approved exactly
these additions: “Ja, genau diese beiden Klickzeilen ergänzen”. Root added one
ordinary summary click in each file, retaining all financial, payload, Undo,
accessibility and timeout assertions. The exact affected band flow and three
setup cases passed locally on the first attempt (4/4, 36.331s reporter duration),
reusing the unchanged 166-file E2E build. The unchanged canonical WebKit
configuration excludes `plan-inspector.spec.ts`; that adapted flow remains an
exact-head Chromium CI gate. The local result is not a two-flow pass.

For the separate equality-only follow-up, the owner approved “Ja, genau diese vier
Bytevergleiche umstellen”. Root replaced four generic deep comparisons with
`Buffer.equals` plus strict `toBe(true)`. The same complete before/after images,
including length and every byte, are compared; there are no hashes, slices,
excluded data, timeout changes or removed financial assertions.

| Existing file                                                 | Approved byte-comparison change              | Retained coverage                                                                                 |
| ------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `apps/server/src/api/inbox-bank-account-724.test.ts`          | Two complete serialized DB comparisons       | Account isolation, counts/pagination, invalid UUIDs and read conservation                         |
| `apps/server/src/api/statement-settlement-727.test.ts`        | One complete serialized DB comparison        | Reviewed source, literal account balances and no writes                                           |
| `apps/server/src/statements/settlement-integrity-727.test.ts` | One complete original SQLite file comparison | Through45/46 copy migration, rollback refusal, FK/integrity checks and original-file conservation |

| Existing file                                | Authorized interaction change           | Retained coverage                                                                       |
| -------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------- |
| `e2e/plan-inspector.spec.ts`                 | Open **Geld verschieben** before `Nach` | Assignment/quick-target payloads, one-cent move, real Undo, selection and accessibility |
| `e2e/issue-481-single-category-band.spec.ts` | Open the same disclosure before `Nach`  | Exact cent writes, shortcuts, Undo and transition to two selected categories            |
