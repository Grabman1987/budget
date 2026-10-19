# Account review rules — #578

Status: focused, native and required aggregate validation passed, followed by the normal production
build. Exact-head CI and live delivery remain pending. Independent whole financial/source review,
coordinator-owned existing-test review, mechanical Main inheritance review and actual image/runtime
review are clear. No complete delivery or all-engine acceptance is claimed.

## Read contract

The owner decision in #467 (16 October 2026, comment `6209941680`) and #578 override the old
35-day rule for supported accounts. Checking, cash, and savings in Budget-Konten, plus credit
cards, have an inclusive fourteen-day deadline. Loans and supported Investments have a calendar
month deadline clamped to its final day. Budget membership uses `onBudget`, not the reserve role;
credit cards retain their group regardless of that flag. Receivables retain the existing legacy
hint and unsupported-action behavior; this change introduces no contact review policy.

The authoritative read model supplies account-list badges, `/accounts/reminders`, and Heute's
existing single source row. Its count is the same reminder array length. An account checked
months ago remains checked when there is no subsequent live eligible activity. Accounts never
checked use the opening date, without inventing a check. Closed, deleted, not-yet-open, and empty
never-checked accounts do not produce reminders. P2P and other assets use their stored manual
valuation; other supported types use the selected live reconciliation.

Statement date and actual check ceremony are separate. A booked day after the statement counts
once that day becomes eligible, even if entered before the ceremony. Audit insertion order also
detects later creation, restoration, and financial changes with backdated or identical dates and
identical clocks. Memo/flag-only edits do not trigger review. Current deleted and future bookings
are excluded. Equal or unknown timestamps without audit evidence conservatively cannot prove a
quiet interval.

Reconciliation undo/redo preserves the original ceremony boundary and excludes only that check's
own audit group and replay lineage, including stamps and adjustment. A later undo of an unrelated
financial booking edit remains later activity. A new explicit valuation update on the same row
advances its checkpoint; undo restores the previous checkpoint and redo restores that update's
original checkpoint. Batched SQL returns only identity, chronology, and change predicates, not
private audit snapshots or monetary values.

## Compatibility

No schema, migration, financial formula, booking/check/lock policy, audit writer, or undo writer
changes. A read cannot unlock a reconciled booking. In particular, changing a booked day already
stamped by reconciliation still requires the existing explicit unlock flow. New backdated
bookings and restoration are observed by the read model without changing those write rules.

Legacy reminder setting storage, validation, API, audit, and undo remain available. That setting
continues to govern the unsupported receivable fallback, and cannot override the covered fixed
rules. Profile wording explains the fixed rules; the separate future-preview editor retains its
original storage and undo behavior. No general account-list layout or #566 inbox grouping change
is included. The due ink reuses the existing orange `--minus-ink` token.

## Executed validation

With Node 22.23.3, `npm ci` completed successfully without changing manifests or the lockfile.
At the pre-merge source freeze `e7fe2b81`, workspace typecheck and lint exited 0, followed by
exactly six unit files with one worker: **74/74 tests passed in 17.27 seconds**. The selection
contained the four new #578 domain/DB/API/UI files and the two coordinator-adapted existing
server Heute and integrated account-review UI files. All source, protected-file, HEAD and status
guards passed. Lint retained one existing unused-disable warning in `panel.tsx:208`.

The exact 22-file candidate was checkpointed at `779ff0a3`, then normally merged with verified
live Main `6a2c9c11` to `b6a03490`. All 22 owned blobs/modes remained exact; all inherited Main
content remained exact. The 74-test result above is explicitly pre-merge, not a new full check
of the merged tree.

At clean `b6a03490`, a fresh `npm run build:e2e` exited 0. The official pinned WebKit helper ran
the unchanged canonical `webkit-iphone` project with one worker and only
`e2e/issue-578-account-review.spec.ts`: **5/5 passed in 71.090 seconds**, comprising the two new
scenarios and three setup cases. No retries, flaky cases, skipped cases or reporter errors.
The native wrapper, archive, post-source guards and lock-release checks all exited 0; all 22
owned files, 3,345 tracked files, 14 protected files, HEAD and clean status remained exact.
The compiled output contained 169 hashed files. Existing build chunk-size warnings were retained.

At clean `2342ffc7667665e62c77379e3c62b215b344c4b7`, after normal inheritance of verified live
Main `23a2eb22`, the required full validation ran with Node **22.23.3** and age **1.2.1**:

```sh
BUDGET_REQUIRE_AGE=1 VITEST_MAX_WORKERS=2 npm run check
npm run build
```

