# #520 read-only preview API/UI — independent source review

Exact source head: `d2015cc1cdf3ff17286f974426a4f617371d9c7b`.
Exact base: `4d1a8242acf4087d484d03367878ec29628d5d78`.
Worktree: `/workspace/impl-520-security-transfers`.

Reviewed all seven changed files plus existing auth/body/cache middleware, API validation/error handling, shared TextInput/privacy, unit parsing/formatting, service-worker exclusions and the reviewed replay interfaces. Source-only inspection: no tests/checks, build, browser, HTTP calls, DB/provider operations, CI or repository edits.

## Findings

### P2 — New quantity input exposes the value with amount privacy enabled

`apps/web/src/wealth/trade-panel.tsx:690–693` renders the new transfer quantity using ordinary `TextInput` without `money`. At this pinned revision, `packages/ui/src/components/field.tsx:36` defaults `money=false` and switches to a masked input only for `money && hidden`. `useAmountPrivacy()` in the form does not mask ordinary input contents.

Consequently, after entering a quantity and enabling privacy, the actual quantity remains visible in the draft field directly above the masked copy in the result. The new preview explicitly masks result units and documents masked amounts/units, so this defeats that behavior on the same screen.

Minimal correction: apply the existing `money` privacy prop to this new quantity input, preserving the exact string draft and E8 parser. No broader trade-form refactor is needed.

### P3 — Successful retry retains the previous request error

`apps/web/src/wealth/trade-panel.tsx:619–651`: the catch branch sets `error`, but a subsequent calculate/success never clears it; only a draft edit calls `setError('')`. A network failure followed by a successful retry without changing fields therefore displays the fresh successful result together with the obsolete error at line 696.

Minimal correction: clear the previous request error when starting a new calculation (and retain normal current validation errors). This is a source-derived state transition, not an executed reproduction.

## Source conclusions outside those findings

- `POST /api/trades/transfer-preview` is mounted under the existing authenticated investment API, after origin/CSRF and session guards. It inherits the 64 KiB body limit and no-store policy. The existing import write hold also blocks this POST; that conservative behavior introduces no write bypass. Service worker handling excludes both non-GET and API requests.
- Zod restricts IDs, validates actual ISO days and safe positive integer E8 units; repository validation repeats positive-safe units and distinct account/date/security scope. Extra client properties are stripped rather than used as authoritative evidence. No lot graph, supplied basis, pair legs or caller-created provenance reaches replay.
- Reader checks live investment accounts, on-budget exclusion and EUR cost currency. Reconciliation and current account closure become prospective write warnings rather than erasing valid recorded history. Unknown/nonredundant snapshots and unpaired legacy deliveries remain unavailable.
- The reader loads facts in one consistent transaction and returns both the requested-day prefix and latest recorded suffix. The hypothetical candidate is replayed against the entire suffix, so a later insufficient sale or invalid split prevents an available result. The source/destination before figures use the prefix, and allocation figures are captured from the candidate event, not from the final suffix balances.
- The candidate is explicitly placed after all native events on the requested date. The API warning and handoff identify this as a preview convention; `applyAvailable` is always false and no persisted chronology is asserted. Native within-day ordering is unchanged. This does not establish the future writer's mixed-day contract.
- FIFO and average calculations reuse the reviewed pure helpers. FIFO result rows preserve original acquisition identity/date and exact units/cents; average returns pool economics with no invented per-acquisition cent allocations. Safe-integer and graph/work limits remain fail-closed.
- The repository preview generates only ephemeral hypothetical IDs and reads data; it calls no tracked insert/update, trade writer or audit write. The response contains a bounded presentation DTO, not the full evidence graph, audit snapshots, settlement details or fact fingerprint. No migration, pair persistence, apply action or canonical report mutation was added.
- UI submission uses exact decimal-to-E8 parsing with at most eight fractional digits; it rejects unsafe/nonpositive units. Busy state prevents double submission/editing, draft edits clear the old result, and the existing discard guard remains. Field render-prop usage matches the shared component contract. Displayed result money/units use privacy formatting; the input exception is the P2 above.
- The shared HTTP helper keeps existing write notifications by default. Only this read-only POST opts out, avoiding a false global write invalidation without weakening existing writers. Draft/result state is in component memory; no preview is written to local storage or an offline mutation queue.

## Disposition and limits

Correct the bounded P2 privacy issue and the P3 retry-state issue, then review that narrow delta. No additional finance, authorization, source-provenance or read-only-integrity defect was found in this pinned slice. No owner policy decision or extra persistence is needed. Runtime/API/browser acceptance remains unperformed; this review does not establish write/apply readiness.

## Exact correction follow-up — source-clear

Independently reviewed `5e4ed5af801b45d332209ac7f1a69e457f7ac5ce` against `d2015cc1cdf3ff17286f974426a4f617371d9c7b`. The correction changes only three lines in the new preview form: `money` now activates shared privacy masking for the quantity field, and `setError('')` runs after the duplicate-request guard and before validation/request processing. Fresh validation errors still replace the cleared message; retry success no longer retains the old request error.

Both findings above are closed at source level. No additional actionable finding in this exact correction. The resulting read-only API/UI slice is source-clear within the stated scope and limits. No tests/checks, build, browser or runtime operation was executed during the follow-up.
