import { readFileSync } from 'node:fs';
import { fifoCost, unitsHeld, type CostTrade } from '@budget/domain';
import { sampleLedger } from '@budget/fixtures';
import { PP_FILE_NAME, ppExport, ppUuid } from '@budget/fixtures/pp';
import { describe, expect, it } from 'vitest';
import { mapToTarget, type PlannedTrade, type PpMapping } from './mapping';
import { parsePp } from './model';

const bytes = (s: string) => new TextEncoder().encode(s);
const ledger = sampleLedger();
const investmentIds = [
  ...new Set([
    ...ledger.trades.map((t) => t.accountId),
    ...ledger.holdings.map((h) => h.accountId),
  ]),
].sort();

const mappingFor = (): PpMapping => ({
  portfolios: Object.fromEntries(
    investmentIds.map((id) => [ppUuid('portfolio', id), { accountId: id }]),
  ),
  accounts: Object.fromEntries(
    investmentIds.map((id) => [ppUuid('account', id), { accountId: `${id}-cash` }]),
  ),
});

const secOf = new Map(ledger.securities.map((s) => [ppUuid('security', s.id as string), s.id]));

describe('ledger -> PP XML -> parse -> map', () => {
  const xml = ppExport(ledger);
  const model = parsePp(bytes(xml));
  const plan = mapToTarget(model, mappingFor());

  it('is byte-stable and equals the committed sample file', () => {
    expect(ppExport(ledger)).toBe(xml);
    const committed = readFileSync(
      new URL(`../../fixtures/pp-export/${PP_FILE_NAME}`, import.meta.url),
      'utf8',
    );
    expect(committed).toBe(xml);
  });

  it('parses without problems', () => {
    expect(model.problems).toEqual([]);
    expect(plan.problems).toEqual([]);
    expect(model.securities).toHaveLength(ledger.securities.length);
    expect(model.portfolios.map((p) => p.name).sort()).toEqual(
      investmentIds.map((id) => ledger.accounts.find((a) => a.id === id)?.name).sort(),
    );
  });

  it('gives identical prices', () => {
    const fromPlan = plan.prices
      .map((p) => `${secOf.get(p.securityPpUuid)}|${p.date}|${p.priceMicro}`)
      .sort();
    const fromLedger = ledger.prices.map((p) => `${p.securityId}|${p.date}|${p.priceMicro}`).sort();
    expect(fromPlan).toEqual(fromLedger);
    expect(plan.prices.every((p) => p.source === 'import')).toBe(true);
  });

  const canon = (t: {
    accountId: string;
    securityId: string;
    date: string;
    kind: string;
    unitsE8: number;
    amountCents: number;
    feeCents: number;
    taxCents: number;
  }) =>
    [
      t.accountId,
      t.securityId,
      t.date,
      t.kind,
      t.unitsE8,
      t.amountCents,
      t.feeCents,
      t.taxCents,
    ].join('|');
  const planTrades = plan.trades.map((t) =>
    canon({ ...t, securityId: secOf.get(t.securityPpUuid) as string }),
  );
  // Opening holdings travel as deliveries in (PP has no snapshots).
  const ledgerTrades = [
    ...ledger.trades.map((t) =>
      canon({
        accountId: t.accountId,
        securityId: t.securityId,
        date: t.date,
        kind: t.kind,
        unitsE8: t.unitsE8 ?? 0,
        amountCents: t.amountCents,
        feeCents: t.feeCents ?? 0,
        taxCents: t.taxCents ?? 0,
      }),
    ),
    ...ledger.holdings.map((h) =>
      canon({
        accountId: h.accountId,
        securityId: h.securityId,
        date: h.asOf,
        kind: 'delivery_in',
        unitsE8: h.unitsE8,
        amountCents: h.costBasisCents ?? 0,
        feeCents: 0,
        taxCents: 0,
      }),
    ),
  ];

  it('gives identical trades (buy, sell, dividend, opening deliveries)', () => {
    expect(planTrades.sort()).toEqual(ledgerTrades.sort());
    expect(new Set(plan.trades.map((t) => t.importKey)).size).toBe(plan.trades.length);
  });

  it('gives the same holdings and cost per portfolio and security (P5.2 functions)', () => {
    const toCost = (t: {
      date: string;
      kind: string;
      unitsE8: number;
      amountCents: number;
      feeCents: number;
      taxCents?: number | null | undefined;
    }): CostTrade & { date: string } => ({
      date: t.date,
      kind: t.kind as CostTrade['kind'],
      unitsE8: t.unitsE8,
      amountCents: t.amountCents,
      feeCents: t.feeCents,
      taxCents: t.taxCents ?? 0,
    });
    const byDate = <T extends { date: string }>(xs: T[]) =>
      [...xs].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    let pairs = 0;
    for (const h of ledger.holdings) {
      const ledgerTrades = byDate(
        ledger.trades
          .filter(
            (t) =>
              t.accountId === h.accountId &&
              t.securityId === h.securityId &&
              t.kind !== 'dividend' &&
              t.date > h.asOf,
          )
          .map((t) => toCost({ ...t, unitsE8: t.unitsE8 ?? 0, feeCents: t.feeCents ?? 0 })),
      );
      const fromLedger = fifoCost(
        { unitsE8: h.unitsE8, costBasisCents: h.costBasisCents ?? 0 },
        ledgerTrades,
      );
      const ppTrades = plan.trades.filter(
        (t: PlannedTrade) =>
          t.accountId === h.accountId &&
          secOf.get(t.securityPpUuid) === h.securityId &&
          t.kind !== 'dividend',
      );
      const fromPlan = fifoCost({ unitsE8: 0, costBasisCents: 0 }, byDate(ppTrades.map(toCost)));
      expect(fromPlan).toEqual(fromLedger);
      const units = unitsHeld(
        undefined,
        ppTrades.map((t) => ({ date: t.date, unitsE8: t.unitsE8 })),
        '9999-12-31',
      );
      expect(units).toBe(
        unitsHeld(
          { asOf: h.asOf, unitsE8: h.unitsE8 },
          ledger.trades
            .filter((t) => t.accountId === h.accountId && t.securityId === h.securityId)
            .map((t) => ({ date: t.date, unitsE8: t.unitsE8 ?? 0 })),
          '9999-12-31',
        ),
      );
      pairs += 1;
    }
    expect(pairs).toBe(ledger.holdings.length);
  });

  it('books the cash legs on the tracking accounts and links them to their trades', () => {
    const cashLegs = ledger.trades.length; // buy, sell and dividend each have one cash booking
    expect(plan.bookings).toHaveLength(cashLegs);
    const buy = plan.bookings.find((b) => b.ppType === 'BUY');
    expect(buy?.amountCents).toBeLessThan(0);
    expect(buy?.accountId.endsWith('-cash')).toBe(true);
    expect(buy?.tradeImportKey).toMatch(/^pp:/);
    const tradeKeys = new Set(plan.trades.map((t) => t.importKey));
    for (const b of plan.bookings.filter((x) => x.ppType === 'BUY' || x.ppType === 'SELL'))
      expect(tradeKeys.has(b.tradeImportKey as string)).toBe(true);
    expect(plan.bookings.find((b) => b.ppType === 'DIVIDENDS')?.tradeImportKey).toBeNull();
  });

  it('maps one investment account per portfolio with its reference account', () => {
    expect(plan.investmentAccounts).toHaveLength(investmentIds.length);
    for (const a of plan.investmentAccounts)
      expect(a.referenceAccountPpUuid).toBe(ppUuid('account', a.accountId));
  });

  it('reads the asset-class taxonomy', () => {
    const t = model.taxonomies[0];
    expect(t?.classifications[0]?.parentId).toBeNull();
    const assigned = t?.classifications.flatMap((c) => c.assignments) ?? [];
    expect(assigned.length).toBe(ledger.securities.filter((s) => s.assetClassId).length);
    expect(assigned.every((a) => a.weightBp === 10000 && secOf.has(a.uuid))).toBe(true);
  });
});

