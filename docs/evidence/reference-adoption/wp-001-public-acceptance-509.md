# WP-001 / #509 — public synthetic acceptance inventory

Status: **source prepared, not executed or accepted**. The completion starts at
`1d0db53607e2e88aa6772ee330c21587f02b8351`, preserving the four previously reviewed
CASE-001/002 test files and their evidence. Historical green results for that
earlier slice do not validate these new tests. No product calculation, write
policy, existing test, manifest, lockfile or repository rule is changed.

## Bounded files and independent constants

Three NEW suites share only the existing production interfaces, not an oracle
generator: `packages/domain/src/ledger/reference-cases-003-007.test.ts`,
`packages/db/src/repos/reference-cases-003-007.test.ts` and
`apps/server/src/api/reference-cases-003-007.test.ts`. Database fixtures are fresh
in-memory databases. API tests exercise real handlers; the established synthetic
signed-in gate is not new authentication evidence. Expected amounts below are
hand-derived integer cents, never values calculated by the subject under test.

| Case / public criterion | Literal oracle | Domain / repository / API source evidence |
| --- | --- | --- |
| CASE-001 / AC-001-01: account vs envelope | 4000 + 10000 − 2501 = 11499; account97499 stays unchanged when assigning | Existing `envelope.test.ts`, `ledger-rules.test.ts`; retained NEW `api/case-001.test.ts`, including real rollover and undo |
| CASE-002 cash / AC-001-01 | Cash97500; next-month carry off available0/free97500/uncovered2500; on available−2500/free100000/uncovered0 | Retained NEW domain/repository/API `case-002.test.ts`; previous bounded evidence remains separate |
| CASE-002 card / AC-001-01 | Cash100000/card−2500; carry off reserve0/credit2500, next category0; on reserve2500/credit0, next category−2500; next free100000/uncovered0 in both | NEW three suites: explicitly named default YNAB variants, both months; real expense undo at DB/API |
| CASE-003 / AC-001-01/02 | Initial card−10000/reserve10000. Purchase2000 fully funded →card−12000/reserve12000/food0/free88000; payment12000 →card0/cash88000/reserve0 | NEW three suites; payment changes no second food expense; grouped payment and expense undo at DB/API |
| CASE-003 partial funding / AC-001-01/02 | Assignfood1000; purchase2000 →food−1000/reserve11000/newcredit1000/free89000. Next month free89000/uncovered0. Payment11000 →cash89000/card−1000/reserve0 | NEW three suites; food's signed activity remains−2000 and payment undo restores both legs |
| CASE-004 / AC-001-01/02 | Ordered ABC positive334/333/333; negative−334/−333/−333; total±1000. Opposite booking restores account100000 and category activity0 | NEW three suites; invalid API sum rejected atomically; reversal undo restores99000, expense undo100000 |
| CASE-005 / AC-001-01/02 | A100000/B25000; transfer20000 →A80000/B45000, total125000, income/activity/contribution delta0; A-only externalflow−20000 | NEW three suites using actual budget classification and actual portfolio scope readers; no invented boundary selector |
| Second transfer INSERT / AC-001-02 | Failure after A was inserted leaves both accounts, bookings, splits, transfer and audit rows identical to before | NEW repository/API suites: transaction-external synthetic callback proves first insert was reached; target-B trigger aborts second insert |
| CASE-006 / public CASE-001–007 inventory | Cash20000; buy10 units / gross10000 / fee200 →cash9800, units1000000000, value10000, wealth19800; included-cash contribution0/gain−200; securities contribution10200 | NEW three suites using existing valuation/trade/portfolio functions; real trade plus linked settlement undo at DB/API |
| CASE-007 / public CASE-001–007 inventory | Gross1000−tax200−fee100 →cash700 once; unchanged position10000/wealth10700, included-cash contribution0/gain700 | Existing exact settlement700: `invest/trade-rules.test.ts:6`; NEW domain tax-basis assertions, DB/API isolated settlement/scope/undo/redo proof |
| Statement date / AC-001-03 | Opening100000 +confirmed20000−3000 →statement117000. Pending−500 and later confirmed−700 excluded; current account115800 unchanged by check | NEW API dated fixture; existing repository `ledger-api.test.ts:322,388` supplies pending/cutoff coverage |
| Locks / unresolved differences / AC-001-02/03 | Future dates rejected, locked changes rejected, no unsolicited balancing booking; explicit check undo restores eligible statuses/history | NEW API dated fixture plus existing `api.test.ts:978,1026,1054,1150` and repository `ledger-api.test.ts:430,441,479` |
| Missing debt terms / AC-001-04 | No invented payoff dates/results without calculable terms | Reuse existing `domain/src/debt/overview.test.ts:41`, API `loan-planning.test.ts:131,146`, `debts.test.ts:180`; no duplicate debt engine |

