# Booking inspector evidence (#993)

Synthetic data only. Redesign ON, Windows, Playwright 1.64.1.

| Profile | Light | Dark |
| --- | --- | --- |
| Chromium desktop, 1440 CSS px | [Screenshot](desktop-light.png) | [Screenshot](desktop-dark.png) |
| Chromium mobile, 390 CSS px | [Screenshot](mobile-light.png) | [Screenshot](mobile-dark.png) |
| WebKit iPhone, 390 CSS px | [Trace frame](webkit-iphone-light.jpeg) | [Trace frame](webkit-iphone-dark.jpeg) |

The Chromium images come from passing presentation cases. All six Chromium
presentation/navigation cases passed, including Axe, touch targets, overflow,
Escape/focus return, stored links and unchanged bookings. The shorter iPhone
viewport scrolls within the existing sheet body.

The WebKit images are the final inspector frames extracted from retained failure
traces, **not evidence of a passing WebKit run**. All three Windows WebKit cases
exhausted the unchanged 30-second test budget during browser evaluation/Axe or
navigation. The host was under memory pressure; the precise runtime cause is
unresolved. Earlier traces recorded an opening click taking over ten seconds.
Separating presentation from navigation did not resolve the Windows limitation.
No assertions, timeouts or profiles were disabled or relaxed. Before merge, run
`e2e/issue-993-booking-inspector.spec.ts` on Linux in all configured profiles with
`--workers=1`, and investigate any remaining WebKit failure.

Other completed local checks: full workspace typecheck, changed-file ESLint and
Prettier, CSS scale check, 21 focused Vitest tests, OFF production web build, and
ON e2e web/server build. An independent agent reviewed the final code and test
changes. These images are review evidence, not screenshot baselines or physical
iPhone acceptance.

## Previous delivery blocker

The enabled pre-push hook passed typecheck, ESLint, Prettier and CSS scale checks,
then reported two failures in the unchanged `apps/server/src/api/export.test.ts`:

- Client-abort snapshot cleanup: reported duration about 83 seconds, with an
  existing Windows test budget of 60 seconds.
- Late CSV-source failure cleanup: reported duration about 41 seconds, with an
  existing test budget of 30 seconds.

Only about 27 MB of physical memory was free during this run. After these failures,
the remaining hook test process was stopped to release resources; no failure
stack or completed related-suite total was available. The push did not proceed,
and no draft PR was created. No hook or test was bypassed. The implementation and
prepared PR body remain local.

## Continuation verification

Merged `origin/main` at `b177f58c`. The only conflict was the adjacent imports in
`apps/server/src/api/bookings.ts`; both the inspector and bulk-note-preview imports
and routes were retained. An independent agent reviewed the merged implementation
at `b613e35b` and found no integration issues.

With `VITEST_MAX_WORKERS=1` and explicit `--maxWorkers=1`, the two previously
failing export tests passed in isolation (2 passed, 9 excluded by the name filter).
Their original assertions and timeouts remain unchanged. This supports a
load-related failure in the earlier run, not a reproduced export defect.

Both inspector test files also passed after the merge (7 tests). Fresh production
web builds passed with redesign OFF and ON, and the server build passed. The
earlier WebKit acceptance gap remains open; no full local browser suite was run.

A continuation hook attempt incorrectly supplied the redesign flag globally to
the mixed-mode unit suite and restricted every check to one CPU. It reported
failures in the unchanged settings, Plan-filter and forecast-tools UI suites and
was stopped without pushing. All three suites subsequently passed in isolation
(27 tests) with CI's unit-test environment, their existing per-test flag choices
and one worker. No test files or timeouts changed.

The hook retry uses that same CI unit-test environment. Vitest 5 does not read
`VITEST_MAX_WORKERS` directly, so a process-local temporary Node preload adds only
`--maxWorkers=1` to its CLI when that variable is set. This limits test workers
without changing repository configuration, test selection, assertions or timeouts.
