import { describe, expect, it } from 'vitest';
import { bulkFieldProtection, type BulkBookingProtection } from './bulk-field-protection';

const plain = {
  reconciled_locked: false,
  linked_transfer: false,
  linked_contact: false,
  linked_expected: false,
  linked_trade: false,
  linked_payroll: false,
  linked_document: false,
  linked_statement: false,
  linked_bank: false,
  invalid: false,
};
describe.each(['memo', 'date', 'payeeId'] as const)('%s bulk protection', (field) => {
  it('allows ordinary records, including ordinary category splits and plain attachments', () => {
    expect(bulkFieldProtection(field, plain)).toBeNull();
  });
  it.each([
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
  ] as BulkBookingProtection[])('protects %s', (reason) => {
    expect(bulkFieldProtection(field, { ...plain, [reason]: true })).toBe(reason);
  });
  it('keeps lock and transfer precedence when several owners apply', () => {
    expect(
      bulkFieldProtection(field, {
        ...plain,
        reconciled_locked: true,
        linked_transfer: true,
        linked_trade: true,
      }),
    ).toBe('reconciled_locked');
    expect(
      bulkFieldProtection(field, { ...plain, linked_transfer: true, linked_trade: true }),
    ).toBe('linked_transfer');
  });
});
