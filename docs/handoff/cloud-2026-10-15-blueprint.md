# Cloud continuation — Blueprint revision 04

## Owner scope and rules

Continue #491 and #499, excluding PUB1 #490. Latest priority is a complete Figma redesign retaining existing functions and restoring graph paper, parts lists and engineering identity; incorporate chat feedback and additional Figma comments when accessible. **Do not spawn new agents.** account_review, payslip_review and search_navigation are finished/frozen. Cloud only, maximum three active implementation branches, lead serial merges. Preserve data, integer cents, atomic writes, locks, undo and all existing tests. No private data/providers/names/secrets. Owner already manually corrected real salary bookings; do not change production records.

Before every merge: all eight required checks on exact head. Then main CI, actual automatic deployment, single-machine guard and public health revision/ancestry before another merge or delivery closure. A skipped deployment is not delivery. Do not close implementation issues using Figma evidence.

## Verified delivery

- PR498 booking: merge514ed362, main38711473445, deploy38713559449.
- PR500 salary/account properties: merge5cf4f5f145e4bb210ae7fcf089dc3f60a88493fa, main38723344839, deploy38725377048. Proof6190736401.
- PR502 contacts: merge501f2e8f0dec06c4bfd1d5a8faeed87256b04593, main38725948953, deploy38728003764. Proof6191133572; contacts in499 checked.
- PR501 search/sidebar: head db57c287a72b778d2009e4a5cfade961a8ad0909, merge8b9dbe556dc58af208be3ef4b21a9e165a36b6be, main38733020009, deploy38735305257. Proof6192226263;484closed,491S1 and499navigation checked.
- PR503 direct salary review: headff3249bc71ae385823a134ee1a5d01b1380f5cee, merge4841e7ebd6cd315279d4e0063fbe4b416c2a7283, main38739444195, deploy38741833899. Exact health verified. [Proof](https://github.com/Grabman1987/budget/pull/503#issuecomment-6193185170). Known codes map automatically; unknown numeric codes ask within existing five sections. Payout date precedence is explicit > PDF > sole selected expectation > null, never automatic month-end. Account/sender/expectation/receipt are atomic with audit/undo and duplicate guards. Final integration434files/3962tests, currentWebKit7/7. Original Windows Chrome pre-chooser hang remains unreproduced; chooser/drop tests are separate evidence.
- **PR504 Q2 + wealth delivered**: head6c4afaf39f1393538c16ef79772743cd414b873a, exact8PRchecks38741758625; merge74f15a77b8dfcd835b909df72c50d3bb68d7cea3. All8mainchecks38745587426 attempt3 passed. Actual automatic deploy38754242097 and single-machine guard passed. Publichealth returned exact74f15a77. [Proof](https://github.com/Grabman1987/budget/pull/504#issuecomment-6195136537). Wealth499checked. **465 remains open**: earlier report/inbox Axe tests filter serious/critical, so passing them does not prove requested zero violations of every severity. [Acceptance limit](https://github.com/Grabman1987/budget/issues/465#issuecomment-6195167986). No false Q2 closure/491checkbox.

## PR506 — merged, main delivery gate pending at checkpoint

Head `184ca700799fd29ef54a35902c86199872fa5cec`, all eight exact-head checks passed in38754322599. Rechecked exact SHA, clean merge state and preceding live74f15a77 before squash. Merge `01a10de8b251f3b3bb05d8a5df6ae534e7d0d631`. Main CI **38757276415** running at15:21UTC; unit, Windows, Docker and restore green, all three E2E shards running. **Next action: inspect all eight main checks, then actual automatic deployment and health. Do not merge another package first.**

Three harness fixes only: read layout rectangles in one browser turn; select exact full contact name; separate independently initialized portfolio overview/detail tests. Every assertion/screenshot/Axe check/30-second timeout retained. Local Node22 full check with `VITEST_MAX_WORKERS=2`434files/3962tests zero skips; currentWebKit capture12/12; available olderChromium141 diagnostic portfolio7/7 and report/capturedesktop/mobile passed. Official current-Chromium gate is green PRCI. Evidence `docs/evidence/e2e-layout-2026-10-15.md`.

First local full check with default scheduling hit unchanged register-pagination timeout; focused2/2 and final complete two-worker run passed. Old combined portfolio reproduced30s timeout locally before splitting. Initial temporaryWebKit config selected wrong executable; corrected by project name. Temporary config removed, generated screenshots copied outside repo and restored. No failed run concealed.

Branch `fix/e2e-layout-snapshots`, workspace `/workspace/work/q2`, clean/frozen after merge. Original `feat/quiet-history-inbox` frozen/merged. PR505 is an independent draft from another writer (`docs/product-foundation-2026-10-15`, head818450a7); preserve, do not merge or overwrite. PUB1 remains excluded.

## Figma — reviewable native design

File `Nv9oaV96Npql6onEofCFEi`. Desktop start194:54809, phone194:55058; rules197:1971. Original references12:2,25:3,11:21,58:3 and original pages preserved. Source pages21–29; prototype30; opposite themes31; system32.

**166 scenarios / 332 source frames**, 332 prototype screens plus two indexes;12opposite-theme comparisons;29native components. Original111pairs redesigned;55additional pairs restore omitted details. Graph-paper10/50native vectors, titleblocks, dimension chains, registration crosses, parts rows, restrained surfaces, semantic hatches, Archivo/Barlow. Plan includes all five registers and contextual inspector. Wide booking/salary dialogs; salary4desktopactionsinline, payoutdate/account/Von/expectation. Mobilefield16px,44pxcontrols. Arithmeticfieldoperatorsonly; no prohibited number keypad.

Final native check:332frames/16510textnodes, **zero text outside immediate parent, zero overlapping sibling text rectangles**. Prototype5658clicklinks+2timedtransitions, zero invalid destinations. This does not assert every visual control is functional or replace browser/Axe evidence. Representative screenshots visually reviewed: PlanD/M/theme,bookingD,salaryD/M,settingsM,expenseM,freedomD,loanM,calculatorM,annualprint,annualheatmapD/M. No exhaustive screenshot review of every frame.

All34existingreportcatalogcapabilities map to retained screens in `design/figma/revision-04/report-coverage.md`;hubstill15entries/fourgroups. AddedR32accuracy,R33paymentcalendar,R34actual36-monthtable,R35annualheatmap,R36bankcosts,R37wealthattribution. Source-derived capability mapping is not production delivery. Freedomprojection comes from existingdomain (436months/Feb2063);loancomparisonfromexistingdomain (500EURextra saves2months/32.63EUR). JSONoutputs saved. Noappformula changed.

Design branch `design/blueprint-revision-04`, workspace `/workspace/work/blueprint-review`; scripts and validation under `design/figma/revision-04/`. Earlier checkpointb8b06881 is superseded by the commit containing this updated handoff. No design PR opened; no application change on this branch. Mainprettier intentionally ignoresdesign/docs; targeted gitdiffcheck is clean. Scripts are native mutation history, not a universally idempotent installer. Large all-frame sync timed out and rolled back; small batches succeeded. Graph grids were compressed to two editable vector paths; no reference page removed.

Known design limits: inputs/calculations/filepicker simulated; montharrows visual-only (misleadingannualjump removed); cash-bank statusrule designed but code still missing. Figma tools cannot read comments. Optional text question asked, no response atcheckpoint; knownchatcomments included, unreadcomments notclaimedimplemented. Keep user-facing design status as reviewable, not final owner approval.

## Actual skills used

Pinned originals and local adapters in docs/skills.md. Ponytail84740e3: minimal reviews/exactCIgate; Impeccableabf5779: existingidentity/tokens/forms, actualCLIearlierQ2/payroll nofindings; UIUXProMax56ea9cf: actuallocal query on labels/progressive disclosure/targets; Hallmark13ac0ec: source-vs-originalcriticaldesign-systemdrift audit, then separate authorizedimplementation; DiagramDesignd97c5c7: commonzero, actualdates/gaps, scales, dimensionchains/Sankey/projectionmodeloutput. No claim that CLI scanned native Figma or that an unavailable figma-use skill was read.

## Runtime and next implementation

Node22.23.3 `/workspace/work/toolchain/node_modules/node/bin`; age `/workspace/.budget-tools/age/usr/bin`. Heavy local runs serial,4CPUquota; finalcheck `BUDGET_REQUIRE_AGE=1 VITEST_MAX_WORKERS=2 npm run check` withNode22+agePATH. CurrentWebKit2370 cache `/workspace/work/playwright-webkit-current/browsers`; `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1`. AvailableChromium141 `/workspace/work/browser-runtime/chromium-1194/chrome-linux/chrome` diagnosticonly; currentChromium156localdownload403, requiredGitHubCIprovidesit. For temporaryPWoverride use project.name==='webkit-iphone', not browserName. MAIN4860→AUTH4861/4862,SAMPLE4863. Managedgitfetch/push andGitHubconnectorwork; ghCLI401stale, neverinspectcredentials.

After506delivery gate: finish design comment follow-up when available; then remaining491/499code packages underdependencies. Cash-banknewmanualtransferstatus is specifically outstanding: cashconfirmed,bankpending,existing/importedrecordsunchanged. Entry points `apps/server/src/api/bookings.ts:198`, `schemas.ts:156`, `packages/db/src/repos/bookings.ts`TransferInput/createTransfer409/importTransfer480; read audit/undo/import semantics first. No active new agent. Manyauditpackages and449/450 remainopen; do not claim whole491complete.
