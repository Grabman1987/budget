import { describe, expect, it } from 'vitest';
import {
  oldUnitsE8,
  parseFlatexCashkonto,
  planStatementRows,
  StatementError,
  type DeliveryItem,
  type ExpectedItem,
} from './statement';

const HEADER = 'buchtag\tvaluta\tbetrag\tta_nr\tempfaenger\tbuchungsinfo';
const tsv = (...lines: string[]) => [HEADER, ...lines].join('\n');

describe('parseFlatexCashkonto', () => {
  const text = tsv(
    '18.09.2026\t17.09.2026\t6,29\t1\t\tErträgnisausschüttung IE0000000001',
    '23.07.2026\t24.07.2026\t-3.500,00\t2\tMax Muster\tUL',
    '17.07.2026\t17.07.2026\t300,00\t3\tMax Muster\tKauf IE0000000002 314623506',
    '15.07.2026\t15.07.2026\t-1.234,56\t4\t\tAusführung ORDER Kauf IE0000000003 111222333',
    '14.07.2026\t14.07.2026\t2.948,18\t5\t\tAusführung ORDER Verkauf DE000TEST000 298198126',
    '28.09.2024\t28.09.2024\t423,10\t6\t\tAblauf der Optionsfrist DE000TEST001 (mit Restwert)',
    '06.07.2026\t06.07.2026\t0,00\t7\t\tZinsabschluss 01.04.2026 -30.06.2026',
    '23.05.2025\t23.05.2025\t-13,77\t8\t\tThesaurierung transparenterFonds IE0000000004',
    '09.01.2024\t09.01.2024\t-5,62\t9\t\tSteuerkorrektur 2023',
  );

  it('reads days, signed cents, references and kinds, oldest first', () => {
    const rows = parseFlatexCashkonto(text);
    expect(rows).toHaveLength(9);
    expect(rows[0]).toMatchObject({ day: '2024-01-09', cents: -562, kind: 'tax-correction' });
    const by = (ref: string) => rows.find((r) => r.ref === ref)!;
    expect(by('2')).toMatchObject({
      day: '2026-07-23',
      valuta: '2026-07-24',
      cents: -350_000,
      kind: 'transfer',
    });
    expect(by('3')).toMatchObject({ kind: 'transfer', isin: 'IE0000000002', order: '314623506' });
    expect(by('4')).toMatchObject({
      kind: 'order-buy',
      cents: -123_456,
      isin: 'IE0000000003',
      order: '111222333',
    });
    expect(by('5')).toMatchObject({ kind: 'order-sell', cents: 294_818 });
    expect(by('6')).toMatchObject({ kind: 'expiry', isin: 'DE000TEST001' });
    expect(by('1')).toMatchObject({ kind: 'distribution', cents: 629 });
    expect(by('8').kind).toBe('deemed-tax');
    expect(by('7')).toMatchObject({ kind: 'interest', cents: 0 });
    expect(rows.map((r) => r.day)).toEqual([...rows.map((r) => r.day)].sort());
  });

  it('refuses a wrong header, a short line, a bad number and a repeated reference', () => {
    expect(() => parseFlatexCashkonto('a\tb\n')).toThrow(StatementError);
    expect(() => parseFlatexCashkonto(tsv('01.01.2026\t01.01.2026\t1,00\t1\t'))).toThrow(
      /6 columns/,
    );
    expect(() => parseFlatexCashkonto(tsv('01.01.2026\t01.01.2026\t1.5\t1\t\tx'))).toThrow(
      /amount/,
    );
    expect(() => parseFlatexCashkonto(tsv('32.01.2026x\t01.01.2026\t1,00\t1\t\tx'))).toThrow(
      /date/,
    );
    expect(() =>
      parseFlatexCashkonto(
        tsv('01.01.2026\t01.01.2026\t1,00\t1\t\tx', '02.01.2026\t02.01.2026\t1,00\t1\t\tx'),
      ),
    ).toThrow(/Duplicate/);
  });
});

describe('planStatementRows', () => {
  const rows = parseFlatexCashkonto(
    tsv(
      '10.03.2026\t10.03.2026\t-1.000,00\t1\t\tAusführung ORDER Kauf IE0000000001 100',
      '12.03.2026\t12.03.2026\t2.948,18\t2\t\tAusführung ORDER Verkauf IE0000000002 101',
      '15.03.2026\t15.03.2026\t-300,00\t3\t\tAusführung ORDER Kauf IE0000000003 102',
      '20.03.2026\t20.03.2026\t6,29\t4\t\tErträgnisausschüttung IE0000000001',
      '21.03.2026\t21.03.2026\t100,00\t5\tMax Muster\tÜberweisung',
      '01.01.2026\t01.01.2026\t0,00\t6\t\tZinsabschluss 01.10.2025 -31.12.2025',
    ),
  );
  const expected: ExpectedItem[] = [
    { date: '2026-03-10', cents: -100_000, key: 'pp:buy', isin: 'IE0000000001', kind: 'trade' },
    { date: '2026-03-12', cents: 283_430, key: 'pp:sell', isin: 'IE0000000002', kind: 'trade' },
    { date: '2026-03-12', cents: 11_388, key: 'pp:refund', isin: null, kind: 'booking' },
    { date: '2026-04-01', cents: 5, key: 'pp:other', isin: null, kind: 'booking' },
  ];
  const deliveries: DeliveryItem[] = [
    { key: 'pp:delivery', date: '2026-03-16', isin: 'IE0000000003', amountCents: 29_000 },
  ];

  it('matches rows to PP items, also a row that is a sale plus its tax refund', () => {
    const plan = planStatementRows(rows, expected, deliveries);
    expect(plan.matched).toBe(2);
    expect(plan.ppOnly.map((e) => e.key)).toEqual(['pp:other']);
  });

  it('turns a delivery with a close amount into the purchase the statement shows', () => {
    const plan = planStatementRows(rows, expected, deliveries);
    expect(plan.conversions).toEqual([
      { key: 'pp:delivery', amountCents: 30_000, row: expect.objectContaining({ ref: '3' }) },
    ]);
    // The distribution is a gap row (income); transfers and zero rows are not part of the plan.
    expect(plan.gap.map((r) => r.ref)).toEqual(['4']);
  });

  it('keeps a purchase without a delivery as a gap row', () => {
    const plan = planStatementRows(rows, expected, []);
    expect(plan.gap.map((r) => r.ref).sort()).toEqual(['3', '4']);
  });

  it('counts one euro as 1,000000 units', () => {
    expect(oldUnitsE8(12_345)).toBe(12_345_000_000);
  });
});
