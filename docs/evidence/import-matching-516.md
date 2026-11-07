# Import matching audit — #516, first bounded step

This slice audits the existing bank matcher and adds a review explanation. It does
not complete WP-008 or enable application file imports. All cases use synthetic
accounts, source rows and integer cents.

## Findings and correction

Literal regressions exposed two defects in the existing identical-group exception:

- Two identical source lines could pair with two bookings whose dates differed.
- Two different source-date groups could each claim the same pair of bookings.
  The service could resolve four source rows onto two bookings, losing provenance.

Pairing now requires an equal-sized pool with a common booking date and no candidate
claimed by a source line outside that group. Otherwise the existing ambiguity note
and explicit review remain. Reversing competing groups does not choose a winner.
The existing four-day threshold, five-day suggestions, signed cents, account and
currency filters, and nearest/input-order singleton tie behavior are unchanged.

The review dialog explains the source, the five-calendar-day suggestion window,
the need to confirm and why date ranking does not prove a unique match. Existing
source descriptions, revision warnings and bank-reference behavior remain intact.

## Coverage and test-file rationale

- `packages/domain/src/bank-matching-516.test.ts`: literal four/five-day edges in
  both directions across DST/month end, exact identity filters, date/ID ties,
  ambiguity, duplicate-group regressions, 21-day year/leap/DST boundaries and
  start-date clamping. Literal fallback keys show complete-batch reorder stability
  and the limitation when a repeated provider reference becomes unique.
- `apps/server/src/bank-sync/service.test.ts`: additive cases prove that both
  defects leave source items open with unchanged bookings/balances on redelivery;
  a failed link audit rolls back staging and preserves the watermark, then retries
  the overlap edge successfully and Undo restores the original booking/provenance.
  Existing tests for source revisions, ordinal redelivery and isolated identical
  pairs remain unchanged.
- `apps/web/src/inbox/bank-matching-516.test.tsx`: redesign ON renders the source and
  ambiguity explanation; selecting a different suggestion and cancelling writes
  nothing.
- `e2e/issue-516-matching.spec.ts`: isolated synthetic ledger, real match API and
  fifth-day targets on both sides; selection/cancellation remains read-only.

## Remaining gates and boundaries

The existing tests explicitly permit isolated identical source/booking groups to
pair in order and singleton source claims to resolve by nearest date/input order.
These legacy exceptions are retained. SPEC-004's broader unique-only wording is
therefore not a claim that all multi-row ambiguity is eliminated; a policy change
needs separate review and must not silently replace protected test expectations.

Fallback keys still depend on the complete batch's reference population and
occurrence ordinals. This audit does not claim universal provider idempotency when
pagination or source populations change. Wider revision/batch persistence,
operator migration/revert and privacy-error acceptance remain in #516; existing
tests are evidence only for their covered cases. No automatic FX transfer matching,
provider setup, production import, migration or historical rewrite is added.

Required exact-head CI, lead integration and owner acceptance remain separate from
this draft PR. The PR records the tested revision and concrete local results.
