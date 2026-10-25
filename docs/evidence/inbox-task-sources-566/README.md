# #566 task-source grouping and counts

The receiving local integrator's [CI follow-up](CI-FOLLOWUP.md) records the
current corrections, separately scoped successful runs and failed diagnostics.
Its [final browser manifest](final-browser/proof.json) pins16 source/test files
and16 original artifacts. Earlier revision-specific evidence below is retained;
new exact-head full CI and protected live verification remain pending.

## Delivered contract

The owner-approved #477/#561 contract is implemented: due account checks are counted once inside Aufgaben, the global Prüfen count remains Umsätze + Aufgaben, and displayed source counts represent raw outstanding work rather than visual rows. The five exhaustive Aufgaben sources are Konten, Plan, receipts, payslips, and other existing tasks. Source classification uses persisted source identifiers, never titles or generic kinds; savings proposals are not double-counted. Existing booking/receipt/payroll actions and pagination remain the drilldown destinations. Bank status remains read-only.

The task-source UI, API contract, deep link, and query error states are implemented. Fatal refetch errors suppress cached source actions until retry succeeds; a next-page-only error retains already loaded work. Existing #566 bank review hash navigation continues to open the account source without rewriting the URL.

## Test changes

Eight existing test files receive technical fixture or navigation adaptations; none weakens financial, security, audit, locking, Undo, timeout, tolerance, or coverage expectations.

| Existing test file | Reason and preserved checks |
| --- | --- |
| `apps/server/src/api/inbox.test.ts` | Seeds recent synthetic review checkpoints so old queue scenarios do not acquire unrelated due-account tasks; adds the two explicit response DTO keys. Original rows, amounts, dates, statuses, count literals, and Undo checks remain. |
| `packages/db/src/repos/inbox.test.ts` | Seeds recent checkpoints to isolate existing queue counts from due reminders. Original count, mutation, and Undo assertions remain. |
| `packages/db/src/repos/heute-inbox-count.test.ts` | Seeds a recent Giro checkpoint so its original two-movement/two-overspent fixture remains independent of due account checks. Literal counts and Heute = Prüfen equality remain. |
| `apps/server/src/api/inbox-bank-account-724.test.ts` | Gives the existing scoped queue fixture recent checkpoints; prevents new global due work from changing its prior expected results. |
| `packages/db/src/repos/inbox-bank-account-724.test.ts` | Same scoped-fixture isolation; the exact empty response now includes `accountReminders: []` and `unlinkedReceiptCount: 0`, matching the explicit DTO. Existing financial values, global/scoped identity, no-write snapshots, and Undo checks remain. |
| `apps/web/src/inbox/account-bank-review-724.test.tsx` | Adapts to the real segment/task-source DTO and the decided Umsätze → Aufgaben → Konten navigation, replacing the removed simultaneous external-reminder placement/request. Preserves the −12,01 € bank candidate, bank-status/setup checks, actual reminder destination, and no-write guard. Adds fatal-refetch/retry, next-page-error retention, and hash-navigation coverage. |
| `e2e/inbox.spec.ts` | Opens Weitere Aufgaben before the pre-existing warning resolution flow; its original resolution, Undo, and redo assertions remain. |
| `e2e/issue-724-account-bank-review.spec.ts` | Navigates to the account source and actual reminder action, then returns to Umsätze before the original bank-candidate merge and Undo proof. Financial values, snapshots, mutations, and timing expectations remain. |

New tests cover the real DB/API source counts and pagination, source classification, summary interactions, and fatal-refresh versus next-page error behavior. The native scenario executes four viewport/theme cases on the recorded WebKit project. Receipt/payroll records are staged synthetic metadata; no PDF parsing or download claim is made. Financial writer behavior was not changed.

## Verified source revision

All final local checks below apply to product/test revision `03e1505b428c82603b6cd8973dfffef140f38fd7`. This evidence-only packaging does not change those source bytes.

| Revision | Actual check | Result |
| --- | --- | --- |
| `03e1505b` | Four targeted component files | 16 tests passed, 5.15 s. Includes header, task-summary and integrated source/hash/error-state coverage. |
| `03e1505b` | Web typecheck, scoped ESLint and fresh E2E build | Passed. |
| `03e1505b` | WebKit native matrix | Seven passed in 43.9 s: three setup plus desktop 1440×900 and configured phone 390×844 in both effective themes. No retry. |

Earlier preparation exposed and corrected missing source navigation fixtures, isolated due-review count fixtures, fatal stale-cache actions, an effect-state lint error, source-table wrapping/touch geometry and minimum-scroll interception by fixed navigation. Those earlier partial runs are not presented as final passes. The [review history](REVIEW.md) retains the findings and independent CLEAR deltas, including final combined source clearance at `03e1505b`. Source review and local checks do not replace full CI, the required Chromium project matrix or serial deployment/live verification; these remain pending. No private archive operation is included.

## Native artifacts and limits

The [native proof manifest](native/proof.json) records the exact revision and SHA-256 of all eight retained artifacts. All source hashes were checked before copying and destination bytes were verified identical. No traces, authentication state, databases, raw logs or private originals are included.

| Profile | Light | Dark |
| --- | --- | --- |
| Desktop 1440×900 | [PNG](native/task-sources-desktop-light.png) · [proof](native/task-sources-desktop-light.json) | [PNG](native/task-sources-desktop-dark.png) · [proof](native/task-sources-desktop-dark.json) |
| Configured phone 390×844 | [PNG](native/task-sources-phone-light.png) · [proof](native/task-sources-phone-light.json) | [PNG](native/task-sources-phone-dark.png) · [proof](native/task-sources-phone-dark.json) |

Root visually inspected final phone-light and desktop-dark images: source labels/actions and the single real status block are clear. These are full-document captures after an ordinary heading click and scroll to the top; fixed phone navigation naturally appears at its viewport edge within that document capture. They are not physical-device evidence.

The actual isolated server/database cases assert five task-source counts summing to Aufgaben 5, plus Umsätze 1 and global 6; source drilldowns, setup navigation, real account-review/booking-assignment dialogs, untouched literal 12,01 amount, no API mutation requests and equal financial/audit snapshots. Main-scoped Axe, unchanged 44px/full-viewport/center-hit checks, contained single-line headings/actions and horizontal-overflow checks passed. Hit testing follows ordinary centered assisted scrolling, not an initial unobstructed-placement claim; no forced clicks or hidden overlays. Receipt/payroll fixtures are synthetic staged metadata, not PDF parsing/download evidence. Actual engine/project/runtime and claim limits are recorded in the linked JSON.

See [current adoption contract](../../handoff/566/ADOPTION.md) and [independent review history](REVIEW.md).
