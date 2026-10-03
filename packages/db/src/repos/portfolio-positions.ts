import { cents, ratioBp, shareBps, type ChainTerm } from '@budget/domain';
import { asc, desc, isNull, lte } from 'drizzle-orm';
import { account, assetClass, institution, price, security } from '../schema';
import type { Executor } from './types';
import { holdingValuationExportAsOf } from './portfolio';
import { positionCostDetailsAsOf } from './portfolio-summary';
import { investmentPreferences } from './investment-preferences';

export interface PositionQuote {
  date: string;
  currency: string;
  priceMicro: number;
  source: string;
}
export interface PositionAccount {
  accountId: string;
  name: string;
  institution: string | null;
  unitsE8: number;
  valueCents: number | null;
  costCents: number | null;
  gainCents: number | null;
  /** `estimated`: valued at the cost basis or a price a few days off, see `quality`. */
  valueStatus: 'known' | 'estimated' | 'missing_price' | 'missing_fx';
  basisStatus: 'known' | 'undocumented' | 'missing_fx';
}
export interface PortfolioPosition {
  securityId: string;
  name: string;
  unitsE8: number;
  quote: PositionQuote | null;
  valueCents: number | null;
  costCents: number | null;
  gainCents: number | null;
  gainBp: number | null;
  shareBp: number | null;
  accounts: PositionAccount[];
}
export interface PositionClass {
  id: string | null;
  name: string;
  valueCents: number | null;
  shareBp: number | null;
  positions: PortfolioPosition[];
}
export interface PortfolioPositionsView {
  asOf: string;
  costMethod: 'average' | 'fifo';
  valueCents: number | null;
  costCents: number | null;
  gainCents: number | null;
  chain: ChainTerm[] | null;
  classes: PositionClass[];
}
const sum = (values: (number | null)[]) =>
  values.some((v) => v === null) ? null : values.reduce<number>((a, v) => a + (v ?? 0), 0);

/** Positions without performance history: reuse shared valuation/basis and preserve unavailable data. */
export function portfolioPositions(db: Executor, asOf: string): PortfolioPositionsView {
  const valuation = holdingValuationExportAsOf(db, asOf);
  const costs = new Map(
    positionCostDetailsAsOf(db, asOf, valuation).map((r) => [`${r.accountId}\0${r.securityId}`, r]),
  );
  const accounts = new Map(
    db
      .select()
      .from(account)
      .where(isNull(account.deletedAt))
      .all()
      .map((a) => [a.id, a]),
  );
  const institutions = new Map(
    db
      .select()
      .from(institution)
      .all()
      .map((i) => [i.id, i.name]),
  );
  const securities = new Map(
    db
      .select()
      .from(security)
      .where(isNull(security.deletedAt))
      .all()
      .map((s) => [s.id, s]),
  );
  const quotes = new Map<string, PositionQuote>();
  for (const row of db
    .select()
    .from(price)
    .where(lte(price.date, asOf))
    .orderBy(desc(price.date))
    .all()) {
    if (!quotes.has(row.securityId))
      quotes.set(row.securityId, {
        date: row.date,
        currency: row.currency,
        priceMicro: row.priceMicro,
        source: row.source,
      });
  }
  const bySecurity = new Map<string, PortfolioPosition>();
  for (const holding of [
    ...valuation.values,
    ...valuation.missingFxPositions,
    ...valuation.missingPricePositions,
  ]) {
    const acct = accounts.get(holding.accountId);
    const sec = securities.get(holding.securityId);
    if (!acct || !sec) continue;
    const quote = quotes.get(sec.id) ?? null;
    const cost = costs.get(`${acct.id}\0${sec.id}`);
    const valueStatus: PositionAccount['valueStatus'] =
      'valueCents' in holding
        ? 'quality' in holding && holding.quality === 'estimated'
          ? 'estimated'
          : 'known'
        : 'priceMicro' in holding
          ? 'missing_fx'
          : 'missing_price';
    const line = bySecurity.get(sec.id) ?? {
      securityId: sec.id,
      name: sec.name,
      unitsE8: 0,
      quote,
      valueCents: null,
      costCents: null,
      gainCents: null,
      gainBp: null,
      shareBp: null,
      accounts: [],
    };
    line.unitsE8 += holding.unitsE8;
    line.accounts.push({
      accountId: acct.id,
      name: acct.name,
      institution: acct.institutionId ? (institutions.get(acct.institutionId) ?? null) : null,
      unitsE8: holding.unitsE8,
      valueCents:
        'valueCents' in holding && typeof holding.valueCents === 'number'
          ? holding.valueCents
          : null,
      valueStatus,
      costCents: cost?.costCents ?? null,
      gainCents:
        valueStatus === 'known' || valueStatus === 'estimated' ? (cost?.gainCents ?? null) : null,
      basisStatus: cost?.basisStatus ?? 'undocumented',
    });
    bySecurity.set(sec.id, line);
  }
  const positions = [...bySecurity.values()];
  for (const p of positions) {
    p.accounts.sort((a, b) => a.name.localeCompare(b.name));
    p.valueCents = sum(p.accounts.map((a) => a.valueCents));
    p.costCents = sum(p.accounts.map((a) => a.costCents));
    p.gainCents = sum(p.accounts.map((a) => a.gainCents));
    p.gainBp =
      p.gainCents !== null && p.costCents !== null && p.costCents > 0
        ? ratioBp(p.gainCents, p.costCents)
        : null;
  }
  positions.sort(
    (a, b) => (b.valueCents ?? 0) - (a.valueCents ?? 0) || a.name.localeCompare(b.name),
  );
  const valueCents = sum(positions.map((p) => p.valueCents));
  const costCents = sum(positions.map((p) => p.costCents));
  const gainCents = sum(positions.map((p) => p.gainCents));
  if (valueCents !== null)
    shareBps(
      positions.map((p) => p.valueCents ?? 0),
      valueCents,
    ).forEach((bp, i) => {
      positions[i]!.shareBp = bp;
    });
  const groups = db
    .select()
    .from(assetClass)
    .where(isNull(assetClass.deletedAt))
    .orderBy(asc(assetClass.sortOrder), asc(assetClass.name))
    .all();
  const classes: PositionClass[] = [
    ...groups.map((g) => ({ id: g.id as string | null, name: g.name })),
    { id: null, name: 'Ohne Anlageklasse' },
  ]
    .map((g) => {
      const mine = positions.filter((p) => {
        const id = securities.get(p.securityId)?.assetClassId ?? null;
        return (groups.some((group) => group.id === id) ? id : null) === g.id;
      });
      return {
        ...g,
        positions: mine,
        valueCents: sum(mine.map((p) => p.valueCents)),
        shareBp: valueCents === null ? null : mine.reduce((a, p) => a + (p.shareBp ?? 0), 0),
      };
    })
    .filter((g) => g.positions.length > 0);
  return {
    asOf,
    costMethod: investmentPreferences(db).costMethod,
    valueCents,
    costCents,
    gainCents,
    classes,
    chain:
      valueCents !== null && costCents !== null && gainCents !== null
        ? [
            { label: 'Einstand', value: cents(costCents) },
            {
              label: 'Wertzuwachs',
              value: cents(Math.abs(gainCents)),
              op: gainCents < 0 ? '-' : '+',
            },
            { label: 'Wert heute', value: cents(valueCents), op: '=', result: true },
          ]
        : null,
  };
}
