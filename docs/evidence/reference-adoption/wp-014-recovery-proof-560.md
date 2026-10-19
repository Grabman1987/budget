# WP-014 — Isolated synthetic recovery proof (#560)

This is a repeatable **synthetic-only** drill of the existing receipt-aware archive
and the staging procedure in [the restore runbook](../../ops.md#83-restore-from-an-encrypted-copy).
It does not restore production, contact a bucket/provider, change restoration or
financial-write semantics, establish private-key custody, or accept the parent
package #522 as complete. The owner decisions recorded in #522 remain authoritative.

## Run the proof

Use Node from `.nvmrc`, the installed project dependencies (`npm ci`), `age`,
`age-keygen`, and TAR on `PATH`. Windows uses the existing native `tar.exe`
selection. From the repository root:

```sh
node --import tsx scripts/recovery-proof.ts
```

The script accepts no arguments or external data locations. It creates an empty
migrated SQLite database, the existing small synthetic repository fixture, receipt
bytes, and a disposable age identity inside one private OS temporary directory.
The production archive builder takes the consistent database-plus-receipts
snapshot. Real age encryption/decryption and TAR extraction restore into fresh
scratch staging directories. Validated staging is renamed only within this
disposable scratch tree. All temporary databases, plaintext, encrypted test
archives and disposable keys are removed on success or failure. Keys, receipt
contents, private paths, financial values and child stderr are never printed.

A missing executable or failed check exits nonzero with a fixed phase-specific
error. There is no skip, download, production endpoint, supplied backup path,
retention override or mode that keeps test keys.

## Independent expected state

All numbers below describe synthetic data, in integer cents:

| Fact | Literal expected value |
| --- | --- |
| Opening checking-account balance | `100000` |
| Expense / later refund | `-3456` / `456` |
| Booking sum / split sum | `-3000` / `-3000` |
| Category `essen` / category `miete` | `-778` / `-2222` |
| Final checking-account balance | `97000` |

The expense splits are `-1234` and `-2222`; the refund adds `456` to `essen`.
Thus the literal expectations are derived independently of Budget's balance
implementation. The production balance read model is checked against `97000`;
SQL sums, exact booking amounts, category totals and SQLite integer storage are
checked separately.

The existing one-pixel PNG and minimal synthetic PDF have literal independent
SHA-256 expectations:

- PNG: `3fd24bcfdb17a6027c5f3ed896d17a020d6ff9d9e4d06362461a9b44b6ac1b52`
- PDF: `59be283d840f08fb0753a6aa06a0625f8b24b11ce1297d68af9e4ed812803135`

Restored bytes must equal the fixtures byte for byte and match these digests. The
PNG must link to the precise expense booking; the removed PDF receipt and its
bytes must remain present for undo. Independent SHA-256 fingerprints of ordered
raw account, booking, split, receipt, booking-receipt and audit rows must equal
the pre-backup source. These are verification fingerprints, **not** a new stored
or cryptographically authenticated audit hash chain. The actual audit contract
uses before/after snapshots and `undo_of_id`; its references must resolve to the
same entity. Three source undo links survive restoration. Undo and redo in the
restored scratch database then unlink/relink the receipt, preserve all ledger
cents, and leave five valid undo references.

## Rejection and unchanged-state proof

Every negative attempt stages separately and must fail at the named check before
publication. Afterward the source database's serialized fingerprint, complete
source receipt tree, and complete existing scratch tree must be unchanged.
That scratch tree includes a sentinel and the previously restored database and
receipt store; candidate directories/partial plaintext must also disappear.

| Synthetic damaged input | Required failure stage |
| --- | --- |
| Flipped encrypted payload byte | Decryption |
| Truncated encrypted payload | Decryption |
| Encrypted TAR containing an invalid SQLite file | Database integrity |
| Encrypted TAR containing altered receipt bytes | Receipt integrity |
| Valid SQLite with the receipt linked to the wrong booking, same row counts | Row/fingerprint validation |
| Valid SQLite with an altered audit actor, same row counts | Row/audit fingerprint validation |
| DB-only archive without receipt bytes | Receipt integrity; recovery is incomplete |

This demonstrates a synthetic staging procedure that preserves current files;
it does not add an application restore endpoint or promise automatic rollback
for arbitrary operator commands. No existing write path, cent guard, lock or
undo implementation is changed.

## Distinct data mechanisms

| Mechanism | Meaning in Budget | Recovery boundary |
| --- | --- | --- |
| CSV ZIP export | Current user-initiated, fresh-passkey-step-up download of allowlisted owner-readable financial CSVs | Portability/analysis, without full app state, audit or receipt bytes; not restorable |
| Portable application export | A standalone app-state interchange/import format; no separate supported Budget format or app import exists in this scope | Do not imply the CSV ZIP can recreate an application instance |
| Sync and offline capture | Existing server-authoritative API and queued idempotent captures; browser read snapshots are a last fetched view | Neither an independent copy nor recovery after server/device loss; Litestream replication is separately DB-only |
| Encrypted operational backup | Age-encrypted TAR pairing the consistent full SQLite snapshot with referenced receipt blobs, including undo-retained files | Privileged offline-key recovery of DB and matching receipts; distinct from the public export allowlist |

See [CSV export](../../export.md), [receipts](../../receipts.md),
[SPEC-011](../../product/specs/SPEC-011-recovery.md), and [operations](../../ops.md).

## Validation and remaining gates

The normal Vitest include patterns do **not** discover this standalone script.
The additive [Recovery proof workflow](../../../.github/workflows/recovery-proof.yml)
now runs it automatically on pull requests affecting its script, archive/receipt
implementation, database/domain dependencies, package lock or Node version. The
Linux job installs real age from Ubuntu's package repository and executes:

```sh
npx --no-install tsx scripts/recovery-proof.ts
```

The workflow uses pinned actions, read-only repository permissions and disposable
synthetic keys/data. It uploads no artifacts and uses no stored secrets. The
existing CI workflow and tests remain unchanged; Windows unit CI does not install
age or execute this Linux job. A green ordinary `npm run check` or Windows CI
alone does not establish that the new drill ran. No missing-age skip is introduced.

At this document update, the workflow and its exact command have been reviewed
and the real-age drill has passed locally and independently, but the added job
has not yet run on the final PR head. The PR must record the actual automated
Recovery proof result and exact head separately from earlier local/full-CI runs.

The PR records the exact revision, actual command results and independent review.
Live delivery, an owner-operated restore with private backups/keys, provider
access, periodic drill ownership and second independent storage remain separate.
