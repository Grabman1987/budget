import { describe, expect, it } from 'vitest';
import type { Occurrence } from './api';
import { paymentGroups } from './expected-model';

/** Fixed day: Thursday 17.09.2026. Weeks run Monday to Sunday (this week 14.–20.09.). */
const TODAY = '2026-09-17';

const occ = (over: Partial<Occurrence>): Occurrence => ({
  occurrenceId: `${over.dueDate}${over.name ?? 'Miete'}`,
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

const ROWS: Occurrence[] = [
  occ({ name: 'Alt offen', dueDate: '2026-08-20', status: 'deviating', amountCents: -1_234 }),
  occ({ name: 'Alt bezahlt', dueDate: '2026-08-21', status: 'received', amountCents: -999 }),
  occ({ name: 'Diese Woche offen', dueDate: '2026-09-15', amountCents: -2_001 }),
  occ({ name: 'Internet', dueDate: '2026-09-16', status: 'received', amountCents: -6_000 }),
  occ({ name: 'Heute', dueDate: '2026-09-17', amountCents: -333 }),
  occ({ name: 'Sonntag', dueDate: '2026-09-20', amountCents: 50_001, kind: 'inflow' }),
  occ({ name: 'Montag', dueDate: '2026-09-21', amountCents: -10_500 }),
  occ({ name: 'Strom', dueDate: '2026-09-27', amountCents: -777 }),
  occ({ name: 'Gehalt', dueDate: '2026-09-30', amountCents: 381_200, kind: 'inflow' }),
  occ({ name: 'Letzter Tag', dueDate: '2026-10-22', amountCents: -1_111 }), // today + 35
  occ({ name: 'Zu spät', dueDate: '2026-10-23', amountCents: -5_555 }), // today + 36
  occ({ name: 'Weit', dueDate: '2026-12-16', amountCents: -2_222 }), // today + 90
];

const sumOf = (rows: Occurrence[]) => rows.reduce((a, r) => a + r.amountCents, 0);

describe('paymentGroups', () => {
  it('builds the four groups of 35 days, empty groups omitted', () => {
    const groups = paymentGroups(ROWS, TODAY, {});
    expect(groups.map((g) => [g.key, g.title, g.rows.map((r) => r.name)])).toEqual([
      ['overdue', 'Überfällig', ['Alt offen', 'Diese Woche offen']],
      ['this-week', 'Diese Woche', ['Internet', 'Heute', 'Sonntag']],
      ['next-week', 'Nächste Woche', ['Montag', 'Strom']],
      ['later', 'Später', ['Gehalt', 'Letzter Tag']],
    ]);
    expect(groups.map((g) => g.sub)).toEqual([
      'noch offen',
      '14.–20.09.',
      '21.–27.09.',
      'bis 22.10.',
    ]);
    expect(paymentGroups([ROWS[5]!], TODAY, {}).map((g) => g.key)).toEqual(['this-week']);
  });

  it('shows an overdue row only in Überfällig, in whatever week it fell', () => {
    const groups = paymentGroups(ROWS, TODAY, {});
    const names = (key: string) => groups.find((g) => g.key === key)?.rows.map((r) => r.name);
    for (const name of ['Alt offen', 'Diese Woche offen']) {
      expect(names('overdue')).toContain(name);
      expect(groups.filter((g) => g.rows.some((r) => r.name === name))).toHaveLength(1);
    }
    // Arrived rows of this week stay visible there; older arrived rows are not shown at all.
    expect(names('this-week')).toContain('Internet');
    expect(groups.flatMap((g) => g.rows).some((r) => r.name === 'Alt bezahlt')).toBe(false);
  });

  it('sums each group, and each week of Später, to exactly the cents of its shown rows', () => {
    const groups = paymentGroups(ROWS, TODAY, {});
    for (const g of groups) {
      expect(g.sumCents).toBe(sumOf(g.rows));
      expect(g.leftOut).toBe(0);
    }
    expect(groups.map((g) => g.sumCents)).toEqual([
      -1_234 - 2_001,
      -6_000 - 333 + 50_001,
      -10_500 - 777,
      381_200 - 1_111,
    ]);
    const later = groups.find((g) => g.key === 'later')!;
    expect(later.weeks.map((w) => [w.key, w.title, w.sub, w.sumCents])).toEqual([
      ['2026-09-28', 'In 2 Wochen', '28.09.–04.10.', 381_200],
      ['2026-10-19', 'In 5 Wochen', '19.–25.10.', -1_111],
    ]);
    expect(later.weeks.reduce((a, w) => a + w.sumCents, 0)).toBe(later.sumCents);
  });

  it('extends to 90 days without changing the first 35 days', () => {
    const short = paymentGroups(ROWS, TODAY, {}, 35);
    const long = paymentGroups(ROWS, TODAY, {}, 90);
    for (const key of ['overdue', 'this-week', 'next-week'] as const) {
      expect(long.find((g) => g.key === key)).toEqual(short.find((g) => g.key === key));
    }
    const laterShort = short.find((g) => g.key === 'later')!;
    const laterLong = long.find((g) => g.key === 'later')!;
    expect(laterLong.rows.map((r) => r.name)).toEqual([
      ...laterShort.rows.map((r) => r.name),
      'Zu spät',
      'Weit',
    ]);
    expect(laterLong.sumCents).toBe(laterShort.sumCents - 5_555 - 2_222);
    expect(laterLong.weeks.slice(0, laterShort.weeks.length)[0]).toEqual(laterShort.weeks[0]);
  });

  it('leaves a foreign amount without a rate out of the sum and counts it', () => {
    const foreign = occ({
      name: 'Fremd',
      dueDate: '2026-09-18',
      currency: 'USD',
      amountCents: -2_000,
    });
    const [open] = paymentGroups([foreign], TODAY, {});
    expect(open).toMatchObject({ key: 'this-week', sumCents: 0, leftOut: 1 });
    const [rated] = paymentGroups([foreign], TODAY, { USD: 850_000 });
    expect(rated).toMatchObject({ sumCents: -1_700, leftOut: 0 });
  });
});
