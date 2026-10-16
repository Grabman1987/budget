# Depot account template — #478

Synthetic data only. Implements owner decision 9A and the 2026-10-16 page review.

The depot reads the same unsplit positions and valuation date as Portfolio. Each account's
integer-cent values are retained; the depot never recalculates holdings from formatted prices.
The additive `valuationQuote` read field exposes the shared valuation's actual quote or gross
execution-price fallback, including date and currency. Financial writes are unchanged.

`depot-template.test.ts` exercises a real SQLite fixture: 1.25 units at EUR 12.34 round to
1,543 cents; 2.5 units at EUR 4.56 give 1,140 cents, totaling 2,683 cents. A second depot's
0.75 units round to 926 cents; Portfolio totals 3,609 cents. Future quotes are excluded.
Missing prices remain unavailable, with row status and incomplete depot value.

`depot-category.test.tsx` checks actual linked trade settlements, unrelated investment
bookings, budget bookings, assigned categories and the unchanged unassigned inflow label.

Browser coverage in `e2e/depot-template.spec.ts` uses an isolated, authenticated synthetic
ledger for each test. It checks all three URL-backed tabs and reload, the existing trade edit
route and browser back, a separate settlement account's shared register, missing-price crypto,
overflow, scoped Axe in both themes and every visible depot touch target on phones.

Screenshots follow `{desktop,mobile,webkit-iphone}-{light,dark}-{bestaende,trades,verrechnung}.png`.
Desktop is 1440 × 900; mobile and iPhone are 390 px wide. These are evidence captures,
not screenshot baselines. No Windows baselines were generated. The existing baseline specs
do not snapshot depot pages; no Linux baseline refresh is required for this new spec.

## Local verification

- Initial money and category tests were observed failing before implementation.
- The first full `VITEST_MAX_WORKERS=1 npm run check` stopped at a new read-model TypeScript
  narrowing error. Explicit field guards corrected it; follow-up checks are recorded below.
- Full lint: CSS scale and formatting passed; ESLint reported zero errors and one existing
  unused-disable warning in the locked `packages/ui/src/components/panel.tsx`.
- Browser attempts encountered an occupied default port and `ENOMEM` while starting the
  default four-server harness. An ignored local config uses only the spec's isolated servers,
  one worker and the existing desktop/mobile/iPhone device definitions. It also selects this
  spec for WebKit, which the repository's normal WebKit matrix does not currently include.
- New regressions: **8/8 passed** in two files (`depot-targeted-final.log`). Existing investment
  API, investment repository and account-review regressions: **47/47 passed** in three files
  (`depot-existing-regressions.log`). The earlier positions API run also passed its six existing
  cases. No existing test was edited or weakened.
- Follow-up workspace checks corrected the read-model narrowing error. A subsequent web check
  exposed incomplete cache-fixture typings; fully typed synthetic account/trade fixtures fixed
  those, and the final web typecheck exited 0. The other workspace checks passed in the
  follow-up run. Changed-file ESLint and final E2E build exited 0.
- Final browser spec: **12/12 passed**, 3.4 minutes. Each theme and the editor/back path have
  separate cases, retaining all assertions and the 180-second limit. Earlier combined WebKit
  cases hit that limit at Axe / editor navigation under load. The final cases cover all three
  browsers, eighteen scoped Axe runs and phone touch-target checks in both themes.
- Both WebKit theme cases were repeated after clearing transient focus before screenshot
  capture: **2/2 passed**, 1.6 minutes (`depot-webkit-captures.log`). No assertions or timeout
  limits were removed; the eighteen final evidence images use this ordinary unfocused state.
- The subsequent single-worker full Vitest attempt was stopped after over twenty minutes
  without a final summary. **No full-suite pass count or green uninterrupted `npm run check`
  is claimed.** That gate remains open before publication.

Reproduce the local isolated matrix in PowerShell (the generated config stays ignored):

```powershell
New-Item -ItemType Directory -Force test-results | Out-Null
@'
import base from '../playwright.config';
import { defineConfig } from '@playwright/test';
export default defineConfig({
  ...base, outputDir: './depot-playwright', testDir: '../e2e', webServer: [],
  projects: base.projects!.filter((p) => ['desktop', 'mobile', 'webkit-iphone'].includes(p.name!))
    .map((p) => ({ ...p, testMatch: /depot-template.spec.ts/, dependencies: [] })),
});
'@ | Set-Content -Encoding utf8 test-results/depot.config.mts
$env:E2E_PORT='4560'
npx.cmd playwright test e2e/depot-template.spec.ts --config=test-results/depot.config.mts --workers=1
```

Logs are in `test-results/depot-{check,lint,tests,typecheck-final,web-typecheck,build-final,e2e-separated,targeted-final,existing-regressions,eslint-final}.log`.

## Delivery

Git refused to create the worktree's `index.lock` with permission denied. Per the task's
explicit instruction, no workaround, commit, push or PR creation was attempted afterwards.
Changes remain uncommitted. The prepared English PR body is `test-results/k2-pr.md`.
Merge, deployment and private financial reconciliation are outside this delivery.
