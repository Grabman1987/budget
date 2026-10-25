# Quality, source operation and recovery

Existing security/operations rules remain authoritative. New acceptance targets
here are review criteria, not measured service-level promises or new integrations.

## Quality requirements

| ID | Requirement | Acceptance evidence |
| --- | --- | --- |
| NFR01 | Use shared pure domain calculations, safe integer cents and explicit quality | Literal independent examples, boundary/overflow and cross-surface comparisons |
| NFR02 | Keep writes atomic/audited/undoable with reconciliation and dependency guards | Failure injection, rollback, undo/redo and stale-write tests on affected operations |
| NFR03 | Enforce session/origin/body/schema/rate limits at the server; no secret/client-only authorization | Anonymous, recovery, passkey and step-up matrix; malicious/oversized input cases |
| NFR04 | Preserve private data boundaries and amount masking in new surfaces | Synthetic evidence only; no credentials/raw source material in logs, docs or exports |
| NFR05 | Phone answer target 5 s; capture reachability target 10 s; no accidental duplicate submission | Exact revision/device/network, cold/warm measurements and owner usability evidence |
| NFR06 | Responsive 390/1440 layouts, visible focus, semantic controls, text alternatives, German errors, 44 px targets | Keyboard/screen-reader, zoom, long text, light/dark and automated accessibility checks |
| NFR07 | Respect reduced motion and preserve context during dialogs, detail navigation and errors | Focus restoration, back navigation, selected month/filters and scroll evidence |
| NFR08 | Local saved, server saved, rejected and uncertain are distinguishable | Offline/reconnect/reload/lost-response cases; no authenticated API cache |
| NFR09 | Every source exposes last success, coverage and repair action separately | Network/auth/parse/partial failure and successful-empty-read scenarios |
| NFR10 | Backup completeness and restore procedure match real storage ownership | Schema/files restore validation; private owner/operational evidence per current status |
| NFR11 | Reproducible release evidence identifies actual deployed revision | Required CI, actual deployment step and `/health`; no skipped deployment called successful |

WCAG 2.2 AA is the proposed comprehensive audit target; existing design minimums
remain binding. Conformance is not claimed until manual and automated coverage
exists. Availability/RPO/RTO and new performance budgets need an explicit owner
agreement; no numerical guarantee is invented by this document.

## Source service blueprint

| Source | Owner action | Background responsibility / result | Failure and repair |
| --- | --- | --- | --- |
| Bank read | Passkey-session connection/consent and account mapping | Fetch balances/lines, deduplicate and apply the configured BOOK/PDNG policy | Separate expired consent, failed fetch, unmatched line and balance difference; reconnect/review |
| Market prices | Maintain valid instrument/source metadata; review manual prices | Current timer and adapters refresh/backfill according to their contracts | Per-source success/coverage; stale/failed observations and fallback provenance stay visible |
| FX | Normally configured runtime source | Date-specific rates used by shared conversion | Missing required rate withholds affected EUR result; no rate=1 default |
| Crypto read | Configure authorized read source and mapping | Bounded read/update under current adapter contract | No write/order permission; partial history and authorization issues explicit |
| Payroll/document intake | Configure permitted source or upload manually; review result | Discover/parse documents and retain review work | Password/read/unknown-code/duplicate/conflict states; upload never books |
| Manual assets/prices | Enter explicit amount/date/source context | Save and use existing valuation precedence | Invalid date/type/check dependency rejected; do not overwrite protected manual history |

The source snapshot already starts the bank worker from server startup and has a
separate market timer with catch-up. Older Y20 “no full worker” wording is not a
current absence claim. Neither startup code nor this document establishes 14
days of stable operation or complete private source coverage.

## Recovery runbook boundaries

| Incident | Required sequence | Finish evidence |
| --- | --- | --- |
| Lost session/device | Existing login/passkey/recovery flow, then return to valid local destination | Same household data, no financial reinitialization; new device does not contain old unsent local captures |
| Offline capture blocked | Inspect first FIFO item/reason, restore access/connection, retry unchanged uncertain item | Exactly one server result, retained later items and useful rejected-item action |
| Source outage | Keep last known data with dates, classify failure, retry through supported adapter/catch-up | Successful bounded replay with no duplicate lines and explicit remaining gaps |
| Bad financial edit | Inspect grouped audit/dependencies and use supported undo | Correct source/derived values restored; no forced rewrite around reconciliation |
| Server/storage loss | Follow [operations](../ops.md), preserve backup, restore supported DB/files and verify | Health/revision plus database integrity, account/source/attachment checks and required owner acceptance |
| Broken deployment | Use documented release/rollback workflow; additive migration compatibility checked | Actual running revision and data integrity verified; no deployment from this docs PR |

CSV ZIP is a portable data extract. Encrypted operational backup contains the
application restoration material defined in operations, including protected
attachments. Unsent IndexedDB captures are device-local and outside server
backups. Do not promise recovery of deleted browser/site data.

## Operational evidence sheet

For each scheduled source/run record: source identifier without secrets, intended
window, start/end, success/partial/failure, latest complete as-of, read/proposed/
posted counts under active policy, dedupe/conflict count, next owner action and
safe diagnostic reference. Reconcile source line counts separately from ledger
equality. Retention of diagnostic details must follow existing privacy rules;
new analytics/telemetry collection requires a separate scope decision.
