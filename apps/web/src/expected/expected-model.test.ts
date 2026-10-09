import { describe, expect, it } from 'vitest';
import type { ExpectedPayment, Occurrence } from './api';
import {
  cadenceText,
  contractGroups,
  isContract,
  money,
  needsAction,
  rhythmText,
  versionLetter,
  weekGroups,
  weekMonday,
  weekRange,
} from './expected-model';

const occ = (over: Partial<Occurrence>): Occurrence => ({
  occurrenceId: over.dueDate + (over.name ?? ''),
  paymentId: 'p',
  name: 'Miete',
  kind: 'outflow',
  dueDate: '2026-09-20',
  status: 'expected',
  amountCents: -10_000,
  currency: 'EUR',
  contactShareCents: 0,
  accountId: null,
  accountName: null,
  payeeId: null,
  payeeName: null,
  contactId: null,
  contactName: null,
  categoryId: null,
  categoryName: null,
  categoryClass: null,
  incomeTypeId: null,
  incomeTypeName: null,
  bookingId: null,
  bookedAmountCents: null,
  suggestion: null,
  ...over,
});

describe('weeks', () => {
  it('runs Monday to Sunday', () => {
    expect(weekMonday('2026-09-17')).toBe('2026-09-14'); // Thursday
    expect(weekMonday('2026-09-20')).toBe('2026-09-14'); // Sunday
    expect(weekMonday('2026-09-21')).toBe('2026-09-21');
    expect(weekRange('2026-09-14')).toBe('14.–20.09.');
    expect(weekRange('2026-09-28')).toBe('28.09.–04.10.');
  });

  it('groups by week with signed sums, overdue open rows first, old received rows dropped', () => {
    const rows = [
      occ({ name: 'Gehalt', kind: 'inflow', dueDate: '2026-09-30', amountCents: 381_200 }),
      occ({ name: 'Strom', dueDate: '2026-09-25', amountCents: -10_500 }),
      occ({ name: 'Internet', dueDate: '2026-09-15', status: 'received', amountCents: -6_000 }),
      occ({ name: 'Alt offen', dueDate: '2026-08-20', status: 'deviating' }),
      occ({ name: 'Alt bezahlt', dueDate: '2026-08-21', status: 'received' }),
      occ({ name: 'Fremd', dueDate: '2026-09-26', currency: 'USD', amountCents: -2_000 }),
    ];
    const groups = weekGroups(rows, '2026-09-17', { USD: 850_000 });
    expect(groups.map((g) => [g.title, g.sub, g.rows.length])).toEqual([
      ['Überfällig', 'noch offen', 1],
      ['Diese Woche', '14.–20.09.', 1],
      ['Nächste Woche', '21.–27.09.', 2],
      ['In 2 Wochen', '28.09.–04.10.', 1],
    ]);
    expect(groups[2]?.sumCents).toBe(-10_500 - 1_700);
    expect(groups[3]?.sumCents).toBe(381_200);
  });

  it('leaves a foreign amount without a rate out of the sum', () => {
    const [group] = weekGroups([occ({ currency: 'USD', amountCents: -2_000 })], '2026-09-17', {});
    expect(group).toMatchObject({ sumCents: 0, leftOut: 1 });
  });
});

describe('needsAction', () => {
  it('is only a deviation after its due date or a missed occurrence', () => {
    expect(needsAction({ status: 'deviating', dueDate: '2026-09-10' }, '2026-09-17')).toBe(true);
    expect(needsAction({ status: 'deviating', dueDate: '2026-09-20' }, '2026-09-17')).toBe(false);
    expect(needsAction({ status: 'missed', dueDate: '2026-09-20' }, '2026-09-17')).toBe(true);
    expect(needsAction({ status: 'expected', dueDate: '2026-09-01' }, '2026-09-17')).toBe(false);
    expect(needsAction({ status: 'received', dueDate: '2026-09-01' }, '2026-09-17')).toBe(false);
  });
});

