# F3 lead-decision repair evidence

Synthetic data only. Refs #1228 and #1225; PR #1253.
The lead decision supersedes the earlier conservative-R07 proposal.

## Financial contract

R07 is restored exactly to `origin/main` (4962d9c8): the household forecast includes
expected inflows. Its evaluator and `packages/fixtures/src/rules.test.ts` are
unchanged from main. The literal household low remains -10,899 cents on
29 September. No account findings enter its status, text, details or check counters.
Raw future ledger bookings enter the additive account/scenario paths only.

Kontoengpass is separate. Each payment account uses its path without expected
inflows from today through the day before its next open recurring expected receipt.
Without such a receipt, use next household payday + 30 days inclusively. Finite
schedules with only one scheduled occurrence are one-off income, even with unequal
start/end dates. They never bound the window. Salary today gives an empty window;
salary tomorrow includes today. Overdraft never covers an alert. Later lows belong
to the full-horizon table, which labels both expected-income variants. Expected
receipts today enter only the new forecast variant; the household and scenario
legacy day-zero conventions remain unchanged.

## Response compatibility proof

The three #956 direct-response digest literals and their JSON manifest remain
unchanged from main. The test removes precisely the additive top-level
`accountLiquidity` field before checking the old byte length and SHA-256. Every
pre-existing serialized field, value and ordering is therefore protected. A direct
recursive JSON comparison against the three saved synthetic main answers also
found zero changed or removed old fields, with `accountLiquidity` the sole added
field. Each old answer was first verified against its unchanged main digest. The
worker/cache test still compares the complete additive response to a direct read,
including concurrent reads and invalidation after writes from both connections.

## Focused regression cases and test-change rationale

- `packages/db/src/repos/account-liquidity.test.ts`: salary before/after debit,
  today/tomorrow, one-off income, finite one-occurrence schedule, second account
  without income, standalone future booking/scenario parity, and legacy R07
  independence. Literal cents: 1,000 - 1,500 = -500; second account
  10,000 - 10,100 = -100. The comment derives each new expectation.
- `packages/domain/src/forecast/account-liquidity.test.ts`: a recurring expected
  receipt bounds the alert but never increases the conservative table path.
- `packages/domain/src/rules/rules.test.ts`: remove the prior branch-only cases
  that redefined R07; all pre-existing main cases are retained unchanged.
- `packages/fixtures/src/rules.test.ts`: restore the exact main literal oracle.
- `apps/server/src/api/heute-positions-956.test.ts`: additive-field projection
  before the unchanged old pins; full worker/direct response comparison retained.
- `apps/web/src/reports/account-liquidity.test.tsx`: German variant labels,
  account/date/amount/help text, no warning after the safe receipt, full table low.
- `e2e/liquidity-navigation.spec.ts`: real API one-off receipt does not hide the
  warning; recurring receipt after the debit retains it with dated help; an earlier
  recurring receipt removes it while the report retains the conservative low.
- `e2e/shell.spec.ts`: explicitly assert no account warning in both existing Heute
  screenshot cases. All geometry and visual assertions are retained.

## Visual baseline scope

All Heute and rule screenshot PNGs are restored byte-for-byte from main. The
standard fixture's recurring salary arrives on 30 September, before the account's
first negative day on 3 October, so it must not add an alert to Heute.
Only the liquidity report needs new Linux baseline review for the intended account
table. Windows screenshot comparisons use the repository's existing platform skip;
no Windows image is committed and no Linux pixel comparison is claimed locally.

## Verification

- All 337 affected package/API/component test files passed: 3,673 tests passed and
  one existing expected failure. A final rerun of the three changed regression
  files passed all 48 tests. Additional Heute investment-basis and financial-term
  contract tests passed all seven cases.
- The unchanged direct #956 pins passed, as did the complete worker/cache
  comparison. Direct old/new JSON diff: zero changed/removed pre-existing fields
  in all three answers; sole addition `accountLiquidity`.
- Typecheck, ESLint and Prettier over the complete PR text/code diff, and
  `git diff --check` passed. OFF production and ON e2e builds passed.
- Every browser spec below passed on desktop and mobile with redesign ON. Each
  ran separately with `--workers=1`; no full e2e suite was run.

| Spec | Desktop | Mobile |
| --- | --- | --- |
| `issue-571-heute-kennzahlen` | passed | passed |
| `issue-575-heute-phone-viewport` | passed | passed |
| `issue-830-background-refresh` | passed | passed |
| `issue-830-design-match` | passed | passed |
| `issue-1005-mobile-heute` | passed | passed |
| `chart-inspection` | passed | passed |
| `issue-1150-report-header` | passed | passed |
| `shell` light/dark Heute screenshot cases | passed; pixel comparison skipped on Windows | passed; pixel comparison skipped on Windows |
| `liquidity-navigation` | passed | passed |
| `liquidity-report` | passed | passed |

The four existing Heute screenshot cases explicitly prove the standard fixture
has no account alert. Their main baselines are unchanged. The new account-table
captures were inspected at desktop and mobile sizes against the project design
and Impeccable profile: both variant labels, signed amounts and dates are readable;
the mobile table retains the shared scroll region. Generated Windows evidence
PNGs were discarded. Only the liquidity report needs new Linux visual baseline
review; no new Heute or rule baseline is requested.

Local independent review covered the complete financial diff and test impact;
its finite-schedule, today-income scope and scenario-source findings were corrected
and re-reviewed. No migration, writer, dependency, deployment configuration,
queue script, merge or release is part of this repair.
