import { sampleLedger } from '@budget/fixtures';
import { ppExport } from '@budget/fixtures/pp';
import { describe, expect, it } from 'vitest';
import { mapToTarget, type PlannedTrade } from './mapping';
import {
  normalizeTrade,
  ppQuoteUrl,
  planSecurities,
  ppCash,
  ppCashFlowByYear,
  ppDepotSeries,
  ppMigrationSchema,
  ppPositionsAsOf,
  proposeMigration,
  resolveMigration,
  skippedButTraded,
  type AppAccountRef,
  type AppSecurityRef,
} from './migration';
import { parsePp } from './model';

const ledger = sampleLedger();
const model = parsePp(new TextEncoder().encode(ppExport(ledger, { extras: true })));
const portfolios = model.portfolios;
const app = (id: string, name: string, over: Partial<AppAccountRef> = {}): AppAccountRef => ({
  id,
  name,
  role: 'investment',
  currency: 'EUR',
  openingDate: '2023-10-01',
  openingBalanceCents: 0,
  ...over,
});
const apps = portfolios.map((p, i) => app(`app-${i}`, p.name));
const refUuid = (i: number) => portfolios[i]?.referenceAccountUuid as string;

const document = (over: Record<string, unknown> = {}) =>
  ppMigrationSchema.parse({
    version: 1,
    portfolios: Object.fromEntries(portfolios.map((p, i) => [p.uuid, { account: apps[i]?.name }])),
    accounts: Object.fromEntries(
      portfolios.map((_, i) => [refUuid(i), { account: apps[i]?.name, openingBalance: 'keep' }]),
    ),
    ...over,
  });

describe('resolveMigration', () => {
  it('resolves names to ids and links depot and reference account to one app account', () => {
    const r = resolveMigration(model, document(), apps);
    expect(r.problems).toEqual([]);
    expect(r.targets.map((t) => t.accountId).sort()).toEqual(apps.map((a) => a.id).sort());
    expect(r.mapping.portfolios[portfolios[0]!.uuid]).toEqual({ accountId: 'app-0' });
    const t = r.targets.find((x) => x.accountId === 'app-0');
    expect(t).toMatchObject({
      cashFlows: 'ynab',
      openingBalance: 'keep',
      retireYnabValue: true,
      portfolioUuids: [portfolios[0]!.uuid],
      ppAccountUuids: [refUuid(0)],
    });
  });

  it('reports unknown, ambiguous and wrong-role accounts and unmapped objects with transactions', () => {
    const doc = document({
      portfolios: { [portfolios[0]!.uuid]: { account: 'Nowhere' } },
      accounts: { [refUuid(1)]: { account: apps[1]!.name } },
    });
    const codes = resolveMigration(model, doc, [
      ...apps.slice(0, 1),
      app('x', apps[1]!.name),
      app('y', apps[1]!.name),
    ]).problems.map((p) => p.code);
    expect(codes).toContain('mapping.account_unknown');
    expect(codes).toContain('mapping.account_ambiguous');
    expect(codes).toContain('mapping.portfolio_unmapped');
    expect(codes).toContain('mapping.account_unmapped');
    const role = resolveMigration(
      model,
      document(),
      apps.map((a) => ({ ...a, role: 'budget' })),
    ).problems.map((p) => p.code);
    expect(role).toContain('mapping.account_role');
  });

  it('refuses a reference account on another app account', () => {
    const doc = document({
      accounts: Object.fromEntries(
        portfolios.map((_, i) => [refUuid(i), { account: apps[(i + 1) % apps.length]!.name }]),
      ),
    });
    expect(resolveMigration(model, doc, apps).problems.map((p) => p.code)).toContain(
      'mapping.reference_account',
    );
  });

  it('accepts a number of cents as opening balance', () => {
    const doc = document({
      accounts: { [refUuid(0)]: { account: apps[0]!.name, openingBalance: 12_345 } },
    });
    const r = resolveMigration(model, doc, apps);
    expect(r.targets.find((t) => t.accountId === 'app-0')?.openingBalance).toBe(12_345);
  });
});

