# #469 glossary / goals source — NOT VALIDATED

Source-only continuation dated 2026-10-22, based on `e7566feb0835c697531556651d213e5ef669cad4` (#514, including the unintegrated #604/#607 migration chain and completed Plan inspector source). It is independent of the root copy branch `codex/impl-469-copy` at `27d2e86fe82f5f08eee298ad7631ec2df754f7b4`, whose parent copy commit is `d2c586aa15746b2e89a427d1963101a37ec43664` on the newer Heute source `d27f9a2f`. No branch was merged or reset.

Read the actual #469 issue and owner comments, SPEC/PRODUCT/DESIGN/queue instructions, local Impeccable and Caveman profiles, Plan design surface, audit instructions, existing glossary, goal models and consumers. Owner terminology is authoritative: Zu verteilen, Zugewiesen, multi-category Verteilen / single-category zuweisen; Gespart keeps its existing context-specific formula. The implementation-only directive supersedes instructions to run checks or publish a PR.

## Implemented source

- Extend the existing single runtime glossary in `reports/term.tsx`; no duplicate glossary component or second definition map. Add canonical category/assignment/goal/planning/portfolio vocabulary and an opt-in visible ⓘ affordance with a descriptive accessible button name. Existing report call sites retain their default labels and native popover mechanism, portal placement, sizing, focus styles and 44px minimum controls. Unknown dynamic headings remain plain text.
- Reuse this glossary outside Reports in Plan's inspector/category editor and the Sparziele page. Distinguish Gesamt-/Sparzielbetrag from a category's Monatsziel; weekly intent has an explicit Wochenziel heading, progress label and pause/resume copy. Target kinds, amounts, dates, forms' request bodies and snooze writes remain unchanged.
- Apply the requested >=1 EUR savings-warning threshold only in the UI view model `budget/goals-model.ts`. Positive funding gaps below 100 cents remain exact text with a neutral `note` tone (no warning or success icon); from 100 cents they warn. Future-projection warning tone uses the exact relevant amount: remaining cents after the target date; needed monthly cents (remaining cents fallback) when no recent saving exists; otherwise the additional monthly amount. Structural target conflicts continue to warn regardless of amount. Completed/reached/on-track states, exact figures, domain status, forecast/funding math, summary comparison, action eligibility, writer/CAS/locks/audit/Undo and every actual category-overspending warning are unchanged. No cent rounding, tolerance or financial oracle was added.

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
- `docs/handoff/implementation-469-glossary-goals/NOT-VALIDATED.md`

## Copy-package reconciliation

The separate root copy checkpoint changes visible Envelope/Pace/Plan-Rest/portfolio/contact language and appends the PRODUCT glossary; it does not implement this warning threshold or the global glossary affordances. Apply its display hunks onto the assembled newer functional files, rather than replacing Plan/#604/#609/Heute bodies. Its `goals-panel.tsx` change is Envelope → Kategorie; this branch already inherits Kategorie from the newer goal source, so retain it alongside the new Sparzielbetrag/Monatsziel strings. Root copy also touches `pages/goals-progress-report.tsx`; retain those text hunks alongside this branch's explicit neutral-note/no-success-icon handling in `GoalStatus`. Root copy does not change `reports/term.tsx`, `goals-model.ts`, `category-panel.tsx`, `plan-inspector.tsx` or `target-snooze.tsx`. The global glossary additions should remain in the existing Term map when reconciling other report work. No PRODUCT history was overwritten here.

## Exact remaining #469 copy inventory

These are source locations requiring later product-wide assembly/copy review, not newly demonstrated defects. They were deliberately not swept into this bounded continuation.

- Rule identities R01–R22 remain data/API identifiers. Visible dynamic code prefixes remain in `rules/rules-page.tsx` (`r.code` rule names/switch labels and `c.code` recommendations), `rules/rule-status-page.tsx` (detail title), `rules/rule-panel.tsx` (title/toast), `rules/book-rule-metric.tsx` (R17/R19/R21/R22 metric labels), and `reports/finanzcheck-report.tsx` (R07 heading, dynamic `t.code`/`item.code` history/result rows). Keep route IDs and source identity; move visible codes to help/detail per owner direction in that future copy pass.
- Literal visible codes remain in `reports/contracts-report.tsx` (R10), `reports/savings-report.tsx` (R01/R03/R17 including chart copy), `reports/liquidity-report.tsx` (R07/R02), `wealth/allocation-section.tsx` (R14/R15 explanations/proposal titles and R13 threshold text), and `pages/portfolio-allocation-report.tsx` (R15). Rev. headings remain in `reports/onepager-report.tsx`, `reports/finanzcheck-report.tsx` and `wealth/allocation-section.tsx`.
- The sentence bank is `packages/domain/src/reports/verdict-templates.ts`, rendered by `reports/verdict-line.tsx` through `reportVerdict`. Stable bank IDs are `record-high`, `record-low`, `streak-savings`, `streak-budget`, `streak-wealth`, `comparison-up`, `comparison-down`, `threshold-wealth`, `threshold-emergency`, `debt-down`, `market-up`, `market-down`, `effort`, `rule-bad`, `rule-warn`, `rule-ok`, `milestone`, `category-streak`, `equivalent`, `negative`, `summary`, `unavailable`, `neutral`; template IDs append their one-based row number. All banks remain pending the requested final copy review, especially ranking grammar, comparison reference articles, anthropomorphic market wording and redundant neutral/summary lines. Preserve winner selection, placeholders, parity banks, stable IDs and financial comparisons; no template or comparison oracle was changed here.
- Other baseline-only wording (Kontoblatt, visible Envelope, portfolio denominator/gap, für uns/gegen uns) is already addressed by the separate root copy package where listed in its manifest, not reproduced here. Theme segmentation and Portfolio-Auswertung belong to the separately preserved settings/navigation package. Newer Heute/Plan/report work must retain its functional source when applying those labels. The whole #469 epic is not complete.

## Remaining gates / push

No tests, test edits, checks, typecheck, formatter, build, browser, screenshots, Axe, migration execution, CI dispatch, PR, merge or deployment. No packages installed or copied. No current independent source review or accessibility/desktop/390/WebKit claim. Later gates include literal threshold boundaries and conflict exceptions, exact under-one-euro remainder visibility, unchanged funding and actual overspending behavior, native popover keyboard/focus behavior, glossary scope/meaning, wrapped German labels/44px phone targets, both themes, all project checks and serial integration.

Read workflow triggers before normal feature push: CI push is main-only, recovery/register workflows PR-only, snapshots manual and deploy requires main CI/manual admission. Open-PR lookup for this new branch returned empty. No PR is authorized by this checkpoint.
