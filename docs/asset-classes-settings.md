# Asset class settings (owner directive PR4)

Baseline: local HEAD and GitHub `refs/heads/main` both `8fc3b1aae42078bdc2c4c9034f0e90032a50d400`, verified 2026-10-04. PR1 #171, PR2 #173, PR3 #177 and PR5 #169 are reused. No deployment is part of this branch.

| Finding | Current status before PR4 | Evidence | Action |
| --- | --- | --- | --- |
| Placeholder page | Still present | Route absent from `BUILT_PATHS`; generic placeholder | Real `AssetClassesSettingsPage` |
| Historical class assignment | Fixed in PR1 | `asset-exposure` repository and history regressions | Reuse dated exposure editor/API |
| Leverage in risk | Fixed in PR2 | `portfolio-risk-policy.test.ts`, central classification | Reuse |
| Shared risk settings | Fixed in PR2 | Stored R13–R15 parameters, resolver and same-date tests | Extend resolver with investment-sum tiers |
| iPhone invisible sheet | Fixed and reproduced in PR5 WebKit; real device confirmation pending | `docs/mobile-panels.md`, primitive harness | Reuse PanelHost/DetailPanel; add page-specific WebKit coverage |

The PR5 cause was a percentage-height inner box inside an intrinsic-height native dialog collapsing in WebKit. The shared auto-height sheet fix remains unchanged. A Chromium pass alone is not iPhone evidence.

PR4's actual Reports → profile → settings flow also reproduced a WebKit focus-return defect: Safari leaves focus on `<main>` when the class link is tapped, restores it on close, and the previous guard then skipped the stored opener. The shared primitive now prefers the recent connected trigger and restores it explicitly. Switching class/instrument editors retains the same dialog and original opener; if the focused editor control disappears, the persistent close button receives focus. The page regression checks focus inside each editor and return after both simple and nested close flows.

## Page and ownership

`/einstellungen/anlageklassen` owns definitions, lifecycle, dated targets, bands and instrument reassignment. The header/table use `assetClassesSettings` decorating the existing Portfolio allocation projection. Market values, signed cash, quality, shares, deviations and bands are not recalculated in the page. Desktop uses a table; phone uses stacked rows with visible field labels. Archived definitions remain listed with status. Current assignments show their effective date, complete/incomplete status and weighted exposures; instrument editing reuses the existing dated editor. Weighted replacement remains available through the PR1 API; no timeless reassignment is introduced.

Portfolio's button navigates to this same target editor. Classes, target versions and instruments use the existing URL-driven PanelHost. Closing steps Back for an in-app link; a fresh deep link is replaced. Dirty forms require explicit discard, and pending saves block Back/close. All writes offer grouped undo and recursive redo through the existing audit endpoint. Production placeholder/filler and the example-panel control are removed; `/dev/panels` remains available only in dev/e2e.

Names are trimmed, nonblank, at most 80 characters and case-insensitively unique, including archived names. Sorting is deterministic by stored position, name and ID. This migration does not normalize or rename existing definitions. Undo also checks name conflicts. Error messages are German; field errors use the shared `Field` IDs with `aria-invalid` and `aria-describedby`.

The existing PP import reuses and restores an archived definition with audit when repeating a reverted import, instead of creating a duplicate name. Its regression proves the class IDs, balances and import result remain stable. A managed zero remains visible after archive. The global mobile booking shortcut now has its own labelled navigation landmark, resolving the page's Axe region finding without changing its position or panel primitive.

## Target versions and tiers

`asset_target_version` stores a complete JSON policy, inclusive `valid_from`, optional trimmed label (80 characters)/reason (500), creation/update timestamps and audit group. It uses the existing tracked insert/update/soft-delete and savepoint patterns. Legacy `asset_class_target` rows remain untouched by migration and are read as static versions. An explicit same-day edit supersedes those rows atomically and records their snapshots, so undo restores their exact prior state. New versions do not carry forward omitted targets: omission is null/unmanaged; a stored 0 is managed and can breach. Legacy programmatic `setTargets` callers retain their previous explicit reduce-to-zero behavior unless requesting a complete snapshot; the settings API always requests one.

Each base model and each tier must sum to exactly 10000 integer basis points across managed classes. The UI displays percentages, never basis points. Standard bands use the shared R13 policy (defaults: the smaller of ±5 percentage points and ±25% of target); individual bands, including explicit ±0, override it. Resolved ranges are displayed in percent. Labels/reasons are optional; the unique date identifies a version and dates sort oldest first.

Tiers have inclusive ascending positive integer-cent upper bounds, with one final open bound, at most ten tiers. The editor starts with 10000/20000/50000 euro boundaries and an open final tier; thresholds and tier count are editable. `resolvePortfolioRiskPolicy` chooses the tier from PR3's dated investment-universe value, including negative broker cash. A value exactly on the boundary remains in the lower tier. Missing valuation supplies no resolved tier targets, rather than silently selecting a different model; PR3's incomplete-quality gate suppresses proposals. Versions without tiers behave as before. Allocation, R13, rebalancing, savings proposals and report 4.2 all use this resolver; each historical month-end selects its own tier. PR1 exposure history, weighted regions, market/gross separation and PR3 provisional quality remain intact.

An unavailable tier is labelled "Nicht ermittelbar", distinct from an unmanaged class. The stored model still has an exact 100% sum; a missing valuation does not remove its version. Loading a template over edited fields requires explicit confirmation.

## Archive and undo integrity

