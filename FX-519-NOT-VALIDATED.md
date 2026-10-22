# #519 manual FX preparation — NOT VALIDATED; posting remains unsupported

Pinned base: `6b5401d176658b4225f09d21c018a61cadfd90ea`.
Read fresh #519 body/comments twice on 2026-10-22, including the latest/only
comment 6231207155 (2026-10-17). No later owner posting-policy answer was present.
Read current SPEC-008 §§4–15 and reference-adoption “Limited transfers approved for
preparation”. The bounded direction is accepted; unconditional posting policy is not.

## Implemented source

A nonwriting `/konten/fx-vorbereitung` page, linked from the bookings ⋯ menu, reuses
the existing authenticated accounts read. It collects explicit EUR↔USD principal
accounts/amounts, actual execution date, the agreed raw decimal rate in the stated
`destination/source` orientation and source reference. It requires an explicit
no-fee/separate-fee choice; a separate real fee needs its charged account, native
amount, actual date and evidence reference. Preparation is limited to open checking,
savings and cash accounts in those two two-decimal currencies; fee facts refer to
one of the two selected accounts. These UI limits are not posting permission.

Amounts stay raw de-AT facts and are parsed through the existing integer-cent
parser. Arithmetic, fractional-cent inputs and blur rewriting are excluded. Only
exact BigInt cross-multiplication compares the supplied rate with the supplied
native principals; no rate, target amount, rounding tolerance or ECB value is
inferred. A mismatch requires manual review and never changes either input.

There is no Save, mutation request, upload, local/device storage, migration, bank
matching or pairing. Leaving discards this temporary preparation. The summary
explicitly says no booking was created and that EUR/reference-rate valuation is
not checked here. The existing cross-currency writer/invariant rejection remains.
This does not complete #519's posting, atomic fee, locks, rollback or Undo criteria.

## Concrete decisions for the first posting slice

1. **Quoted-rate rounding:** the document says 100.00 USD at 0.90125 EUR/USD and
   90.13 EUR received. Multiplication yields 90.125 EUR, whereas the exact ratio of
   the native booked amounts is 0.9013 EUR/USD. Keep all facts and support a specified
   documented half-cent convention, or initially reject every non-exact quote/native
   pair for manual review? Proposed narrow starting point: exact pairs only.
2. **Reference-rate difference:** 100.00 USD→90.00 EUR at agreed 0.90 EUR/USD, with
   dated reference 0.95 EUR/USD, reduces reference-valued principal by 5.00 EUR even
   without a separate charge. Permit that as a disclosed execution effect within
   internal value/return change, or keep every nonzero reference/execution difference
   in manual review for the first posting slice? Neither option adds a synthetic
   5.00 EUR fee or invented income. Current direction leaves unsupported spread in
   review; approval is needed to admit this documented nonzero case.
3. **First supported budget boundary:** 100.00 EUR from an EUR budget account→
   110.00 USD in an off-budget tracking account, plus an actually separate 2.00 EUR
   source-account fee. Admit this using the existing explicit budget-leg category
   for the 100.00 EUR principal and a separate chosen expense category for 2.00 EUR,
   or initially restrict FX posting to tracking ↔ tracking cash accounts? The existing
   same-currency budget-leg rule is already defined; whether the initial FX variant
   admits this mixed budget scope is not specified by its allowed-account-role gate.

These are financial policy/initial-scope choices. In contrast, the current
same-currency guard, absent metadata and required additive storage are implementation
work, not reasons to ask the owner to approve ordinary source edits. Once the slice
is fixed, use the canonical two-principal transaction with explicit pair metadata,
separate actual fee, provenance, idempotency, current locks and grouped audit/Undo.
Embedded charges, unknown spread, missing rate/amount, unsupported fee sources and
lossy other-currency precision remain rejected/manual review. Existing data stays.

## Source trace and remaining work

- `TransferInput` and `createTransfer` accept one principal amount, require equal
  account currencies and create opposite native bookings in one transaction.
- `assertTransfer` requires exactly two live legs, equal currency and opposite
  nonzero cents. Existing transfer rows store identity/time only; no executed-rate
  orientation, native-pair provenance or separate-fee relationship is persisted.
- Existing budget-leg attribution and investment boundary-flow conversion consume
  the current pair identity. They must be reconciled with any accepted FX variant;
  bypassing the invariant with unrelated manual bookings would not be equivalent.
- No dedicated 519/FX preparation branch was found in bounded branch/ref inventory,
  handoff index and subject-history search. Historical WP-011 freedom-history files
  are a different package and were not adopted.
- #511 is CLOSED/live; #516 is OPEN and explicitly excludes new automatic FX matching.
  This checkpoint neither changes those dependencies nor implements bank matching.
- No migration was created/reserved: root owns numbering (#514 reserves 50; #762 may 51).
  Router wiring was supplied as an external root-owned additive patch and applied
  by Root. No server/API/schema/barrel or financial writer source changed.

No tests were added, edited or run; no checks/typechecks/build/browser/CI/PR/merge/
deploy. No private data, dependencies or old evidence was copied. Meaningful later
proof must cover exact native conservation, accepted rate policy, separate fees,
missing FX, second-leg failure rollback, linked locks, grouped Undo/redo and source
exclusions. Keyboard/mobile/privacy/Axe/44px/overflow, independent full financial
review and all delivery gates remain open. Workflow inspection shows CI push only
on main; this branch is a normal WIP checkpoint push with no PR.
