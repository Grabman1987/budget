# Spritmonitor fuel source

This bounded, server-only source reads the owner's explicitly selected car and tank using
Spritmonitor's official read-only API. It does not allocate expenses to contacts.
It is disabled by default and does not use bank consent or crypto-source state.
No private IDs, credentials or real fueling examples belong in this repository.

## Configuration

Set these server environment variables privately:

- `BUDGET_SPRITMONITOR_ENABLED=1`
- `SPRITMONITOR_APPLICATION_ID` and `SPRITMONITOR_BEARER_TOKEN`
- `SPRITMONITOR_VEHICLE_ID` and `SPRITMONITOR_TANK_ID` (explicit positive provider IDs)
- `SPRITMONITOR_ACCOUNT_ID` (default payment account, e.g. the owner's fuel card)
- `SPRITMONITOR_CATEGORY_ID` (fuel spending category)
- `SPRITMONITOR_START_DATE` (explicit ISO date delimiting the imported history)

The account must be open, on-budget, EUR, and checking/savings/credit-card. The category
must be visible and a normal spending category. Invalid destinations or held writes
fail closed. Credentials stay in request headers to the fixed official HTTPS origin.
The client validates the response and enforces a 10,000-row limit before any ledger writes.

## Bootstrap and duplicate handling

The first successful fetch for each explicitly selected vehicle/tank pair stages every
returned fueling in Prüfen. It records its Vienna as-of date as a source-bound bootstrap boundary: later arrivals on or before that date also
require review. An empty first fetch still establishes this boundary. Existing manual,
card statement, net or gross fuel purchases must be explicitly linked or ignored before
using automation for subsequent fuelings. Linking retains the existing amount, account,
status, splits, receipts and import provenance; it only stores source proof separately.

Subsequent clear EUR fuelings after the boundary import as pending expenses through
`importBooking`, in exact cents, with the configured account/category. The booking can
then be edited and reassigned through the existing ledger API/UI. A possible fuel
expense within two days (never a future entry beyond today), across any account and
including soft-deleted rows, forces review regardless of amount. Fuel-category or
fuel/station text evidence qualifies. This deliberately catches net/gross differences;
there is no inferred discount, rebate, balance adjustment or bank confirmation.
Ambiguous rows are never automatically linked. Unsupported currencies/missing costs
remain in review. A changed source snapshot never overwrites a booking. If the provider later returns to
the accepted snapshot, review adopts the latest returned snapshot and invalidates the
previous changed-snapshot token. Source deletions
never delete ledger data.

## API and scheduling

All routes inherit the normal session/origin guards. Mutation routes require a
passkey-opened session, matching existing data-source APIs:

- `GET /api/sources/spritmonitor`: configured/running state and source rows, their
  original snapshots, candidate booking IDs, and `reviewFingerprint` tokens.
- `POST /api/sources/spritmonitor/refresh` with `{}`: bounded complete fetch and one
  atomic audited write group; returns counts and `groupId` (null for unchanged replay).
- `POST /api/sources/spritmonitor/resolve` with `key`, `fingerprint` (the returned
  `reviewFingerprint`), `action` (`link`, `ignore`, or explicit `book`) and optional
  `bookingId`. Linking requires a live EUR expense within two days; a booking already
  mapped to another source row is refused. `book` is explicit review approval for a
  previously unbooked, supported fueling, including a corrected review snapshot; it
  cannot rebook a changed linked source or a previously created/undone fueling.

The independent timer checks every 15 minutes, with an initial 30-second delay. It
fetches at most once per Vienna day after success, with a minimum 30-minute retry delay
in the running process. Last attempt/failure is sanitized and process-local; the last
source-changing success and bootstrap boundary are audited settings keyed by vehicle/tank.
Attempt/success state is checked against that same scope, so a different source never
borrows another source's daily success or bootstrap date. Restart may repeat
an unchanged read. Read failures never write money. An unchanged replay writes nothing.

## Identity, atomicity and Undo

Each provider ID is qualified by vehicle and tank. Its import key is checked globally,
including other accounts and soft-deleted bookings. A separate hashed `app_setting`
key stores original fingerprint/snapshot, accepted snapshot and optional booking link.
Manual account changes retain the mapping. Deleted rows remain suppressed. Native Undo
reverts the whole import group; retained setting audit history is a replay tombstone
if Undo removed both setting and booking. An unchanged source never recreates undone
money. Undoing a manual review action restores the review state; it does not trigger an
automatic import. Restoring money requires the normal explicit Undo/redo path.

Network access occurs before SQLite transactions. The complete response is validated
before writes, and an audit-version/configuration freshness guard rejects intervening
changes. All money, source records and inbox updates share one transaction and audit
group; any failing row rolls back the batch. No schema migration or generic integration
framework is introduced.

Synthetic regression coverage is in `sources/spritmonitor-sync.test.ts` (bootstrap,
net/gross candidates, exact cents, account overrides, deletion, Undo, changed source,
unsupported data, atomic rejection, freshness/held writes, source deletion). The client
contract tests are in `sources/spritmonitor-api.test.ts`. Neither suite uses credentials
or real IDs. Provider setup and private historical mapping remain separate owner work.

## Local validation (2026-11-05)

- Both targeted source suites: 31/31 passed, one worker. The installed Vitest was
  5.0.3; the lockfile requests 5.0.5. This is a local runtime diagnostic, not evidence
  for the lockfile's exact dependency graph or required CI.
- ESLint on every changed server file and the client dependency: passed.
- Server TypeScript check (`tsc -p apps/server/tsconfig.json --noEmit`): passed.
- New sync test file rationale: exercises real synthetic SQLite transactions and native
  writers/Undo to establish money, source identity, rollback and guard behavior, plus
  mounted API session/origin/passkey wiring. No existing test oracle was changed.

These checks use the isolated worktree's own `@budget/*` packages. Independent full-diff
financial/security review and exact-head CI remain required before integration. No
production credentials, settings, private mappings or deployment were changed.

Independent review follow-up: four added regressions first reproduced the stale review
token, cross-source bootstrap, cross-source daily skip and corrected-unbooked-review
failures. All four now pass with the existing 27 checks; no money oracle was changed.

## App controls

Both presentations of Einstellungen › Datenquellen include the Spritmonitor source.
The source shows setup, running, review, success and failure states, an explicit refresh,
and a bounded, expandable history. Access credentials and provider IDs are configured
on the server; no secret fields are rendered. The read-only status additionally supplies
the configured destination labels and guarded `canResolve` / `canBook` capabilities.
These capabilities reuse the writer's durable booking history/global-key checks.

Open source rows also appear in the existing Konten › Prüfen detail. That detail uses
Spritmonitor's fingerprint-guarded link/book/ignore actions instead of generic task
completion. It shows current/original source values, existing ledger expense choices
within two days, the configured destination and the exact pending amount before an
explicit new booking. A link preserves an existing different net/gross amount. Reads
and disclosures do not book anything; historical review is loaded only when opened.
Source actions reuse the existing audited group Undo/redo UI.

A booked/linked row opens the existing normal BookingPanel, including its existing
account reassignment, category, amount, lock and Undo rules. Deleted/undone rows have
no rebook control. Unknown currency/missing-cost rows have no new-book action. A stale
review rejection refreshes the current token and shows the error without retrying the
money write. All new amounts use the existing privacy-aware native formatter.

## UI follow-up validation (2026-11-05)

- New Spritmonitor UI suite: 16/16 passed with one worker. It covers both source
  presentations and the actual ON/OFF inbox-detail integration, lazy ledger matches,
  setup/running/current/failure states, explicit refresh/link/book/ignore, native Undo,
  the existing booking editor, stale-token refusal without retry and amount privacy.
- Both server suites: 31/31 passed after adding read-only destination/capability data.
  The existing account-bank-review-724 UI path also passed all 10 checks unchanged.
- Affected ESLint, CSS-scale, web TypeScript and server TypeScript checks passed.
- The first UI run exposed incorrect use of the existing Field render-prop contract;
  fixing the component call made all 16 UI checks pass. No timeout, protected oracle
  or assertion was weakened. A later lint fix changed only an erased test type argument.
- Existing sync-test additions assert only the new destination/capability presentation,
  including `canBook: false` after native Undo. The native money/Undo expectations remain.

Desktop/mobile visual review is pending the root-coordinated synthetic preview. No
browser, Vite server, preview build, provider credential or production setting was
started or changed for this follow-up. The new source remains disabled by default.

## UI review correction (2026-11-05)

Independent review found two presentation defects: free monetary text could bypass
amount privacy, and the fingerprint-keyed source form owned the normal editor's draft.
The follow-up masks free station/location/note, candidate description/account and
configured destination labels. Unsupported numeric source amounts also use the shared
private-amount formatter when the currency is unknown; stored values remain untouched.

The normal BookingPanel and its state now live in the stable review parent, outside
source decision-token/status keys and loading/error returns. Source decisions still
reset when their token changes. An open booking draft remains under the existing native
editor's explicit save/discard, dirty and session guards during a source refresh or 503.

Validation: 19 Spritmonitor UI checks plus the 10 unchanged bank-inbox checks passed
serially with one worker (29/29). The new draft test retains the real BookingPanel and
its dirty guard; only CaptureForm is replaced by a stateful draft probe. It verifies the
same input/draft survives a fingerprint/status update and a source-read failure, native
cancel still asks before discard, and no POST occurs. Free-text privacy is checked both
before and after expanding history, including an amount with no known currency. The
original reviewer cases failed before the fix. Explicit cleanup now unmounts the real
panel before browser globals are restored; no assertion or timeout was weakened.
Affected ESLint, Prettier, web TypeScript and whitespace checks passed. API and financial
writers are unchanged. Root-coordinated browser/visual verification remains outstanding.
