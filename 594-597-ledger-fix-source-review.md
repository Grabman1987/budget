# Narrow source-only review: Ledger #594–597 correction

Worktree `/workspace/impl-ledger-594-597`, head `385004715da6b5d2dca4880b474376e7b3703aba` against prior reviewed head `6b5401d176658b4225f09d21c018a61cadfd90ea` (package base `6420676d257698767931dd151863765cec914acf`). Scope: correction delta only, using `/workspace/.budget-tools/cloud-control/594-597-ledger-source-review.md` for the original two findings. No tests, checks, build, browser, CI or source mutation.

No new actionable finding in this correction delta. `packages/db/src/repos/ledger-queries.ts:321-339,428-454,597` now accumulates classified split contributions and whole-filter net in `bigint`, converts only within `Number.MAX_SAFE_INTEGER`, and sends `null` for unsafe/unknown values. The web DTO, filter summary and row view carry/render that nullable state (`apps/web/src/ledger/types.ts:129,160`; `bookings-page.tsx:235`; `booking-table.tsx:515-517`). This addresses the prior overflow/render failure without altering native totals, row selection or the classified source of the net figure.

The three new read-only preview/result surfaces now apply `maskMoneyText` to descriptions, account names and before/after memo/payee labels (`booking-bulk-edit.tsx:56-63,88-93`; `booking-delete-preview.tsx:56-58`; `booking-selection-bar.tsx:44-49`). Structured amounts still use the existing privacy-aware native formatter. The editable TextInput and Select values, preview payload and writer inputs remain literal. Existing payee/category/project picker option labels are outside the previously reported read-only preview leak.

This is static source evidence only; no runtime privacy, query or financial-parity claim. The package remains NOT VALIDATED; #719 STOP is unchanged.
