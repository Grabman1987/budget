# #781: bounded CI observation and PR reference guard

Base: checked/live main `614a2bf9e38ab086d5da0bdd3b0f3945d857606e`.
Source-only package; independent capable HIGH source review and focused proof completed. Required public exact-head CI and delivery remain pending.

## Behavior

`wait_ci` still selects the existing exact-head CI run. It now validates and pins
its run ID, head and positive attempt before watching it once. A watch error is
an observation interruption, not a terminal CI verdict. Afterwards, authoritative
reads accept only the same run/head/attempt with completed success. Known terminal
non-success conclusions retain the existing red diagnostics. Queued/in-progress
state with no conclusion permits at most 30 readbacks, 20 seconds apart, with the
existing three-attempt read retry. Malformed/unavailable status, mismatched
identity/attempt, contradictory/unknown state and exhaustion fail closed with an
observation message. No automatic workflow dispatch or CI retry is added.

Related prevention enforces the existing Refs-only rule:
`closingIssuesReferences` must be an array with length zero. A Boolean projection
from the supported GitHub CLI field must be exactly `true`; errors or unknown
output block the action. The guard runs before a possible remote branch update
and is re-read immediately before the merge mutation, catching edits during CI.
It does not infer safety from natural-language negation in the PR body.

Every existing main/head, checked-main CI, published healthy ancestor, deploy,
fresh-main/head match, hold-release, release and failure gate remains intact.
STOP/bypass/unattended-loop behavior and workflow files are unchanged.

## Prepared regression coverage

34 new literal CLI-stub cases are added to the existing mandatory
`scripts/queue/queue-glue.test.mjs`; no old assertion, timeout or skip changes.
The unchanged `vitest.config.ts` includes `scripts/queue/*.test.mjs` in normal CI.
Tests execute the real helper function declarations with the existing throw-away
fixture, normal PATH-only `gh`/`sleep` stubs and no production test/eval hook.
They never enter the real integration body or access GitHub/production.

- Ordinary watch success and transient nonzero watch with queued → running →
  success on run 42, exact head and attempt 2.
- Every known terminal non-success, unknown/contradictory/malformed state,
  changed run/head/attempt, invalid initial identity, bounded API errors and
  exactly 30 live readbacks on exhaustion. Observation errors never say CI red;
  a successful watch alone never overrides mismatched authoritative state.
- Typed-empty closing-reference projection permits the stub merge; nonempty,
  null/unknown/malformed output, duplicate output and exhausted API errors block
  it. Observation cases assert no merge, API mutation or new workflow dispatch.

Exact-source focused Cloud proof [40620237506](https://github.com/Grabman1987/budget/actions/runs/40620237506) ran all three mandatory queue test files: 165/165 first-pass, including all 34 new cases, with shell syntax, diff check, lint and discovery green. Its only red result was formatting. The exact one-file formatting patch was independently reviewed and applied without changing helper logic or test expectations. Final format remains for public exact-head static CI to verify. No frontend build or browser was part of this bounded proof.

No local Node/npm/build/test/browser/install/lint/formatter was run. No PR, merge, deploy or production setting/data change has occurred for this package.
