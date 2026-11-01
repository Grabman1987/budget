# T7 #827 — retained closed-account disclosure

Execution: managed Cloud builder, `/workspace/budget`, branch
`feat/redesign-t7-827-display`, based on main `78f47490` (T1/S1 included).
Owner's named task start grants N1 display implementation only. Staging acceptance
remains separate. No production activation, financial correction or release.

## Implementation and scope

- `apps/web/src/ledger/closed-account-disclosure.tsx`: native accessible disclosure
  of retained closed accounts, existing overview-model net worth/closed contribution,
  per-account canonical EUR values and retained-account links. Distinct zero and
  unavailable FX/quote reasons. Detail notice includes closed depots as well as cash.
- `closed-account-disclosure.css`: dedicated styles using existing semantic colors,
  spacing, wrapping, focus and 44px targets; no motion.
- `overview-page.tsx` and `account-page.tsx`: minimal mounts. Production flag OFF
  returns null from both new components; no new query, writer or persistent state.
- `closed-account-disclosure.test.tsx`: **new** synthetic real SQLite/API regression
  tests. No existing technical test, oracle, tolerance, timeout, assertion or baseline
  was changed. Covers +900/-40 with open 10000 = authoritative current/historical
  10860 cents, closed 860 cents, zero, missing USD FX, no writes and OFF isolation.

No route, identifier or existing visible text was moved/removed, so there is no
old-value migration. No Router/Nav/Auth/Shell, shared smoke, Heute main/API/offline,
Heute dimension page, finance semantics, migration or PROGRESS.md edit.

## Heute mount proposal for Root/T3 (not applied)

In the net-worth source explanation, use its same-date canonical `AccountList`:

```tsx
import { ClosedAccountDisclosure } from '../ledger/closed-account-disclosure';
// Render after the existing net-worth source terms, when the read is available:
<ClosedAccountDisclosure accounts={accountList.accounts} asOf={accountList.asOf} />
```

Use the existing accounts read/query and its date, not a new total or current-day
read alongside historical terms. Component handles the OFF flag and empty closed
set. Root/T3 owns placement, stale/error handling and final integration verification.
Do not add it to an investment-basis sum or infer allocation membership from it.

## Local evidence

- Initial workspace typecheck passed before the new test was added. The real pre-push
  gate then caught the new test API fixture missing its required `stepUp` middleware
  (contract/fixture failure); fixed with the established test-only pass-through.
  No protected API behavior or production middleware was changed. Final gate
  status is recorded in the PR.
- `npx vitest run apps/web/src/ledger/closed-account-disclosure.test.tsx apps/web/src/ledger/overview-model.test.ts apps/web/src/ledger/tree-values.test.ts`:
  **42 tests passed in 3 files**. Existing grouping/valuation cases retained.
- Changed-file ESLint and CSS scale check: passed.
- `VITE_BUDGET_REDESIGN=1 npm run build:e2e`: passed.
- Original run: real authenticated local app, synthetic isolated SQLite and existing
  passkey test bootstrap. Only the **API source date** was pinned with
  `BUDGET_TODAY=2026-09-17`; the original browser clock was **not** pinned. The
  retained original `desktop-light-overview.png` therefore shows header 01.11.
  versus source date 17.09.2026. `mobile-dark-detail.png` is also retained from that
  unpinned-browser run. These are not evidence of a synchronized browser/API date.
  Chromium covered 1440x900 light, 390x844 dark/touch and 320x844 light/touch,
  reduced motion, Enter disclosure, signed values/zero, destination/reload,
  height >=44px, no horizontal disclosure overflow and zero mutation requests.
  The original mobile overview captures partly obscured disclosure content behind
  the fixed tabbar; that was a capture limitation, not evidence of inaccessible
  product content. The two overview images have been replaced as described below.
- WebKit was attempted but could not launch: missing libgtk-4, libgraphene,
  libharfbuzz-icu, libmanette, libhyphen and libGLESv2. Classified **infrastructure**;
  no assertions were skipped or weakened, no repeated identical attempt. Chromium
  evidence does not establish WebKit or physical-device acceptance.

## Review delta after a4bae731 (same branch/PR)

- Only product change: add `min-width: var(--touch)` to
  `.closed-account-disclosure a`. This uses the existing 44px token for fine as well
  as coarse pointers. No route, ID, visible text, protected financial oracle,
  timeout, tolerance, assertion, skip or existing test changed.
- Rebuilt with `VITE_BUDGET_REDESIGN=1 npm run build:e2e`. The focused real-browser
  harness is `work/t7-browser-reviewfix.ts`; its synthetic fixture uses account
  name **A** for the +900-cent closed account. Other literal values remain open
  10000, closed -40 and closed zero, total 10860 / closed contribution 860 cents.
- New Chromium desktop light (1440x900, `pointer:fine=true`, `pointer:coarse=false`):
  **A measures 44 x 45.75 CSS px**, with successful navigation and reload. This is
  browser geometry, not jsdom geometry. The 390x844 dark/touch and 320x844
  light/touch links also measure 44px wide and at least 44px high.
- All three delta contexts use `page.clock.setFixedTime` with
  `2026-09-17T08:30:00+02:00`, the same browser time as `e2e/sample.ts`, before
  navigation, plus server `BUDGET_TODAY=2026-09-17`. This synchronized binding applies
  to **new delta evidence only**, not to the two retained original images above.
- The existing native disclosure is scrolled to the viewport center before capture;
  no shell/product CSS was changed to accommodate a screenshot. Both the aggregate
  block and complete minus row are visible above the fixed tabbar (top 780px):
  390px dark aggregate bottom 471.3125, minus bottom 581.6875; 320px light aggregate
  bottom 467.5, minus bottom 609.0625. Element hit checks also confirm neither
  target center is covered. Signed/zero totals, keyboard opening, 44px targets,
  no horizontal disclosure overflow, retained destination/reload and zero mutation
  requests all passed without changing the original harness or its assertions.
- Visually inspected delta captures: `desktop-short-link.png` (new),
  `mobile-dark-overview.png` and `narrow-light-overview.png` (only affected images
  replaced). Each shows the disclosure readable. Machine measurements and explicit
  browser/server dates are in `reviewfix-browser-results.json`; link dimensions
  were measured before centering, and `geometry` records the centered capture.
- A first scratch-harness instrumentation attempt failed because TSX's named
  function helper was unavailable inside `page.evaluate`. Replaced only the new
  measurement helper with an inline loop; all geometry assertions were retained.
  This was a local harness failure, not CI or product failure. The successful
  focused run completed all three contexts. WebKit/system-library, physical-device,
  Owner staging and Root/T3 Heute-mount boundaries remain unchanged.
- Pre-fix CI on a4bae731 is not post-fix evidence and was not manually rerun. The
  coherent reviewfix push must run the real `.githooks` gate without skip; the PR
  reports its actual result, new head and newly triggered exact-head CI. Root
  arranges independent review of this delta before integration.

Pre-push gate, independent review and exact-head CI are reported in the PR. Owner
staging acceptance, Heute owner mount, WebKit environment evidence and physical
checks remain separate; this document does not claim Live or queue completion.