describe('planSecurities', () => {
  const none: AppSecurityRef[] = [];
  it('creates what is missing and skips what the document skips', () => {
    const [first] = model.securities;
    const doc = document({ securities: { [first!.uuid]: 'skip' } });
    const { securities, problems } = planSecurities(model, doc, none);
    expect(problems).toEqual([]);
    expect(securities.find((s) => s.ppUuid === first!.uuid)?.action).toBe('skip');
    expect(securities.filter((s) => s.action === 'create')).toHaveLength(
      model.securities.length - 1,
    );
  });

  it('matches by id, then ISIN, then name; refuses ambiguity and currency clashes', () => {
    const [a, b, c] = model.securities;
    const existing: AppSecurityRef[] = [
      { id: 'by-isin', name: 'other', isin: a!.isin, symbol: null, currency: 'EUR' },
      { id: 'by-name', name: b!.name.toUpperCase(), isin: null, symbol: null, currency: 'EUR' },
      { id: 'usd', name: c!.name, isin: null, symbol: null, currency: 'USD' },
    ];
    const fourth = model.securities[3]!.uuid;
    const { securities, problems } = planSecurities(
      model,
      document({ securities: { [fourth]: { securityId: 'forced' } } }),
      [...existing, { id: 'forced', name: 'x', isin: null, symbol: null, currency: 'EUR' }],
    );
    const by = (u: string) => securities.find((s) => s.ppUuid === u)!;
    if (a!.isin) expect(by(a!.uuid)).toMatchObject({ securityId: 'by-isin', matchedBy: 'isin' });
    expect(by(b!.uuid)).toMatchObject({ securityId: 'by-name', matchedBy: 'name' });
    expect(by(fourth)).toMatchObject({ securityId: 'forced', matchedBy: 'id' });
    expect(problems.map((p) => p.code)).toContain('security.currency');
    const twice = planSecurities(model, document(), [
      { id: '1', name: b!.name, isin: null, symbol: null, currency: 'EUR' },
      { id: '2', name: b!.name, isin: null, symbol: null, currency: 'EUR' },
    ]);
    expect(twice.problems.map((p) => p.code)).toContain('security.ambiguous');
  });

  it('takes the symbol from a Yahoo feed only and switches the refresh off without a quote id', () => {
    const { securities } = planSecurities(model, document(), none);
    // The synthetic file has feed MANUAL: no symbol, no refresh, unless the document says so.
    expect(securities.every((s) => s.symbol === null && !s.pricesEnabled)).toBe(true);
    const uuid = model.securities[0]!.uuid;
    const set = planSecurities(
      model,
      document({ securities: { [uuid]: { symbol: 'ABC.DE', assetClass: 'Aktien' } } }),
      none,
    );
    expect(set.securities.find((s) => s.ppUuid === uuid)).toMatchObject({
      symbol: 'ABC.DE',
      pricesEnabled: true,
      assetClass: 'Aktien',
    });
  });

  it('finds traded securities that the document skips', () => {
    const plan = mapToTarget(model, resolveMigration(model, document(), apps).mapping);
    const traded = plan.trades[0]!.securityPpUuid;
    const doc = document({ securities: { [traded]: 'skip' } });
    const { securities } = planSecurities(model, doc, none);
    expect(skippedButTraded(plan, securities)).toEqual([traded]);
  });
});

describe('normalizeTrade', () => {
  const t = (over: Partial<PlannedTrade>): PlannedTrade => ({
    importKey: 'pp:x',
    securityPpUuid: 's',
    accountId: 'a',
    portfolioPpUuid: 'p',
    date: '2026-01-02',
    kind: 'buy',
    unitsE8: 100,
    amountCents: 1000,
    feeCents: 10,
    taxCents: 0,
    currency: 'EUR',
    note: null,
    ...over,
  });

  it('puts the tax of a purchase into the fee so the cash stays exact', () => {
    const n = normalizeTrade(t({ taxCents: 5 }));
    expect(n.trade).toMatchObject({ feeCents: 15, taxCents: 0 });
    expect(n.notes).toEqual(['buy-tax-in-fee']);
    expect(n.error).toBeNull();
  });

  it('carries fee and tax of a delivery in its amount', () => {
    const n = normalizeTrade(t({ kind: 'delivery_in', feeCents: 3, taxCents: 2 }));
    expect(n.trade).toMatchObject({ amountCents: 1005, feeCents: 0, taxCents: 0 });
    expect(n.notes).toEqual(['delivery-fee-in-amount']);
  });

  it('folds fee and tax of a standalone cost into its amount', () => {
    const n = normalizeTrade(t({ kind: 'fee', unitsE8: 0, feeCents: 1, taxCents: 1 }));
    expect(n.trade.amountCents).toBe(1002);
    expect(n.notes).toEqual(['cost-fee-in-amount']);
  });

  it('refuses a sale whose fee and tax exceed the gross amount, leaves valid trades alone', () => {
    const bad = normalizeTrade(t({ kind: 'sell', unitsE8: -1, feeCents: 900, taxCents: 200 }));
    expect(bad.error).toMatch(/exceed/);
    const ok = t({ kind: 'sell', unitsE8: -1, feeCents: 5, taxCents: 5 });
    expect(normalizeTrade(ok)).toEqual({ trade: ok, notes: [], error: null });
  });
});

