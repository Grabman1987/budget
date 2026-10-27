# Plan parent residuals #449 / #450

Source-only package in isolated plan-header-449-450 checkout, branch codex/plan-header-449-450, immutable checked base1a190b115edbfe8879b78344f9b4ce7b6df0adaa. No changes to Reports/wealth/621 or old prepared checkouts. Requirement audit read both issue bodies and all owner comments; no broad epic rebuild.

## Requirement-level audit

#449 head/filter/mobile selection children587–590 are CLOSED and their live implementations exist: month navigation/income link/TBA/visible month close, menu/URL filters, explicit phone selection. Later16Oct decisions override original arrangement; do not restore obsolete tabs/positions/head alarms. Owner26Oct comment6419596597 identifies remaining B05 acceptance: all-target preview/application through Verteilen without forced Wasserfall view. Live startDistribute still sets viewstage and retains Fertig. The existing suggestions(rows,tba) uses shared waterfallFill; take() sends canonical assign through useBudgetWrite and grouped Undo. This package exposes those SAME operations, not a second allocator.

#450 children591–593 are LIVE. Later16Oct comment6209536493 explicitly retains Monatsüberblick and50/30/20 OPEN by default with remembered disclosure state; leave those components untouched. Sole27Oct residual is class/pace-only-in-title-tooltip: current inspector visible paragraph conflicts. Preserve exact information, amount privacy, heading name/focus and all money forms. Parent acceptance remains a requirement-level delivery decision after proofs; this source package does not close either parent.

## Bounded implementation

Separate Alle Ziele füllen menu action opens the existing SettingsFormDialog pattern and lists current existing suggestions for ALL target rows in the displayed single month, explicitly independent of selection/filter. It leaves current view/filter/selection/month span unchanged; multi-month action is unavailable with the existing single-month reason. Existing Wasserfall-Assistent/Geld verteilen still starts the stage view, inline suggestions and Fertig exactly as before.

Apply calls the SAME take(ids), assign and useBudgetWrite path; take now returns its existing write result so preview can close only after success. No domain/db/API/cent cap/FX/locking/audit/Undo algorithm is changed. Suggestions remain canonical integer-cents and reactive; cancel never writes. Synchronous ref+disabled state blocks duplicate apply, busy blocks closing, failed writes keep preview with local feedback plus existing detailed toast. Focus returns to the real Verteilen summary, not its now-hidden menu item. Native dialog/toast host/focus trap are reused. No CSS, colors/fonts, dependency or new framework added.

Selected-category h2 title contains the same CLASS_TEXT and barFor.meta previously shown by inspector-pace. Existing useAmountPrivacy makes title reactive; visible paragraph alone removed. Heading text/tabIndex/ref and all category actions/default open sections unchanged.

## Per-file tests and proof limits

- plan-model.test.ts: additive literal pre-implementation200-cent pool with100/300 needs→100/100, using original suggestions; prior calculation/guard tests unchanged.
- plan-menus.test.tsx: only technical expected menu inventory adds the new entry; every existing quickAssign/cover/assistant/keyboard/disabled oracle unchanged.
- plan-panel-592-593.test.tsx: additive selected-heading exact class/pace title, no duplicated visible paragraph, same focusability and hide/unhide private amounts.
- e2e/issue-449-450-plan-completion.spec.ts: new isolated canonical opening200/targets100+300, class view and live name filter retained; preview shows both targets even off filter, literal1.00+1.00/no write, both themes/Axe/phone44/nooverflow/bounded PNG, cancel exact no mutation/focus return, real double click yields one assignment request100+100/pool0, same view+URL and real grouped Undo to0+0/pool200.
- e2e/issue-592-593-plan-panel.spec.ts: technical visible class/pace assertion becomes the title tooltip and absence of old paragraph; adds hidden-money title assertion. Existing exact financial states, source/cover caps, Undo, focus and disclosure behavior are unchanged.

No local Node/npm/build/test/browser/lint/formatter runs are allowed under the host RAM restriction. Only git diff-check/source inspection performed; literal tests are unrun, no RED/GREEN/static/3profile/Axe/visual pass is claimed. No Cloud/feature push/PR/full/publication. Freeze for capable independent HIGH full source/financial/security and per-file test review before any future scoped proof. Source integrates onto current checked main at its publication turn; parent/all-live claims remain coordinator-owned.
