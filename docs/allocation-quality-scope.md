# Allocation quality and scope — owner directive PR3 (2026-10-04)

Scope: §§21–25, R07/R08 and PR3 in §46. Branch `codex/allocation-quality-pr3`, based on PR2 `32a9332025e30f8c8fc5ff5fe2422099499bb874` (includes PR1). No settings page, dynamic tiers, panel changes, provider access or deployment.

## Pre-change matrix

Continuation merged `origin/codex/risk-policy-pr2` at `047026ee11937028df68c9b448ba3299426bc305` and `origin/main` at `acb54a99cd8f7161a031886e70a66921c62f4598`. Main's assignment-rule booking/inbox/capture behavior is retained. Its 0032 migration, snapshot and journal entry remain unchanged; allocation scope is regenerated as 0033 from that snapshot.

| Finding | Current status | Evidence | Action |
| --- | --- | --- | --- |
| Asset-class placeholder | Present on main/base | Asset-class route absent from `BUILT_PATHS` | PR4 |
| Historical class assignment | Fixed by PR1 on main/base | Dated exposure resolver; A01/A02/A08 and migration regressions | Preserve and rerun |
| Leverage in risk | Fixed by PR2 in base, outside current main | R01–R03; separate gross/market projection | Preserve and rerun |
| Shared risk settings | Fixed by PR2 in base, outside current main | R04–R06 policy consumer tests | Preserve and rerun |
| Invisible iPhone panel | Owner-reported, shared primitive unchanged | Native dialog/PanelHost not modified; no real-device evidence in PR3 | PR5 |
| Quality/scope | Missing at base | No allocation quality gate; allocation used securities alone | This PR |

## One decision universe

`allocationInputsAsOf` is the shared read model for current allocation, R13–R15, rebalancing, report 4.2/month ends and savings proposals. It reuses existing holding valuation and exposure resolution; it does not change trades, prices, balances, performance or net-worth formulas.

Migration **0033_allocation_scope** was generated with the installed Drizzle kit after main's 0032_assignment_rules. The generated account rebuild's SELECT was corrected to use defaults for new columns; the deterministic data backfill is appended explicitly. Its snapshot/journal remain generated. Tests exercise the complete previous main schema, original columns, FK checks, repeat migration and snapshot restore.

| Metadata | Meaning/default |
| --- | --- |
| `account.allocation_scope` | `included`, `excluded`, or `default` (type fallback for new raw/legacy inserts) |
| `security.allocation_included` | Boolean instrument opt-out, default true |
| `account.allocation_asset_class_id` | Optional deliberate class for investment cash / account-only P2P; absent means unclassified |

The migration freezes existing brokerage/crypto/P2P accounts as included; existing linked settlement accounts are included unless debt/card/receivable types. Other accounts are excluded. New `default` accounts use brokerage/crypto/P2P type only. New investment cash/savings accounts require explicit inclusion; ordinary checking, cash and reserve savings remain outside. Money-market funds are ordinary included instruments in an included account. Names never determine membership or classification. Card, loan, other-liability and receivable accounts remain excluded even if corrupted/raw metadata says included; API/repository writes reject that inclusion.

Holdings require both account and instrument inclusion. Included account cash is added once, **including negative broker cash**. Transfers/bookings retain their existing cash-balance semantics; synthetic cash positions do not become stored securities or orders. Account-only P2P uses the newest stored manual valuation at/before the day instead of its cash balance; with securities, holdings plus actual cash are counted without adding the manual account valuation again. Foreign values use the existing EUR FX conversion. Missing FX never becomes zero. Cash and account-only P2P without a deliberate class remain unclassified. Regions for cash remain unknown.

`portfolioAllocation.valueCents` is this universe's investment sum, the input for later dynamic target tiers. Performance/current-position views retain their existing securities/depot scope; their header totals may differ from the explicitly labelled policy universe. Scope and cash-class metadata are not versioned in this minimal schema: historical allocation resolves dated security exposures and target policies, with current scope/cash-class configuration. No historical membership certainty is claimed; any future historical scope editor needs its own versioning contract.

Metadata writes use existing authenticated/origin-protected account and instrument APIs, German scope/class validation and grouped audit/savepoint/undo. No PR4 controls are added.

## Quality contract

`GET /api/portfolio/allocation` exposes root `valuationQuality` and structured `quality`; report 4.2 exposes `quality`, each class's confidence and `history.quality` per report date. Risk projections share this quality. Details include:

- Unclassified market value (signed), absolute unknown exposure, share, distinct product/cash-position count and ids. Weighted exposure slices and multiple accounts do not multiply a product count. Missing unclassified valuations retain product identities; their unknown value is not invented. Percentages are null with unavailable/nonpositive totals.
- Estimated value/share; sorted distinct estimated, stale, missing-price and missing-FX security ids, plus missing-FX account ids. Shares count affected account/security slices only, not every holding of an instrument that has one estimated account.
- `classification: complete|partial`, `valuationQuality: exact|estimated|incomplete`, `confidence: exact|provisional`.

Exact uses the existing quote freshness window (up to seven days). Stale quotes are conservatively included in estimated quality/share and separately identified; cost-basis/later-price fallbacks are estimated. Missing price or FX makes the valuation incomplete and the investment total unavailable, never a sum that omits a held position. Missing FX on a cost-basis fallback is identified as FX, rather than missing price.