describe('the PP side of the report', () => {
  const resolved = resolveMigration(model, document(), apps);
  const plan = mapToTarget(model, resolved.mapping);

  it('gives units and value from PP trades and quotes alone', () => {
    const day = '2026-09-30';
    const positions = ppPositionsAsOf(plan, day);
    expect(positions.length).toBeGreaterThan(0);
    for (const p of positions) {
      const units = plan.trades
        .filter((t) => t.accountId === p.accountId && t.securityPpUuid === p.securityPpUuid)
        .filter((t) => t.date <= day)
        .reduce((a, t) => a + t.unitsE8, 0);
      expect(p.unitsE8).toBe(units);
    }
    const skipped = new Set([positions[0]!.securityPpUuid]);
    expect(ppPositionsAsOf(plan, day, skipped).some((p) => skipped.has(p.securityPpUuid))).toBe(
      false,
    );
  });

  it('sums the reference account cash before or up to a day', () => {
    const uuid = refUuid(0);
    const txs = model.accounts.find((a) => a.uuid === uuid)!.transactions;
    const day = '2026-09-05';
    const plus = ['DEPOSIT', 'INTEREST', 'DIVIDENDS', 'FEES_REFUND', 'TAX_REFUND', 'SELL'];
    const signed = (t: (typeof txs)[number]) =>
      plus.includes(t.type) || t.type === 'TRANSFER_IN' ? t.amountCents : -t.amountCents;
    expect(ppCash(model, [uuid], day)).toBe(
      txs.filter((t) => t.date <= day).reduce((a, t) => a + signed(t), 0),
    );
    expect(ppCash(model, [uuid], day, false)).toBe(
      txs.filter((t) => t.date < day).reduce((a, t) => a + signed(t), 0),
    );
  });

  it('summarises PP cash movements per year', () => {
    const y2026 = ppCashFlowByYear(model, [refUuid(0)]).get('2026');
    expect(y2026).toMatchObject({ deposits: 500000, removals: 12000, interest: 340 - 120 });
  });

  it('builds the depot series with PP flows: deposits, removals, deliveries', () => {
    const t = resolved.targets[0]!;
    const s = ppDepotSeries(model, plan, t, '2026-08-31', '2026-09-30');
    expect(s.days[0]).toBe('2026-08-31');
    expect(s.valuations).toHaveLength(s.days.length);
    expect(s.flows.find((f) => f.date === '2026-09-01')?.cents).toBe(500000);
    expect(s.flows.find((f) => f.date === '2026-09-02')?.cents).toBe(-12000);
    // Delivery out of 0,5 units at its stored amount.
    expect(s.flows.find((f) => f.date === '2026-09-11')?.cents).toBe(-40000);
    // Dividends and fees are performance, not flows.
    expect(s.flows.some((f) => f.date === '2026-09-14' || f.date === '2026-09-05')).toBe(false);
    const end = s.valuations[s.valuations.length - 1]!.valueCents;
    expect(end).toBe((s.cashCents.at(-1) as number) + (s.holdingsCents.at(-1) as number));
  });
});

