# Ausgabenanalyse pilot (#554)

Private source package based on checked live main `9d41432cbaeff2dd7937976af666cbf8b4d0b662`. Issue554 and the16October owner decisions in parent488 govern. Parent488, Explorer heatmap template517, redirects487 and saved-view628 are outside this package. No writer, lock, audit, Undo, FX engine or production data is changed.

The historical28c5a212 checkpoint object is unavailable. The mixed slot-c checkout was inspected read-only. Only the full signed breakdown/stable-ID metadata and exact-day prior projection from its two spending source files, and the report presentation/CSS, were selectively adapted. No mixed branch, saved-view entry, redirect, chart package or unrelated report was transplanted. The shared live553 ReportAnswer is reused; no second sentence formatter is introduced.

## Read and presentation contract

- Existing analysis rows/moves/month comparison/heatmap fields retain their old meanings. New breakdown contains EVERY Bedarf/Wunsch category, including negative refunds, zero-current categories and rows beyond the largest six moves; groups use category-group IDs, never nonunique labels. Zukunft remains excluded from consumption. Signed child/group totals are checked against the canonical consumption figure before rendering.
- The answer and bar comparison use an additive exact inclusive prior-day window, projected through existing overviewData/overviewMonthlyFigures/sumOverviewMonths classification. A fully covered empty prior is zero; unavailable history stays null. Existing monthly previousWindow callers/fields remain untouched. Budget-account currency guards and canonical report-table source rules remain unchanged; no FX rate is guessed.
- Group/category amount links use canonical classified category-spending contributions with the same inclusive dates. New bounded categoryGroupId read filter restricts Bedarf/Wunsch members and intersects an optional category filter; complete-filter contribution totals survive pagination. Cash booking values are never rewritten. Existing #594 native/dated-EUR summaries, pending handling and CSV transport remain intact.
- The heatmap handoff sets an explicit opt-in exakt flag plus the selected month window. Only that path shows the complete signed categories and selected window. Existing625 heatmap default remains positive rows over its established12-month span; other templates, saved queries and CSV remain unchanged. Current partial-month facts retain the same source asOf cutoff.
- Main group bars expand to categories and have a prior tick, signed delta, named chart summary, existing tooltips and a table alternative. Further02–04 sections default collapsed through an optional default on the existing persisted-section helper; existing callers retain their default. Shared header/period control552 and answer553 remain. Token colors/type/lines and privacy formatting are reused.

## Test-file reasons

- `packages/db/src/repos/spending-pilot-554.test.ts`: independently expected current2222, group2777/refund−555 and exact17-day prior1500 (Aug15..31; Aug14 excluded), off-page group contributions, zero and duplicate-name group IDs, Zukunft/future-date exclusion, exact Explorer category/source parity and preserved12-month default; missing prior remains null.
- `apps/server/src/api/spending-pilot-554.test.ts`: real split booking with8888 consumption and1113 Zukunft, inferred1234 refund, API7654 across paginated rows and stable group filter, bounded invalid ID400; exact source/split/audit snapshots unchanged by all reads.
- `apps/web/src/reports/spending-pilot-554.test.ts`: seven positive rows sum2800 plus refund−555/zero gives2245; duplicate labels remain two groups, every child retained, mismatched canonical total rejected. No top-six reconstruction.
- `e2e/issue-554-spending-pilot.spec.ts`: new isolated synthetic real-ledger case, lead/sentence/group/category literal2245, prior700/delta1545, seven-category expansion, zero/refund, persisted section choice, table/privacy, matching group booking total2800 and exact-window Explorer negative/zero rows/reload; desktop1440×900 compact-first/two-screen checks, Chromium390/WebKit both themes, Axe, actual physical viewport no-overflow,44px controls and real center hits. Bounded viewport PNGs, unforced clicks, no timeout/retry/skip changes.
- `e2e/spending-analysis-report.spec.ts`: technical adaptation of the existing sample scenario to new heading/period placement, collapsed retained class facts, grouped category links and relocated same-period Explorer heatmap. All original consumption tolerances, reference arithmetic, refund deductions, class-percent sum100,12-month/14-column heatmap and drill dates remain unchanged. The unavailable-prior assertion retains its meaning with the new explicit coverage label. Independent review must inspect this sole existing-test edit.

## Verification status

Literal tests were authored before their dependent source changes. Owner RAM constraint forbids local Node/npm/build/tests/browser/lint/formatter; no runtime RED/GREEN is claimed. Git diff checks only. No source push, PR, Cloud proof, screenshots or publication yet. Source freezes for capable independent HIGH full financial/read/security and test review before one bounded scoped Cloud proof. Existing protected calculation/write/lock/audit/Undo oracles remain unchanged; because no write is touched, no new write/Undo path exists to prove. Final mandatory exact-head static/full CI and coordinator canonical integration/release remain required.

## First focused proof and technical privacy-control correction

Run `40519355282` on reviewed source `a9442450` passed scoped ESLint, CSS token scale, full typecheck, build and all106 tests across10 unit files. Browser results were7 first-attempt passes (setup plus existing sample compatibility) and3 new-case failures at the privacy control; later group-drill/Explorer assertions were not reached and remain unproven. Prior to that stop, the new literal group/category/prior, compact geometry, both-theme Axe/phone44px/nooverflow/hit checks and expanded table assertions passed. Retained synthetic desktop-light and390-dark viewport PNGs were inspected. No baseline was generated.

