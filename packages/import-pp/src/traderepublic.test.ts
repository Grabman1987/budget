import { describe, expect, it } from 'vitest';
import { StatementError } from './statement';
import { checkUnits, parsePytrCsv, parseTradeRepublicWeb, summarizeTr } from './traderepublic';

const web = [
  'datum\tname\tstatus\tbetrag',
  '2026-10-02\tSupermarkt\t\t-8.19',
  '2026-10-02\tFonds A\tSparplan ausgeführt\t-100.00',
  '2026-10-02\tFonds A\tRound up\t-70.50',
  '2026-10-02\tFonds A\tSaveback\t-11.25',
  '2026-10-02\tEinzahlung\t\t130.00',
  '2026-10-01\tZinsen\t\t0.45',
  '2026-09-29\tMax Muster\tGesendet\t-2000.00',
  '2026-09-29\tFonds B\tVerkaufsorder\t575.27',
  '2026-09-28\tFonds B\tKauforder\t-50.00',
  '2026-09-26\tMax Muster\tFertig\t100.00',
  '2026-09-25\tHändler\tAbgelehnt\t-30.00',
  '2026-09-24\tFonds A\tLimit-Buy-Order\t-45.00',
  '2026-09-23\tKarte\tKartenprüfung\t0.00',
  '2026-09-22\tBank\t2 % p.a.\t1.07',
].join('\n');

describe('parseTradeRepublicWeb', () => {
  const rows = parseTradeRepublicWeb(web);

  it('reads days, signed cents and kinds, oldest first', () => {
    expect(rows[0]).toMatchObject({ day: '2026-09-22', kind: 'interest', cents: 107 });
    const kinds = Object.fromEntries(rows.map((r) => [`${r.name}/${r.status}`, r.kind]));
    expect(kinds).toMatchObject({
      'Supermarkt/': 'card',
      'Fonds A/Sparplan ausgeführt': 'savings-plan',
      'Fonds A/Round up': 'round-up',
      'Fonds A/Saveback': 'saveback',
      'Einzahlung/': 'deposit',
      'Zinsen/': 'interest',
      'Max Muster/Gesendet': 'transfer-out',
      'Max Muster/Fertig': 'transfer-in',
      'Fonds B/Verkaufsorder': 'order-sell',
      'Fonds B/Kauforder': 'order-buy',
      'Händler/Abgelehnt': 'ignored',
      'Fonds A/Limit-Buy-Order': 'ignored',
      'Karte/Kartenprüfung': 'ignored',
    });
    expect(rows.find((r) => r.name === 'Max Muster' && r.kind === 'transfer-out')?.cents).toBe(
      -200_000,
    );
  });

  it('refuses a wrong header, a bad date and a bad amount', () => {
    expect(() => parseTradeRepublicWeb('a\tb')).toThrow(StatementError);
    expect(() =>
      parseTradeRepublicWeb('datum\tname\tstatus\tbetrag\n02.10.2026\tx\t\t1.00'),
    ).toThrow(/date/);
    expect(() =>
      parseTradeRepublicWeb('datum\tname\tstatus\tbetrag\n2026-10-02\tx\t\t1,00'),
    ).toThrow(/amount/);
  });

  it('sums the cash of the executed rows only (no rejected, Saveback, card check, open limit order)', () => {
    const s = summarizeTr(rows);
    expect(s.cashCents).toBe(
      -819 - 10_000 - 7_050 + 13_000 + 45 - 200_000 + 57_527 - 5_000 + 10_000 + 107,
    );
    expect(s.byKind['saveback']).toEqual({ count: 1, cents: -1_125 });
    expect(s.first).toBe('2026-09-22');
    expect(s.last).toBe('2026-10-02');
  });
});

describe('parsePytrCsv and checkUnits', () => {
  const csv = [
    'Datum;Typ;Wert;Notiz;ISIN;Stück;Gebühren;Steuern;ISIN2;Stück2',
    '2026-03-02T10:00:00;Kauf;-251.0;Fonds;IE0000000001;3.6182;-1.0;;;',
    '2026-03-02T10:00:01;Kauf;-20.18;Fonds;IE0000000001;9.0;-1.0;;;',
    '2026-03-05T09:00:00;Verkauf;459.23;Fonds;IE0000000001;-2.0;-1.0;-2.5;;',
    '2026-03-06T09:00:00;Einlage;100.0;Max Muster;;;;;;',
  ].join('\n');

  it('reads ISIN, units, fees and taxes', () => {
    const rows = parsePytrCsv(csv);
    expect(rows[0]).toMatchObject({
      day: '2026-03-02',
      type: 'Kauf',
      cents: -25_100,
      isin: 'IE0000000001',
      unitsE8: 361_820_000,
      feeCents: 100,
    });
    expect(rows[2]).toMatchObject({ type: 'Verkauf', unitsE8: -200_000_000, taxCents: 250 });
    expect(rows[3]).toMatchObject({ type: 'Einlage', isin: null, unitsE8: null });
    expect(() => parsePytrCsv('x;y')).toThrow(StatementError);
  });

  it('compares units per ISIN at month ends, an order booked in two parts counts as one', () => {
    const pytr = parsePytrCsv(csv);
    const pp = [
      { day: '2026-03-02', isin: 'IE0000000001', unitsE8: 361_820_000 },
      { day: '2026-03-02', isin: 'IE0000000001', unitsE8: 900_000_000 },
      { day: '2026-03-05', isin: 'IE0000000001', unitsE8: -200_000_000 },
    ];
    const ok = checkUnits(pytr, pp, '2026-03-31');
    expect(ok).toMatchObject({ trades: 3, positionsEqual: 1, differing: [], missingInPp: [] });
    const bad = checkUnits(
      pytr,
      [{ day: '2026-03-02', isin: 'IE0000000001', unitsE8: 1 }],
      '2026-03-31',
    );
    expect(bad.positionsEqual).toBe(0);
    expect(bad.differing).toHaveLength(1);
    expect(bad.differing[0]).toMatchObject({ month: '2026-03', isin: 'IE0000000001' });
    expect(checkUnits(pytr, [], '2026-03-31').missingInPp).toEqual(['IE0000000001']);
  });
});
