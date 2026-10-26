# Annual planning continuation

The prepared branch `codex/backlog-608-year-delivery` at `6b2892ad` is retained.
Merging published main `ce12723a` at `e02f99a6` introduced no conflict or change to
the prepared annual-planning delta. Historical source-only reviews and failed
older height observations remain in `docs/handoff/implementation-608/`.

The leading year-end amount, monthly chart and December table inspection reuse
the existing integer-cent scenario calculation. Event selections are local
read-only overlays. The chart explicitly distinguishes saved monthly stands from
dated event markers; its low is among displayed stands, not an invented daily
cash-flow minimum. Existing event editing, ledger, locks and Undo paths remain.

Scoped test rationale:
- `plan-year-scenario-608.test.tsx` retains literal December/lead/chart parity,
  selection, privacy, past/future/empty years and collapsed-group amounts. Two
  added cases cover the prepared event loading/error correction: independent
  report totals and their own error stay visible without fabricated scenario
  amounts or requests.
- `year-planning.test.tsx` follows the replaced matrix's chart inspection table
  and disclosure, preserving the existing literal financial expectations.
- `issue-608-year-scenario.spec.ts` uses a real synthetic ledger and literal
  720.00/699.97/1000.01 results. Additive open-list Axe, overflow and trial-action
  checks cover both themes; original cent parity, 44px, height and no-write
  assertions remain unchanged.
- `plan-year-events.spec.ts` opens the new event disclosure and follows its
  current help/inspection controls, preserving mutation and Undo assertions.
- `plan-year.spec.ts` expands initially collapsed groups before inspecting the
  existing canonical table values; financial expectations remain unchanged.

Independent full source/canonical-callers/test review is CLEAR at `e02f99a6`
plus the two additive test changes. The two affected component suites passed
10/10 with the published main lock (Vitest 5.0.3). The production E2E build passed.
The first native browser run passed 12 cases and failed 2. Desktop exhausted the
unchanged 30-second budget late in the financial sequence after the added open-list
scans; WebKit measured 1354 px against the 1328 px two-screen limit. Mobile Chromium
and the existing event create/edit/Undo flows passed. This is not a passing whole
run. Scoped ESLint passed on the reviewed source/tests.

The reviewed correction `e1fdf157` reduces mobile whitespace by 40 px nominally:
outer top padding, two toolbar paddings, context bottom padding and the chart-low
paragraph margins. It changes no font size, chart geometry, 44px target, financial
value or timeout. The scoped Linux run 40252485442 checked out exact `e1fdf157`
and passed all 14 tests in 1.1 minutes without retries or baseline changes. This
includes desktop 1440, Chromium 390 and WebKit light/dark, the two-screen bound,
44px targets, closed/open-list Axe and the unchanged financial/Undo cases.
The actual test summary was inspected, since the snapshot workflow itself allows
test failures. This run uses published main's Axe 4.13; the pending dependency
update's Axe 4.14 is not claimed by this result.

Scoped ESLint, Prettier and the design-scale CSS check passed. Required full CI
and publication remain pending. No live or physical-device acceptance is claimed.

## Dependency compatibility

Prepared integration `ffa7b494` merges the independently reviewed dependency
candidate `115536eb`, including Axe 4.14, into the annual branch. Independent
binary-diff comparison confirms both the incoming dependency change and the
annual feature are unchanged. This prepares compatibility before main integration;
it does not claim the dependency PR is already published.

The focused Linux run 40278198919 checked out exact `ffa7b494` and passed the same
14 annual tests in 1.1 minutes without retries or baseline changes, now with the
updated lockfile and Axe 4.14. This repeats the earlier cases for the changed
dependency graph; the counts are not an additional set of unique acceptance
cases. Required full CI and exact-main publication still remain outstanding.

The follow-up dependency candidate `4c0db51b` is also integrated for preparation.
Its old annual occurrence matrix and its new matrix-only naming regression
conflict with this feature's already replaced event-list view. Those two files
retain this branch's independently reviewed annual implementation and tests
byte-for-byte. The incoming waterfall naming correction and both strict Axe
error-diagnostic improvements remain. No old matrix is restored. The event-list
view retains its own privacy regression and the Axe 4.14 browser evidence above;
this merge does not claim a new browser or full-CI run.

## Generic phone-container consumer

The first full PR run `40302177547` reported a failure in the mobile annual-page
case in `e2e/mobile-chart-containers.spec.ts`: its readiness selector resolved to a
hidden row inside the annual disclosure because category groups now start
collapsed. Both configured attempts failed at the same visibility assertion,
not a financial or overflow check. This generic consumer was absent from the
initial focused annual suite.
At the time of this diagnosis, the other completed groups had passed and WebKit
groups 11/12 were still running; no complete-run success is claimed.

The technical adaptation opens the first real category group and requires its
collapsed-to-expanded transition before the original row visibility, both-theme
page-width, Axe and screenshot assertions. It keeps the 30-second readiness and
90-second scenario deadlines and all other routes unchanged. No product,
financial oracle, source data, retry count or protection changes. Scoped browser
proof and independent review of this adaptation remain pending.

Independent review is CLEAR for the adaptation. Scoped Linux run
[40304830923](https://github.com/Grabman1987/budget/actions/runs/40304830923)
checked out exact `6ecd447d40ad0e89538bdf6131829e1f01545e2f`, ran only the
mobile annual-page consumer and its three setup cases, and passed **4/4 in
14.4 seconds**, without retries, failures or skips. The original both-theme
width, Axe and screenshot assertions passed after opening the real group. The
baseline step reported **No baseline changes** and the remote branch stayed at
the tested commit. Product source is unchanged. This focused result does not
replace the required full CI on the final PR revision or establish publication.

## Shared popup geometry consumer

The next complete run `40306173072` reported a mobile failure in the unchanged
`e2e/bank-sync.spec.ts` popup test inherited from #772. Its title/close boxes were
read in separate browser calls during an animated sheet entry. The retained
trace confirms non-overlapping reads on both attempts and the shared 104%-to-zero
sheet transition; animation is a supported timing explanation, not direct
rectangle-coordinate proof from the trace.

The technical correction reads both rectangles synchronously in one header
`evaluate`, preserving the null checks, title-before-close order, original
one-pixel center threshold, native animation, themes, Axe, cancellation/no-write,
focus, confirmation and all deadlines. It additionally requires the named close
button to be visible. No product source or financial expectation changes. Scoped
Linux proof and independent review remain required before the final full run.
