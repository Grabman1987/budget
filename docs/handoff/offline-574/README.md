# Offline / Heute section compatibility — source-only handoff, NOT VALIDATED

Refs #558, #574. Offline adapter owner: `impl_offline_558_700`; Heute section owner:
`impl_heute_month_close`. Direct coordination confirmed the frozen section contract.
No active runtime source on this offline branch was changed by this handoff because
its companion `HeuteSectionData` contract is not yet integrated here.

## Exact source pins and application order

1. Offline infrastructure/capture/viewer plus HTTP boundaries:
   `a8502ed35d454324f7d67049536f1680aa3ffb82`, branch
   `codex/impl-offline-558-700`.
2. Independently prepared Heute sections/page:
   `d27f9a2ff042d3c565009040c701ce37141efe98`, branch
   `codex/impl-heute-month-close`. This is the exact frozen frontend DTO/server
   section contract used by this adapter, not a declaration that either branch
   is merged or live. Retain the existing offline `today` capture hook when
   integrating its page replacement.
3. In the combined source tree, apply `01-offline-section-adapter.patch` once.
   It changes only offline capture/store/viewer, the HTTP snapshot allowlist, and
   adds `pwa/read-snapshot-today-sections.tsx`. It imports the actual companion
   `HeuteSectionData` type; it never fabricates a complete aggregate DTO.
4. Apply `02-heute-capture-mount.patch` to the frozen companion page only if the
   existing `useOfflineSnapshotCapture('today')` import/mount was not retained.
   This two-line mount is required. Do not apply it twice.

There are no merge commands, dependency upgrades or schema migrations in this
package. Mutable outside-repo editing copies are at
`/workspace/.budget-tools/offline-574/target/`; committed patches are the handoff.

## Source behavior

- The protected HTTP allowlist adds exactly the eight named section GET endpoints:
  overview, pace, wealth, tasks, upcoming, bookings, pinned and accuracy.
  Existing server authorization and pre-request epoch token provenance remain.
- Each successful authorized HTTP response stores its original source URL, receipt
  timestamp and exact returned `stand`. Optional/missing/failed sections are not
  replaced with zeros or inferred from other section responses. The adapter issues
  no HTTP requests and does not restore the former aggregate request.
- A tagged `today-sections-v1` payload uses the existing protected `today` record.
  The IndexedDB database version, view allowlist, keying and logout erasure remain
  unchanged. Native read/merge/write happens in one transaction, including across
  tabs, so concurrent successes cannot discard another section. Each merge rechecks
  the epoch/logout/generation/storage fence before publication. An older timestamp
  cannot overwrite a newer copy of the same section.
- A section failure leaves its own earlier successful copy available. A section
  that was never copied remains visibly missing. Successful writes notify the
  existing local read subscribers so late successful responses can refresh a
  displayed local viewer without a new request.
- The viewer displays a separate timestamp, server day, selected month and actual
  returned period for every section. Accuracy has no period in its server DTO and
  is shown without inventing one. Different section scopes/dates are explicitly
  disclosed, never presented as one complete or synchronized Heute snapshot.
- Money uses the existing private EUR formatter. Local section summaries expose
  no write controls or authenticated route; finance-check value text and the
  unavailable-wealth diagnostic use the existing money-text privacy mask. These
  lines are synchronized with the active SavedToday privacy correction in the
  offline package and must survive the later single application of the patch.
  No formulas or stored money change.
  Upcoming events use the same 14-day bound from the returned server day as #574.

## Actual compatibility limits

- The legacy complete aggregate remains readable until a first successful section
  response replaces it with a partial section bundle. Old aggregates are not split
  into supposedly independently fetched sections. Existing aggregate consumers and
  the other three offline views remain supported by their original paths.
- Only the latest successful response per section is retained. If the user changes
  month/period and a section fails, it may show its earlier selection with its own
  exact label. No common as-of date or complete-current-view claim is made.
- Failures are not successful API-read events, so this package does not persist
  error diagnostics or claim that an old successful copy is the latest server state.
- Independent liquidity, budget and expected-payment reads remain separate; this
  package does not synthesize those into Heute. The offline presentation is a
  read-only numeric/list summary, not replay of every interactive chart.
- Optional contact reminders appear only if the server supplied them. The #599
  backend connection remains the separate companion integration patch and is not
  supplied or simulated here. Disabled/unrequested pinned/accuracy sections may
  have no saved copy.

## Validation status

No tests, test edits, test runs, typechecks, builds, browser checks, CI, PR, merges,
deployment or database operations were performed. No `git apply --check` or runtime
validation was run. This package is prepared source, not verified integration.
Exact-head source review, native IndexedDB concurrency/logout/retention evidence,
partial-failure/selection/timezone/privacy proof and ordinary required checks and
live acceptance remain outstanding. No issue is closed.
