import { describe, expect, it } from 'vitest';
import type { ClassRow, PortfolioSummary, PositionLine, SavingsProposal } from './portfolio-api';
import {
  gainBp,
  kpiRow,
  leadState,
  pctBp,
  pctRatio,
  planRows,
  plansAside,
  positionGroups,
  ppBp,
  priceText,
  rebalanceRows,
  sourceSummary,
  tracks,
  unitPriceCents,
  unitsText,
} from './portfolio-model';

const position = (over: Partial<PositionLine>): PositionLine => ({
  securityId: 's',
  name: 'ETF Welt',
  kind: 'etf',
  assetClassId: 'ac-welt',
  institutionId: 'inst-c',
  unitsE8: 61_240_000_000,
  valueCents: 6_850_000,
  costCents: 5_018_696,
  gainCents: 1_831_304,
  shareBp: 7784,
  ...over,
});

const row = (over: Partial<ClassRow>): ClassRow => ({
  assetClass: 'ac-welt',
  valueCents: 6_850_000,
  shareBp: 7784,
  targetBp: 8000,
  bandBp: 500,
  breach: false,
  side: 'under',
  speculativeOnly: false,
  ...over,
});

const welt = position({});
const em = position({
  securityId: 'em',
  name: 'ETF Schwellenländer',
  assetClassId: 'ac-em',
  valueCents: 700_000,
  shareBp: 796,
});
const spec = position({
  securityId: 'akt',
  name: 'Einzelaktie A',
  kind: 'stock',
  assetClassId: 'ac-spec',
  valueCents: 1_250_000,
  shareBp: 1420,
});

const summary = (over: Partial<PortfolioSummary> = {}): PortfolioSummary => ({
  asOf: '2026-09-17',
  period: 'YTD',
  valueCents: 8_800_000,
  costCents: 6_435_847,
  gainCents: 2_364_153,
  performance: {
    ttwror: 0.0598,
    moneyWeighted: 0.0602,
    xirr: 0.0855,
    benchmarkTtwror: 0.0763,
    from: '2025-12-31',
    to: '2026-09-17',
    days: 260,
    monthCount: 9,
  },
  benchmark: { securityId: 'welt', name: 'ETF Welt' },
  costs: { terCents: 13_614, feesCents: 150, totalCents: 13_764, costRateBp: 16 },
  income: { grossCents: 1800, taxCents: 350, feeCents: 150, netCents: 1300 },
  allocation: {
    rows: [
      row({}),
      row({
        assetClass: 'ac-em',
        shareBp: 796,
        targetBp: 1200,
        bandBp: 300,
        breach: true,
        side: 'under',
      }),
      row({
        assetClass: 'ac-spec',
        shareBp: 1420,
        targetBp: 800,
        bandBp: 300,
        breach: true,
        side: 'over',
        speculativeOnly: true,
      }),
    ],
    breaches: [
      row({ assetClass: 'ac-em', breach: true }),
      row({ assetClass: 'ac-spec', breach: true }),
    ],
    ok: false,
  },
  speculative: { shareBp: 1420, limitBp: 1000, breach: true, overCents: 370_000 },
  proposals: [
    {
      code: 'r13_under',
      rule: 'R13',
      direction: 'add',
      assetClass: 'ac-em',
      subjectId: null,
      shareBp: 796,
      referenceBp: 1200,
      gapCents: 356_000,
    },
    {
      code: 'r15_speculative',
      rule: 'R15',
      direction: 'reduce',
      assetClass: null,
      subjectId: null,
      shareBp: 1420,
      referenceBp: 1000,
      gapCents: 370_000,
    },
  ],
  classes: [
    {
      assetClassId: 'ac-welt',
      name: 'Aktien Welt',
      valueCents: 6_850_000,
      shareBp: 7784,
      targetBp: 8000,
      bandBp: 500,
      breach: false,
      positions: [welt],
    },
    {
      assetClassId: 'ac-em',
      name: 'Schwellenländer',
      valueCents: 700_000,
      shareBp: 796,
      targetBp: 1200,
      bandBp: 300,
      breach: true,
      positions: [em],
    },
    {
      assetClassId: 'ac-spec',
      name: 'Spekulativ',
      valueCents: 1_250_000,
      shareBp: 1420,
      targetBp: 800,
      bandBp: 300,
      breach: true,
      positions: [spec, position({ securityId: 'p2p', name: 'P2P-Kredite', kind: 'p2p' })],
    },
  ],
  positions: [welt, em, spec],
  platforms: [],
  names: {
    assetClasses: { 'ac-welt': 'Aktien Welt', 'ac-em': 'Schwellenländer', 'ac-spec': 'Spekulativ' },
    securities: {},
    institutions: { 'inst-c': 'Broker C' },
  },
  ...over,
});

