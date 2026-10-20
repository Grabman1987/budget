import { describe, expect, it } from 'vitest';
import { manualTransferStatus } from './manual-transfer-status';

describe('new manual cash/bank status policy #585', () => {
  it.each(['checking', 'savings'])(
    'keeps cash confirmed and %s independently pending or confirmed in either direction',
    (bank) => {
      expect(manualTransferStatus('cash', bank)).toEqual({
        cashSide: 'from',
        fromStatus: 'confirmed',
        toStatus: 'pending',
      });
      expect(manualTransferStatus(bank, 'cash')).toEqual({
        cashSide: 'to',
        fromStatus: 'pending',
        toStatus: 'confirmed',
      });
      expect(manualTransferStatus('cash', bank, 'pending')).toEqual({
        cashSide: 'from',
        fromStatus: 'confirmed',
        toStatus: 'pending',
      });
      expect(manualTransferStatus(bank, 'cash', 'pending')).toEqual({
        cashSide: 'to',
        fromStatus: 'pending',
        toStatus: 'confirmed',
      });
      expect(manualTransferStatus('cash', bank, 'confirmed')).toEqual({
        cashSide: 'from',
        fromStatus: 'confirmed',
        toStatus: 'confirmed',
      });
      expect(manualTransferStatus(bank, 'cash', 'confirmed')).toEqual({
        cashSide: 'to',
        fromStatus: 'confirmed',
        toStatus: 'confirmed',
      });
    },
  );
  it.each([
    'cash',
    'credit_card',
    'loan',
    'brokerage',
    'crypto',
    'p2p',
    'receivable',
    'other_asset',
    'other_liability',
    'unknown',
  ])('does not classify cash/%s as a bank pair', (type) => {
    expect(manualTransferStatus('cash', type)).toBeNull();
    expect(manualTransferStatus(type, 'cash', 'confirmed')).toBeNull();
  });
  it('does not classify bank/bank or a missing account as a cash pair', () => {
    expect(manualTransferStatus('checking', 'savings')).toBeNull();
    expect(manualTransferStatus('savings', 'checking', 'confirmed')).toBeNull();
    expect(manualTransferStatus('', 'checking')).toBeNull();
    expect(manualTransferStatus('cash', '')).toBeNull();
  });
});
