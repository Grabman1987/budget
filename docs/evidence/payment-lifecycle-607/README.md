# Payment pause/end lifecycle continuation (Refs #607)

This continues existing PR #763, rather than replacing its implementation. Current
owner delivery authority is docs/queue/README.md; the older implementation-only
checkpoint restrictions in docs/implementation remain historical. Nothing below
claims their old test results for the current source.

## Source adoption

Original PR head: 8325561b7a1a6e47ef0ef67d27d0959d9f7c5b84. Its dependency #760 is
now published at main 9fda8be659d631cb85a22b1fb7d642f10ab9688a. Merge e8ff0f78
preserves the current SPEC, domain exports, historical-goal correction and regression,
and goal evidence from main; the migration journal retains main through48 plus49.
No goal implementation was replaced by an older copy.

Prepared tests were recovered from handoff/607-20261021 at
59416cc5b0ca62dc13913a63f5c523b27806cc33. Only test hunks from its six ordered source
patches were applied (4ca52ccf,5131ebc9,c4f510b9,327f59a8,a552bbda,42d26f3a). Product
source was already present in #763. The original42d26f3 commit object was unavailable;
the retained patch blobs, not an invented checkout, are the provenance.

## Scoped adaptations

- packages/db/src/repos/expected.test.ts: three existing delete calls now obtain the required current review digest. Existing financial, restore and Undo assertions remain unchanged.
- apps/server/src/api/expected.test.ts: the existing delete/restore scenario obtains the public token after its version Undo, preserving all existing assertions.
- apps/server/src/api/income-pause.test.ts and e2e/income-pause.spec.ts: the existing deleted-source scenario reads the token before deleting its never-assigned synthetic payment. Original source/history/amount checks remain unchanged.
- New packages/db/src/repos/expected-lifecycle-607.test.ts: the historical-assignment deletion case supplies a valid token and checks the actual prior-assignment refusal, preventing a missing-token false positive.
- New apps/server/src/api/expected-lifecycle-607.test.ts: added byte-neutral missing/malformed/stale DELETE-token checks and a current-token success case for the source checkpoint's mandatory-token correction.
- New domain, migration-copy, UI and native browser tests are adopted from the handoff; their literal financial expectations are retained.
- e2e/expected.spec.ts: four additive framing lines establish page-top scroll and a visible named payment heading before the existing detail screenshot. The first generated mobile image clipped the heading because navigation retained uncontrolled scroll. Finance, Axe, screenshot tolerances and timeouts remain unchanged.
- Client deletePayment now requires a token at the TypeScript boundary, matching the existing mandatory server contract. The dialog ignores a null-token callback; no tokenless server fallback is introduced.

The additional repository regression at `430f0971` compares the complete prior
February income report and assigned occurrence before ending, after ending from
April and after whole-group Undo. Literal 10,000-cent expectations prove April is
removed and restored; February remains identical. No existing oracle changed.

## Fresh verification

Independent full financial/API/migration/source/test review is CLEAR at
`e35fbe4f`; the additional report regression is independently CLEAR at `430f0971`.
Node 22.23.3 and the current lockfile (web Vite 8.3.5) were used.

- Eight affected suites passed 94 tests, including the migration-on-copy checks.
- Four existing UI compatibility suites passed 14 tests.
- The report repository suite subsequently passed 20 tests with the new case.
  These overlap the initial 94; do not add them as unique tests.
- Scoped ESLint, all-workspace typechecking and `build:e2e` passed.
- The three-profile local browser run passed 11 cases and failed one: WebKit
  light exceeded its unchanged 60-second budget during the additional desktop
  context, after completing the phone inspection. Desktop and mobile Chromium,
  all three real mutation/Undo cases, and WebKit dark both layouts passed.
- Trace inspection found many slow browser actions, not one unresolved locator.
  One unchanged targeted repeat also timed out, later at desktop Escape. An
  initial anchored grep selected no tests; that command is not verification.
  No further local retry loop, timeout extension, test split or assertion change
  was used. The unchanged Linux CI case must pass before publication.

[Proof](proof.json) records source and synthetic artifact hashes. The seven
[runtime receipts](receipts) and seven [images](browser) distinguish browser
engine, viewport, theme and pointer configuration. The iPhone light receipt
belongs to a completed phase of a failed combined case; it is not proof that the
whole case passed. No desktop WebKit light receipt is claimed. These are emulated
browser profiles, not physical-device or authenticated hosted-preview evidence.

The affected Linux snapshot run
[40247016090](https://github.com/Grabman1987/budget/actions/runs/40247016090), limited
to `e2e/expected.spec.ts`, passed all 15 tests in 36.5 seconds. Independent review
rejected its one changed mobile image because uncontrolled scroll clipped the
heading. The additive framing correction at `d717b640` is independently CLEAR;
its targeted desktop/mobile check passed five cases (three setup) in 30.6 seconds,
and scoped ESLint passed. Windows does not compare Linux baseline pixels. The
corrected Linux regeneration
[40247452561](https://github.com/Grabman1987/budget/actions/runs/40247452561) passed
15 tests in 37.2 seconds without a failure/retry result. Its one corrected mobile
image is independently CLEAR at merge `5d5f2abb`: title and amount are fully
visible at page top. The workflow's tolerant exit alone is not used as proof.

The seven images, seven runtime receipts, revision qualifications and all 45
manifest hashes were independently reviewed CLEAR at `1f93fa7a`, including hash
comparisons against immutable Git blobs. Main `7b77a574` (#770's daily-step chart)
was merged without conflicts at `0958d43d`; payment source and tests are unchanged.

Final required CI, remaining browser acceptance and verified publication are still
pending. Migration49 has not been applied to production. #607 remains open.
