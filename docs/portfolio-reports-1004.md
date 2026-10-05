# Portfolio-Reports und Heute · 04.10.2026

Owner feedback supersedes the former single benchmark and 90-day R07 default. No schema migration or dependency added. All financial tests and browser captures use the synthetic ledger; no private data or authenticated provider request is used.

## Reports

4.1 previously enumerated accounts from security positions, so P2P and other manually valued investment accounts disappeared. It now enumerates investment accounts, uses their existing cash/security/manual EUR valuations and external flows, and hides closed accounts only when the effective period contains neither value nor flows. Brokerage/crypto retain the securities-only basis (clearing cash excluded). Product lists are removed from cards.

4.2 class and region composition and historical layers divide only positive classified assets by their classified market value; shares conserve 10,000 basis points. Cash (except invested P2P manual values), negative and unclassified positions appear separately with signed amounts. R13/R15 retain their existing signed risk universe, explicitly labeled in the Soll table. History starts no earlier than the budget's first account month and omits months before classified assets exist. Targets/bands respect dated versions; every monthly class is available through shared keyboard/touch inspection.

4.3 uses daily stored valuations, cumulative net flows starting at zero, clearly signed monthly gain bars, and a conserved monthly table: Anfang + Zuflüsse + Abflüsse + Wertänderung = Ende. Shared tooltip includes value, net flows, monthly change and date. Short notes keep the securities-only scope explicit.

## Benchmarks

The four public ETF proxies below use Xetra EUR closes (Ariva exchange 45). They represent price returns, not index total returns: cash distributions are not added. ETF tracking/fees and EUR currency effects can differ from a published index. ATX's distributing proxy particularly differs from ATX total-return series.

| Checkbox | Public instrument | ISIN | Yahoo fallback |
| --- | --- | --- | --- |
| FTSE All-World | Vanguard FTSE All-World UCITS ETF USD Acc | IE00BK5BQT80 | VWCE.DE |
| S&P 500 | iShares Core S&P 500 UCITS ETF USD Acc | IE00B5BMR087 | SXR8.DE |
| Nasdaq-100 | iShares Nasdaq-100 UCITS ETF USD Acc | IE00B53SZB19 | SXRV.DE |
| ATX | iShares ATX UCITS ETF DE | DE000A0D8Q23 | EXXX.DE |

