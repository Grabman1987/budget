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

- `npm run typecheck`: passed.
- `npx vitest run apps/web/src/ledger/closed-account-disclosure.test.tsx apps/web/src/ledger/overview-model.test.ts apps/web/src/ledger/tree-values.test.ts`:
  **42 tests passed in 3 files**. Existing grouping/valuation cases retained.
- Changed-file ESLint and CSS scale check: passed.
- `VITE_BUDGET_REDESIGN=1 npm run build:e2e`: passed.
- Real authenticated local app, synthetic isolated SQLite, existing passkey test
  bootstrap, pinned date 2026-09-17. Chromium: 1440x900 light, 390x844 dark/touch,
  320x844 light/touch, reduced motion. Enter opens native disclosure; signed values,
  zero, account destination and reload verified. Summary/link height >=44px;
  disclosure has no horizontal overflow; zero non-GET/HEAD API requests during
  navigation/disclosure/reload. Four representative PNGs in this directory were
  visually inspected. Existing shell fixed controls and bank-sync empty-fixture
  states are outside T7 ownership.
- WebKit was attempted but could not launch: missing libgtk-4, libgraphene,
  libharfbuzz-icu, libmanette, libhyphen and libGLESv2. Classified **infrastructure**;
  no assertions were skipped or weakened, no repeated identical attempt. Chromium
  evidence does not establish WebKit or physical-device acceptance.

Pre-push gate, independent review and exact-head CI are reported in the PR. Owner
staging acceptance, Heute owner mount, WebKit environment evidence and physical
checks remain separate; this document does not claim Live or queue completion.
