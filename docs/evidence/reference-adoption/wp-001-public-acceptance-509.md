# WP-001 / #509 — public synthetic acceptance inventory

Status: **26 new focused unit tests, workspace typechecks/lint and the bounded
native WebKit walkthrough passed; fresh aggregate check, production build,
canonical Chromium CI and live acceptance remain pending**. The completion
starts at `1d0db53607e2e88aa6772ee330c21587f02b8351`, preserving the four previously
reviewed CASE-001/002 test files and their evidence. Historical green results for
that earlier slice do not validate these new tests. No product calculation,
write policy, existing test, manifest, lockfile or repository rule is changed.

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
the actual viewport images and safe browser/financial metadata linked below
were generated by the coordinator-granted run. Screenshots preserve the real
undo feedback; they are qualified captures, not unobscured register-row or
hit-test evidence.

## Executed validation and exact revision

On 2026-10-19, pinned Node **22.23.3** ran only the three NEW unit suites with
`npx --no-install vitest run` and `--maxWorkers=1`: **3 files, 26 tests passed,
6.20s, exit0**. `npm run typecheck` then `npm run lint` both exited0. CSS scale,
ESLint and Prettier passed; the existing `packages/ui/src/components/panel.tsx:208`
unused-disable warning remains. These commands tested
`1d0db53607e2e88aa6772ee330c21587f02b8351` plus the reviewed completion source
freeze `f962908bcc1ac526d11b027402bd641e419429ac03ee547b5cbb956891c27d5d`.
All ten owned files and all 3307 tracked files, HEAD and expected source status
were identical before/after each execution.

The completion was checkpointed at `78c2a0ec3cd412a1a591943f69919f9842bc346a`,
then normally merged with live Main932 to clean
`3eab6946e25ce87e4e7c18211772f61118f080ed`. Independent review verified all ten
owned blobs unchanged and every inherited Main blob/mode exact. At that exact
merged head, `npm run build:e2e` exited0, then the unmodified canonical Playwright
configuration ran **only** `e2e/issue-509-reference-assurance.spec.ts` with
`--project=webkit-iphone --workers=1`: **5/5 passed in43.8s**, comprising three
setup cases and the desktop walkthrough16.2s and phone walkthrough13.1s. These
counts are not added to the 26 unit tests. Native/build/wrapper exits were0;
all ten owned plus all3317 tracked files, HEAD and clean status stayed exact.
No product source, existing test, configuration, retry, timeout or oracle changed.

Both profiles used actual **WebKit**, not Chromium under a phone label:

| Profile | Actual runtime | Safe proof / exact original images |
| --- | --- | --- |
| Desktop1440 | 1440×900, fine pointer, no touch, DPR1 | [JSON](509/public-509-desktop1440-proof.json), [light](509/public-509-desktop1440-light.png), [dark](509/public-509-desktop1440-dark.png) |
| Phone390 | 390×844, coarse pointer, DPR3; raw maxTouchPoints0; a trusted native tap reported pointerType`touch` | [JSON](509/public-509-phone390-proof.json), [light](509/public-509-phone390-light.png), [dark](509/public-509-phone390-dark.png) |

The two safe JSONs are byte-exact copies of the physical files and attached
proofs; the four PNGs are unedited original renderer bytes. Both themes passed
strict Axe and document-width checks. Both accounts return to literal97500 and
25000 cents after grouped undo; the incomplete split was blocked before saving.
Independent review opened all four images and checked actual runtime/guards.

**Capture limit:** account975.00 and count1 are readable, but the real undo toast
covers part of the lower desktop row. On the phone, most booking details are
below or behind the fixed navigation and toast. These images do not establish
unobscured complete row contents or action hit-testing. No screenshot-only rerun,
CSS hiding, focus mutation or product fix is claimed. No exact browser raster
mechanism is inferred.

The earlier CASE-001/002 aggregate result remains historical: it predates these
26 new tests and the new browser source. A fresh age-required aggregate check,
normal production build, final-head canonical Chromium CI, controlled integration
and exact public-live checks are still required. The E2E build is not a claim
that the separate normal production build or aggregate check has run.

## Delivery and private boundaries

Independent whole-financial-diff review preceded the focused tests and actual
desktop/phone browser evidence; the normal Main merge and bounded actual images
also received independent review. The coordinator-granted fresh age-required
full check and production build remain pending. Exact revision, actual
commands/counts/exits and unchanged file hashes are recorded above for completed
steps. A failing financial
assertion must be reported before any production fix; none is authorized here.
Required exact-head CI and controlled merge/deployment/public-live verification
remain open. #509 cannot close while public acceptance remains unverified.

AC-001-04 requires honest separation of public synthetic assurance from private
owner acceptance. This package uses no private figures, exports, credentials or
production data. Private holdings comparison #355, return comparison #356 and
parallel month-end #357 remain separate and open; this public proof does not
claim Gate3/Gate4, private PP equality or owner sign-off. CASE-006/007 reuse the
approved existing portfolio convention without rewriting investment logic.