Public source pages: [FTSE](https://www.ariva.de/etf/vanguard-ftse-all-world-ucits-etf-usd-acc), [S&P 500](https://www.ariva.de/etf/ishares-core-s-p-500-ucits-etf-usd-acc), [Nasdaq](https://www.ariva.de/etf/ishares-nasdaq-100-ucits-etf-usd-acc), [ATX](https://live.deutsche-boerse.com/etf/ishares-atx-ucits-etf-de).

System instruments are created idempotently on selection or nightly market refresh, excluded from asset allocation. App setting `portfolio.benchmark_ids` stores the validated allowlist selection with audit/undo/redo. Each selected series starts at 100 at the effective period start; missing boundary closes remain gaps (weekends may carry Friday). Return, monthly/yearly comparison and class differences are separate for every selection.

The existing nightly run uses Ariva first and Yahoo fallback. First benchmark refresh starts three days before the earliest account opening to cover weekend starts, in bounded three-year history calls; subsequent runs continue after the newest stored network quote. Existing rate limiting, synthetic mocks, price audit and stale-value inbox handling apply. No new key or consent required. Existing optional source switch: `BUDGET_ARIVA` (names only; no values stored).

## Heute / R07

Same `budgetLiquidityForecast` and resolved R07 parameters, default/maximum 35 days after today (today plus 35 future days). Stored longer horizons clamp to 35, preserving the minimum balance. Shorter valid choices remain shared. Five largest named payments of at least 250 EUR have numbered chart markers and a separate readable list; same-day markers combine their numbers. Every payment, including smaller ones and variable spending, remains in the shared daily tooltip. Nothing is booked automatically.

## Verification and owner steps

Required: npm ci, full typecheck/lint/unit suite, production build; focused desktop 1440/mobile 390 Playwright runs for depots, allocation, contributions, performance benchmarks and Heute/tooltip. Review captures use synthetic fixtures only; desktop 1440/mobile 390 examples are committed below. No screenshot baselines regenerated locally.

Expected visual changes: Heute light/dark (35-day curve, new low point and step labels), report 4.1 cards/charts, 4.2 composition/colours/bands, 4.3 net-flow line/month table, 4.4/settings checkboxes and multiple benchmark lines. The affected golden files are `shell-heute-light.png` and `shell-heute-dark.png` in both desktop/mobile projects; they must be approved/regenerated in the pinned Linux browser; portfolio report specs capture evidence, not golden baselines.

Owner steps: merge main after PR #186 (no rebase performed), merge this draft through the usual checks, select benchmark checkboxes, let the nightly run backfill and inspect any stale-value inbox gaps; review private data/device rendering yourself. No keys, bank consents or automatic budget booking added. Owner visual acceptance and pinned Linux screenshot acceptance remain open.

| Synthetic review evidence | Desktop | Mobile |
| --- | --- | --- |
| Depots | [1440 px](evidence/portfolio-reports-1004/depots-light-desktop.png) | [390 px](evidence/portfolio-reports-1004/depots-light-mobile.png) |
| Allocation | [1440 px](evidence/portfolio-reports-1004/allocation-light-desktop.png) | [390 px](evidence/portfolio-reports-1004/allocation-light-mobile.png) |
| Contributions | [1440 px](evidence/portfolio-reports-1004/contributions-light-desktop.png) | [390 px](evidence/portfolio-reports-1004/contributions-light-mobile.png) |
| Benchmarks | [1440 px](evidence/portfolio-reports-1004/benchmarks-light-desktop.png) | [390 px](evidence/portfolio-reports-1004/benchmarks-light-mobile.png) |
| Heute | [1440 px](evidence/portfolio-reports-1004/heute-light-desktop.png) | [390 px](evidence/portfolio-reports-1004/heute-light-mobile.png) |

Local Windows sandbox notes: `npm.cmd ci` succeeds. The sandbox denies `os.userInfo()` (`uv_os_get_passwd`, ENOMEM), which prevents tsx from choosing its temporary cache directory. An ignored Node preload substitutes a synthetic username only for that exact OS error during verification; application sources are unchanged. Browser seeding used the existing esbuild plus the existing explicit migration-directory option. Git cannot create the shared worktree index lock, so delivery commits use an ignored separate Git directory and the same branch/base. No rebase or merge performed.

Delivery limitation: native Git push cannot use the sandbox credential store; the connected GitHub app can read but its write tools require approval while this session's approval policy is `never`. No remote branch update or draft PR is claimed. `test-results/portfolio-reports-1004.bundle` and `test-results/portfolio-reports-1004-pr.md` preserve the complete reviewable delivery locally. On an authorized local machine, fetch the bundle to the existing branch, push it, and open a draft; synchronize the original worktree's HEAD/index only after preserving any independent edits.

Final local verification (2026-10-05): `npm.cmd ci`, full typecheck/lint and production `npm.cmd run build` succeeded. Full `npm.cmd run check -- -- --testTimeout=30000 --hookTimeout=30000` succeeded with `VITEST_MAX_WORKERS=1` and the ignored OS-cache preload described above: 310 files passed, 2,971 tests passed, 2 skipped. The workaround changes no application/test source; the two existing age-dependent encrypted-backup tests are skipped because age is unavailable locally. CI installs age and requires it through `BUDGET_REQUIRE_AGE`. The earlier resource-sensitive hook failure passed in this final full run.

Twenty affected browser cases passed across desktop/mobile (plus three setup cases), covering depots, allocation, contributions, benchmark selection/persistence, shared tooltip keyboard/touch inspection and Heute forecast/labels. The final benchmark and settled-Heute cases passed again in both themes and motion modes. Browser commands used the ignored config/seed workaround described above; no golden baseline files changed.
