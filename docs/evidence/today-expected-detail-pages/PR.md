Today and Expected details previously opened content side panels, and Today secondary monthly sections retained side-column placement. This package adds linkable dimension/payment pages, reuses the existing income page for Expected, separates input/confirmation dialogs and places secondary Today content at full width below the three answer cards.

Refs #316
Refs #317
Refs #328
Refs #329
Refs #341

Builds on PR #409; merge that dependency first. Existing read models, money calculations, skip/unskip APIs and audited write/undo adapters are reused. No migration or new dependency. In router.tsx only routes and their validation are added. The Expected income alias routes to the existing PlanIncomePage/IncomeBody instead of rebuilding the Plan entry.

Validation: 23 focused unit tests passed; Web typecheck, changed-file ESLint/Prettier, CSS design-scale check and E2E build passed. Selected Expected/Today browser scenarios passed on desktop and 390 px; the final payment run passed on both viewports, including explicit skip/unskip, undo, form cancellation/focus and deletion return context with undo. Axe, overflow and mobile target-size checks passed. [Delivery evidence and reviewed captures](docs/evidence/today-expected-detail-pages/README.md) record the reproduced Windows OS-metadata startup issue and ignored local test preload.

Full local check and full E2E intentionally omitted under the package-specific memory constraint; CI is the final gate. No local visual baseline regeneration: review `expected-panel-light-{desktop,mobile}-linux.png`, `expected-income-dark-{desktop,mobile}-linux.png`, `shell-heute-{light,dark}-{desktop,mobile}-linux.png` and Today captures that include expanded secondary sections.

Owner steps: review desktop/390-px navigation, forms and Linux visual baselines; integrate PR #409 first. No keys, consents or migration required. No merge or deployment.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
