# Bank sync (P4)

Owner decision 41: **BOOK** transactions immediately become unchecked (`pending`,
"vorgemerkt") bookings without a category or income type and count in account balances.
Their classification task appears in **Konten › Posteingang**. **PDNG** transactions
remain candidates and count only after owner confirmation. No automatic categorization
or envelope assignment occurs. Einstellungen › Datenquellen offers a per-connection
**Gebuchte Umsätze** setting; the default is immediate BOOK posting, with confirmation-first
as an override for subsequent fetches. Existing bookings are retained.

Source identity remains in staging after posting/deletion, so repeated fetches and a
stable-identity PDNG→BOOK transition do not create another booking or resurrect one
the owner deleted. Automatic ledger changes have their own undoable audit group;
provider protocol history stays protected. Changed booked history produces a review
warning. Check transfers against both accounts and use the regular transfer workflow
without retaining duplicate feed bookings. The provider's [API reference](https://enablebanking.com/docs/api/reference/)
defines BOOK and PDNG; the adapter fetches both without a BOOK-only filter.

Owner decision 42: income can use **Für nächsten Monat** in the booking editor.
Defaults per payee, income category or income type are in Einstellungen › Zuordnungsregeln.
They apply when the owner creates/classifies income, never at automatic fetch.
Payee rules override category rules, which override income-type rules; an explicit
booking option overrides all defaults. Cash date and labels stay unchanged.

## Owner setup

