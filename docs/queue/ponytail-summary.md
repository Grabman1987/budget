# Ponytail summary (core rules)

Source: the Ponytail skill. Applies to all coding in the queue; CLAUDE.md wins on conflict.

1. Ladder, stop at the first rung that holds: needed at all? already in this codebase? stdlib? native platform feature? already-installed dependency? one line? only then the minimum code.
2. Read and understand the task and the code it touches first; the ladder shortens the solution, never the reading.
3. Bug fix = root cause where all callers route through, not a symptom patch in one caller.
4. No unrequested abstractions, interfaces with one implementation, config for constants, or scaffolding for later.
5. Deletion over addition; boring over clever; fewest files; shortest diff once the problem is understood.
6. Mark deliberate shortcuts with a known ceiling as `ponytail: <ceiling and upgrade path>`.
7. Never simplify away validation at trust boundaries, error handling that prevents data loss, security, or accessibility.
8. Money paths keep their invariants (integer cents, shared domain functions, no float arithmetic).
9. Repo override: Ponytail leaves "one small check"; here every acceptance criterion gets a test, and calculation logic gets tests first (CLAUDE.md).

## Issue #465 — strict Q2 accessibility evidence

- Reused `sampleTest`, the existing seeded synthetic ledger, Axe and Playwright projects.
- Added one spec for all seven Q2 pages in both themes, with unfiltered violations,
  the single inbox summary, 390 px page overflow and 44 px phone target assertions.
- The strict phone test reproduced 4 px comparison targets. Fixed only the page's
  mobile wrapper grid placement and minimum height using `--touch`; the visible
  bar keeps `--bar-progress`. No shared UI or shell changes.
- Attached Axe JSON and screenshots directly through Playwright; no new helper,
  dependency, baseline or test weakening. All 33 scoped browser cases passed.
- Final PowerShell check with one worker: 440 files / 4,039 tests passed, no skips;
  both production and E2E builds passed.
- Recorded the permitted WebKit matcher gap and actual local checks in
  [the strict Q2 evidence note](../evidence/q2/strict-a11y-465.md). CI browser evidence
  remains the merge gate; local Chromium ran successfully through PowerShell.
