import { describe, expect, it } from 'vitest';
import { PRODUCTS, referenceModel } from '../reference/model';
import { sampleLedger } from './build';
import { marketValueCents as valueCents } from '@budget/domain';

const ledger = sampleLedger();
const ref = referenceModel();
const monthOf = (date: string) => date.slice(0, 7);
const cents = (euros: number) => Math.round(euros * 100);

describe('sample ledger invariants', () => {
  it('covers 01.10.2023 to 17.09.2026', () => {
    const dates = ledger.bookings.map((b) => b.date).sort();
    expect(dates[0]).toBe('2023-10-01');
    expect(dates[dates.length - 1]).toBe('2026-09-17');
    expect(ledger.bookings.length).toBeGreaterThan(2500);
  });

  it('the splits of every booking add up to its amount, all amounts are integers', () => {
    const sums = new Map<string, number>();
    for (const s of ledger.splits)
      sums.set(s.bookingId, (sums.get(s.bookingId) ?? 0) + s.amountCents);
    for (const b of ledger.bookings) {
      expect(Number.isInteger(b.amountCents)).toBe(true);
      expect(sums.get(b.id), b.id).toBe(b.amountCents);
    }
    expect(
      ledger.splits.some(
        (s) => s.bookingId && ledger.splits.filter((x) => x.bookingId === s.bookingId).length > 1,
      ),
    ).toBe(true);
  });

  it('a transfer is exactly two bookings with opposite amounts on different accounts', () => {
    const legs = new Map<string, typeof ledger.bookings>();
    for (const b of ledger.bookings) {
      if (!b.transferId) continue;
      legs.set(b.transferId, [...(legs.get(b.transferId) ?? []), b]);
    }
    expect(legs.size).toBe(ledger.transfers.length);
    for (const [id, pair] of legs) {
      expect(pair, id).toHaveLength(2);
      expect((pair[0]?.amountCents ?? 0) + (pair[1]?.amountCents ?? 0), id).toBe(0);
      expect(pair[0]?.accountId).not.toBe(pair[1]?.accountId);
    }
  });

  it('import keys are unique per account', () => {
    const keys = new Set(ledger.bookings.map((b) => `${b.accountId}|${b.importKey}`));
    expect(keys.size).toBe(ledger.bookings.length);
  });

  it('category activity per month equals the prototype spend to the cent', () => {
    const activity = new Map<string, number>();
    const bookingMonth = new Map(ledger.bookings.map((b) => [b.id, monthOf(b.date)]));
    for (const s of ledger.splits) {
      if (!s.categoryId) continue;
      const key = `${s.categoryId}|${bookingMonth.get(s.bookingId)}`;
      activity.set(key, (activity.get(key) ?? 0) - s.amountCents);
    }
    for (const m of ref.months) {
      for (const [id, euros] of Object.entries(ref.spend[m.k] ?? {})) {
        expect(activity.get(`cat-${id}|${m.key}`) ?? 0, `${id} ${m.key}`).toBe(cents(euros));
      }
    }
  });

  it('income per month equals the prototype (all inflows that are not transfers)', () => {
    const investmentOrDebt = new Set(
      ledger.accounts.filter((a) => a.role === 'investment' || a.role === 'debt').map((a) => a.id),
    );
    const inflow = new Map<string, number>();
    for (const b of ledger.bookings) {
      if (b.transferId || b.amountCents <= 0 || investmentOrDebt.has(b.accountId)) continue;
      inflow.set(monthOf(b.date), (inflow.get(monthOf(b.date)) ?? 0) + b.amountCents);
    }
    for (const m of ref.months)
      expect(inflow.get(m.key) ?? 0, m.key).toBe(cents(ref.incomeOf(m.k)));
  });

  it('net worth on 17.09.2026 is exactly 84.730,00 EUR (balances plus holdings at market value)', () => {
    const balance = new Map<string, number>(
      ledger.accounts.map((a) => [a.id, a.openingBalanceCents ?? 0]),
    );
    for (const b of ledger.bookings)
      balance.set(b.accountId, (balance.get(b.accountId) ?? 0) + b.amountCents);
    const last = new Map<string, number>();
    for (const p of ledger.prices) if (p.date <= '2026-09-17') last.set(p.securityId, p.priceMicro);
    const units = new Map<string, number>(ledger.holdings.map((h) => [h.securityId, h.unitsE8]));
    for (const t of ledger.trades)
      units.set(t.securityId, (units.get(t.securityId) ?? 0) + (t.unitsE8 ?? 0));
    let holdings = 0;
    for (const [id, u] of units) holdings += valueCents(u, last.get(id) as number);
    const cash = [...balance.values()].reduce((a, b) => a + b, 0);
    expect(cash + holdings).toBe(8473000);
    expect(balance.get('acc-giro')).toBe(161700);
    expect(balance.get('acc-kredit')).toBe(-1217600);
    expect(holdings).toBe(8800000);
  });

  it('each product is worth the prototype value at every month end (within 1 EUR)', () => {
    const priceOn = new Map(ledger.prices.map((p) => [`${p.securityId}|${p.date}`, p.priceMicro]));
    for (const p of PRODUCTS) {
      const series = ref.pv[p.id];
      for (const m of ref.months) {
        const date = m.partial
          ? '2026-09-17'
          : `${m.key}-${String(new Date(Date.UTC(m.y, m.m + 1, 0)).getUTCDate())}`;
        let units = ledger.holdings.find((h) => h.securityId === `sec-${p.id}`)?.unitsE8 ?? 0;
        for (const t of ledger.trades)
          if (t.securityId === `sec-${p.id}` && t.date <= date) units += t.unitsE8 ?? 0;
        const value = valueCents(units, priceOn.get(`sec-${p.id}|${date}`) as number);
        expect(Math.abs(value / 100 - (series?.v[m.k] as number)), `${p.id} ${m.key}`).toBeLessThan(
          1,
        );
      }
    }
  });

  it('trades reference their settlement booking and prices carry a source', () => {
    for (const t of ledger.trades) {
      expect(t.bookingId, t.id).toBeTruthy();
      expect(t.unitsE8).toBeGreaterThan(0);
    }
    expect(ledger.prices.every((p) => p.source)).toBe(true);
    expect(ledger.prices.filter((p) => p.securityId === 'sec-etfw')).toHaveLength(37);
  });

  it('has payees, splits, foreign-currency bookings and versioned expected payments', () => {
    expect(ledger.payees.length).toBeGreaterThan(30);
    expect(
      ledger.bookings.some(
        (b) => b.originalCurrency === 'USD' && b.fxRateMicro && b.originalAmountCents,
      ),
    ).toBe(true);
    // C7: every foreign-currency booking reproduces amount = round(original × rate) + fee.
    const fx = ledger.bookings.filter((b) => b.originalCurrency);
    expect(fx.length).toBeGreaterThan(30);
    for (const b of fx) {
      expect(Math.sign(b.originalAmountCents as number)).toBe(Math.sign(b.amountCents));
      expect(b.fxFeeCents).not.toBeUndefined();
      const converted = Math.round(
        ((b.originalAmountCents as number) * (b.fxRateMicro as number)) / 1e6,
      );
      expect(b.amountCents).toBe(converted + (b.fxFeeCents as number));
    }
    // C3: income carries income types; split contacts are only receivable shares.
    const splitsOf = (memo: string) =>
      ledger.bookings
        .filter((b) => b.memo === memo)
        .flatMap((b) => ledger.splits.filter((s) => s.bookingId === b.id));
    expect(splitsOf('Gehalt').every((s) => s.incomeTypeId === 'income-salary')).toBe(true);
    expect(
      splitsOf('Beitrag zum Haushalt').every((s) => s.incomeTypeId === 'income-contribution'),
    ).toBe(true);
    expect(ledger.splits.filter((s) => s.contactId)).toEqual([]);
    expect(
      ledger.expectedPaymentVersions.filter((v) => v.expectedPaymentId === 'ep-miete'),
    ).toHaveLength(2);
    expect(ledger.payslips.length).toBeGreaterThan(30);
    expect(ledger.rules).toHaveLength(16);
  });
});
