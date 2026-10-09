import { describe, expect, it } from 'vitest';
import { paymentsPreview, type PreviewPayment, type PreviewStored } from './payments-preview';

const payment = (patch: Partial<PreviewPayment> = {}): PreviewPayment => ({
  id: 'monthly',
  name: 'Vertrag',
  kind: 'outflow',
  contactShareBp: 0,
  rhythm: 'monthly',
  dueDay: 1,
  dueMonth: null,
  dateShift: 'none',
  startDate: null,
  endDate: null,
  categoryName: 'Wohnen',
  categoryClass: 'need',
  categoryKind: 'fixed',
  versions: [
    { validFrom: '2026-11-01', amountCents: 10000, amountMaxCents: null, currency: 'EUR' },
  ],
  ...patch,
});
const stored = (patch: Partial<PreviewStored> = {}): PreviewStored => ({
  paymentId: 'monthly',
  dueDate: '2026-11-01',
  occurrenceId: 'saved',
  status: 'received',
  storedExpectedCents: -10000,
  bookingId: 'booking',
  bookedAmountCents: -11000,
  bookedCurrency: 'EUR',
  ...patch,
});

describe('skipped (gestrichen) occurrences', () => {
  it('drop out of the preview rows and totals, the other months stay', () => {
    const r = paymentsPreview(
      '2026-10-02',
      [payment()],
      [
        stored({
          status: 'skipped',
          bookingId: null,
          bookedAmountCents: null,
          bookedCurrency: null,
        }),
      ],
    );
    expect(r.rows[0]?.events.map((e) => e.dueDate)).not.toContain('2026-11-01');
    expect(r.rows[0]?.events).toHaveLength(11);
    expect(r.currencies[0]?.total).toEqual({ baseCents: 110_000, upperCents: 110_000 });
  });
});

