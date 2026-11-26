import { describe, expect, it } from 'vitest';
import type { ExpectedPayment } from './api';
import {
  DATE_PRESETS,
  applyDatePreset,
  changedFields,
  draftFromPayment,
  emptyDraft,
  matchingDatePreset,
  percentText,
  readDraft,
} from './payment-draft';

const base = { ...emptyDraft('2026-09-17'), name: ' Strom  ', amount: '105', dueDay: '25' };

describe('percent', () => {
  it('writes basis points as text', () => {
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
  it('reads a fixed euro share and loads it back in euro mode', () => {
    const read = readDraft({ ...base, contactId: 'k', shareAmount: '800,00' }, true);
    expect(read.errors).toEqual({});
    expect(read.fields).toMatchObject({ contactShareBp: 0, contactShareCents: 80_000 });
    expect(readDraft({ ...base, shareAmount: '5' }, true).errors).toHaveProperty('contactId');
    expect(readDraft({ ...base, contactId: 'k', shareAmount: '0' }, true).errors).toHaveProperty(
      'shareAmount',
    );
  });
  it('shows a legacy percentage as its euro equivalent', () => {
    const legacy = { contactShareBp: 3_333, contactShareCents: null, amountCents: -10_050 };
    const draft = draftFromPayment({ ...legacy, name: 'x' } as unknown as ExpectedPayment);
    expect(draft.shareAmount).toBe('33,50');
  });
  it('names every problem', () => {
    const read = readDraft(
      { ...base, name: '', amount: '0', dueDay: '32', rhythm: 'yearly', shareAmount: '5' },
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

describe('interval in weeks', () => {
  const weekly = { ...base, rhythm: 'weekly' as const, startDate: '2026-09-18' };
  it('is every week by default and stored as null', () => {
    expect(emptyDraft('2026-09-17').intervalWeeks).toBe('1');
    expect(readDraft(weekly, true).fields).toMatchObject({ rhythm: 'weekly', intervalWeeks: null });
  });
  it('reads "alle N Wochen" for a weekly rhythm', () => {
    expect(readDraft({ ...weekly, intervalWeeks: '2' }, true).fields).toMatchObject({
      intervalWeeks: 2,
    });
    expect(readDraft({ ...weekly, intervalWeeks: '52' }, true).fields).toMatchObject({
      intervalWeeks: 52,
    });
  });
  it('refuses 0, 53 and text for a weekly rhythm, and ignores it for other rhythms', () => {
    for (const intervalWeeks of ['0', '53', 'x', '', '1,5'])
      expect(readDraft({ ...weekly, intervalWeeks }, true).errors.intervalWeeks).toBeTruthy();
    const monthly = readDraft({ ...base, intervalWeeks: '4' }, true);
    expect(monthly.errors).toEqual({});
    expect(monthly.fields).toMatchObject({ rhythm: 'monthly', intervalWeeks: null });
  });
  it('loads a stored interval into the draft and patches only a change', () => {
    const stored = {
      ...weekly,
      rhythm: 'weekly',
      accountId: 'a',
      payeeId: null,
      contactId: null,
      categoryId: null,
      incomeTypeId: null,
      contactShareBp: 0,
      contactShareCents: null,
      amountToleranceCents: 0,
      dateWindowDays: 3,
      dueDay: 25,
      dueMonth: null,
      dateShift: 'none',
      startDate: '2026-09-18',
      endDate: null,
      intervalWeeks: 2,
      name: 'Strom',
      kind: 'outflow',
      note: null,
      version: null,
    } as unknown as ExpectedPayment;
    const draft = draftFromPayment(stored);
    expect(draft.intervalWeeks).toBe('2');
    expect(changedFields(stored, readDraft(draft, false).fields!)).toEqual({});
    expect(
      changedFields(stored, readDraft({ ...draft, intervalWeeks: '4' }, false).fields!),
    ).toEqual({ intervalWeeks: 4 });
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
      contactShareCents: null,
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

describe('date presets', () => {
  it('sets the salary rhythm: the 15th, else the banking day before', () => {
    const draft = applyDatePreset({ ...base, rhythm: 'yearly', dueMonth: '3' }, 'salary-15');
    expect(draft).toMatchObject({
      rhythm: 'monthly',
      dueDay: '15',
      dueMonth: '',
      dateShift: 'before',
    });
    const read = readDraft({ ...draft, kind: 'inflow' }, true);
    expect(read.errors).toEqual({});
    expect(read.fields).toMatchObject({
      rhythm: 'monthly',
      dueDay: 15,
      dueMonth: null,
      dateShift: 'before',
    });
  });
  it('sets the last banking day of the month: day 31, shifted back', () => {
    const read = readDraft(applyDatePreset(base, 'last-banking-day'), true);
    expect(read.fields).toMatchObject({ rhythm: 'monthly', dueDay: 31, dateShift: 'before' });
  });
  it('recognises a preset again and calls anything else an own setting', () => {
    expect(DATE_PRESETS.map((p) => p.label)).toEqual([
      'Gehalt: am 15., sonst Banktag davor',
      'Letzter Banktag des Monats',
    ]);
    expect(matchingDatePreset(applyDatePreset(base, 'salary-15'))).toBe('salary-15');
    expect(matchingDatePreset(applyDatePreset(base, 'last-banking-day'))).toBe('last-banking-day');
    expect(
      matchingDatePreset({ rhythm: 'monthly', dueDay: '15', dateShift: 'none' }),
    ).toBeUndefined();
    expect(
      matchingDatePreset({ rhythm: 'weekly', dueDay: '15', dateShift: 'before' }),
    ).toBeUndefined();
  });
});