describe('proposeMigration', () => {
  it('maps depots and reference accounts by name, keeps YNAB flows and opening balances', () => {
    const { doc } = proposeMigration(model, apps);
    const parsed = ppMigrationSchema.parse(doc);
    expect(Object.keys(parsed.portfolios)).toHaveLength(portfolios.length);
    for (const entry of Object.values(parsed.accounts))
      if (entry !== 'ignore')
        expect(entry).toMatchObject({
          cashFlows: 'ynab',
          openingBalance: 'keep',
          retireYnabValue: true,
        });
    expect(resolveMigration(model, parsed, apps).problems).toEqual([]);
  });

  it('marks what it cannot decide', () => {
    const lonely = proposeMigration(model, []);
    expect(lonely.open.some((l) => l.includes('no unique app account'))).toBe(true);
  });

  it('keeps YNAB values of an account without a depot (P2P platform)', () => {
    // A cash account that no portfolio uses as reference account.
    const spare = model.accounts.find(
      (a) => !portfolios.some((p) => p.referenceAccountUuid === a.uuid),
    );
    if (!spare) return;
    const { doc } = proposeMigration(model, [...apps, app('p2p', spare.name)]);
    const entry = doc.accounts[spare.uuid];
    if (entry && entry !== 'ignore') expect(entry.retireYnabValue).toBe(false);
  });

  it('never invents quote ids: only Yahoo-shaped symbols, none from a MANUAL feed', () => {
    const { doc } = proposeMigration(model, apps);
    for (const entry of Object.values(doc.securities ?? {}))
      if (entry !== 'skip') expect(entry.symbol).toBeUndefined();
  });
});

describe('splits (platform as cash account plus securities account)', () => {
  // The other portfolios of the file are not in these documents.
  const own = (r: { problems: { code: string }[] }) =>
    r.problems.filter((p) => !p.code.endsWith('_unmapped'));
  const name0 = portfolios[0]!.name;
  const splitDoc = (over: Record<string, unknown> = {}) =>
    ppMigrationSchema.parse({
      version: 1,
      portfolios: { [portfolios[0]!.uuid]: { account: name0, cashAccount: { name: 'Cash X' } } },
      accounts: {
        [refUuid(0)]: { account: 'Cash X', openingBalance: 'total', retireYnabValue: false },
      },
      ...over,
    });

  it('renames the YNAB account to the cash account and plans a new securities account', () => {
    const r = resolveMigration(model, splitDoc(), apps.slice(0, 1));
    expect(own(r)).toEqual([]);
    expect(r.splits).toEqual([
      {
        state: 'new',
        cashAccountId: 'app-0',
        depotAccountId: 'new:app-0',
        cashName: 'Cash X',
        depotName: name0,
        previousName: name0,
      },
    ]);
    const depot = r.targets.find((t) => t.accountId === 'new:app-0')!;
    expect(depot).toMatchObject({ cashAccountId: 'app-0', referenceAccountId: 'app-0' });
    expect(r.mapping.portfolios[portfolios[0]!.uuid]).toEqual({ accountId: 'new:app-0' });
    expect(r.mapping.accounts[refUuid(0)]).toEqual({ accountId: 'app-0' });
    expect(r.targets.find((t) => t.accountId === 'app-0')?.openingBalance).toBe('total');
  });

  it('recognises a finished split and refuses a conflicting one', () => {
    const done = resolveMigration(model, splitDoc(), [
      app('c', 'Cash X'),
      app('d', name0, { referenceAccountId: 'c' }),
    ]);
    expect(own(done)).toEqual([]);
    expect(done.splits[0]).toMatchObject({
      state: 'done',
      cashAccountId: 'c',
      depotAccountId: 'd',
    });
    const bad = resolveMigration(model, splitDoc(), [app('c', 'Cash X'), app('d', name0)]);
    expect(bad.problems.map((p) => p.code)).toContain('mapping.split_conflict');
    expect(resolveMigration(model, splitDoc(), []).problems.map((p) => p.code)).toContain(
      'mapping.split_account',
    );
  });

  it('wants the PP reference account on the cash account and total only on a split', () => {
    const wrong = splitDoc({
      accounts: { [refUuid(0)]: { account: name0, openingBalance: 'keep' } },
    });
    expect(resolveMigration(model, wrong, apps.slice(0, 1)).problems.map((p) => p.code)).toContain(
      'mapping.reference_account',
    );
    const plainTotal = document({
      accounts: { [refUuid(0)]: { account: apps[0]!.name, openingBalance: 'total' } },
    });
    expect(resolveMigration(model, plainTotal, apps).problems.map((p) => p.code)).toContain(
      'mapping.opening_total',
    );
  });

  it('keeps an existing Verrechnungskonto without creating anything', () => {
    const doc = document({
      portfolios: {
        [portfolios[1]!.uuid]: { account: apps[1]!.name, referenceAccount: apps[0]!.name },
      },
    });
    const r = resolveMigration(model, doc, apps);
    expect(r.splits).toEqual([]);
    expect(r.targets.find((t) => t.accountId === 'app-1')?.referenceAccountId).toBe('app-0');
  });
});

