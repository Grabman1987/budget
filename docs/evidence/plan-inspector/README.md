# Plan inspector — #446

Package 2 restores the Plan-month inspector only. At 1180px and wider, the grid and a sticky 320px inspector share the page. Smaller viewports keep the inspector as a collapsible section below the grid. The phone action layout remains package 3.

Without selection, only Monatsüberblick starts open. The other native disclosures contain the existing 50/30/20 band, income/target comparison, budget-account details and waterfall stages. The temporary Monatsdetails block is removed. Category names select the inspector; assignment amounts retain inline editing. Escape/outside dismissal restores the overview. A handled dialog/toast Escape does not also dismiss the selection.

`EnvelopeBody`, `QuickAssignActions`, `CategoryPanel` and `useBudgetWrite` retain their existing server calls, guards and grouped undo. The inspector adds target progress, expected-payment context and the existing history URL. Browser history retains the source selection so the phone's shorter overview cannot clamp the restored scroll position. Waterfall jumps leave the multi-month layout before locating a stage. A collapsed small-screen inspector remains reopenable after resizing to desktop.

No migration, dependency, shared domain/server change or automatic booking. New styles are confined to the Plan-month inspector and its existing grid; Sparziele and Erwartet retain package 1's styling.

## Polish pass

Disclosures use the grid's chevron instead of the browser marker. Section bodies are inset, so the waterfall stages and budget-account list no longer touch the inspector edge. The selection head uses an icon close button (accessible name „Auswahl aufheben“). Target progress has a slim themed bar that turns green when funded. Inline quick values drop the redundant count and stay on one row. The small-screen fold is titled „Monatszahlen“ / „Kategorie-Details“ / „Auswahl“, so the overview title is no longer repeated. The six affected specs passed again on desktop and mobile (23 cases), and category/month captures were refreshed.

## Verification

The package-specific memory exception applies: no `npm run check` and no full E2E suite. `npm run build:e2e` ran once; web-only builds refreshed the UI after fixes. Focused checks and final browser results are recorded in [the PR body](PR.md).

| Check | Result |
| --- | --- |
| `npm run typecheck -w @budget/web` | Exit 0 |
| Changed-file ESLint / Prettier; CSS scale; `git diff --check` | Exit 0 |
| Vitest: budget-ui, plan-model, split-band, income-targets-card, plan-form-dialogs, use-category-writes | 6 files, 48 tests passed |
| E2E web/server build; final web-only refresh | Exit 0 |
| Final six changed E2E specs, desktop/mobile, one worker | 23 passed (20 functional + 3 setup), 2.1 minutes |
| Final inspector-only evidence refresh after excluding the offscreen shell skip link from the crop | 5 passed (2 functional + 3 setup), 37.1 seconds |

Final browser command:

```powershell
$env:E2E_PORT='5020'
$env:E2E_START_TIMEOUT='300000'
$env:E2E_LEDGER_PORT_OFFSET='100'
npx.cmd playwright test e2e/plan-inspector.spec.ts e2e/plan-compact-grid.spec.ts e2e/plan-views.spec.ts e2e/plan-detail-pages.spec.ts e2e/plan-ghost.spec.ts e2e/plan.spec.ts --workers=1 --project=desktop --project=mobile
```

The new synthetic-ledger browser test verifies disclosure keyboard behavior, single/multiple selection, literal assignment/quick-assign/move payloads, exact cents, undo, category edit/hide/undo, expected-payment context, desktop/tablet positioning, collapse/resize, mobile touch sizes and page overflow. Existing changed Plan specs retain cover/capped-cover, assignment guards, history quick values, redo, rollover, distribution, month navigation and route/scroll checks. Axe checks run in light/dark.

Earlier runs exposed one occupied isolated-ledger port and UI defects in handled Escape, the underfunded-chip transition, multi-month waterfall navigation, history scroll restoration and reopening a collapsed inspector after resize. Reproductions preceded the corresponding fixes. One new test also needed an unambiguous selector for the overview list. Financial expectations were retained. Port 5040 belongs to another process; `E2E_LEDGER_PORT_OFFSET=100` selects the free isolated-ledger port 5120 while the requested main port remains 5020.

Build output retains existing Zod annotation, dynamic-import and chunk-size notices. jsdom reports its unimplemented `scrollTo`; browser servers report test-environment warnings. These are not hidden or described as pristine output.

## Evidence and remaining gates

All captures contain synthetic fixtures and are evidence, not comparison baselines. No tracked Plan-month screenshot baseline exists; expected/goals/report/shell baseline layouts are unaffected. No baseline was regenerated locally.

The isolated inspector crop hides only the shell's offscreen fixed skip link during capture, because tall element screenshots can paint it inside the crop. Accessibility and functional assertions run against the unchanged page before capture.

- Desktop grid: [light](desktop-grid-light.png), [dark](desktop-grid-dark.png), [1440 × 900 fold](desktop-fold.png).
- Desktop category inspector: [light](desktop-category-light.png), [dark](desktop-category-dark.png).
- Month overview: [desktop](desktop-month.png), [tablet](tablet-month.png), [mobile](mobile-month.png).
- Mobile category inspector: [light](mobile-category-light.png), [dark](mobile-category-dark.png).
- Mobile grid: [light](mobile-grid-light.png), [dark](mobile-grid-dark.png).

Required CI, pinned Linux visual review and owner desktop/phone acceptance remain pending. No credentials, consent setup, migration or deployment steps are needed for this package. Do not merge as part of this task.
