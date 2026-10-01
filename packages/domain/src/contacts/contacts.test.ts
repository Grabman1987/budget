import { describe, expect, it } from 'vitest';
import {
  allocateSettlement,
  contactBalanceCents,
  contactOutlook,
  kontoblatt,
  monthlyStatement,
  openItems,
  type ContactEntry,
  type ContactOccurrence,
} from './contacts';

// Paid for the contact: negative splits. Repaid: positive.
const E: ContactEntry[] = [
  { id: 'a', date: '2026-07-10', amountCents: -4_000, memo: 'Kino' },
  { id: 'b', date: '2026-08-02', amountCents: -2_550 },
  { id: 'c', date: '2026-08-20', amountCents: 5_000, memo: 'Überweisung' },
  { id: 'd', date: '2026-09-05', amountCents: -1_200 },
];

describe('contactBalanceCents', () => {
  it('is minus the sum of the splits: paying for the contact raises it, repaying lowers it', () => {
    expect(contactBalanceCents([])).toBe(0);
    expect(contactBalanceCents(E)).toBe(4_000 + 2_550 - 5_000 + 1_200);
    expect(contactBalanceCents([{ id: 'x', date: '2026-01-01', amountCents: 700 }])).toBe(-700);
  });
});

describe('kontoblatt', () => {
  it('lists Auslage (+), Ausgleich (−) and the running balance in date order', () => {
    const rows = kontoblatt([E[3]!, E[0]!, E[2]!, E[1]!]);
    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(rows.map((r) => r.auslageCents)).toEqual([4_000, 2_550, 0, 1_200]);
    expect(rows.map((r) => r.ausgleichCents)).toEqual([0, 0, 5_000, 0]);
    expect(rows.map((r) => r.balanceCents)).toEqual([4_000, 6_550, 1_550, 2_750]);
    expect(rows.at(-1)!.balanceCents).toBe(contactBalanceCents(E));
  });
  it('keeps the given order within a day and starts from an opening balance', () => {
    const rows = kontoblatt(
      [
        { id: 'p', date: '2026-05-01', amountCents: -100 },
        { id: 'q', date: '2026-05-01', amountCents: 100 },
      ],
      900,
    );
    expect(rows.map((r) => r.id)).toEqual(['p', 'q']);
    expect(rows.map((r) => r.balanceCents)).toEqual([1_000, 900]);
  });
});

describe('openItems (FIFO)', () => {
  it('settles the oldest Auslage first and leaves the rest of a partly settled one open', () => {
    const r = openItems(E);
    expect(r.items.map((i) => [i.id, i.amountCents, i.openCents])).toEqual([
      ['b', 2_550, 1_550],
      ['d', 1_200, 1_200],
    ]);
    expect(r.openCents).toBe(2_750);
    expect(r.creditCents).toBe(0);
    expect(r.openCents).toBe(contactBalanceCents(E));
  });
  it('treats a repayment beyond all Auslagen as a credit (Verbindlichkeit)', () => {
    const r = openItems([
      { id: 'a', date: '2026-01-01', amountCents: -1_000 },
      { id: 'b', date: '2026-02-01', amountCents: 1_800 },
    ]);
    expect(r.items).toEqual([]);
    expect(r.openCents).toBe(0);
    expect(r.creditCents).toBe(800);
  });
  it('lets a repayment made before an Auslage settle it as well', () => {
    const r = openItems([
      { id: 'pre', date: '2026-01-01', amountCents: 500 },
      { id: 'a', date: '2026-02-01', amountCents: -800 },
    ]);
    expect(r.items.map((i) => [i.id, i.openCents])).toEqual([['a', 300]]);
  });
  it('has nothing open without entries', () => {
    expect(openItems([])).toEqual({ items: [], openCents: 0, creditCents: 0 });
  });
});

describe('allocateSettlement', () => {
  const items = openItems(E).items;
  it('distributes a repayment FIFO over the open items', () => {
    expect(allocateSettlement(items, 2_000)).toEqual({
      parts: [
        { id: 'b', settledCents: 1_550, remainingCents: 0 },
        { id: 'd', settledCents: 450, remainingCents: 750 },
      ],
      surplusCents: 0,
    });
  });
  it('stops at the item it does not reach and reports a surplus', () => {
    expect(allocateSettlement(items, 1_000).parts).toEqual([
      { id: 'b', settledCents: 1_000, remainingCents: 550 },
    ]);
    expect(allocateSettlement(items, 3_000)).toMatchObject({ surplusCents: 250 });
    expect(allocateSettlement(items, 0)).toEqual({ parts: [], surplusCents: 0 });
  });
});

