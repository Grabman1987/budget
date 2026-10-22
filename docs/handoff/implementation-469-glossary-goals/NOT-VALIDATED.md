# #469 glossary / goals source — NOT VALIDATED

Source-only continuation dated 2026-10-22, based on `e7566feb0835c697531556651d213e5ef669cad4` (#514, including the unintegrated #604/#607 migration chain and completed Plan inspector source). It is independent of the root copy branch `codex/impl-469-copy` at `27d2e86fe82f5f08eee298ad7631ec2df754f7b4`, whose parent copy commit is `d2c586aa15746b2e89a427d1963101a37ec43664` on the newer Heute source `d27f9a2f`. No branch was merged or reset.

Read the actual #469 issue and owner comments, SPEC/PRODUCT/DESIGN/queue instructions, local Impeccable and Caveman profiles, Plan design surface, audit instructions, existing glossary, goal models and consumers. Owner terminology is authoritative: Zu verteilen, Zugewiesen, multi-category Verteilen / single-category zuweisen; Gespart keeps its existing context-specific formula. The implementation-only directive supersedes instructions to run checks or publish a PR.

## Implemented source

- Extend the existing single runtime glossary in `reports/term.tsx`; no duplicate glossary component or second definition map. Add canonical category/assignment/goal/planning/portfolio vocabulary and an opt-in visible ⓘ affordance with a descriptive accessible button name. Existing report call sites retain their default labels and native popover mechanism, portal placement, sizing, focus styles and 44px minimum controls. Unknown dynamic headings remain plain text.
- Reuse this glossary outside Reports in Plan's inspector/category editor and the Sparziele page. Distinguish Gesamt-/Sparzielbetrag from a category's Monatsziel; weekly intent has an explicit Wochenziel heading, progress label and pause/resume copy. Target kinds, amounts, dates, forms' request bodies and snooze writes remain unchanged.
- Apply the requested >=1 EUR savings-warning threshold only in the UI view model `budget/goals-model.ts`. Positive funding gaps below 100 cents remain exact text with a neutral `note` tone (no warning or success icon); from 100 cents they warn. Future-projection warning tone uses the exact relevant amount: remaining cents after the target date; needed monthly cents (remaining cents fallback) when no recent saving exists; otherwise the additional monthly amount. Structural target conflicts continue to warn regardless of amount. Completed/reached/on-track states, exact figures, domain status, forecast/funding math, summary comparison, action eligibility, writer/CAS/locks/audit/Undo and every actual category-overspending warning are unchanged. No cent rounding, tolerance or financial oracle was added.
- Present rule names from the existing API rule rows or shared `RULE_DEFS` in the rule list, detail title, edit dialog, book-rule metric, finance-check history, and the bounded report references listed below. Rule codes remain in data keys, routes, DOM anchors, request bodies, and rule detail text. The static report name helper reads `RULE_DEFS`; it creates no second name map. Recommendation headings now lead with their names while their S-codes remain in smaller source text. No rule evaluation, threshold, report figure or privacy behavior was changed.
- Correct bounded sentence-bank copy in `packages/domain/src/reports/verdict-templates.ts`: ranked-month article agreement; comparison labels that can be `Vormonat`, `Vergleichszeitraum`, `vorherige 12 Monate` or `Monatsdurchschnitt`; threshold crossing wording that allows an exactly reached mark or a later recrossing; neutral market effects; incomplete-data lines that do not assume a missing comparison; and neutral lines that do not claim an unevidenced absence of change. Keep the same bank slots, tone assignments, placeholders, stable IDs, fact selection and numeric values. Rename decorative `Rev.` column headings to `Punkt` in the One-Pager, finance check and allocation proposal table; the One-Pager section becomes `Befunde des Monats`. Existing letter markers still identify rows and do not assert a revision date or event.

The requested 1/99/100-cent boundaries describe the intended source behavior; they were not executed as tests. Existing tests and snapshots were not changed. Inherited #604/#514 acceptance is not re-proven by these copy edits.

## Owned paths

- `apps/web/src/reports/term.tsx`
- `apps/web/src/budget/category-panel.tsx`
- `apps/web/src/budget/goals-model.ts`
- `apps/web/src/budget/goals-page.tsx`
- `apps/web/src/budget/goals-panel.tsx`
- `apps/web/src/budget/plan-inspector.tsx`
- `apps/web/src/budget/target-snooze.tsx`
- `apps/web/src/pages/goals-progress-report.tsx` (neutral-note icon handling only)
- `apps/web/src/rules/rules-page.tsx`, `rule-status-page.tsx`, `rule-status-content.tsx`, `rule-panel.tsx`, `book-rule-metric.tsx` and `rules-model.ts` (rule display names and static name lookup)
- `apps/web/src/reports/{finanzcheck-report,contracts-report,savings-report,liquidity-report}.tsx` (rule display names)
- `apps/web/src/wealth/allocation-section.tsx` and `apps/web/src/pages/portfolio-allocation-report.tsx` (rule display names)
- `packages/domain/src/reports/verdict-templates.ts` (bounded verdict copy)
- `apps/web/src/reports/onepager-report.tsx` (findings heading)
- `docs/handoff/implementation-469-glossary-goals/NOT-VALIDATED.md`

## Copy-package reconciliation

The separate root copy checkpoint changes visible Envelope/Pace/Plan-Rest/portfolio/contact language and appends the PRODUCT glossary; it does not implement this warning threshold or the global glossary affordances. Apply its display hunks onto the assembled newer functional files, rather than replacing Plan/#604/#609/Heute bodies. Its `goals-panel.tsx` change is Envelope → Kategorie; this branch already inherits Kategorie from the newer goal source, so retain it alongside the new Sparzielbetrag/Monatsziel strings. Root copy also touches `pages/goals-progress-report.tsx`; retain those text hunks alongside this branch's explicit neutral-note/no-success-icon handling in `GoalStatus`. Root copy does not change `reports/term.tsx`, `goals-model.ts`, `category-panel.tsx`, `plan-inspector.tsx` or `target-snooze.tsx`. The global glossary additions should remain in the existing Term map when reconciling other report work. No PRODUCT history was overwritten here.

## Exact remaining #469 copy inventory

These are source locations requiring later product-wide assembly/copy review, not newly demonstrated defects. The rule-name locations below received a bounded source-only pass; final copy and layout review remains open.

- Rule identities R01–R22 remain data/API identifiers. The prior visible code prefixes and literal report references in `rules/rules-page.tsx`, `rules/rule-status-page.tsx`, `rules/rule-panel.tsx`, `rules/book-rule-metric.tsx`, `reports/finanzcheck-report.tsx`, `reports/contracts-report.tsx`, `reports/savings-report.tsx`, `reports/liquidity-report.tsx`, `wealth/allocation-section.tsx` and `pages/portfolio-allocation-report.tsx` now show existing rule names or omit a redundant code where the rule name already appears. Codes remain in rule detail and recommendation source lines for lookup. This display-only pass has not been validated on desktop, phone, WebKit or assistive technology.
- The three named decorative `Rev.` headings are now `Punkt`; their alphabetic row markers still need product-wide design review. Other `Rev.` copy outside these bounded surfaces and visible rule codes in the One-Pager's findings column remain open for the larger assembly review.
- The sentence bank is `packages/domain/src/reports/verdict-templates.ts`, rendered by `reports/verdict-line.tsx` through `reportVerdict`. Stable bank IDs are `record-high`, `record-low`, `streak-savings`, `streak-budget`, `streak-wealth`, `comparison-up`, `comparison-down`, `threshold-wealth`, `threshold-emergency`, `debt-down`, `market-up`, `market-down`, `effort`, `rule-bad`, `rule-warn`, `rule-ok`, `milestone`, `category-streak`, `equivalent`, `negative`, `summary`, `unavailable`, `neutral`; template IDs append their one-based row number. The changed sentence slots still need actual report review in both privacy states and the 140-character selection window. Remaining bank copy includes repetitive neutral/summary sentences and context-sensitive `effort` wording; replacing `ownCents` with the owner term `Gespart` would need confirmation of every producer's calculation and is left unchanged. The #553 answer-line source and its lead figure/chart relationship were not changed.
- Other baseline-only wording (Kontoblatt, visible Envelope, portfolio denominator/gap, für uns/gegen uns) is already addressed by the separate root copy package where listed in its manifest, not reproduced here. Theme segmentation and Portfolio-Auswertung belong to the separately preserved settings/navigation package. Newer Heute/Plan/report work must retain its functional source when applying those labels. The whole #469 epic is not complete.

## Scoped rule-label continuation — NOT VALIDATED

Source-only continuation on 2026-10-22. In `apps/web/src/reports/onepager-report.tsx`, the Monats-One-Pager findings table now displays the canonical rule name via the existing `ruleName` helper for recognized `RuleCode` values. Null remains an en dash; an unknown future code is preserved as supplied instead of being dropped or guessed. Rule evaluation, finding selection/order, amounts, and identifiers in stored/API data, keys, details, and routes are unchanged.

In `apps/web/src/reports/jahresreport-page.tsx`, the findings section title and its accessible label now read `Auffälligkeiten des Jahres`, matching its findings table and empty state rather than describing findings as revisions.

The source scan found no additional user-facing `Rev.` literal in the current application UI. Internal `RevisionTriangle`/revision-table component names and design-system terminology are retained; they describe the drawing convention, not a customer-facing label. The bounded `effort` sentence wording remains unchanged because its producer semantics are context-sensitive.

No tests or test edits, checks, typechecks, builds, browser review, CI, PR, merge, deployment, screenshot or accessibility evidence were run for this continuation. These scoped text changes are **NOT VALIDATED / NOT LIVE**. Final copy, layout, mobile, keyboard, and screen-reader acceptance remains open.

## Negative “Zu verteilen” wording correction — NOT VALIDATED

At `47377c904544f3302cb55ddfc4b93b460eca2367`, the `Zu verteilen` glossary no longer explains a negative amount as necessarily caused by excess assignment. It now says that less money is currently available to distribute than is already committed, and that uncovered expenses can contribute. This is wording only: the budget calculation, amounts, allocation behavior, rule identifiers, and adjacent glossary labels are unchanged.

The exact one-file delta (`e0e39d4b0b5b04ad6966e8603d0bd91cf4b66cad..47377c904544f3302cb55ddfc4b93b460eca2367`, `apps/web/src/reports/term.tsx`) received an independent source review in `469-glossary-goals-fix-source-review.md`. The prior misleading causal claim is closed in this bounded delta; no further scoped finding was reported. This is source review only, not runtime, copy, accessibility, or product acceptance. NOT VALIDATED / NOT LIVE.

## Remaining gates / push

No tests, test edits, checks, typecheck, formatter, build, browser, screenshots, Axe, migration execution, CI dispatch, PR, merge or deployment. No whole-branch independent source review or accessibility/desktop/390/WebKit claim. Later gates include literal threshold boundaries and conflict exceptions, exact under-one-euro remainder visibility, unchanged funding and actual overspending behavior, native popover keyboard/focus behavior, glossary scope/meaning, wrapped German labels/44px phone targets, both themes, all project checks and serial integration.

Read workflow triggers before normal feature push: CI push is main-only, recovery/register workflows PR-only, snapshots manual and deploy requires main CI/manual admission. Open-PR lookup for this new branch returned empty. No PR is authorized by this checkpoint.
