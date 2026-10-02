# Bank sync (P4)

Bank sync stages booked transactions in **Konten › Posteingang**. Fetching never creates
bookings. The owner selects a category and confirms each item, or chooses **Nicht
übernehmen** for a duplicate/already recorded movement. Confirmation uses the existing
ledger validation, audit group and undo/redo path. Transfers should be checked against
both accounts and recorded using the regular transfer workflow; reject the corresponding
feed suggestions instead of recording a second movement.

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
   - `BUDGET_ORIGIN`: existing canonical HTTPS app origin.
5. Deploy through the normal approved workflow. When the app ID is configured, the server
   starts the separate bank worker on the same machine and SQLite volume, after migrations.
   `BUDGET_BANK_SYNC_DAILY=0` disables the worker for maintenance; queued manual runs
   also wait while it is disabled. Do not run a separate Fly machine with an independent
   volume for this worker.
6. Open **Einstellungen › Datenquellen → Bank verbinden**, complete the passkey step-up,
   select an institute, and approve the bank's read access. On returning, choose
   **Bankfreigabe abschließen** (another passkey confirmation may be necessary).
   Start and completion must use the same app session/browser; an expired callback requires
   a new connection.
7. Connect Dadat and PayPal if returned by the live institute list; connect Flatex only
   if it is listed for the application. The adapter requests available personal AIS
   institutes and presents Austria plus PayPal entries from other countries. Their names
   and availability are runtime provider data, never hardcoded account mappings.
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
- **Verbindung pausieren** stops this app's polling, not the bank's consent. Revoke consent
  at the bank/provider if desired. To renew, pause the old connection, connect again and
  assign its accounts. A mapping is immutable after its first successful fetch; one active
  source per local account prevents accidental cross-account duplication.
- One worker checks durable due timestamps every 30 seconds. Nightly runs are at 02:30 UTC
  (03:30/04:30 Vienna). Startup catches up a missed run. Manual requests queue the same job.
  A database lease prevents overlapping claims; a heartbeat extends it during paging.
- Each linked account reads its entire owner-selected date window on every run. This
  catches late postings and downtime without advancing past missing pages. Persistence
  happens only after all pages and a supported booked balance succeeded for that account.
  Other accounts may already have succeeded; their repeat fetch is idempotent.
- Only `BOOK` transactions are staged. Identity is scoped to the local account and uses
  `entry_reference`, or a SHA-256 hash of date, signed integer cents, currency, text and
  an occurrence index. Two identical reference-free purchases remain two suggestions.
  The provider explicitly says `transaction_id` is unstable and not a unique transaction
  identifier, so it is not used as a deduplication key.
- Booked `ITBD` / `CLBD` balances with an explicit statement date are compared with the
  existing booked-balance calculation for that date. Pending ledger bookings are excluded.
  Differences create warnings; no balancing booking is created. Missing booked balances,
  currency mismatches and unsupported data fail visibly rather than substituting an
  available balance or converting unsupported currencies.
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