describe('monthlyStatement', () => {
  it('shows offen am Monatsanfang, neu, bezahlt and the Differenz', () => {
    expect(monthlyStatement(E, '2026-08')).toEqual({
      month: '2026-08',
      openingCents: 4_000,
      newCents: 2_550,
      paidCents: 5_000,
      differenceCents: -2_450,
      closingCents: 1_550,
    });
    expect(monthlyStatement(E, '2026-09')).toMatchObject({
      openingCents: 1_550,
      newCents: 1_200,
      paidCents: 0,
      differenceCents: 1_200,
      closingCents: 2_750,
    });
  });
  it('is empty before the first split and carries the balance over quiet months', () => {
    expect(monthlyStatement(E, '2026-06')).toMatchObject({ openingCents: 0, closingCents: 0 });
    expect(monthlyStatement(E, '2026-12')).toMatchObject({
      openingCents: 2_750,
      newCents: 0,
      paidCents: 0,
      closingCents: 2_750,
    });
  });
  it('counts the last day of the month and not the first of the next', () => {
    const e: ContactEntry[] = [
      { id: 'x', date: '2026-02-28', amountCents: -100 },
      { id: 'y', date: '2026-03-01', amountCents: -200 },
    ];
    expect(monthlyStatement(e, '2026-02')).toMatchObject({ newCents: 100, closingCents: 100 });
    expect(monthlyStatement(e, '2026-03')).toMatchObject({ openingCents: 100, newCents: 200 });
  });
});

describe('contactOutlook', () => {
  const occ = (
    over: Partial<ContactOccurrence> & Pick<ContactOccurrence, 'occurrenceId'>,
  ): ContactOccurrence => ({
    paymentId: 'p',
    name: 'Zahlung',
    contactId: 'c1',
    dueDate: '2026-10-01',
    status: 'expected',
    amountCents: 0,
    contactShareCents: 0,
    ...over,
  });
  const list = [
    occ({ occurrenceId: 'o1', name: 'Beitrag', amountCents: 80_000 }),
    occ({
      occurrenceId: 'o2',
      name: 'Streaming',
      dueDate: '2026-10-05',
      amountCents: -1_299,
      contactShareCents: -1_299,
    }),
    occ({
      occurrenceId: 'o3',
      name: 'Cloud',
      dueDate: '2026-10-09',
      amountCents: -999,
      contactShareCents: -500,
      status: 'received',
    }),
    occ({ occurrenceId: 'o4', name: 'Beitrag', dueDate: '2026-11-20', amountCents: 80_000 }),
    occ({ occurrenceId: 'o5', contactId: 'c2', amountCents: 5_000 }),
    occ({ occurrenceId: 'o6', amountCents: -2_000, contactShareCents: 0 }),
  ];
  it('lists contributions and pass-through shares of the contact inside the window', () => {
    const r = contactOutlook(list, 'c1', '2026-09-17', '2026-10-17');
    expect(r.contributions.map((l) => [l.occurrenceId, l.cents])).toEqual([['o1', 80_000]]);
    expect(r.passThroughs.map((l) => [l.occurrenceId, l.cents, l.status])).toEqual([
      ['o2', 1_299, 'expected'],
      ['o3', 500, 'received'],
    ]);
  });
  it('sums only occurrences that are still expected', () => {
    const r = contactOutlook(list, 'c1', '2026-09-17', '2026-10-17');
    expect(r.contributionCents).toBe(80_000);
    expect(r.passThroughCents).toBe(1_299);
    expect(contactOutlook(list, 'c1', '2026-09-17', '2026-12-31').contributionCents).toBe(160_000);
  });
  it('ignores other contacts, costs without a share and days outside the window', () => {
    expect(contactOutlook(list, 'c2', '2026-10-01', '2026-10-01').contributionCents).toBe(5_000);
    expect(contactOutlook(list, 'c1', '2026-10-02', '2026-10-04')).toEqual({
      contributions: [],
      passThroughs: [],
      contributionCents: 0,
      passThroughCents: 0,
    });
  });
});
