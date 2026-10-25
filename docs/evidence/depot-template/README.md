# Depot account template — #478

Synthetic data only. Implements owner decision 9A and the 2026-10-16 page review.

## Round 2 — retained account-header behaviour

The depot branch previously bypassed the entire `AccountBody`, removing owner review
actions, dialogs and the stored review date. `AccountReview` now extracts the existing
buttons, URL state, `ReconcilePanel` and `ManualValue` without duplicating their logic.
Both headers use it; the depot also uses the existing `AccountFreshness` beside Depotwert.
The review regression includes brokerage and crypto, saving a check, its displayed date,
the direct review URL and phone touch targets. Existing manual-value/undo checks remain.

Own nonzero cash is shown separately in its native currency, including negative cash and
accounts with a separate settlement link. Zero cash adds no line. Verrechnung uses the
linked account when present and otherwise the depot's own shared register.

The only replaced existing assertion is `portfolio-trades.spec.ts`'s `account-balance =
2.284,00 €`: it now strictly asserts `depot-value = 720,00 €` and `depot-cash = Bargeld im
Depotkonto: 1.564,00 €`. Independently: (10 bought − 4 sold) × EUR 120 = EUR 720 holdings;
EUR 2,000 opening − 1,000 purchase − 10 purchase fee + 600 sale − 6 edited sale fee − 20 tax
= EUR 1,564 cash. Their sum preserves the old EUR 2,284 total. A source-booking assertion
also proves the unlinked depot's register is reachable. The derivation is in the spec.

The E2E inventory searched account types (`brokerage`/`crypto`), account URLs and account
link clicks. Only `account-review`, `portfolio-trades` and `depot-template` actually enter
these depot detail pages. Other matching fixture specs enter overview, portfolio or inbox
pages instead. Their existing assertions were not changed.

Chromium verification: `portfolio-trades` 6/6 desktop + 6/6 mobile; `depot-template` 4/4
desktop + 4/4 mobile; `account-review` 1/1 desktop + 1/1 mobile; `verdicts`'s “Fazit:
Überblick” 1/1 desktop + 1/1 mobile. The two initial extended review failures used the
wrong new test-only input label; corrected to the existing depot-specific
“Bargeld-Saldo (ohne Wertpapiere)” without changing any original assertion.

Local Windows runs used one worker and only the required main/sample servers. `tsx`
could not start the sample seeder (`os.userInfo`: ENOMEM), so a temporary esbuild bundle
ran the same seed source with `BUDGET_MIGRATIONS_DIR=packages/db/drizzle`. Production
bundles, browser projects, authentication and assertions remained the normal ones.
No full check was run in this round, as explicitly requested; CI remains the gate.

WebKit iPhone: 4/4 depot cases pass on the single rerun with local expectation timeout
30 s and action timeout 90 s. The first run had three 5 s loading timeouts (value, tab,
trade-row availability; recorded API requests returned HTTP 200) and one passing crypto
case. The first retry could not start while Windows retained the old test servers' SQLite
files; those completed-run servers were stopped before the successful rerun. No product
code, assertion or committed timeout was changed for this retry. Evidence screenshots
were refreshed in all three projects; these are captures, not screenshot baselines.

Verdict investigation: “Fazit: Überblick” visits the report group (Gesamtübersicht,
Jahresreport, Finanz-Check-Verlauf, Explorer, Kontakte-Abrechnung, Zeitraumvergleich),
never a depot account. Report sources, PageFrame, catalog and verdict spec have no diff
against `origin/main@2579390341a15411e83448cf4ad66dfdab262d92`; depot styles are scoped.
For the baseline run, all four changed existing production modules (account page,
booking cells/table and portfolio positions) were temporarily restored from that ref,
and equality was verified with `git diff --exit-code` before building. Added depot
modules were unreachable from the restored entry points. No merge or rebase occurred.
The unchanged desktop spec failed on Main too: 0/1, at the explicit 45 s verdict wait
on `/reports/finanzcheck`, while the heading/banner and loading placeholders remained.
This is a different failure from CI's null bounding box; the exact CI timing cause is
not reproduced. On the repaired branch the same overview case passed desktop/mobile
(2/2), and on the original PR head it also passed desktop (1/1). No verdict assertion
was changed. The four repaired-branch files were restored byte-for-byte from backups
before the final build and focused unit/static checks.

The restored branch's final `npm run build:e2e` passed. Focused unit verification,
`npx vitest run apps/web/src/ledger apps/server/src/api/depot-template.test.ts
--maxWorkers=1`, passed all 29 files / 203 tests (432.78 s). The runner buffered its
results until completion. A diagnostic repeat had already started when those totals
arrived; the attempted stop did not take effect, and it also passed 29 files / 203 tests
(one thread worker, verbose reporter, 230.82 s). No unit assertion was changed.

Round 2 delivery is blocked before staging: `git add` returned exit 128 because Git
cannot create the shared Git directory's `worktrees/budget-478/index.lock` (Permission
denied). Per owner instruction, changes remain uncommitted and no push was attempted;
PR #534 still points to `eade9832`. No permissions or Git history were changed.

Final static checks: `npm run typecheck` exit 0; `npm run lint` exit 0 (CSS scale,
ESLint and Prettier). ESLint reports one existing unused-disable warning in
`packages/ui/src/components/panel.tsx:208`; no errors. The forbidden router, navigation
and UI-package paths have no diff. The original Impeccable CLI engine is not available
in this local checkout; no upstream detector result is claimed. UI evidence uses the
existing design reference, rendered desktop/phone captures and browser Axe/touch checks.

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