describe('quote sources from PP feeds', () => {
  const sec = (over: Record<string, unknown>) => ({ ...model.securities[0]!, ...over });
  const withSecurities = (list: ReturnType<typeof sec>[]) => ({ ...model, securities: list });
  const plan = (list: ReturnType<typeof sec>[], coin?: (s: { name: string }) => string | null) =>
    planSecurities(withSecurities(list), document(), [], coin as never).securities;

  it('takes the quote page of an HTML-table feed on Ariva or cryptocalc, https only', () => {
    const ariva = 'https://www.ariva.de/etf/some-etf/kurse/historische-kurse?boerse_id=45&month=';
    const crypto = 'https://cryptocalc.cc/bitpanda-kurse/?currency=BTC&fiat=EUR&range=all';
    const ok = (feedUrl: string, feed = 'GENERIC_HTML_TABLE') => ppQuoteUrl({ feed, feedUrl });
    expect(ok(ariva)).toBe(ariva);
    expect(ok(crypto)).toBe(crypto);
    expect(ok(ariva.replace('https', 'http'))).toBeNull();
    expect(ok('https://user:pw@www.ariva.de/etf/x/kurse/historische-kurse')).toBeNull();
    expect(ok('https://example.org/quotes')).toBeNull();
    expect(ok(ariva, 'YAHOO')).toBeNull();
    expect(ppQuoteUrl({ feed: 'GENERIC_HTML_TABLE', feedUrl: null })).toBeNull();
    const [p] = plan([sec({ feed: 'GENERIC_HTML_TABLE', feedUrl: ariva })]);
    expect(p).toMatchObject({
      quoteUrl: ariva,
      pricesEnabled: true,
      symbol: null,
      coingeckoId: null,
    });
  });

  it('takes the CoinGecko id from the PP property, else from the helper, else none', () => {
    const [a, b, c] = plan(
      [
        sec({ feed: 'COINGECKO', feedProperties: { COINGECKOCOINID: 'bitcoin' } }),
        sec({ name: 'BTC', feed: 'GENERIC_HTML_TABLE', feedUrl: null }),
        sec({ name: 'Unknown coin', feed: 'GENERIC_HTML_TABLE', feedUrl: null }),
      ],
      (s) => (s.name === 'BTC' ? 'bitcoin' : null),
    );
    expect(a).toMatchObject({ coingeckoId: 'bitcoin', pricesEnabled: true });
    expect(b).toMatchObject({ coingeckoId: 'bitcoin', pricesEnabled: true });
    expect(c).toMatchObject({ coingeckoId: null, pricesEnabled: false });
  });

  it('never sets the legacy fallback id and lets the document override', () => {
    const uuid = model.securities[0]!.uuid;
    const doc = document({
      securities: {
        [uuid]: {
          quoteUrl: 'https://www.ariva.de/x/kurse/historische-kurse',
          coingeckoId: 'x-coin',
        },
      },
    });
    const [p] = planSecurities(model, doc, []).securities;
    expect(p).toMatchObject({
      quoteUrl: 'https://www.ariva.de/x/kurse/historische-kurse',
      coingeckoId: 'x-coin',
    });
    expect(Object.keys(p!)).not.toContain('fallbackQuoteId');
  });

  it('reads the FEED properties of a security from the file', () => {
    const xml = ppExport(ledger).replace(
      '<isRetired>false</isRetired>',
      '<property type="FEED" name="COINGECKOCOINID">some-coin</property>\n<isRetired>false</isRetired>',
    );
    const m = parsePp(new TextEncoder().encode(xml));
    expect(m.securities[0]!.feedProperties).toEqual({ COINGECKOCOINID: 'some-coin' });
    expect(m.securities[1]!.feedProperties).toEqual({});
  });
});