The card carry-on fixture preserves the existing explicit negative-carry policy:
the full spend moves into the reserve, while the negative food envelope carries
its obligation. Its legacy `cashOverspentCents` indicator is2500 and credit0;
no actual cash leaves the checking account and next-month uncovered cash is0.
This is not a new chronological funding algorithm or a switch to `concept`.

CASE-004 uses the existing basis-point representation of thirds: 3334/3333/3333,
not an invalid 3333+3333+3333 template or a newly invented equal-share endpoint.
The API accepts/validates explicit cent splits; domain/repository evidence also
exercises the existing signed allocator. Expected ABC amounts remain literals.

CASE-007 securities-only contribution facts use the existing after-tax withdrawal
−700. PP before-tax / PP security-IRR return-flow conversion yields−900 in EUR.
These conventions are named separately; the test never forces them to agree.

## Atomicity and undo identity

The second-leg failpoints exist only in disposable test databases. No production
path or configuration enables them. A callback outside the SQL transaction records
that the first insert actually occurred before the second-leg abort. Complete
pre/post row equality is required on the failed operation, including audit rows.

Successful grouped undo instead restores the **active financial state**. Both
transfer legs become inactive together; original audits remain and linked undo
entries are appended. Structural transfer rows and soft-deleted history must not
be erased merely to make a before/after snapshot equal. Trade undo covers the
trade and its one linked settlement; dividend redo cannot create a duplicate.

## Synthetic browser walkthrough / SPEC-001 §14

NEW `e2e/issue-509-reference-assurance.spec.ts` has independent disposable ledgers
for explicit desktop1440/fine-pointer/no-touch/DPR1 and phone390 profiles. Each
walkthrough follows the real envelope history, toggles amount privacy, proves an
incomplete split cannot save, then saves the corrected split and undoes it. A
real20000 transfer is created through the existing UI and one UI undo restores
both balances and removes both active legs. The original confirmed2500 expense
remains intact. Both themes retain strict Axe and document-width assertions;
actual viewport images and safe browser/financial metadata are produced only
when the future authorized run reaches them. No baseline or screenshot is
claimed generated or reviewed by this source-only preparation.

## Delivery and private boundaries

Independent whole-financial-diff review must precede the coordinator-granted
focused tests, actual desktop/phone browser evidence, fresh age-required full
check and production build. Exact revision, actual commands/counts/exits and
unchanged file hashes must be recorded after execution. A failing financial
assertion must be reported before any production fix; none is authorized here.
Required exact-head CI and controlled merge/deployment/public-live verification
remain open. #509 cannot close while public acceptance remains unverified.

AC-001-04 requires honest separation of public synthetic assurance from private
owner acceptance. This package uses no private figures, exports, credentials or
production data. Private holdings comparison #355, return comparison #356 and
parallel month-end #357 remain separate and open; this public proof does not
claim Gate3/Gate4, private PP equality or owner sign-off. CASE-006/007 reuse the
approved existing portfolio convention without rewriting investment logic.
