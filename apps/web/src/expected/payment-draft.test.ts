import { describe, expect, it } from 'vitest';
import type { ExpectedPayment } from './api';
import {
  changedFields,
  draftFromPayment,
  emptyDraft,
  parsePercentBp,
  percentText,
  readDraft,
} from './payment-draft';

const base = { ...emptyDraft('2026-09-17'), name: ' Strom  ', amount: '105', dueDay: '25' };

describe('percent', () => {
  it('reads and writes basis points', () => {
    expect(parsePercentBp('50')).toBe(5000);
    expect(parsePercentBp('33,33')).toBe(3333);
    expect(parsePercentBp('12.5')).toBe(1250);
    expect(parsePercentBp('100,01')).toBeUndefined();
    expect(parsePercentBp('abc')).toBeUndefined();
    expect([5000, 3333, 1250, 0].map(percentText)).toEqual(['50', '33,33', '12,5', '0']);
  });
});

describe('readDraft', () => {
  it('reads a new payment with its first version', () => {
    const read = readDraft(base, true);
    expect(read.errors).toEqual({});
    expect(read.fields).toMatchObject({
      name: 'Strom',
      kind: 'outflow',
      dueDay: 25,
      dueMonth: null,
    });
    expect(read.version).toEqual({ amountCents: 10_500, amountMaxCents: null, currency: 'EUR' });
  });
  it('names every problem', () => {
    const read = readDraft(
      { ...base, name: '', amount: '0', dueDay: '32', rhythm: 'yearly', sharePercent: '50' },
      true,
    );
    expect(Object.keys(read.errors).sort()).toEqual([
      'amount',
      'contactId',
      'dueDay',
      'dueMonth',
      'name',
    ]);
    expect(read.fields).toBeUndefined();
  });
  it('drops the category of an income and the income type of an expense', () => {
    const income = readDraft(
      { ...base, kind: 'inflow', categoryId: 'c', incomeTypeId: 'i' },
      true,
    ).fields;
    expect(income).toMatchObject({ categoryId: null, incomeTypeId: 'i' });
    const spend = readDraft({ ...base, categoryId: 'c', incomeTypeId: 'i' }, true).fields;
    expect(spend).toMatchObject({ categoryId: 'c', incomeTypeId: null });
  });
});

describe('changedFields', () => {
  it('sends only what differs from the stored payment', () => {
    const stored = {
      id: 'p',
      name: 'Strom',
      kind: 'outflow',
      accountId: 'a',
      payeeId: null,
      contactId: null,
      categoryId: 'c',
      incomeTypeId: null,
      contactShareBp: 0,
      amountToleranceCents: 0,
      dateWindowDays: 3,
      rhythm: 'monthly',
      dueDay: 25,
      dueMonth: null,
      dateShift: 'none',
      startDate: null,
      endDate: null,
      note: null,
      version: null,
    } as unknown as ExpectedPayment;
    const draft = { ...draftFromPayment(stored), dueDay: '26', note: 'Abschlag' };
    const read = readDraft(draft, false);
    expect(changedFields(stored, read.fields!)).toEqual({ dueDay: 26, note: 'Abschlag' });
  });
});
