# #781: bounded CI observation and PR reference guard

Base: checked main `4696066ebd9c14c0ae80dbbbcd338266580d7c35`; its production release is pending. Independent capable HIGH source and integration reviews and focused proofs are complete. Final public exact-head CI and delivery remain pending.

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
Tests execute the real helper function declarations with lightweight temporary
directories for the new observation cases and the unchanged Git fixture for old
cases. They use normal PATH-only `gh`/`sleep` stubs and no production test/eval hook.
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

Initial focused Cloud proof [40620237506](https://github.com/Grabman1987/budget/actions/runs/40620237506) ran all three mandatory queue test files: 165/165 first-pass, including all 34 new cases, with shell syntax, diff check, lint and discovery green. Its only red result was formatting; the reviewed mechanical patch was applied. The first public PR CI attempt and its failed-job rerun then failed the unchanged Windows PDF intake case at its existing 20-second worker cap. Those attempts remain red. The new observation fixtures were made lighter without changing any of the 34 cases or the old 40 cases. Focused Windows shard proof [40629108854](https://github.com/Grabman1987/budget/actions/runs/40629108854) passed 2961 tests, including all 74 queue cases and the protected PDF gross-amount assertion in 3.662 seconds. This measured pass supports the fixture change; it does not establish exclusive causality for the prior failures or resolve the separate recurring #783 issue.

The next exact-head public [CI40631290618](https://github.com/Grabman1987/budget/actions/runs/40631290618) passed Windows, static checks and eleven browser shards but failed the old WebKit Plan journey at its fixed 30-second case limit. Retained traces show the expected assignments and Undo states; the final polls started less than 170 milliseconds before that deadline. No incorrect amount, rejected write or Undo failure was observed. The one long #592 browser case was split into two independently seeded cases: five literal assignment/Undo paths with post-write reload and baseline, then themes, Axe, geometry, privacy and selected assignment/Undo. The existing #593 case, product code, timeout, retries, skips and money oracles are unchanged. Independent whole-assertion review is recorded in `private/781-plan-split-review.md`. Focused [40635261253](https://github.com/Grabman1987/budget/actions/runs/40635261253) discovered all three cases in desktop, mobile and WebKit; all nine browser cases and three setup cases passed first attempt. Lint, typecheck, CSS, units, build and baseline guard passed. That disposable proof was red only for one formatting change in the new test, captured as a pinned patch for independent review before final source push. The required new exact-head public CI, merge and release are still pending.

The queue/Windows proofs did not exercise a frontend browser; the separate focused Plan proof above did. None of these proofs by itself establishes production acceptance.

No local Node/npm/build/test/browser/install/lint/formatter was run. [PR807](https://github.com/Grabman1987/budget/pull/807) is open; no merge, deploy or production setting/data change has occurred for this package.
