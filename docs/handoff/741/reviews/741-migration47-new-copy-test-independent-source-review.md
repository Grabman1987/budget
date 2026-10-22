# NEW741 migration47 copy-test independent source review

Verdict: HOLD for one concrete NEW fixture setup error. This is source review only; no migration, tests, typecheck or other runtime executed.

Bound immutable manifest: 4a9bd90e5141549555d6cef62c378491d70279e5c197ff3411d6e8f70c79ef14, baseline 3dcce9f2afd40c905db6e22d4977f845edef75a2. Reviewed NEW packages/db/src/statement-automation-migration-741.test.ts SHA 07b660bf0daca52071b254b4995e7d65fa257064e1589b2d9d460489a3118677. Current source matches frozen copy. Domain/repository tests are separately reviewed by 686.

## Necessary NEW fixture correction

The initial createBooking call omits required splits. BookingInput requires SplitInput[] and assertSplits immediately reads splits.length. Therefore typechecking fails and runtime setup would throw before opening the disposable copy or reaching any migration oracle. Keep the literal card purchase −10000 and supply its real matching uncategorized split: splits: [{ categoryId: null, amountCents: -10000 }]. No product change or weakened assertion is needed.

## Meaningful expected product failure

Keep the later-migration rollback refusal. The current rollback47 SQL checks FK protocol, retained configs/runs/rows/audits and machine/null-reference settlement intent, but does not reject a journal entry newer than47. The synthetic later marker is legitimate for that guard: it does not require another physical schema and cannot trigger an unrelated FK or retained-intent refusal. With the initial fixture repaired, current SQL can rebuild46 and delete only its47 journal entry while retaining the later marker. Its expected-to-throw failure would expose a product rollback safety gap, not a broken fixture. This is a source prediction, not an actual test result.

## Remaining bounded source read

No second concrete setup blocker found. Through46 and through47 folders are sliced from the real journal and used explicitly for initial upgrade and both re-upgrade calls, isolating future migrations. Real accounts/source/manual review/configuration/settlement and represented transfer populate the46 source; retained inactive self-FK rows are explicitly synthetic preservation fixtures rather than claimed writer actions. Source closes before copyFileSync. The disposable copy is the only upgraded/rolled-back database; a reopened source is compared against its complete prior rows.

Legacy table/audit comparisons include all non-sqlite tables; migration journal normalization is confined to expected forward journal additions. Literal funding/card balances 40000/0, whole-action Undo 50000/−10000 and redo40000/0 retain the original purchase audit. Empty rollback compares all prior rows and re-upgrades twice; wrong-FK and retained-intent refusal compare table/schema state and restore foreign_keys in finally. Historical supersession/self-FK rows and FK/integrity checks are meaningful. The seven parameter cases plus three standalone cases declare ten migration tests, not executed here.

These assertions do not prove runtime success, full automation coverage, backup/restore, private layout recognition or production deployment. No OLD test or project file was modified by this review.