describe('text', () => {
  it('formats the original currency', () => {
    expect(money(-1_234_56)).toBe('−1.234,56 €');
    expect(money(2_000, 'USD')).toBe('20,00 $');
    expect(money(1_200, 'CHF', true)).toBe('+12,00 CHF');
  });
  it('describes the rhythm', () => {
    const base = { dueMonth: null, dateShift: 'none' as const };
    expect(cadenceText({ ...base, rhythm: 'monthly', dueDay: 15 })).toBe('monatlich am 15.');
    expect(cadenceText({ ...base, rhythm: 'monthly', dueDay: 31, dateShift: 'before' })).toBe(
      'monatlich am letzten Werktag',
    );
    expect(cadenceText({ ...base, rhythm: 'yearly', dueDay: 12, dueMonth: 4 })).toBe(
      'jährlich am 12.04.',
    );
    expect(cadenceText({ ...base, rhythm: 'quarterly', dueDay: 1, dueMonth: 2 })).toBe(
      'vierteljährlich ab Februar, am 1.',
    );
  });
  it('describes a weekly rhythm with its interval', () => {
    const base = {
      dueMonth: null,
      dateShift: 'none' as const,
      dueDay: 1,
      rhythm: 'weekly' as const,
    };
    expect(cadenceText(base)).toBe('wöchentlich');
    expect(cadenceText({ ...base, intervalWeeks: null })).toBe('wöchentlich');
    expect(cadenceText({ ...base, intervalWeeks: 1 })).toBe('wöchentlich');
    expect(cadenceText({ ...base, intervalWeeks: 2 })).toBe('alle 2 Wochen');
    expect(rhythmText('weekly', 3)).toBe('alle 3 Wochen');
    expect(rhythmText('monthly', 3)).toBe('monatlich');
  });
  it('letters versions', () => {
    expect([0, 1, 25, 26].map(versionLetter)).toEqual(['A', 'B', 'Z', '27']);
  });
});

describe('contractGroups', () => {
  const pay = (over: Partial<ExpectedPayment>): ExpectedPayment =>
    ({
      id: over.name,
      kind: 'outflow',
      categoryId: 'c1',
      version: {
        id: 'v',
        validFrom: '2026-01-01',
        amountCents: 100,
        amountMaxCents: null,
        currency: 'EUR',
      },
      amountCents: -100,
      monthlyEquivalentCents: -100,
      yearlyEquivalentCents: -1_200,
      ...over,
    }) as ExpectedPayment;
  it('builds assemblies with sums, incomes first, foreign money converted', () => {
    const groups = contractGroups(
      [
        pay({ name: 'Miete' }),
        pay({
          name: 'Abo',
          categoryId: 'c2',
          monthlyEquivalentCents: -2_000,
          yearlyEquivalentCents: -24_000,
          version: {
            id: 'v',
            validFrom: '2026-01-01',
            amountCents: 2_000,
            amountMaxCents: null,
            currency: 'USD',
          },
        }),
        pay({
          name: 'Gehalt',
          kind: 'inflow',
          categoryId: null,
          monthlyEquivalentCents: 500,
          yearlyEquivalentCents: 6_000,
        }),
      ],
      (id) =>
        id === 'c1'
          ? { id: 'g1', name: 'Wohnen' }
          : id === 'c2'
            ? { id: 'g2', name: 'Abos' }
            : null,
      { USD: 850_000 },
    );
    expect(groups.map((g) => [g.title, g.monthlyCents, g.yearlyCents])).toEqual([
      ['Einnahmen', 500, 6_000],
      ['Abos', -1_700, -20_400],
      ['Wohnen', -100, -1_200],
    ]);
  });
});

describe('isContract', () => {
  it('keeps contracts and leaves out savings and set-asides for wants', () => {
    expect(isContract('outflow', { kind: 'fixed', class: 'need' })).toBe(true);
    expect(isContract('outflow', { kind: 'fixed', class: 'want' })).toBe(true);
    expect(isContract('outflow', { kind: 'periodic', class: 'need' })).toBe(true);
    expect(isContract('outflow', { kind: 'debt', class: 'need' })).toBe(true);
    expect(isContract('outflow', null)).toBe(true);
    expect(isContract('outflow', { kind: 'periodic', class: 'want' })).toBe(false);
    expect(isContract('outflow', { kind: 'saving', class: 'future' })).toBe(false);
    expect(isContract('inflow', null)).toBe(false);
  });
});