1. Create an Enable Banking application in the [control panel](https://enablebanking.com/cp/applications).
   Choose production with restricted access to your own whitelisted accounts. The provider
   documents own-account use as free; verify the current limits in the control panel.
   Sandbox and production applications are separate.
2. Generate a private RSA key (at least 2048 bits, preferably 4096) and public certificate
   outside this public repository, or use the provider's browser generation/export flow.
   Upload **only the public certificate/key** to the application. Keep the private key in
   the owner's secret store. Do not attach either key to issues, commits, logs or this PR.
3. Register this exact redirect URL for the application's HTTPS origin:
   `https://<app-host>/einstellungen/datenquellen`.
4. Set Fly secrets on the existing application using `fly secrets import` with input from
   the owner's secret manager (never paste secret values into shell history):
   - `ENABLE_BANKING_APP_ID`: registered app identifier.
   - `ENABLE_BANKING_PRIVATE_KEY`: PEM private key (literal newlines or escaped
     `\n`). Alternatively `ENABLE_BANKING_PRIVATE_KEY_PATH` points to a securely
     mounted PEM file readable by the application; do not bake it into the image.
   - `BANK_SYNC_ENCRYPTION_KEY`: independent cryptographically random 32-byte key,
     encoded as 64 hexadecimal characters. Back this key up separately from SQLite.
   - `BANK_SYNC_ENCRYPTION_KEY_VERSION`: positive integer key version (default `1`).
     Ciphertexts carry a `v<version>:` prefix; unprefixed legacy values use version `1`.
   - For rotation, set a new key and increment its version; retain the old key as
     `BANK_SYNC_PREVIOUS_ENCRYPTION_KEY` and its version as
     `BANK_SYNC_PREVIOUS_ENCRYPTION_KEY_VERSION` (default `1`). Successful account
     and consent syncs re-encrypt live identifiers. Keep the previous key with the
     corresponding encrypted backups/audit history; never replace a key without a
     new version. Paused or failing connections still require the old key until renewed.
   - `BANK_SYNC_EXTRA_INSTITUTIONS`: optional comma-separated exact institution names
     to include outside Austria. Set real names only in the owner's Fly configuration,
     never in this repository. Matching ignores case; it does not use substring filters.
   - `BUDGET_ORIGIN`: existing canonical HTTPS app origin.
5. Deploy through the normal approved workflow. When the app ID is configured, the server
   starts the separate bank worker on the same machine and SQLite volume, after migrations.
   `BUDGET_BANK_SYNC_DAILY=0` disables the worker for maintenance; queued manual runs
   also wait while it is disabled. Do not run a separate Fly machine with an independent
   volume for this worker.
6. Open **Einstellungen › Datenquellen → Bank verbinden**, select an institute, and approve the bank's read access. On returning, choose
   **Bankfreigabe abschließen** (no extra passkey confirmation is needed; the login that opened the app is enough).
   Start and completion must use the same app session/browser; an expired callback requires
   a new connection.
7. Choose institutions returned by the live list. The adapter requests personal AIS
   institutions and presents Austria plus the owner's configured extra institutions.
   Availability and account mappings are runtime data.
8. Assign each provider account to an existing EUR account. Choose the first date whose
   feed suggestions should be reviewed; it must not precede that account's opening date.
   Compare the first booked balance, review the inbox, then validate daily operation over
   14 days. No live provider request was made during implementation.

## Behaviour and safeguards

- JWTs use RS256, app ID as `kid`, documented issuer/audience and a five-minute lifetime.
  Requests use the fixed API origin, refuse HTTP redirects, time out after 30 seconds,
  validate responses with zod and cap body size, pages and rows.
- Consent requests are bounded by 180 days and the institute's advertised maximum.
  The returned `valid_until` is authoritative. One durable reminder per consent appears
  at or within 14 days of expiry. Expired consents are not fetched.
- Session IDs and account UIDs are AES-256-GCM encrypted with row-specific authenticated
  context, including in audit snapshots. Only minimal account labels/currency are retained;
  account numbers, IBANs, addresses and raw API bodies are discarded. State is random,
  hashed, session-bound, valid for 30 minutes and atomically consumed before session creation.
  Protocol state cannot be restored through generic undo, even forced undo; pause/reconnect
  instead. Mapping changes before the first fetch, booking confirmations and inbox decisions remain undoable.
  Pending/failed callbacks without a remote session expire after 30 minutes and are
  removed from the active list with an audited abandoned tombstone; no ledger history
  is hard-deleted. Invalid keys or a missing/invalid origin disable bank sync with a
  redacted `not_configured` log line while the ledger API remains usable.
- **Verbindung pausieren** stops this app's polling, not the bank's consent. Revoke consent
  at the bank/provider if desired. To renew, pause the old connection, connect again and
  assign its accounts. A mapping is immutable after its first successful fetch; one active
  source per local account prevents accidental cross-account duplication.
- One worker checks durable due timestamps every 30 seconds. Nightly runs are at 02:30 UTC
  (03:30/04:30 Vienna). Startup catches up a missed run. Manual requests queue the same job.
  A database lease prevents overlapping claims; a heartbeat extends it during paging.
- The first successful account run reads from the owner-selected start date; subsequent
  runs read from the later of that date and the account's last successful sync minus
  21 days. The overlap deduplicates late postings. Each account stage is atomic and
  failures do not stop later accounts of that consent; retries skip accounts that already
  committed in the failed attempt. A durable per-account/day counter reserves every
  request before HTTP, including failed requests, retries, manual runs and restarts.
  At most four account requests per Vienna calendar day are sent; paging is limited to
  three transaction pages plus one balance request. Incomplete pages never stage rows.
  A longer first-run history requires a newer owner-selected start date. A history-period
  refusal gives an explicit start-date message without copying the provider's error text.
- Both `BOOK` and `PDNG` transactions are fetched. `BOOK` enters the ledger immediately
  unless the connection requires confirmation; `PDNG` stays a candidate. Identity is scoped to the local account and uses
  `entry_reference`, or a SHA-256 hash of date, signed integer cents, currency, text and
  an occurrence index. Two identical reference-free purchases remain two suggestions.
  The provider explicitly says `transaction_id` is unstable and not a unique transaction
  identifier, so it is not used as a deduplication key.
  References repeated within a complete batch use fingerprint plus ordinal for all
  affected rows. Changed unique references update open candidates; already confirmed
  or dismissed candidates produce a persistent "geändert" warning without changing
  their booking or decision. Changes from/to ambiguous references remain owner review.
- Dates use `booking_date`, then `value_date`, then `transaction_date`. Invalid/negative
  raw amounts, malformed rows and rows outside the requested window are skipped with
  redacted inbox counters; valid rows still stage. Pending rows never stage.
- Booked `ITBD` / `CLBD` balances with an explicit statement date are compared with the
  existing booked-balance calculation for that date. Pending ledger bookings are excluded.
  Differences update one warning per account, suppressed while unconfirmed BOOK candidates are open;
  unchecked BOOK ledger entries count in this comparison, while PDNG candidates do not;
  no balancing booking is created. An undated booked balance leaves transactions intact
  and creates a notice instead of comparing. Missing booked balances and currency
  mismatches fail visibly rather than substituting an available balance or converting
  unsupported currencies. App JWT authentication errors are separate from consent expiry.
- Failures create redacted inbox items and exponential retry delays (15 minutes up to
  24 hours), respecting longer `Retry-After` values up to 24 hours. Manual refresh cannot
  bypass retry delays or the 15-minute minimum between attempts.
- This slice supports EUR only. Foreign-currency accounts stay visibly unsupported.
  Generic domain, route and table names use `bank-sync`; provider conventions stay in
  the adapter module.

## Open questions / acceptance still required

- Is 02:30 UTC sufficient, or should the owner require a Vienna-local time/twice daily?
- Banks can revise text/dates or introduce references on previously reference-free rows.
  Those ambiguous changes require owner review; fuzzy matching must not silently drop
  legitimate purchases. Changed feed history and real bank coverage need private acceptance.
- Restricted/free account eligibility and live coverage for each requested institution
  must be verified by the owner; no claim of live consent or successful production sync.
- Historical availability is bank-dependent. The selected start date is a request, not a
  guarantee of full history. First-run reconciliation and the 14-day operational gate stay open.
- Automatic assignment rules and transfer matching are not introduced here: no existing
  bank staging assignment engine was available. Category selection uses existing lookups.

Sources: [API reference](https://enablebanking.com/docs/api/reference/),
[own-account access](https://enablebanking.com/docs/api/linked-accounts),
[personal-use terms](https://enablebanking.com/terms/).
