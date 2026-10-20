# Manual cash/bank transfer status — #585

A newly captured whole transfer between cash and a checking/savings account confirms the cash leg immediately. The bank leg starts pending. Its enabled pre-save control can explicitly confirm that leg; the cash status stays read-only and explains why. Both transfer directions use the existing paired bookings, splits, audit group and Undo/Redo.

The owner rule is recorded in [#523](https://github.com/Grabman1987/budget/issues/523#issuecomment-6213531076): “die Bargeld-Seite wird sofort bestätigt, die Bank-Seite startet vorgemerkt”. [#499](https://github.com/Grabman1987/budget/issues/499#issuecomment-6191386775) requires both directions and write/undo coverage while existing bookings retain their status. Coordinator-selected technical alternative B keeps SPEC's genuine manual bank-confirmation control.

## Scope and compatibility

- Only the manual whole-transfer POST opts into the pure cash/checking-or-savings status policy. Source-omitted operator calls, imports, split-level transfers, credit cards, edits and old pending/confirmed/reconciled rows retain their existing behavior.
- Optional `bankStatus` is appended at the end of the transfer schema without a default. Absent intent retains the exact old parsed object order, JSON and SHA-256, including common-status normalization. Replay of a saved delivery still occurs before account type/closure eligibility, and returns the original saved response.
- Explicit intent on a noneligible pair returns422 before booking, split, structural transfer, audit or delivery writes. Invalid/null/reconciled intent returns400. Changed intent on one delivery key returns409. No migration, stored status column, hash fallback or hidden follow-up PATCH is added.
- Explicit queued intent is restored before asynchronous account choices load. Unchanged queued transfers retain their original shared status/payload bytes. A same-ID remote account retype does not silently discard explicit metadata; the server can still reject it. A user account-identity change clears the prior choice.

## Independent literal money and mutation controls

Fixtures start cash50000/bank100000 and move12345 cents. Cash→bank creates−12345 confirmed/+12345 pending, full balances37655/112345 and confirmed-only37655/100000. Bank→cash creates−12345 pending/+12345 confirmed, full balances87655/62345 and confirmed-only100000/62345. Explicit bank confirmation changes its confirmed-only balance to112345 or87655 respectively. Total150000 remains unchanged.

The API tests read both actual rows/splits and one four-entry audit group, replay with zero five-table writes, Undo back to50000/100000 with no live new booking/splits, then Redo the same identities/statuses/cents. The unaudited structural transfer row intentionally survives Undo. A real SQL-trigger second-leg constraint observes the existing first leg, rejects the transfer, leaves all five tables unchanged, and permits the same delivery key afterward. Ordinary operator/import/split/credit-card and historical-status controls are preserved.

## Actual local results

Source checkpoint: `605bd6799a00c5ca4c4f5b8f1a6468b686b038ce`, direct parent LIVE Main `e020e36867fd949372b294c99fcbde22a6a77cf4`. All3471 source files/full filesystem modes, index and clean HEAD were checked before and after native validation; all12 owned source blobs equal the independently reviewed candidate. No existing test was edited.

| Stage | Actual result and qualification |
| --- | --- |
| Initial API regression | 30 collected:4 passed,25 meaningful policy/validation failures,1 separate NEW observer-fixture500. The four explicit-confirmed directions reached balances and Undo/Redo. Initial formatter-guard failure occurred before API execution and is preserved separately. |
| Focused current source | 11 files/294 cases:293 passed,1 NEW asynchronous disabled-state fixture failed before account choices loaded. All30 API cases,13 domain,11 DB and215 unchanged neighbor tests passed. |
| Corrected UI fixture | NEW RTL25/25 passed in5.52s using default `waitFor`, with no value/assertion/timeout change. Across these checkpoints all79 NEW and215 unchanged cases passed; the repeated25 are not additional unique coverage. |
| Types/static | Domain/DB types0; an OWN test-array inference produced eight server TS18048 diagnostics, fixed only by an erased two-element `as const` tuple. Server/Web types, ESLint12, Prettier12 and exact canonical discovery then all exited0. |
| Fresh browser build | `npm run build:e2e` exited0. Existing esbuild large-bundle warnings remain visible in the raw log. |
| Genuine native | Canonical WebKit5/5 first-attempt PASS,53.619470s,0 skipped/flaky/unexpected/errors:3 setup cases plus2 owned cases. Functional case17.023s and visual case17.860s stayed within unchanged30s defaults. |
| Artifact reconciliation | Native exit0, source/168compiled/full-mode/process/archive/lock guards0. Outer wrapper47 solely because the external inventory counted4 original profile JSON files plus4 reporter copies as8 originals. Separate reconciliation0 proved all four1:1 entire-byte copies; original error/exits/artifacts remain preserved. No browser rerun or source change followed. |
| Required full and normal production build | At source `605bd679` with the reviewed19-path evidence candidate frozen, `BUDGET_REQUIRE_AGE=1 VITEST_MAX_WORKERS=2 npm run check` passed548 files/4927 tests in405.77s; the separate normal `npm run build` exited0. All11 actual phase/guard/wrapper/lock exit files were0. All3477 working files,19 owned paths,12 source paths, full filesystem modes, HEAD, index, exact evidence-dirty status and the whole205490-byte incoming Roadmap prefix/own append stayed exact. This result precedes only this result-document update. |
| Delivery gates | Exact-head Chromium/Windows CI and serial deployment/health remain pending. No issue closure or LIVE claim. |

The full run used Node22.23.3 and age1.2.1 with two Vitest workers. Existing warnings were the unused panel ESLint-disable directive, jsdom `scrollTo` and large build chunks. The own-document Prettier file-info/check stage was ignored/no-op0 under the existing `.prettierignore`; it does not claim document parsing or formatting. No source, test or image changed during the full run.

The native functional case performs eight real UI transfers across checking/savings, both directions and default/explicit bank confirmation, checks actual bank/cash status and cleared/full balances, real grouped Undo and no booking PATCH. Its three-account total is independently250000. The visual case exercises keyboard toggling, readonly cash/reason,44px bank targets, dialog-scoped light/dark Axe, strict horizontal document/dialog bounds and five financial-table equality for view-only interaction.

## Current original images and profiles

- [Desktop light](cash-bank-transfer-585/cash-bank-desktop-layout-light.png) · [desktop dark](cash-bank-transfer-585/cash-bank-desktop-layout-dark.png)
- [Phone light](cash-bank-transfer-585/cash-bank-configured-profile-light.png) · [phone dark](cash-bank-transfer-585/cash-bank-configured-profile-dark.png)
- [Safe runtime/image proof](cash-bank-transfer-585/runtime-proof.json)

All four files are byte-identical original captures personally opened by the author, coordinator and independent reviewer. Genuine WebKit used a separate1440×900/fine/DPR1 desktop-layout context and configured390×664/coarse/DPR3 phone context; raw `maxTouchPoints` was0. Light captures honestly record `system` resolving light. Playwright click/focus/keyboard is not proof of observed physical/native touch. Full-page phone photographs include a sticky capture footer partly covering older More content; they do not prove an entirely unobscured form or general hit testing. The ledger-view assertion covers exactly five financial tables, not every database/auth field. No auth state, database file, trace or full private report is published here.
