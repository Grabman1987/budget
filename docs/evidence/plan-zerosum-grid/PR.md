Plan month rows now show cent-exact spending status and a green two-tone bar. Rounded group bands and the table header contain group/overall selection, collapse and creation controls. Desktop inline editing and the existing assignment, cover, move, quick-assignment and undo paths remain shared.

Phone rows put the name and available amount first, followed by spending/assignment and the bar. Chips use one sticky scrolling line, and the available pill opens the existing inspector. C/G shortcuts, alternative views and multiple months remain available. The branch includes the global checkbox/select correction and the saved-order regression fix.

## Validation

Fresh web TypeScript, CSS scale and E2E build passed; 19 targeted unit tests passed. All 28 affected Playwright cases passed across desktop, Chromium phone and WebKit, covering contact rename, group/category creation, scale, pace markers, quick assignment, inspector actions, exact cents, cover, move, guards, rollover and undo.

The final compact-grid rerun passed six cases including setup. It strengthens the width guard against the real viewport and checks both touch-target dimensions, with light/dark Axe, 390px page width, phone controls at least 44px, desktop rows at most 40px and groups at most 36px. Changed test/config ESLint and Prettier checks passed. Targeted local checks use one worker under the owner's memory constraint; required final-head CI and Linux screenshot review gate delivery.

## Synthetic evidence from the integrated build

| Viewport | Light | Dark |
| --- | --- | --- |
| Desktop 1440 | [Light](https://raw.githubusercontent.com/Grabman1987/budget/feat/plan-zerosum-grid/docs/evidence/plan-zerosum-grid/desktop-light.png) | [Dark](https://raw.githubusercontent.com/Grabman1987/budget/feat/plan-zerosum-grid/docs/evidence/plan-zerosum-grid/desktop-dark.png) |
| Chromium phone 390 | [Light](https://raw.githubusercontent.com/Grabman1987/budget/feat/plan-zerosum-grid/docs/evidence/plan-zerosum-grid/mobile-light.png) | [Dark](https://raw.githubusercontent.com/Grabman1987/budget/feat/plan-zerosum-grid/docs/evidence/plan-zerosum-grid/mobile-dark.png) |
| WebKit iPhone 390 | [Light](https://raw.githubusercontent.com/Grabman1987/budget/feat/plan-zerosum-grid/docs/evidence/plan-zerosum-grid/webkit-iphone-light.png) | [Dark](https://raw.githubusercontent.com/Grabman1987/budget/feat/plan-zerosum-grid/docs/evidence/plan-zerosum-grid/webkit-iphone-dark.png) |

Physical-iPhone review can follow deployment. Z2/Z3 and the later phone action package follow separately.

Refs #448