describe('twelve full future months from versioned payment contracts', () => {
  it('literal Nov 2026–Oct 2027: 100 ×2 +120 ×10 + annual 300 =1700', () => {
    const p = payment();
    p.versions.push({
      validFrom: '2027-01-01',
      amountCents: 12000,
      amountMaxCents: null,
      currency: 'EUR',
    });
    const annual = payment({
      id: 'annual',
      rhythm: 'yearly',
      dueMonth: 3,
      categoryKind: 'periodic',
      versions: [
        { validFrom: '2026-01-01', amountCents: 30000, amountMaxCents: null, currency: 'EUR' },
      ],
    });
    const r = paymentsPreview('2026-10-02', [p, annual], []);
    expect([r.from, r.to]).toEqual(['2026-11-01', '2027-10-31']);
    expect(r.months).toHaveLength(12);
    expect(r.currencies[0]).toMatchObject({
      total: { baseCents: 170000, upperCents: 170000 },
      periodicTotal: { baseCents: 30000, upperCents: 30000 },
      average: { baseCents: 14167, upperCents: 14167 },
      highestMonth: '2027-03',
    });
    expect(r.currencies[0]!.months.map((m) => m.baseCents)).toEqual([
      10000, 10000, 12000, 12000, 42000, 12000, 12000, 12000, 12000, 12000, 12000, 12000,
    ]);
    expect(r.rows[0]!.total!.baseCents).toBe(140000);
    expect(r.rows[1]!.months[4]!.baseCents).toBe(30000);
    expect(r.eurComplete).toBe(true);
  });
  it('uses the version on the shifted due date, excludes shifts over the right edge', () => {
    const p = payment({
      dueDay: 31,
      dateShift: 'after',
      versions: [
        { validFrom: '2026-01-01', amountCents: 1, amountMaxCents: null, currency: 'EUR' },
        { validFrom: '2026-11-01', amountCents: 2, amountMaxCents: null, currency: 'EUR' },
      ],
    });
    const r = paymentsPreview('2026-10-02', [p], []);
    expect(r.rows[0]!.events[0]).toMatchObject({
      dueDate: '2026-11-02',
      contract: { baseCents: 2 },
    });
    expect(r.rows[0]!.events.some((e) => e.dueDate > '2027-10-31')).toBe(false);
    expect(r.rows[0]!.events.at(-1)!.dueDate).toBe('2027-09-30');
  });
  it('retains leap month ends, quarterly anchors and inclusive start/end', () => {
    const p = payment({
      dueDay: 31,
      startDate: '2028-02-29',
      endDate: '2028-04-30',
      versions: [
        { validFrom: '2026-01-01', amountCents: 101, amountMaxCents: null, currency: 'EUR' },
      ],
    });
    expect(paymentsPreview('2027-12-31', [p], []).rows[0]!.events.map((e) => e.dueDate)).toEqual([
      '2028-02-29',
      '2028-03-31',
      '2028-04-30',
    ]);
    const q = payment({
      rhythm: 'quarterly',
      dueMonth: 2,
      startDate: '2027-02-01',
      endDate: '2027-08-01',
    });
    expect(paymentsPreview('2026-10-02', [q], []).rows[0]!.events.map((e) => e.dueDate)).toEqual([
      '2027-02-01',
      '2027-05-01',
      '2027-08-01',
    ]);
  });
  it('does not invent dates before the first future version; no versions remain unavailable', () => {
    const p = payment({
      versions: [
        { validFrom: '2027-01-01', amountCents: 10000, amountMaxCents: null, currency: 'EUR' },
      ],
    });
    const r = paymentsPreview('2026-10-02', [p], []);
    expect(r.rows[0]!.events).toHaveLength(10);
    expect(r.rows[0]!.months.slice(0, 2)).toEqual([
      { baseCents: 0, upperCents: 0 },
      { baseCents: 0, upperCents: 0 },
    ]);
    expect(r.eurComplete).toBe(true);
    expect(paymentsPreview('2026-10-02', [payment({ versions: [] })], []).unavailableCount).toBe(
      12,
    );
  });
  it('deduplicates payment/date, preserves stored link/status, separates booking and ambiguous stored cents', () => {
    const r = paymentsPreview('2026-10-02', [payment()], [stored(), stored()]);
    expect(r.rows[0]!.events).toHaveLength(12);
    expect(r.currencies[0]!.total.baseCents).toBe(120000);
    expect(r.rows[0]!.events[0]!.stored).toMatchObject({
      status: 'received',
      bookingId: 'booking',
      bookedCurrency: 'EUR',
      bookedAmountCents: -11000,
    });
    const changed = paymentsPreview(
      '2026-10-02',
      [
        payment({
          versions: [
            { validFrom: '2026-11-01', amountCents: 15000, amountMaxCents: null, currency: 'USD' },
          ],
        }),
      ],
      [stored()],
    );
    expect(changed.rows[0]!.events[0]).toMatchObject({
      currency: 'USD',
      contract: { baseCents: 15000 },
      stored: { storedExpectedCents: -10000, bookedCurrency: 'EUR' },
    });
    expect(changed.eurComplete).toBe(false);
  });
  it('keeps ranges/native currencies, multiple contracts in the same category, and first highest-month tie', () => {
    const ranged = payment({
      versions: [
        { validFrom: '2026-01-01', amountCents: 10001, amountMaxCents: 20002, currency: 'EUR' },
      ],
    });
    const usd = payment({
      id: 'usd',
      versions: [
        { validFrom: '2026-01-01', amountCents: 30000, amountMaxCents: null, currency: 'USD' },
      ],
    });
    const other = payment({
      id: 'other',
      versions: [
        { validFrom: '2026-01-01', amountCents: 1, amountMaxCents: null, currency: 'EUR' },
      ],
    });
    const r = paymentsPreview(
      '2026-10-02',
      [ranged, usd, other, payment({ id: 'in', kind: 'inflow' })],
      [],
    );
    expect(r.rows).toHaveLength(3);
    expect(r.currencies[0]).toMatchObject({
      total: { baseCents: 120024, upperCents: 240036 },
      average: { baseCents: 10002, upperCents: 20003 },
      highestMonth: '2026-11',
    });
    expect(r.currencies[1]!.total.baseCents).toBe(360000);
    expect(r.eurComplete).toBe(false);
    const empty = paymentsPreview('2026-10-02', [], []);
    expect(empty.currencies[0]).toMatchObject({ total: { baseCents: 0 }, highestMonth: null });
    expect(empty.eurComplete).toBe(true);
  });
  it('refuses unsafe aggregate cents instead of returning rounded financial totals', () => {
    const p = payment({
      versions: [
        {
          validFrom: '2026-01-01',
          amountCents: 1_000_000_000_000_000,
          amountMaxCents: null,
          currency: 'EUR',
        },
      ],
    });
    expect(() => paymentsPreview('2026-10-02', [p], [])).toThrow(RangeError);
  });
  it('retains saved-only dates explicitly unavailable when the schedule no longer defines them', () => {
    const r = paymentsPreview('2026-10-02', [payment({ dueDay: 15 })], [stored()]);
    expect(r.unavailableCount).toBe(1);
    expect(r.rows.find((r) => r.currency === null)!.events[0]).toMatchObject({
      currency: null,
      contract: null,
      stored: { occurrenceId: 'saved' },
    });
    expect(r.currencies[0]!.total.baseCents).toBe(120000);
    expect(r.eurComplete).toBe(false);
  });
});