describe('formatting', () => {
  it('writes basis points as tenths of a percent with the real minus', () => {
    expect(pctBp(7784)).toBe('77,8 %');
    expect(pctBp(796)).toBe('8,0 %');
    expect(pctBp(-404, true)).toBe('−4,0 %');
    expect(pctBp(2, true)).toBe('0,0 %');
    expect(ppBp(-404)).toBe('−4,0 Pp');
    expect(ppBp(620)).toBe('+6,2 Pp');
    expect(pctRatio(0.0598)).toBe('+6,0 %');
    expect(pctRatio(null)).toBe('–');
  });

  it('shows units with two decimals and drops a plain ,00', () => {
    expect(unitsText(61_240_000_000)).toBe('612,40');
    expect(unitsText(21_800_000_000)).toBe('218');
    expect(unitsText(4_120_000)).toBe('0,04');
  });

  it('derives the price per unit exactly from value and units', () => {
    expect(unitPriceCents(6_850_000, 61_240_000_000)).toBe(11_185);
    expect(unitPriceCents(100, 0)).toBeNull();
    expect(gainBp({ gainCents: 1_831_304, costCents: 5_018_696 })).toBe(3649);
    expect(gainBp({ gainCents: 5, costCents: 0 })).toBeNull();
    expect(priceText(111_858_700, 'EUR')).toBe('111,86 €');
    expect(priceText(82_524_270_000, 'USD')).toBe('82.524,27 USD');
  });
});

describe('lead', () => {
  it('names the classes outside the band, or says the allocation is fine', () => {
    expect(leadState(summary())).toEqual({ ok: false, text: '2 Klassen außerhalb des Bands' });
    const one = summary();
    one.allocation.breaches = [row({ breach: true })];
    expect(leadState(one).text).toBe('1 Klasse außerhalb des Bands');
    const fine = summary();
    fine.allocation.breaches = [];
    expect(leadState(fine)).toEqual({ ok: true, text: 'Allocation im Band' });
  });

  it('builds the KPI row in the order of the spec', () => {
    const kpis = kpiRow(summary());
    expect(kpis.map((k) => k.label)).toEqual([
      'Wert',
      'TTWROR',
      'IRR',
      'Weltindex',
      'Kosten',
      'Ausschüttungen',
    ]);
    expect(kpis.map((k) => k.value)).toEqual([
      '88.000 €',
      '+6,0 %',
      '+6,0 %',
      '+7,6 %',
      '138 €',
      '18 €',
    ]);
    expect(kpis[4]?.note).toContain('0,16 %');
  });

  it('shows dashes while there is no history', () => {
    const none = kpiRow(summary({ performance: null, benchmark: null }));
    expect(none.map((k) => k.value).slice(1, 4)).toEqual(['–', '–', '–']);
  });
});

describe('Soll/Ist tracks', () => {
  it('puts the band around the Soll mark and flags the classes outside', () => {
    const [welt1, em1, spec1] = tracks(summary());
    expect(welt1).toMatchObject({
      bandLeft: 75,
      bandWidth: 10,
      sollLeft: 80,
      ist: '77,8 %',
      out: false,
    });
    expect(em1).toMatchObject({
      bandLeft: 9,
      bandWidth: 6,
      sollLeft: 12,
      ist: '8,0 %',
      soll: '12,0 %',
      out: true,
    });
    expect(em1?.summary).toBe('Abweichung vom Soll −4,0 Pp, Band ±3,0 Pp, außerhalb');
    expect(spec1?.note).toBe('Einzelaktien, P2P');
  });

  it('names the kinds of a purely speculative class', () => {
    const s = summary();
    (s.classes[2] as { positions: PositionLine[] }).positions = [
      spec,
      position({ securityId: 'btc', kind: 'crypto' }),
      position({ securityId: 'p2p', kind: 'p2p' }),
    ];
    expect(tracks(s)[2]?.note).toBe('Einzelaktien, Krypto, P2P');
  });
});