describe('the whole transaction vocabulary (extras)', () => {
  const model = parsePp(bytes(ppExport(ledger, { extras: true })));
  const plan = mapToTarget(model, mappingFor());

  it('parses without problems', () => {
    expect(model.problems).toEqual([]);
  });

  it('covers every account and portfolio transaction type', () => {
    const account = new Set(model.accounts.flatMap((a) => a.transactions.map((t) => t.type)));
    const portfolio = new Set(model.portfolios.flatMap((p) => p.transactions.map((t) => t.type)));
    expect([...account].sort()).toEqual(
      [
        'BUY',
        'DEPOSIT',
        'DIVIDENDS',
        'FEES',
        'FEES_REFUND',
        'INTEREST',
        'INTEREST_CHARGE',
        'REMOVAL',
        'SELL',
        'TAXES',
        'TAX_REFUND',
        'TRANSFER_IN',
        'TRANSFER_OUT',
      ].sort(),
    );
    expect([...portfolio].sort()).toEqual(
      [
        'BUY',
        'DELIVERY_INBOUND',
        'DELIVERY_OUTBOUND',
        'SELL',
        'TRANSFER_IN',
        'TRANSFER_OUT',
      ].sort(),
    );
  });

  it('pairs transfers and reads the forex unit', () => {
    const all = [
      ...model.accounts.flatMap((a) => a.transactions),
      ...model.portfolios.flatMap((p) => p.transactions),
    ];
    const byType = (owner: string, type: string) =>
      all.filter((t) => t.owner === owner && t.type === type);
    const [pfOut] = byType('portfolio', 'TRANSFER_OUT');
    const [pfIn] = byType('portfolio', 'TRANSFER_IN');
    expect(pfOut?.crossEntry).toEqual({ kind: 'portfolio-transfer', peerUuid: pfIn?.uuid });
    expect(pfIn?.crossEntry).toEqual({ kind: 'portfolio-transfer', peerUuid: pfOut?.uuid });
    const [acOut] = byType('account', 'TRANSFER_OUT');
    const [acIn] = byType('account', 'TRANSFER_IN');
    expect(acOut?.crossEntry).toEqual({ kind: 'account-transfer', peerUuid: acIn?.uuid });
    const dividend = byType('account', 'DIVIDENDS').find((t) => t.units.some((u) => u.forex));
    expect(dividend?.units.find((u) => u.forex)?.forex).toEqual({
      currency: 'USD',
      amountCents: 1087,
      rateMicro: 920000,
    });
    expect(dividend?.grossCents).toBe(1000);
  });

  it('maps every kind to a trade or a booking', () => {
    expect(new Set(plan.trades.map((t) => t.kind))).toEqual(
      new Set(['buy', 'sell', 'delivery_in', 'delivery_out', 'dividend']),
    );
    const transfer = plan.trades.filter((t) => t.note === 'transfer');
    expect(transfer.map((t) => t.kind).sort()).toEqual(['delivery_in', 'delivery_out']);
    // Signed units as the trade table demands.
    for (const t of plan.trades) {
      if (t.kind === 'buy' || t.kind === 'delivery_in') expect(t.unitsE8).toBeGreaterThan(0);
      if (t.kind === 'sell' || t.kind === 'delivery_out') expect(t.unitsE8).toBeLessThan(0);
      if (t.kind === 'dividend') expect(t.unitsE8).toBe(0);
    }
    const sell = plan.trades.find((t) => t.kind === 'sell' && t.date === '2026-09-10');
    expect(sell).toMatchObject({ amountCents: 101000, feeCents: 500, taxCents: 1500 });
    const signs = Object.fromEntries(
      plan.bookings.map((b) => [b.ppType, Math.sign(b.amountCents)]),
    );
    expect(signs).toMatchObject({
      DEPOSIT: 1,
      REMOVAL: -1,
      INTEREST: 1,
      INTEREST_CHARGE: -1,
      FEES: -1,
      FEES_REFUND: 1,
      TAXES: -1,
      TAX_REFUND: 1,
      BUY: -1,
      SELL: 1,
    });
    const accTransfers = plan.bookings.filter((b) => b.counterpartKey !== null);
    expect(accTransfers).toHaveLength(2);
  });

  it('ignores accounts and portfolios per mapping and reports unmapped ones', () => {
    const p = mapToTarget(model, {
      portfolios: { [ppUuid('portfolio', 'acc-depot')]: 'ignore' },
      accounts: { [ppUuid('account', 'acc-depot')]: 'ignore' },
    });
    expect(p.trades).toEqual([]);
    expect(p.bookings).toEqual([]);
    expect(p.problems.filter((x) => x.code === 'unmapped-portfolio').length).toBeGreaterThan(0);
    expect(p.problems.filter((x) => x.code === 'unmapped-account').length).toBeGreaterThan(0);
    expect(p.ignored.length).toBeGreaterThan(0);
  });
});