Archive is a soft delete. Positive current or future targets in any tier block it. Any exposure history, live compatibility assignment or deliberate investment-cash dependency blocks it, with a German explanation. Historical exposure references are retained even after reassignment. A targeted, otherwise unused class can be retired by saving a complete replacement target version and archiving it in one transaction/audit group (`archiveClassId`). Validation/dependency failure rolls back both the version and archive; no partial target universe is visible. Future target versions remain and must also permit retirement. Restore is audited. Target deletion/undo cannot reintroduce positive current/future targets for archived classes; force undo does not bypass these checks.

Report 4.2 retains archived definition names for historical target rows; retirement does not relabel them as unclassified. A literal January target followed by February retirement regression covers this lifecycle.

## API and migration

- `GET /api/asset-classes/settings`: shared allocation projection plus archived/active definitions, current assignments and exposure details.
- `GET /api/asset-classes?deleted=1`: include archived definitions; the default remains active-only.
- `POST/PATCH /api/asset-classes[/id]`: create/rename/order with German validation; `DELETE /id` archives safely; `POST /id/restore` restores.
- `GET/PUT /api/asset-classes/targets`: complete dated base model, optional `label`, `reason`, `tiers: [{upToCents, targets}]`, optional atomic `archiveClassId`; each target accepts `bandMode: standard|custom` and `bandBp`. Managed omission is null, explicit zero stays present. Existing security exposure endpoints are unchanged.
- ZIP export retains `asset_class_targets.csv` for base models and adds `asset_target_policies.csv` for metadata, band modes and complete tiers. It excludes audit events and continues to require step-up and a SQLite snapshot.

Drizzle-kit generated additive migration **0035_asset_target_versions**, based on main's 0034 snapshot. It adds only a table/index; there is no seed, reclassification, trade/price/balance update or target rewrite. SQLite backups include the table automatically. The migration regression uses a 0034 database with synthetic holdings, trades, prices, exposures and existing targets; checks every source row, market/net-worth values, FK integrity, repeated migration and restoring a pre-migration backup. Production deployment must still follow CI backup/restore gates and the owner snapshot/count/value reconciliation in the directive.

## Acceptance and evidence

- A04–A07, U02–U07/U12: `asset-classes-settings.test.ts`, domain `target-policy.test.ts`, existing invest API/undo regressions. Includes exact sums, unmanaged versus managed zero, positive current/future/tier archive guards, atomic retirement rollback, same-day legacy restoration, class create/rename/order/archive/restore undo and redo.
- Dynamic tiers: literal cent boundaries, negative investment cash, independent month-end target arrays, R13/live agreement and literal savings-rate outcomes. Existing PR1/PR2/PR3 tests remain required.
- U01–U12/page M01–M12: `e2e/asset-classes-settings.spec.ts` plus `portfolio-allocation.spec.ts` for the shared editor, dirty/template and pending-save guards, target undo/redo and retry. Light/dark Axe, desktop/mobile overflow and screenshots; page-specific spec is included in `webkit-iphone.testMatch`.
- M04 and safe-area CSS contracts remain covered by PR5 `mobile-panels.spec.ts`; page-specific tests measure sheet geometry, reachable close, focus inside/return, scroll ownership, Back/Forward, repeated reopen and landscape.

Automated WebKit is engine evidence. Owner confirmation on real Safari is still required for toolbar collapse, actual home-indicator inset, swipe/rubber-band scrolling, rotation, profile/settings navigation and frozen-backdrop checks. See the [real-device checklist](mobile-panels.md#real-device-checklist-owner-confirms-directive-section-45). No production or real-iPhone acceptance is claimed by local tests.

### Local browser evidence

`playwright test e2e/asset-classes-settings.spec.ts e2e/portfolio-allocation.spec.ts e2e/mobile-panels.spec.ts e2e/savings-plans.spec.ts --project=desktop --project=mobile --project=webkit-iphone --workers=2`: **95 passed, 42 existing intentional skips**. The new page's two tests ran in all three projects without skips, including light/dark Axe with zero violations, simple and nested focus return, viewport geometry, scroll ownership and landscape. Shared PR5 harness focus/backdrop/safe-area regressions passed. Existing primitive skips are desktop-only mobile cases and URL-trigger focus cases; they are not evidence for those flows.

Synthetic screenshots were visually inspected: [desktop light](evidence/asset-classes-pr4/desktop-light.png), [desktop dark](evidence/asset-classes-pr4/desktop-dark.png), [390px mobile light](evidence/asset-classes-pr4/mobile-light.png), [mobile dark](evidence/asset-classes-pr4/mobile-dark.png), [WebKit iPhone sheet light](evidence/asset-classes-pr4/webkit-iphone-light.png), [sheet dark](evidence/asset-classes-pr4/webkit-iphone-dark.png). Mobile page captures are full-page images; fixed navigation appears at the initial viewport's bottom.

`npm run check` passed: typecheck, ESLint/Prettier and **304 test files / 2922 tests**, with `BUDGET_REQUIRE_AGE=1` and two workers. `npm run build` passed for web and server. The last focused lifecycle/loan check passed all 28 tests. The loan test now identifies scenarios by their IDs because equal creation timestamps legitimately sort by ID; its financial expectations are unchanged.

Execution constraints: the restricted Windows runtime throws `uv_os_get_passwd` from `os.userInfo()`. An ignored process preload supplies a synthetic user only for that exact error; it is not committed and bypasses no assertions. CI uses the normal runtime. The original worktree could not write its Git index lock, so delivery uses an ignored checkout inside the workspace. The local Git push failed at Windows Credential Manager. The connected GitHub `create_tree` action was also refused because it requires tool approval while the current approval policy is `never`. Local commits, a Git bundle, patches and a complete draft PR body are preserved for owner publication; no remote branch or PR was created. Docker and the complete CI E2E/restore jobs remain CI gates; no CI or local Docker success is claimed.
