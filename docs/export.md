# Account and depot CSV export

The export is one user-initiated ZIP download after a fresh passkey step-up. It contains exactly these UTF-8 CSV files:

| File | Contents |
| --- | --- |
| `accounts.csv` | Account metadata and balance read model |
| `bookings.csv` | Complete stored booking history, including split and original-currency fields |
| `trades.csv` | Stored trades and their booking links |
| `holdings.csv` | Stored holding snapshots |
| `prices.csv` | Stored security price history |
| `valuations.csv` | Stored account valuations |
| `securities.csv` | Security identification and selected quote fields |
| `asset_classes.csv` | Asset class definitions |
| `asset_class_targets.csv` | Stored target history |
| `asset_target_policies.csv` | Complete version metadata, managed targets/band modes and investment-sum tiers (JSON); legacy and new versions |
| `security_exposure_versions.csv` | Effective dates, source and explicit completeness, including empty unknown sets |
| `security_asset_exposures.csv` | Full weighted security/class history in integer basis points |
| `fx_rates.csv` | Stored exchange-rate history |
| `savings_plans.csv` | Stored savings-plan rows |
| `positions.csv` | Per-account position read model as of the export date |

Each CSV starts with a UTF-8 BOM, uses semicolons between fields and CRLF line endings. Text cells are quoted with double quotes; embedded quotes are doubled. Text beginning with a spreadsheet formula marker (`=`, `+`, `-` or `@`) after leading whitespace or control characters receives a leading apostrophe before CSV quoting. Other text is emitted unchanged; formula-like source text is intentionally prefixed in the archive to prevent spreadsheet formula evaluation.

Stored money amounts use integer cents and retain their source currency. Prices use integer micro-units, units use integer `units_e8`, and rates and target shares use integer micro-units and basis points respectively. Do not parse these integer fields as floating-point currency. Empty values remain empty; they do not imply zero.

`positions.csv` reports current computed balances and positions as of the export date; stored booking, trade, holding, price, valuation, FX-rate, target and savings-plan history is exported in full, including future scheduled bookings. A position whose value cannot be calculated has blank value fields and an explicit `valuation_basis` such as `missing_price` or `missing_fx`; missing source currencies are listed in `missing_fx_currencies`. Cost basis status is `known`, `undocumented` or `missing_fx`. These statuses explain unavailable calculations and do not replace stored source rows.

For split bookings, `booking_amount_cents` repeats the parent booking amount on each split row. Use `split_amount_cents` to aggregate the split allocation; do not sum the repeated parent amount across rows. `split_id` and `split_index` identify split rows, while booking-level and split-level memos remain separate.

The ZIP is a data export, not a backup or restore artifact. It contains no authentication/session state, credentials, audit events, import staging data or opaque provider configuration.

Current class labels in `securities.csv` and `positions.csv` resolve the exposure effective on the export date. Mixed products show weighted class labels; the two exposure history files preserve the precise dated semantics and incomplete remainder. Legacy `security.asset_class_id` is not used for these labels. See [historical exposure](asset-exposure.md).


The API admits one in-flight export for the single owner (database identity, across
sessions/devices), with a process-wide cap of two. Excess requests return
`429 export_busy` with a German retry hint. Admission happens before temporary
snapshot allocation and remains held until response completion/cancellation and
snapshot cleanup. Limits are process-local; run one API process per database.

## Encrypted application backup download

`GET /api/export/backup.age` is separate from the CSV export. It uses the same
session and fresh passkey step-up middleware and shared admission slot; recovery
sessions are denied before storage access. It reads only the latest completed
`encrypted/budget-YYYY-MM-DD.tar.age` object from the existing nightly backup
destination. It never creates a snapshot, decrypts data, changes retention (30
daily and 12 monthly copies), or restores the application. Older DB-only
`.sqlite.age` objects and partial/other files are not eligible.

Before returning download headers, the server stages ciphertext in a restricted
temporary directory, verifies its exact length, the single-PUT MD5 ETag and the
age header, then streams it with `no-store` and `nosniff`. Multipart/missing ETags,
encoded bodies, redirects and interrupted or inconsistent transfers fail closed.
Storage headers have the existing 30-second deadline; transferring ciphertext
allows one additional second per MiB, as does the nightly uploader. Temporary
files and admission are released on completion, cancellation or failure. MD5
checks transport consistency, not authenticity against a compromised storage
service; age authenticates the archive when the owner decrypts it. The server
has no private age key and cannot verify decrypted archive contents.

No completed artifact returns `404 backup_missing`; unavailable configuration,
storage or failed integrity returns `503 backup_unavailable`, without provider
details. Concurrent CSV/backup downloads return `429 export_busy`. A failed
latest artifact is not silently replaced with an older copy. The filename shows
the UTC backup day; the artifact may precede recent edits.

The archive contains the database (including authentication/session state) and
hash-referenced receipts, including retained receipts needed for Undo. It excludes
server configuration and external secrets. Restore requires the separately held
private age key, archive/database/receipt verification and restoring both DB and
receipts together in maintenance mode; see [operations, section 8.3](ops.md).
Losing `BUDGET_PEPPER` invalidates existing recovery codes, so regenerate them
after passkey login; it does not prevent database decryption or restoration.
Downloading is not evidence of a successful real restore.