**No materiality tolerance:** one unknown cent makes every recommendation provisional. Absolute unknown exposure prevents a negative cash position from cancelling an unknown positive holding. A zero-valued, fully priced position alone does not create unknown monetary exposure.

| Data basis | Rebalancing | Savings optimisation | Rule evaluation |
| --- | --- | --- | --- |
| Exact valuation + complete classification | Exact confidence | Existing policy proposal with exact confidence | Existing exact R13–R15 results |
| Estimated/stale valuation or unknown classification | Every proposal provisional; neutral visible label, including marginal band breaches | Suppress changes; unchanged rates/total, provisional confidence, `quality_gate` | Warning to complete/check data, no definitive capital-routing action |
| Missing price/FX | No proposals; unavailable live risk/total | Suppress changes, provisional confidence | Not assessable |
| A plan outside the universe | Existing scoped rebalancing | Suppress redistribution as a whole (`scope_gate`), retaining all schedules/rates | Scoped holdings only |

Unknown plan exposure also suppresses savings changes, even if that product has no current holding. Every individual savings proposal carries confidence. Applying a suppressed proposal is a no-op with no bookings, trades, schedule edits or bank instruction.

Report 4.2 remains strict when historical values are missing (typed 503). Its known snapshots carry quality at their own dates; later classification still cannot rewrite historical security exposure. Signed investment cash remains in all tables/totals; the sunburst is withheld when a negative product cannot be represented faithfully. Monetary and percentage sums remain conserved to the cent/basis point.

## Rebalancing euros

`gapCents = round(total × targetShare) − classValue` is labelled **Umschichtungsabstand**, at unchanged portfolio total. It is not the amount of a new contribution. R13 underweight proposals separately expose **Neues Kapital bis Soll** (`newCapitalCents`):

`x = (targetShare × total − classValue) / (1 − targetShare)`

Round once from the exact integer numerator to cents. Example, entirely synthetic: total EUR 1,000, class EUR 400, target 60% → EUR 200 Umschichtungsabstand; EUR 500 new capital into that one class gives EUR 900 of EUR 1,500, exactly 60%. At a 100% target with other holdings, no finite contribution suffices; return null. Reductions and already-at/over-target classes have no new-capital value. R14/R15 excess retains its distinct gross-exposure meaning. These are decision aids; no order is executed.

## Verification and delivery

R07/R08, unknown weighted shares/counts, marginal estimates, missing quote/FX, negative cash, explicit exclusions/instrument opt-outs, P2P account valuation, savings suppression, formula boundaries and scope/class audit/undo are covered by literal synthetic domain/repository/API/browser cases. Existing PR1 history and PR2 policy regressions are retained.

Continuation verification on 2026-10-04, implementation commit `9d38677`:

- Targeted allocation/assignment/exposure migration tests: 3 files, 4 tests passed. Allocation SQL is byte-identical to the previous PR3 SQL after newline normalization. Main's migration SQL and snapshots are unchanged; 0033 links to main's 0032 snapshot and preserves its other tables. The upgrade test applies every main migration through 0032, compares original source columns (including assignment rules, raw bank booking text, candidates, cleanup and aliases), checks valuation/FKs/integrity, repeats the migration and restores the pre-upgrade backup.
- `BUDGET_REQUIRE_AGE=1 npm run check` ran once. Typecheck, ESLint and Prettier passed. The default parallel unit run reported 286 passing files and 7 files with only 5-second test / 10-second hook timeouts (2,781 passed, 8 failed, 8 not run). Each affected file then passed alone with `--maxWorkers=1 --testTimeout=30000 --hookTimeout=30000`: PP migration, PP statement, allocation API, fixture figures, mocked Dropbox payroll, payslip intake API and budget API (73 tests). The known auth stress file also passed alone (37 tests). All 293 files / 2,797 distinct tests therefore passed across the full run and isolated repeats; the default `check` invocation itself exited nonzero on those timeouts. No assertions failed and no repository timeout configuration was changed.
- `npm run build` and `npm run build:e2e` passed. `E2E_START_TIMEOUT=120000 npx playwright test 'portfolio-' 'savings-plans.spec.ts' 'assignment-rules.spec.ts' --project=desktop --project=mobile --workers=2 --timeout=60000`: 81 passed, no skips or retries, 8.9 minutes. This includes allocation/report 4.2, positions, instruments, trades, savings schedules, performance/benchmark and portfolio reports, plus main's assignment-rule integration. Chromium viewports: desktop 1440×900 and mobile 390×844; existing Axe, overflow, light/dark screenshots, mutation and undo/redo assertions passed. PR3 quality screenshots were also visually inspected.

Local logs and four retained quality screenshots are in ignored `data/task-delivery/` (`pr3-check-after-main.log`, `pr3-isolated-after-main.log`, `pr3-migration-0033.log`, both build logs, `pr3-e2e-after-main.log`, `pr3-evidence/`). Dependencies were already installed and neither package manifest nor lockfile changed, so no reinstall was needed. This is local Windows/Chromium evidence; Linux visual CI and owner/private acceptance remain open.

Owner steps: review the scope defaults and provisional rule; configure strategic cash membership/class via the API or later PR4 controls. Before production, use the existing CI migration/backup gates and owner snapshot/count/market-value reconciliation. No production or real-iPhone acceptance is implied by local tests.
