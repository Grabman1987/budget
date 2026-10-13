Plan month category rows now show net spending, target shortfall and a green two-tone bar instead of class swatches/progress. Group header bands have rounded corners and gaps, selection checkboxes and inline category creation; the table header owns select-all, collapse-all and group creation. Existing colours, cent guards, audited writes and undo remain.

On phones, chips scroll in one sticky line. Rows use name/available, status/assigned and bar, with the available pill opening the existing inspector. Cover and distribution proposal controls stay on the first line. Alternative views, C/G shortcuts, desktop inline editing and multiple months remain available. The chip panels sit outside their horizontal scroller to keep disclosures visible; Escape restores their trigger focus.

Refs #448

Validation (synthetic local ledgers only):

- Web package `tsc`: exit 0. Changed TypeScript ESLint, Prettier and CSS scale checks: exit 0. `git diff --check`: clean.
- Affected Vitest files (`plan-model.test.ts`, `plan-form-dialogs.test.tsx`): **19 passed**. Spending cases cover exact cents, refunds, exhausted/empty/overspent envelopes and one-cent target shortfall; the two new tests failed before implementation.
- `npm run build:e2e`: exit 0; subsequent web-only rebuilds verified display corrections. Existing dependency annotation, mixed-import and bundle-size warnings remain.
- Changed Plan E2E specs (`plan-compact-grid`, `plan-inspector`, `plan`): **16 passed** including setup, desktop and Chromium mobile. After the final pill alignment/rounded-band polish, compact-grid rerun: **6 passed**, including desktop, Chromium mobile and WebKit iPhone.
- Desktop retains the existing stricter ≤40px row/≤36px group/fold assertions. Phone rows ≤76px, chip bar ≤56px, touch targets ≥44px, no horizontal page overflow and zero main-content Axe violations in light/dark. Literal cent totals, selection, keyboard creation/collapse, arithmetic assignment, guard refusal, cover, move, quick assignment, undo and rollover remain tested.
- E2E used `E2E_PORT=5020 E2E_START_TIMEOUT=300000 E2E_LEDGER_PORT_OFFSET=100`, one worker. The default isolated port was occupied by another job; no process from another job was stopped. No full check/full E2E suite was run, as required for this package; CI is the final gate.

Screenshots from the final compact-grid run:

| Viewport | Light | Dark |
| --- | --- | --- |
| Desktop Chromium, 1440 × 900 | [Light](desktop-light.png) | [Dark](desktop-dark.png) |
| Chromium mobile, 390 × 844 | [Light](mobile-light.png) | [Dark](mobile-dark.png) |
| WebKit iPhone, 390 CSS px (native 3× capture) | [Light](webkit-iphone-light.png) | [Dark](webkit-iphone-dark.png) |

Visual baselines were not regenerated. Review the affected Plan design references `design/screens/desktop/plan-monat.webp` and `design/screens/mobile/plan-monat.webp` against the approved Z1 override; no Playwright snapshot-baseline files changed.

Open/owner steps: wait for required CI and review the six synthetic screenshots, then check scrolling and editing on a physical iPhone. The base branch still enforces 44px dimensions on native checkbox inputs via global `base.css`; its visible large Safari checkboxes belong to the separate global correction. Z1 sizes only the label and does not override input dimensions. Z2/Z3 and the later phone action package remain separate. No migration, credentials, provider calls, deployment or merge is involved.

Delivery limitation: normal `git add` and `git commit` fail when creating the shared worktree's `index.lock` (`Permission denied`). One single-file staging attempt succeeded for `apps/web/src/budget/plan-model.ts`; normal `git restore --staged` also fails, so the index could not be cleared. No commit was created. `git push -u origin HEAD` succeeded but published only the unchanged base commit `3d164f93`. The implementation and this ready-to-use PR body remain local; repository metadata permissions must be restored before staging, committing and publishing the actual change. No ACL changes or alternate Git metadata paths were used.


🤖 Generated with [Claude Code](https://claude.com/claude-code)
