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
10/10 with the published main lock (Vitest5.0.3). The production E2E build passed.
The first native browser run passed12cases and failed2. Desktop exhausted the
unchanged30second budget late in the financial sequence after the added open-list
scans; WebKit measured1354px against the1328px two-screen limit. Mobile Chromium
and the existing event create/edit/Undo flows passed. This is not a passing whole
run. Scoped ESLint passed on the reviewed source/tests.

The reviewed correction `e1fdf157` reduces mobile whitespace by40px nominally:
outer top padding, two toolbar paddings, context bottom padding and the chart-low
paragraph margins. It changes no font size, chart geometry, 44px target, financial
value or timeout. The scoped Linux run40252485442 checked out exact `e1fdf157`
and passed all14tests in1.1minutes without retries or baseline changes. This
includes desktop1440, Chromium390 and WebKit light/dark, the two-screen bound,
44px targets, closed/open-list Axe and the unchanged financial/Undo cases.
The actual test summary was inspected, since the snapshot workflow itself allows
test failures. This run uses published main's Axe4.13; the pending dependency
update's Axe4.14 is not claimed by this result.

Scoped ESLint, Prettier and the design-scale CSS check passed. Required full CI
and publication remain pending. No live or physical-device acceptance is claimed.
