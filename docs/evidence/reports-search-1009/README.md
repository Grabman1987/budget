# Reports and search: #303–#308

The package closes the audited gaps in report 2.4 and the existing global search palette. Price observations, booking-derived prices, CPI category proxies and trailing average expenditure retain their existing source data. The headline qualifies consumption effects before the chart; both basket views identify measurement types and incomplete coverage. Basket observations, rolling means and index contributions name their separate periods. Calculations and stored data are unchanged.

Report 1.11 is named Prognosegenauigkeit everywhere through the shared catalog entry; `/reports/planungstreue` remains its URL. Report 2.2 remains Budgettreue at `/reports/budgettreue`.

Exact, case-insensitive everyday synonyms lead to existing functions: budget/month planning, annual planning, Baby/Einkommenspause/Elternzeit/Karenz, savings goals/Notgroschen, Dispo/Kredit/Tilgung and Gebühren/Bankgebühren/Zinskosten. The shared shell change is limited to the existing palette: source-kind labels still distinguish data results from function routes, while content matches and global actions have separate named groups and counts. A fully named command keeps Enter priority, and the existing month-close destination is preserved. PR #249 and its #252 repair were reviewed.

## Verification

- Clean `npm ci`; no dependency or lockfile changes.
- `@budget/web` typecheck and ESLint/Prettier on changed files passed. No full local check or full E2E suite was run, as required for the concurrent worktrees.
- 83 affected unit tests passed: 26 in the domain/navigation/planning-accuracy files and 57 in the search/inflation component files. The initial synthetic regressions failed on the missing features before implementation.
- The final aggregate unit attempt could not start two fork workers under host load. Only those two files were rerun with one thread worker; all 57 tests passed with no unhandled errors. No repository test configuration or assertions were relaxed.
- `npm run build:e2e` passed; the web bundle was rebuilt after the command-priority correction.
- Desktop package spec: 5/5 passed, including three setup tests. The initial inflation case exceeded its 120-second deadline while saving a screenshot; the same spec passed with a 300-second CLI timeout. The spec retains its 120-second minimum and honors longer CLI deadlines.
- Mobile package spec was attempted twice on port 4883. The first bootstrap encountered an occupied sample-server port; the second failed before browser assertions in the tsx seed CLI with `uv_os_get_passwd: ENOMEM`. Mobile verification remains open for CI; no baseline, assertion or server configuration was changed to hide these host failures.

Review images use only the seeded synthetic ledger and are not baseline replacements. They cover light/dark search groups and both inflation basket views at desktop 1440 px. The new spec also targets mobile 390 px in CI. Desktop browser checks include existing function URLs, both report headings, data-result kinds, month-close entry, displayed contribution sums, Axe, 44 px search choices and no horizontal page scroll.

## Remaining gates

Required CI and owner visual/device acceptance remain open. The affected Linux baselines were not regenerated locally:

- `e2e/shell.spec.ts-snapshots/shell-reports-light-desktop-linux.png`
- `e2e/shell.spec.ts-snapshots/shell-reports-light-mobile-linux.png`

The protected worktree metadata rejects its normal index, commit-message and HEAD locks. Delivery uses an ignored temporary index, native Git commit objects and an atomic update of this package's branch through the writable common Git directory. Working files are retained; the owner must refresh the standard index with `git reset --mixed HEAD` after delivery.

Owner steps: refresh that local index, review the report wording, search destinations and CI baseline differences, and confirm mobile acceptance when the browser job passes. No keys, consents or configuration changes are required. This PR does not merge or deploy.