Desktop error DOM shows the actual shared button still named “Beträge verbergen” with aria-pressed=true, and the lead, sentence, chart/table and links masked. The test wrongly waited for a different “Beträge zeigen” name after its successful hide assertions. Phone DOM instead shows the profile menu closed; its privacy button is inside that existing disclosure, so the original test never invoked privacy. Shared PrivacyButton intentionally uses one constant accessible label with aria-pressed state in every viewport. This is a test-control setup issue; no report masking or production behavior changed.

Only new `issue-554-spending-pilot.spec.ts` adapts this flow: on phones open/close the actual profile summary, use the existing constant accessible button name, and assert aria-pressed before/after each real unforced toggle. The exact hidden-money assertions remain, and exact22.45/28.00 figures are explicitly rechecked after unmasking before the existing drill/Explorer sequence. No catch, forced action, timeout/retry/skip or softened financial oracle is introduced. This technical delta requires independent HIGH review and a narrow three-profile proof reaching the full remaining sequence; the unchanged106 unit passes and old compatibility cases need not be repeated.

The entire retained formatter artifact `12741687002` patch (40920 bytes,10 paths within the reviewed20-path package) was hash/allowlist/apply-check verified on clean a944 and applied mechanically as `2c389d27`. SHA256 `7573E140F0FBFE667760690F71F1CBA25ADC23E22AD01DAA14DE47F0805295B6`. Every token diff was inspected: layout/spacing, trailing commas, equivalent parentheses and SQL-string quote escaping only, preserving all literals/actions/oracles. No local formatter was run. Independent mechanical-delta review remains required; the workflow's initial Prettier check was red, so it is not a complete static-green claim.


## PR795 first full-CI verdict regression repair (private)

Exact58d PR795 full CI40532138750 exposed the unchanged verdicts.spec.ts
Fazit: Ausgaben/Plan regression: #554's PageFrame rewrite dropped its prior
verdict prop. Restore the EXACT canonical prop from checked-main1ad's
spending-analysis-report.tsx: data && !query.isError, reportId=report.id,
period=`${data.from}..${data.to}`, metric label Konsum/value
 data.consumptionCents/unit money, else undefined. Current data gating and
canonical report-period source are unchanged. No new formula, inferred metric,
verdict text, writer or financial semantics. All old verdict assertions remain
untouched and serve as the existing regression check; runtime is not yet proven.

The observed old category-trend/report-polish heatmap failures are a separate
capability review. No heatmap/source/test/baseline/timeouts are changed in this
repair, pending coordinator/HIGH recommendation and complete old CI failure
collection. No local Node/build/test/browser/lint/formatter, remote VM, public
push or full retry. Independent HIGH exact-delta review precedes focused proof.


## Relocated old heatmap consumers (private technical adapters)

Independent HIGH source diagnosis approved following the real04 Auswertung
handoff, rather than restoring a second heatmap into the compact pilot. Only
category-trend.spec.ts's two old Ausgaben heatmap portions and report-polish's
one Ausgaben contrast matrix entry change; the first category-trend case, new554
full case, old verdict tests and other two contrast routes remain unchanged.

- category-trend.spec.ts: genuinely expand the existing section only if collapsed,
  click its real In Auswertung öffnen link, require template-heatmap and exakt=true.
  Retain visible private euro text and masked aria-label on the actual per-month
  button, normalizing ONLY its known decorative up/down arrow. For exact drill,
  keep the report's first category ID, address the matching cat:id row/month cell,
  derive that calendar month's bounds and request the SAME canonical classified
  bookings API. Exact normalized cell cents equal the API (not a tolerance).
  Preserve44px width/height and both-theme Axe/no-overflow/screenshots via the
  original inspectReport. Click the real cell, assert BOTH displayed cell value
  and inline sourceSum exactly equal that same API amount, with no mismatch alert.
  Then return to the original1M report and use the SAME category's real amount
  link; require exact category/from/to params, real booking URL and original
  Kategorie-netto ksum cents. No arbitrary unrelated category or total substitute.
- report-polish.spec.ts: only Ausgaben now follows that genuine same-period
  handoff and tests actual template td[data-heat=bad/good] cells. The existing
  composed-background/text contrast calculation, minimum4.5 in BOTH themes,
  changed-report Axe/no-overflow/screenshots and Jahresansicht/Prendite entries
  remain unchanged. The new table uses original Explorer44px buttons/token heat.

Source evidence: ExplorerTemplates renders data-template-row=cat:id and the
YYYY-MM data-template-column button, canonical explorerTemplateSources and
sourceSum; its displayed cell/source reconciliation is tested in addition to
retaining the original filtered-bookings sum. This does not implement517 or
change a financial/read/write formula. No financial/aria/privacy/contrast oracle,
timeout/retry/skip/baseline is weakened. Runtime remains unproven until exact-HIGH
review and bounded first-attempt proof after old CI failure collection completes.
No local heavy commands, public push, remote VM or full retry were performed.
