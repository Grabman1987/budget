# Local follow-up to the preserved cloud handoff

The local integration owner continues the handoff at25769708. Prior WIP evidence and unapproved Linux PNGs remain preserved as historical evidence; they are not acceptance.

## Diagnosed failures and bounded changes

- Existing `e2e/goals.spec.ts`: the goal figures now live inside the visible "Beträge und Prognose erklärt" disclosure. The test opens that real disclosure before the unchanged literal2.820,11EUR, disabled-funding/conflict and Axe assertions. Desktop and mobile failed before this adaptation.
- Product `apps/web/src/budget/goals.css`: the new future-only forecast prose inherited `.col-num { white-space: nowrap }`. The preserved Linux phone PNG is514px wide for a390px viewport. A new regression against the configured viewport reproduced501px on Windows in both themes. `innerWidth` is unsuitable here because the mobile layout viewport itself expands. One scoped `white-space: normal` permits prose to wrap; amounts and financial calculations are unchanged.
- Existing create/edit/delete/Undo originally failed on Linux at the first ordinary Anlegen click:57 stable attempts were intercepted by the form itself. Both Windows scenarios passed before the fix; the exact Linux hit-test cause remains unproven without its absent trace. No speculative overlay fix, forced click or timeout change is made. The narrow Linux rerun must verify this scenario.

## Executed local checks

- Existing detail/create cases before adaptation:5 passed,2 failed (both detail cases),48.2s.
- New configured-width overflow regression before CSS fix:3 setup passed,2 theme cases failed,24.6s;501 >390 in both themes.
- Fresh build after CSS fix:PASS.
- Complete `e2e/goals.spec.ts`, desktop and mobile, one worker, unchanged no-local-retry configuration:15/15 passed in46.9s. All original financial, adoption/Undo, create/edit/delete and Axe checks retained. Windows does not compare Linux snapshot pixels; the existing helper records that limitation.

Logs and original traces are preserved outside the repository under `C:/Users/fabia/tmp/604-delivery-20261022`. Synthetic data only. Independent final review, narrow Linux regeneration/visual inspection, native acceptance and exact-head full CI remain required before integration. No live claim.
