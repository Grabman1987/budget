# #469 visible terminology — independent source-only review

Reviewed `/workspace/impl-469-copy` at `27d2e86fe82f5f08eee298ad7631ec2df754f7b4`; product-source changes are in `d2c586aa15746b2e89a427d1963101a37ec43664` (base `d27f9a2ff042d3c565009040c701ce37141efe98`), and the checkpoint commit after that only appends the glossary. The worktree was clean. I did not author this source: my separate #469 residual-label task was in `impl-469-glossary-goals`, not the `impl-469-copy` branch reviewed here.

## Finding

**P3 — The copy substitution leaves an ungrammatical phrase.** In `apps/web/src/pages/goals-progress-report.tsx:141`, “Gespart entspricht dem verfügbaren Envelope” became “Gespart entspricht dem verfügbaren Kategorie”. The feminine noun requires a feminine article, and “verfügbare Kategorie” does not clearly name the amount being compared. Use a concrete amount noun, for example: “Gespart entspricht dem verfügbaren Betrag in der Kategorie oder dem Geldsaldo des verknüpften Kontos am Monatsende.” This is a copy-only correction; no financial behavior is implicated.

## Scope observations

The examined changes are visible labels, accessible captions, help copy, route title, and the #469 glossary. Existing route paths and identifiers remain. The allocation explanations still describe the selected portfolio universe, signed investment cash, denominators, valuation limits and non-order nature of target deviations; calculations and report data are unchanged. The “Gewinn/Verlust” replacement is emitted only beside the `marketCents` “Markteffekt” row in `apps/web/src/reports/whole-picture-report.tsx`, not for the total monthly net-worth change, so this wording does not relabel the whole balance change as investment performance.

This review covers only the copied source checkpoint, not the separately owned glossary/goals residual branch or the later cross-branch assembly called out in its handoff. No tests, checks, typecheck, build, browser or runtime validation were performed.
