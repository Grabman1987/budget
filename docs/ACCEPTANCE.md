# Implementation and acceptance matrix

Source snapshot: main `5193b0a930656be210e6b447bfd0e8de8c9846a0`, verified live on 2026-10-08. [STATUS](STATUS.md) records immutable CI/deploy evidence and the observed health revision. This matrix is a starting acceptance register, not a claim of complete feature coverage or owner sign-off. SPEC remains authoritative.

## Reading and updating the evidence

Every row separates connected source, deployment and acceptance. The shared live revision covers source included in main; it does not include open PRs. For each subsequent task record its exact PR/head, independently expected result, final main/deploy/health revision and owner acceptance or remaining reason. Do not substitute test totals for financial, private or physical-device acceptance.

| Workflow / requirement | Source and contract in the live snapshot | Deployment | Evidence still needed / next task |
| --- | --- | --- | --- |
| Account register, capture and settlement | [Router](../apps/web/src/router.tsx), [ledger](../apps/web/src/ledger/), [ledger API](api-ledger.md) | Verified snapshot | Exact booking inputs/save/focus #309/#315; real-phone timing #310; dialog #222 plus repair #251 are open |
| Envelope money and monthly planning | [Plan](../apps/web/src/budget/plan-page.tsx), [API contract](api-ledger.md) | Verified snapshot | Gate 2 #354; distinguish monthly plan remainder from cash available through payday #264; empty targets/income/coverage #271–#273 |
| Today and finance check | [Heute](../apps/web/src/heute/heute-page.tsx), [shared horizon](heute-horizon-1005.md) | Verified snapshot | P0/P1 wording and unevaluated-rule coverage; actual iPhone #310; baseline/cache/performance #280–#282 |
| Annual planning and income scenarios | [Year plan](../apps/web/src/budget/plan-year-page.tsx), [forecast contract](heute-horizon-1005.md) | Verified snapshot | #285 concept → #286 shared calculation → #287 form; #288 payout distinction before #289 delay scenario |
| Contacts and savings goals | [Contacts](../apps/web/src/contacts/), [goals](../apps/web/src/budget/), [goal report](../apps/web/src/pages/goals-progress-report.tsx) | Verified snapshot | Private workflow/foreign-currency acceptance; details/forms #321/#322/#325/#326; allocation-source gaps remain |
| Inbox and assignments | [Inbox](../apps/web/src/inbox/), [assignment rules](assignment-rules.md) | Verified snapshot | Historical filtering/grouping #277/#278; pagination #279; warning acknowledgement does not repair the source |
| Global search | [Existing search](../apps/web/src/shell/global-search.tsx), [open #249](https://github.com/Grabman1987/budget/pull/249) and [repair #252](https://github.com/Grabman1987/budget/pull/252) | Existing search verified; PRs open | Final parent/repair integration checks, #307/#308, later sub-page #338 |
| Portfolio, dated classes and policy | [Portfolio](../apps/web/src/wealth/portfolio-page.tsx), [exposure](asset-exposure.md), [risk](portfolio-risk-policy.md), [settings](asset-classes-settings.md) | Verified snapshot | Holdings/returns #355/#356; historical classification #302; wealth navigation #248 remains open |
| Trade capture and savings execution | [Trade and execution contract](trades-execution.md), [investment API](../apps/server/src/api/) | Verified snapshot | Private history, statement/cash/withholding equality, owner execution review; rate-optimization proposal/apply is separate |
| Debt decisions and costs | [Debt page](../apps/web/src/wealth/debts-page.tsx), [cost report](../apps/web/src/reports/) | Existing workflow verified; UX #225 open | Missing terms and cost coverage #293/#295; model/liquidity #296; final #225 conflict/CI/review |
| Freedom forecast | [Freedom page](../apps/web/src/wealth/freedom-page.tsx), [domain](../packages/domain/src/wealth/freedom.ts) | Verified snapshot | Historical target path, chosen goal year, persisted assumptions and private acceptance; current scenario is unsaved |
| Reports, Explorer and print | [34-entry catalog](../apps/web/src/nav/reports-catalog.ts), [connected dispatch](../apps/web/src/pages/reports-pages.tsx) | Verified snapshot | Every entry has a body; per-report source coverage/financial/device acceptance still required. Catalog total supersedes older 30/31 counts; duplicate Budgettreue labels #306 remain |
| CSV ZIP export | [Download UI](../apps/web/src/pages/export-placeholder.tsx), [export contract](export.md) | Verified snapshot | Owner archive completeness and fresh-passkey acceptance; historical filename is not a placeholder-status indicator |
| PWA/offline booking queue | [PWA contract](pwa.md), [PWA source](../apps/web/src/pwa/) | Verified snapshot | Actual phone installation, durable offline capture, reconnect/retry/error review and session expiry; no app import feature |
| Sources and nightly processing | [Worker](../apps/worker/src/bank-sync-worker.ts), [scheduler](../apps/server/src/index.ts), [market contract](market-data.md) | Source verified; real configuration not checked | #359–#362 one source at a time; private reconciliation, retry/catch-up and 14 stable nights; worker already exists |
| Backup, restore and recovery | [Runbook](ops.md), [backup source](../apps/server/src/backup/) | CI restore/docker jobs passed | Actual encrypted owner backup restored in isolation #351; device/recovery evidence; no production-data writes from documentation work |
| Private migration and comparison | [YNAB contract](migration/ynab-export.md), [PP contract](migration/pp-export.md), [operator runbook](ops.md) | Tooling verified | Current Gate 2/3 evidence #354–#356; do not confuse missing acceptance with absent migration tooling or proof of no past execution |
| Guided month close | [Month-close contract](month-close.md), [F2 #243](https://github.com/Grabman1987/budget/pull/243) | F1 present; F2 open | F2 conflict/CI/review, search repair #252, private parallel month-end #357 and complete Gate 4 |

## Delivery stages

1. Source exists and the workflow is connected.
2. The exact final PR head passed required checks and review.
3. The change was merged; main CI and the actual deploy succeeded.
4. The observed live health revision identifies the deployed source.
5. Required financial, source, device and owner acceptance is recorded with its bounded scope.

Later stages do not follow automatically from earlier ones. A closed reference issue, archived draft or green repair PR does not accept its parent workflow. A one-account or one-period comparison does not accept an entire gate.

## Step-by-step execution queue

| Step | Bounded deliverable | Completion condition |
| --- | --- | --- |
| 1 — Current documentation | STATUS, README and this matrix agree about connected source, live revision and remaining gates | Source/link/catalog verification, required repository checks and reviewed documentation PR; old audit evidence retained |
| 2 — Existing PR chain | One parent/repair or conflicted PR at a time, following [#365](https://github.com/Grabman1987/budget/issues/365) | No competing merge chain; final-head review/checks; actual main/deploy/health evidence |
| 3 — P0 correctness/meaning | One issue, one expected synthetic case, one PR | Reproduce/verify the specific criterion; financial mutation/undo/rollback where applicable |
| 4 — Performance and navigation | Measure integrated/live performance, then bounded #316–#348 replacements | Complete content and exact-revision measurements; desktop/phone/back/focus evidence |
| 5 — Owner operations/gates | One actual source, device, restore or comparison unit at a time | Private bounded evidence and owner sign-off; full gate remains open until all required coverage exists |

Step 1 is only the source/acceptance baseline. Historical feature and roadmap details still need task-specific reconciliation; this document does not close #352, whose post-integration refresh remains necessary, or any financial/device gate.