The check exited **0**: **530 test files and 4,656/4,656 tests passed**, with a Vitest duration of
**387.00 seconds**. Only after that success, the regular production build ran and exited **0**.
The wrapper, post-run source guard and nonblocking-lock release checks also each exited **0**.
All **32 owned files, 3,370 tracked files, 14 protected files, the four coordinator-owned existing
tests, HEAD and clean status** remained exact before and after both commands. There were no
source, test or documentation writes during validation. Existing warnings remain visible:
`panel.tsx:208` has an unused ESLint disable, JSDOM reports unimplemented `Window.scrollTo`, and
production bundling reports its existing chunk-size warnings. No warning or test was suppressed.

This result belongs to the frozen `2342ffc7` tree. Subsequent delivery edits update only this
result document and the own #578 Roadmap block; the other thirty owned blobs, including all
source/tests and the exact eight images/runtime extract, remain unchanged. No repeat aggregate
or new browser execution is claimed for that documentation-only checkpoint.

Initial fixture errors and failed runs remain in the external validation archive. The final
repairs were narrowly reviewed: required matching splits in the coordinator-owned ±1 fixture,
the new test's actual nested reconciliation response, and waiting for the existing preview
input to become enabled. No monetary, status, undo, accessibility or geometry oracle was relaxed.

### Coverage verified

- Pure fixed-date tests cover group mapping, day 14/15, calendar-month clamping, quiet accounts,
  opening/empty/closed cases, and separately supplied backdated/same-day activity evidence.
- Real SQLite tests exercise equal-clock create/restore, live deletion/redo, original and older
  reconciliation undo/redo, own adjustment/stamp exclusion, unrelated financial-edit undo,
  same-row valuation save/undo/redo, pre-created future maturity, and unchanged money/audit bytes.
- API tests compare due IDs from all three read routes, literal balances and manual values,
  real check/value/undo routes, the preserved legacy setting, and read-only storage snapshots.
- UI tests pin authoritative DTO display, exactly one Heute source row and existing action
  destinations, fixed-rule wording, and the independent future-preview editor with undo.
- Isolated-ledger browser scenarios passed real completion/undo, literal values,
  due badge/count parity, quiet/empty accounts, actual theme controls, Axe, forty-four-pixel
  affected actions, overflow, and phone/desktop captures. Real WebKit desktop layout is explicitly
  separate from Chromium desktop/mobile acceptance; no engine substitution is claimed.

### Exact images and profile limits

The eight original full-page images in [account-review-578](account-review-578/) were opened by
the author, coordinator and independent reviewer. Their copied bytes are exact native outputs;
[runtime-profiles.json](account-review-578/runtime-profiles.json) is the exact 1,486-byte safe
runtime attachment extract, without DB, session/authentication, trace, HTML or full-report data.

The actual canonical phone viewport was **390 × 664**, coarse pointer, DPR 3, and observed
`navigator.maxTouchPoints: 0`; it was not 390 × 844. The additional real WebKit desktop context
was **1440 × 900**, fine pointer, no touch, DPR 1. Both light and dark profiles were checked.
The engine is recorded separately from the project label: the desktop context also belongs to
the `webkit-iphone` project. Main workflow actions use Playwright `click`; only the phone theme
helper uses Playwright `tap`. No observed trusted touch-pointer or hardware-touch assurance is
claimed from these commands or metadata. Reminder links and Heute's Prüfen action passed strict
44-pixel checks; this is not an assurance that every action was simultaneously unobscured and hit-tested.

Phone full-page captures retain the fixed navigation/FAB overlay at the viewport boundary,
obscuring part of the first overview name and third reminder area in the composed photograph.
This limitation is explicit; no layout fix, screenshot baseline refresh or additional capture
rerun was made. The actual due states, four deadlines and quiet checked account remain readable.

Root alone adapted exactly four existing test files under the #467/#578 owner decision, with
independent delta review. The zero-net pending ±1 activity fixtures preserve the original
0/900/12501/15002 values, and actual legacy setting save/undo is retained. The two existing unit
files passed in the six-file run. **Existing `e2e/account-review.spec.ts` and
`e2e/account-reminders.spec.ts` are excluded by the canonical WebKit match and were not run or
claimed as WebKit coverage**; their exact Chromium desktop/mobile CI acceptance remains pending.

Pending: actual Chromium desktop/mobile acceptance, exact-head CI, reviewed PR, serial
integration and exact deployed revision verification. Parent #467 and #566 are not completed by this evidence.
