# #615 — one current Anlagebasis for Freiheit and R16

Authority: [owner clarification on #528](https://github.com/Grabman1987/budget/issues/528#issuecomment-6213592200)
and the current #507 account/security selection. The owner explicitly requires the
same selected investment basis for Freiheit, R16 and Allokation, including historical
valuations since October 2023. Historical membership is not separately versioned:
current selection applies to facts valued at their actual historical date.

## Implementation boundary

`allocationInputsAsOf` remains the authoritative resolver. Freiheit projects its
selected positions into source-account explanations rather than adding whole
investment-role account values. R16 reuses the same dated basis for today and its
existing three-month comparison. Signed cash, explicit savings/settlement selection,
security opt-outs, account-only P2P valuations, historical FX and missing-value
handling come from that existing resolver. Class slices are summed once per account.
Safe-integer checks remain; missing selected prices or FX never become zero.
The canonical resolver's former numeric reduction lost one cent for safe inputs
`MAX_SAFE_INTEGER + 2 - MAX_SAFE_INTEGER`. It now reuses the existing exact
`freedomSumCents` guard, so all consumers retain the literal 2-cent result, and an
unsafe final sum stays unavailable. This precision-only correction changes no
allocation, expense or return formula and avoids a second competing investment sum.

The rule book previews current R16 inputs without writing results or audit records.
It reuses already loaded inputs when available; if unrelated valuation gaps withhold
other previews, R16 resolves its own selected basis and existing expense facts.
Other rules and global net-worth availability retain their existing contracts.
The narrow domain adapter calls the same R16 evaluator. Its original formula body
is byte-identical: multiples, annualisation, thresholds and prior-progress conventions
are unchanged. Existing role-based public helpers remain compatible and retain
their exact-sum/cancellation guard tests.

The page states **“Kontenauswahl Stand heute · gilt auch für historische Bewertungen.”**
beside the current chart container and describes its selected Anlagebasis sources.
This does not add the historical Ist chart (#616), goal year or persisted assumptions
(#617). No stored financial row, schema, new write endpoint, auth guard, booking,
lock, allocation policy, valuation formula or undo engine is changed.

## Independent literal regressions

Only synthetic fixtures are used, at 2024-02-01 and 2023-10-31:

| Case                                                                                          | Expected cents or derived evidence                                                                       |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Selected brokerage 20,000 + selected budget-role savings 7,000 − signed settlement cash 2,000 | 25,000; excluded investment-role brokerage 30,000 stays outside                                          |
| Existing audited scope save includes that brokerage                                           | 55,000 for current and historical reads                                                                  |
| Grouped undo, then redo                                                                       | 25,000, then 55,000; money/bookings/splits and original financial audit identity unchanged               |
| Stale expected scope                                                                          | 409/conflict with no partial target/scope/audit mutation                                                 |
| Annual spend 1,200 and multiple 25                                                            | Target 30,000; R16 changes 83.3% → 183.3%, including recalculated historical rows                        |
| Selected fund 12,345 split into two classes, unpriced opted-out fund                          | 37,345 total; source brokerage 32,345; opt-out does not poison the basis                                 |
| Missing selected quote or historical FX, including future FX only                             | Unavailable total/progress/R16; original source-specific reason retained                                 |
| USD 100 holding × 1.5 EUR/USD                                                                 | 15,000 holding cents plus 25,000 cash = 40,000                                                           |
| Account-only P2P: opening 10,000; later manual value 42,000                                   | Historical total 35,000; current 67,000, not cash plus manual value twice; three-month progress 11,667bp |
| Selected USD cash lacks FX; exclude then undo exclusion                                       | Unavailable → 25,000 → unavailable, with original money unchanged                                        |

An additional literal boundary fixture proves `MAX_SAFE_INTEGER + 2 - MAX_SAFE_INTEGER`
equals exactly 2 cents for allocation, Freiheit and dated R16 inputs. The unsafe
final sum `MAX_SAFE_INTEGER + 2` stays unavailable for all three consumers.

New API tests use the real scope-save, stale-save and undo routes. Repeated current
and historical Freiheit/allocation/rule-book GETs leave `total_changes()` unchanged.
Global net worth remains the literal 154,600 cents through selection edits. Auth is
injected only for these route-wiring tests; they do not claim new auth acceptance.
The browser proof uses a real authenticated isolated synthetic ledger.

## Validation and remaining gates

- New literal repository cases reproduced five failures against the original source
  before implementation (`615-expanded-before-fix.log`).
- New repository/domain/API/DOM regressions cover the complete scope contract. The API
  verifies 25,000 → 55,000 → 25,000 current/history reads and unchanged money;
  the DOM proof verifies the adjacent note, selected sources and privacy masking.
- The additional exact-cancellation regression reproduced expected 2 / received 1
  before the canonical precision correction. After it, seven targeted files / 40
  tests passed, including unchanged Freiheit, allocation-quality, target-settings
  and portfolio-risk-policy neighbors, plus the new repository/domain/API tests.
- Unchanged financial/domain/UI neighbors passed in seven-file/57-test and
  four-file/29-test runs. These counts overlap and are not summed.
- Four changed workspaces typechecked; an initial new adapter typing error was
  corrected and domain/database typechecks rerun successfully. Focused ESLint and
  `npm run build:e2e` passed. The R16 formula-body byte comparison passed.
- Final real WebKit 27.2 execution passed five selected tests: three setup cases,
  one canonical iPhone-profile case and one explicit 1440px desktop-context case,
  with zero skipped, flaky or unexpected tests. Both contexts passed light/dark Axe,
  page-overflow, adjacent-note, 25,000-cent/source and privacy-shortcut assertions.
  An initial new test used a desktop-only privacy button in the compact phone header;
  its selector was corrected to the existing shortcut without changing product code,
  assertions, timeouts or retries. Final phone/desktop cases took 8.7/6.2 seconds.
  Captures await fonts and finite animations using the established existing
  `freedom.spec.ts` pattern; the first earlier phone-light capture caught an
  unfinished target-marker animation and was replaced after this deterministic wait.
  The desktop context explicitly disables mobile/touch emulation and uses DPR 1;
  runtime assertions confirm width 1440, fine pointer, touch 0 and pixel ratio 1.
  This is actual Linux WebKit desktop-layout evidence, not a Chromium or Windows
  substitute. Chromium desktop/mobile coverage remains a remote CI gate.
- Independent whole-diff financial review, serialized required full check, production
  build, final exact-head CI and serial live delivery remain pending. No existing
  tests were edited. This evidence does not close #615, its parent or private gates.

Detailed logs and synthetic screenshots are retained outside the repository under
`/workspace/.budget-tools/logs/615-*` and the isolated worktree's test-results folder.

## Actual synthetic screenshot evidence

| Context                         | Light                                                             | Dark                                                             |
| ------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| Desktop WebKit, explicit 1440px | [Screenshot](615/freedom-selection-desktop-webkit-1440-light.png) | [Screenshot](615/freedom-selection-desktop-webkit-1440-dark.png) |
| Canonical iPhone WebKit, 390px  | [Screenshot](615/freedom-selection-phone-webkit-390-light.png)    | [Screenshot](615/freedom-selection-phone-webkit-390-dark.png)    |

[Actual browser-profile proof](615/browser-profile-proof.json). All captures use
the frozen source tree identified by that proof and only the synthetic fixture.
The visible curve remains the existing forecast; #616 owns historical chart work.
