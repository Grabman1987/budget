# Research review and limitations

Research baseline `01a10de8b251f3b3bb05d8a5df6ae534e7d0d631`, date 2026-10-15. Documentation-only local branch. [Plan/progress](README.md), [source manifest](source-manifest.json), [matrix](../../product/feature-matrix/README.md), [specifications](../../product/specs/README.md), [roadmap](../../product/roadmap/README.md).

## Coverage and evidence counts

| Product | Canonical records | Evidence boundary |
| --- | --- | --- |
| YNAB | 99 | 95 documented, four observed control/display rows; ten authenticated generic read-only observation records |
| Toolkit | 116 | 107 option definitions plus nine report subfunctions; all source-confirmed; defaults/variants/hidden controls retained |
| Actual | 93 | 72 source-confirmed, 21 documented; disposable demo startup only, no loaded budget execution |
| Portfolio Performance | 84 | Pinned source/manual study, including one explicit evidence-boundary metadata row; no desktop/private file execution |
| Total | 392 | Records are not a count of independent new functions or runtime-verified parity |

All records map once to 24 capabilities. Final disposition counts are recorded by the validation result below. These are qualitative decisions about the inspected baseline and relevant variants, not a completeness percentage. Eleven specifications have all 15 requested fields; 14 packages link their acceptance criteria, dependencies and effort ranges.

## Checks performed

- Canonical CSV schema, unique IDs, nonempty source/evidence fields and allowed evidence/disposition values checked.
- Exact matrix/inventory membership, actual Budget evidence file existence and cross-reference/package/acceptance links checked by [validate-research.py](validate-research.py).
- Primary GitHub URLs resolve to 246 files at the pinned source commits; specified primary line ranges fit those files. The remaining 146 primary URLs are live official documentation. This path check does not prove that every source sentence fully supports every analyst conclusion; lead review and the independent review address semantics.
- A second check resolves 43 pinned Markdown source links and 42 line ranges, including split noncontiguous GitHub anchors; referenced concrete paths resolve in Budget or the explicitly pinned upstream checkout.
- Lead read every agent contribution and corrected source/schema/semantic defects before integration. A four-product scope gate was closed before moving to the next product.
- Calendar arithmetic independently confirms four Fridays in April 2026 and five in May; synthetic formulas/cases distinguish timing and denominators rather than asserting false cross-product equality.

No upstream build/test suite or Budget product test suite is claimed run by this research. The added Python validator only reads documentation and has no financial/external side effects. Repository Prettier deliberately ignores documentation; the custom structural/source/link checks and Git whitespace check are the applicable research verification.

## Lead repairs already incorporated

| Finding | Resolution |
| --- | --- |
| CSV commas/combined evidence labels and overlong Actual line ranges | Canonical DictWriter output, one evidence status per row, valid primary source and corrected line ranges |
| Preliminary Toolkit default-list interpretation | Per-setting defaults retained; package warning allowlist is not an override; hidden/system/deprecation distinctions corrected |
| PP SecurityIndex could be mistaken for held-security performance | Quote-only index/endpoint IRR separated from actual held-security cashflow IRR, with PP-019 added |
| Related capability was mistaken for identical source function | Corrected tracking/hold/template engines, native PP storage, plan-generated executions, transfer provenance and export/recovery distinctions |
| Read-only TSV clipboard was described as duplicate booking risk | Corrected to copying output with no financial write; CSV alternative/defer decision explicit |
| Weekly calendar example used the wrong weekday | Literal Friday dates verified; cadence stored as nullable weekly intent instead of needlessly changing SQLite target-kind CHECK |
| Bulk date edits could imply unselected counterpart changes | Protected field-specific guards required; linked transfer date changes excluded initially |
| Report CSV left format/empty/units ambiguous | Explicit bounded Explorer schema, integer cents/count, delimiter/quoting and empty metadata contract |
| Nullable transfer group alone cannot preserve FIFO dates/basis | Same-security/currency/1:1 scope and shared cross-account lineage replay specified; general corporate/tax events deferred |
| Step-up and privacy could become overbroad/hard-coded | Configuration-driven freshness retained; diagnostic privacy distinguished from authenticated financial UI/protected audit |

## Independent review

A fresh review agent read the governing instructions, integrated analyses/model/matrix, all eleven specifications and roadmap, spot-checked source versions and recalculated weekday/flow cases. The complete [independent findings and targeted recheck](independent-review.md) are retained.

**R-01, P2: ambiguous security-transfer proof gate — resolved.** SPEC-009 previously placed partial FIFO/average synthetic proof “before implementation” without assigning it to estimated work. The lead made that stage A inside WP-012's 6–12-day estimate, listed literal expected cases, assigned reviewer confirmation of AC-009-01/02 and defined its exit before persistence/API and UI/undo. Bounded design acceptance remains before package start; unknown-basis/conversion/general corporate tax events remain excluded. The reviewer rechecked the repair and reported no residual finding in that recheck.

Lead final trace audit also moved scale/quality evidence to WP-003, kept only the conditional cash-transfer variant at WP-011, deferred incomplete trade FX provenance and removed implementation promises from all deferred/not-useful rows. This prevents source-provider administration or excluded extension options from appearing as executable backlog.

## Final verification

Run `python docs/research/rea/validate-research.py` from the research checkout. The final successful run covers 392 unique records/matrix rows, 24 capabilities, 11 complete specifications, 14 packages, all referenced acceptance IDs, dependency acyclicity, actual Budget evidence paths, local Markdown links and privacy-sensitive identifier/path patterns. Exact disposition totals: 82 present, 78 partial, eight missing, 108 different, 76 not-useful and 40 deferred. Excluded alternatives have no implementation package promise. Source-path/range checks pass as described above. `git diff --cached --check` passed with no whitespace errors before the local documentation commit.

## Remaining gaps and explicit decisions

Authenticated YNAB writes, mobile variants and proprietary algorithms were not exercised. Toolkit was not installed/tested against current YNAB. Actual demo did not reach a budget in the capture window; experimental/provider/E2EE recovery was not executed. PP desktop/mobile/provider/importer variants and corrupted-file recovery were not executed. Public source tests were inspected, not run. Product coverage gates state these limits, rather than claiming exhaustive enumeration.

No private YNAB values/names/identifiers, PP owner file, provider credentials, personal screenshots or raw private exports are stored. Future private holdings/balance/return reconciliation, a full parallel month-end, physical-device behavior, provider authorization, current backup/key custody and deployment evidence remain separate gates.

Future decisions are nonblocking for this research: alternate PP timing/pre-tax mode, cross-currency spread/rounding/fee posting, unknown-basis security transfers/general corporate tax allocation, broad saved-query scope and optional runway usefulness. Existing owner defaults remain unchanged. Source code reuse requires exact file/package/dependency license provenance: Toolkit MIT, Actual root MIT/core-manifest ISC mismatch, PP EPL-1.0 and separate manual CC BY-NC-SA 4.0. No upstream implementation was copied into product code.
