/** Bulk-only policy; individual editors retain their existing metadata exceptions. */
export type BulkBookingField = 'memo' | 'date' | 'payeeId';
export type BulkBookingProtection =
  | 'reconciled_locked'
  | 'linked_transfer'
  | 'linked_contact'
  | 'linked_expected'
  | 'linked_trade'
  | 'linked_payroll'
  | 'linked_document'
  | 'linked_statement'
  | 'linked_bank'
  | 'invalid';

/** Ordered by the existing register ownership reader's reason precedence. */
export const BULK_FIELD_PROTECTION: Readonly<
  Record<BulkBookingField, readonly BulkBookingProtection[]>
> = {
  memo: [
    'reconciled_locked',
    'linked_transfer',
    'linked_contact',
    'linked_expected',
    'linked_trade',
    'linked_payroll',
    'linked_document',
    'linked_statement',
    'linked_bank',
    'invalid',
  ],
  date: [
    'reconciled_locked',
    'linked_transfer',
    'linked_contact',
    'linked_expected',
    'linked_trade',
    'linked_payroll',
    'linked_document',
    'linked_statement',
    'linked_bank',
    'invalid',
  ],
  payeeId: [
    'reconciled_locked',
    'linked_transfer',
    'linked_contact',
    'linked_expected',
    'linked_trade',
    'linked_payroll',
    'linked_document',
    'linked_statement',
    'linked_bank',
    'invalid',
  ],
};

/** Facts are gathered from persisted booking, split, owner and audit metadata. */
export function bulkFieldProtection(
  field: BulkBookingField,
  facts: Readonly<Record<BulkBookingProtection, boolean>>,
): BulkBookingProtection | null {
  return BULK_FIELD_PROTECTION[field].find((reason) => facts[reason]) ?? null;
}
