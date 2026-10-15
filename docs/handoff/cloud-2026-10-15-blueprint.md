# Cloud continuation — Blueprint revision 04

## Scope and guardrails

Continue #491 and #499; PUB1 #490 is excluded. No new agents: account_review, payslip_review and search_navigation are finished/frozen. Cloud only. Preserve financial data, integer cents, atomic writes, locks and undo. No real people/provider data or secrets. Maximum three implementation branches. Serial lead merges only after all required checks at exact head; main CI, real automatic deployment, guard and actual health revision before another merge. Do not close issues from design-only evidence.

## Delivered before this continuation

PR498 booking: merge514ed362. PR500 payroll/account properties: merge5cf4f5f1. PR502 contacts: merge501f2e8f. PR501 search/navigation: merge8b9dbe55, main CI38733020009, deploy38735305257. PR503 direct payroll review: merge4841e7ebd6cd315279d4e0063fbe4b416c2a7283, main CI38739444195, deploy38741833899 and exact health verified. PR503 proof: https://github.com/Grabman1987/budget/pull/503#issuecomment-6193185170 . Payroll code headff3249bc: 434 files / 3955 tests, final Q2 integration434/3962, current WebKit7/7. Original Windows Chrome chooser hang remains unproven; chooser/drop completion is separate evidence.

## PR504 — merged, NOT delivered yet

Exact head `6c4afaf39f1393538c16ef79772743cd414b873a`: eight required checks green in38741758625, freshly reread before merge. Merge `74f15a77b8dfcd835b909df72c50d3bb68d7cea3`. Main CI38745587426 first attempt failed:

- e2e1: existing desktop portfolio positions test exhausted30seconds during a screenshot; repeated locally with available Chromium141. Required CI uses current Chromium. All assertions remain intact.
- e2e3: report-panel-layouts sampled two boxes in separate browser turns, observing inconsistent animation/font frames. First observed difference1.39px, retry88.59px. It also had a flaky contact selector matching both the intended contact and a concurrently created prefix-related contact.
- e2e1 rerun requested successfully (newjob116468037636). A later e2e3 rerun request was rejected because the containing workflow was still running. Reinspect before retrying. Do not claim current main CI or deployment passed.

Local branch `fix/e2e-layout-snapshots` in `/workspace/work/q2` starts at74f15a77. Two uncommitted fixes: atomic same-browser-turn rectangle reads; exact full contact option name. No expectations/tolerances were weakened. Diagnostic Chromium141 run: modified layout checks desktop/mobile and capture desktop/mobile passed; original portfolio desktop still timed out; mobile portfolio passed18.9s. The diagnostic WebKit launch initially used the wrong executable override, was stopped, then corrected to select by project name. Current WebKit-only capture run log `/workspace/work/e2e-layout-webkit.log`, session86571 pending at checkpoint. Temporary `playwright.cloud-review.config.ts` is cloud-only and must not be committed.

Next CI work: inspect trace and split the long portfolio overview/detail verification into independently meaningful tests while preserving every assertion and screenshot, rather than increasing timeout or dropping checks. Re-run affected tests; full required check before PR. Previous-main delivery gate still applies; fix PR may be prepared while waiting. Do not rerun successful jobs without need.

## Figma revision

User rejected earlier generic target design. All111existing screen pairs now have restored Blueprint language.46additional detail pairs preserve previously omitted functions. Total157scenarios/314sourceframes. Native prototype314frames,5315links,0missingtargets;12opposite-themeframes resynchronized. Stable starts194:54809desktop,194:55058phone. FileNv9oaV96Npql6onEofCFEi; rules197:1971. Original reference pages untouched. New design branch `design/blueprint-revision-04`, workspace `/workspace/work/blueprint-review`, source records `design/figma/revision-04/`.

Known pending: final geometry repeat after two Sankey label corrections; further screenshots and semantic interaction review; exact complete function gap reconciliation. Existing source scripts are mutation history and not universally idempotent. Cash/Bank transfer status is designed but still requires code. Figma inputs/file selection are simulated. No Figma comment-reading capability; chat comments incorporated.

## Runtime

Node22.23.3: `/workspace/work/toolchain/node_modules/node/bin`. Age `/workspace/.budget-tools/age/usr/bin`. Full check: `BUDGET_REQUIRE_AGE=1 npm run check` with Node22/age PATH. Heavy local work serial (4CPUquota). Current WebKit2370 cache `/workspace/work/playwright-webkit-current/browsers`. Available older Chromium141 `/workspace/work/browser-runtime/chromium-1194/chrome-linux/chrome` is diagnostic only; current Chromium156download403, GitHub Actions provides required current matrix. MAIN E2E port4860 implies auth4861/4862 and SAMPLE4863. Managed git fetch/push and GitHub connector work; ghCLI credential is stale, never inspect credentials.

## Remaining delivery work

After504live: prove and close465onlyifallacceptance met; mark499wealth delivered; update491S1/Q2 against actual evidence. Remaining491/499 audit packages remain open. Priority cash↔bank transfer status, account details, remaining plan/forms/navigation/report packages following dependencies and final Figma design. No production-data corrections: owner already fixed salary dates/senders manually.