describe('rebalancing rows', () => {
  it('writes A for the under-weight class and B for R15', () => {
    const rows = rebalanceRows(summary());
    expect(rows.map((r) => r.letter)).toEqual(['A', 'B']);
    expect(rows[0]?.title).toBe('Schwellenländer unter Soll');
    expect(rows[0]?.detail).toContain('8,0 % statt 12,0 % · 3.560 € fehlen');
    expect(rows[0]?.action).toBe('plans');
    expect(rows[1]?.title).toBe('Spekulativer Anteil 14,2 % über 10 % (R15)');
    expect(rows[1]?.detail).toContain('3.700 € über der Grenze');
  });

  it('has no rows when everything is in the band', () => {
    expect(rebalanceRows(summary({ proposals: [] }))).toEqual([]);
  });
});

describe('savings plans', () => {
  const data: SavingsProposal = {
    proposal: {
      plans: [
        { id: 'p1', name: 'Bitcoin', currentCents: 200, proposedCents: 0, reason: 'paused_r15' },
        {
          id: 'p2',
          name: 'ETF Welt',
          currentCents: 31_680,
          proposedCents: 30_000,
          reason: 'rounded',
        },
        {
          id: 'p3',
          name: 'Einzelaktie A',
          currentCents: 2000,
          proposedCents: 0,
          reason: 'paused_r15',
        },
        {
          id: 'p4',
          name: 'ETF Schwellenländer',
          currentCents: 6000,
          proposedCents: 10_000,
          reason: 'steer_r13_under',
        },
      ],
      totalCents: 40_000,
      freedCents: 2200,
      changed: true,
      note: null,
    },
    basis: [
      { id: 'p1', securityId: 'btc', dayOfMonth: 5, amountCents: 200 },
      { id: 'p2', securityId: 's', dayOfMonth: 5, amountCents: 31_680 },
      { id: 'p3', securityId: 'akt', dayOfMonth: 5, amountCents: 2000 },
      { id: 'p4', securityId: 'em', dayOfMonth: 5, amountCents: 6000 },
    ],
  };

  it('lists the largest rate first and gives the reasons in words', () => {
    const rows = planRows(summary(), data);
    expect(rows.map((r) => r.name)).toEqual([
      'ETF Welt',
      'ETF Schwellenländer',
      'Einzelaktie A',
      'Bitcoin',
    ]);
    expect(rows[0]?.reason).toBe('Soll 80 %, Ist 77,8 %: bleibt Hauptposition');
    expect(rows[1]?.reason).toBe('unter Soll (8,0 % statt 12,0 %), R13');
    expect(rows[2]?.reason).toBe('spekulativer Anteil 14,2 % über 10 %, R15');
    expect(rows[3]?.reason).toBe('R15');
  });

  it('says the monthly total and the day', () => {
    expect(plansAside(data)).toBe('400 € im Monat · am 5.');
    const mixed = {
      ...data,
      basis: [
        { id: 'p1', securityId: 'btc', dayOfMonth: 5, amountCents: 1 },
        { id: 'p2', securityId: 's', dayOfMonth: 31, amountCents: 1 },
      ],
    };
    expect(plansAside(mixed)).toBe('400 € im Monat · an mehreren Tagen');
  });
});

describe('positions', () => {
  it('numbers positions by class and shows P2P loans as manual', () => {
    const groups = positionGroups(summary());
    expect(groups.map((g) => g.value)).toEqual(['68.500 €', '7.000 €', '12.500 €']);
    const first = groups[0]?.positions[0];
    expect(first).toMatchObject({
      no: '1.1',
      platform: 'Broker C',
      units: '612,40',
      price: '111,85 €',
      value: '68.500 €',
      share: '77,8 %',
      gain: '+36,5 %',
    });
    expect(groups[2]?.positions[1]).toMatchObject({ no: '3.2', units: '—', price: 'manuell' });
  });

  it('counts prices per source', () => {
    expect(
      sourceSummary([
        { date: '2026-09-01', priceMicro: 1, currency: 'EUR', source: 'yfinance' },
        { date: '2026-09-02', priceMicro: 1, currency: 'EUR', source: 'yfinance' },
        { date: '2026-09-03', priceMicro: 1, currency: 'EUR', source: 'manual' },
      ]),
    ).toBe('yfinance 2 · von Hand 1');
  });
});
