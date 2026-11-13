import { describe, expect, it } from 'vitest';
import { addMonths, monthsBetween } from '../date';
import { divRound, changeBp, ratioBp } from './math';
import {
  paidTotal,
  baseLevelMonths,
  baseSalaryAnchor,
  baseSalarySteps,
  baseSalaryValues,
  classifyWageLine,
  deductionRateByYear,
  lastRaiseNetEffect,
  personalIndexMicro,
  realDevelopment,
  salaryMonthlySeries,
  salaryYears,
  sameMonthPreviousYear,
  variablePayByYear,
  yearToDate,
  type SalaryPayslip,
  type SalaryWageLine,
  type WageComponentRule,
} from './index';

// Synthetic only: invented employer, wage types and amounts.
const rules: WageComponentRule[] = [
  { employerContactId: null, wageCode: '105', labelNorm: null, component: 'base' },
  { employerContactId: null, wageCode: '129', labelNorm: null, component: 'variable' },
  { employerContactId: null, wageCode: '820', labelNorm: null, component: 'benefit_in_kind' },
  { employerContactId: null, wageCode: '900', labelNorm: null, component: 'variable' },
];
type Extra = {
  code: string | null;
  label: string;
  section: SalaryWageLine['section'];
  cents: number;
  referenceMonth?: string;
};
const reimbursement = (cents = 2_500): Extra => ({
  code: '1260',
  label: 'Telearbeit',
  section: 'reimbursement',
  cents,
});
const benefit = (cents = 20_000): Extra => ({
  code: '820',
  label: 'Sachbezug Dienstwagen',
  section: 'earning', // a benefit in kind only through the owner mapping of code 820
  cents,
});
function slip(
  month: string,
  base: number,
  extras: Extra[] = [],
  o: Partial<
    Pick<SalaryPayslip, 'kind' | 'specialType' | 'id' | 'svCents' | 'taxCents' | 'grossCents'>
  > & { lineCheck?: 'ok' | 'gross_mismatch' | 'no_gross' } = {},
): SalaryPayslip {
  const lines: SalaryWageLine[] = [
    ...(base
      ? [
          {
            code: '105',
            label: 'Grundgehalt',
            section: 'earning' as const,
            referenceMonth: null,
            amountCents: base,
          },
        ]
      : []),
    ...extras.map((e) => ({
      code: e.code,
      label: e.label,
      section: e.section,
      referenceMonth: e.referenceMonth ?? null,
      amountCents: e.cents,
    })),
  ];
  // The fixture's own gross: earning and benefit lines, unless given (a printed gross the lines
  // do not explain).
  const gross =
    o.grossCents ??
    lines
      .filter((l) => l.section === 'earning' || l.section === 'benefit_in_kind')
      .reduce((n, l) => n + l.amountCents, 0);
  const reimbursed = lines
    .filter((l) => l.section === 'reimbursement')
    .reduce((n, l) => n + l.amountCents, 0);
  // Integer arithmetic only (exact percent of whole cents, rounded half away from zero).
  const sv = o.svCents ?? Number(divRound(BigInt(gross) * 18n, 100n)),
    tax = o.taxCents ?? Number(divRound(BigInt(gross) * 10n, 100n));
  return {
    id: o.id ?? `p-${month}`,
    month,
    kind: o.kind ?? 'regular',
    specialType: o.specialType ?? null,
    employerContactId: 'emp',
    grossCents: gross,
    svCents: sv,
    taxCents: tax,
    netCents: gross - sv - tax + reimbursed,
    bookingId: null,
    receiptId: null,
    lines: reimbursed
      ? [{ section: 'reimbursement', label: 'Telearbeit', amountCents: reimbursed }]
      : [],
    wage: { lineCheck: o.lineCheck ?? 'ok', split: null, lines },
  };
}
const special = (month: string, gross: number, type: 'salary13' | 'salary14') =>
  slip(month, 0, [{ code: '503', label: 'Sonderzahlung', section: 'earning', cents: gross }], {
    kind: 'special',
    specialType: type,
    id: `s-${month}`,
  });

/**
 * Scenario A: 2029 raise mid-year (July), a bonus in March, 14th in June, 13th in November;
 * 2030 with a benefit in kind every month and a raise in October; January 2031.
 */
function scenarioA(extraBenefit = 0, extraReimbursement = 0) {
  const slips: SalaryPayslip[] = [];
  for (const month of monthsBetween('2029-01', '2029-12')) {
    const base = month < '2029-07' ? 300_000 : 315_000;
    const extras = [reimbursement(2_500 + extraReimbursement)];
    if (extraBenefit) extras.push(benefit(extraBenefit));
    if (month === '2029-03')
      extras.push({ code: '129', label: 'Bonus', section: 'earning', cents: 50_000 });
    slips.push(slip(month, base, extras));
  }
  slips.push(special('2029-06', 300_000, 'salary14'), special('2029-11', 315_000, 'salary13'));
  for (const month of monthsBetween('2030-01', '2031-01')) {
    const base = month < '2030-10' ? 315_000 : 330_750;
    slips.push(
      slip(month, base, [
        reimbursement(2_500 + extraReimbursement),
        benefit(20_000 + extraBenefit),
      ]),
    );
  }
  slips.push(special('2030-06', 315_000, 'salary14'), special('2030-11', 330_750, 'salary13'));
  return slips;
}

describe('component classifier (#1066)', () => {
  const regular = {
    kind: 'regular',
    specialType: null,
    employerContactId: 'emp',
  } as const;
  const earning = (code: string | null, label = 'Zulage'): SalaryWageLine => ({
    code,
    label,
    section: 'earning',
    referenceMonth: null,
    amountCents: 100,
  });
  it('uses only unambiguous built-in rules and never guesses', () => {
    expect(classifyWageLine({ ...earning('1'), section: 'reimbursement' }, regular, [])).toBe(
      'reimbursement',
    );
    // 13th/14th: special only as the single earning line of the payslip.
    expect(
      classifyWageLine(earning('1'), { ...regular, kind: 'special', specialType: 'salary14' }, [], {
        singleEarningLine: true,
      }),
    ).toBe('special');
    expect(
      classifyWageLine(earning('1'), { ...regular, kind: 'special', specialType: 'salary14' }, []),
    ).toBe('unmapped');
    expect(
      classifyWageLine(earning('1'), { ...regular, kind: 'special', specialType: 'other' }, []),
    ).toBe('unmapped');
    expect(classifyWageLine({ ...earning('820'), section: 'benefit_in_kind' }, regular, [])).toBe(
      'unmapped',
    );
    expect(classifyWageLine(earning('1'), regular, [])).toBe('unmapped');
    expect(classifyWageLine({ ...earning('1'), section: 'deduction' }, regular, rules)).toBe(
      'none',
    );
    expect(classifyWageLine({ ...earning('1'), section: 'unknown' }, regular, rules)).toBe('none');
  });
  it('prefers the most specific owner mapping', () => {
    const owner: WageComponentRule[] = [
      { employerContactId: null, wageCode: null, labelNorm: 'zulage', component: 'variable' },
      { employerContactId: null, wageCode: '7', labelNorm: null, component: 'base' },
      { employerContactId: 'other', wageCode: '7', labelNorm: null, component: 'variable' },
      { employerContactId: 'emp', wageCode: '8', labelNorm: null, component: 'benefit_in_kind' },
    ];
    expect(classifyWageLine(earning('7', '*Zulage'), regular, owner)).toBe('base');
    expect(classifyWageLine(earning('9', ' ZULAGE '), regular, owner)).toBe('variable');
    expect(classifyWageLine(earning('8'), regular, owner)).toBe('benefit_in_kind');
    expect(
      classifyWageLine(earning('8', 'Prämie'), { ...regular, employerContactId: 'x' }, owner),
    ).toBe('unmapped');
  });
});

describe('salary series, steps and comparisons: scenario A (#1066)', () => {
  const slips = scenarioA();
  const series = salaryMonthlySeries({ payslips: slips, rules });

  it('builds the monthly components with markers', () => {
    expect(series).toHaveLength(25);
    const march = series.find((m) => m.month === '2029-03')!;
    expect(march).toMatchObject({
      components: {
        base: 300_000,
        special: 0,
        variable: 50_000,
        benefit_in_kind: 0,
        reimbursement: 2_500,
      },
      developmentCents: 350_000,
      hasVariable: true,
      hasSpecial: false,
      comparable: true,
    });
    const june = series.find((m) => m.month === '2030-06')!;
    expect(june).toMatchObject({
      payslipIds: ['p-2030-06', 's-2030-06'],
      components: {
        base: 315_000,
        special: 315_000,
        variable: 0,
        benefit_in_kind: 20_000,
        reimbursement: 2_500,
      },
      developmentCents: 630_000,
      hasSpecial: true,
      grossCents: 650_000,
      salaryNetCents: 468_000,
    });
  });

  it('records each base step with amount and basis points', () => {
    expect(baseSalarySteps(series)).toEqual([
      {
        effectiveMonth: '2029-07',
        previousMonth: '2029-06',
        oldCents: 300_000,
        newCents: 315_000,
        deltaCents: 15_000,
        deltaBp: 500,
        uncertain: null,
        retroactiveFrom: null,
      },
      {
        effectiveMonth: '2030-10',
        previousMonth: '2030-09',
        oldCents: 315_000,
        newCents: 330_750,
        deltaCents: 15_750,
        deltaBp: 500,
        uncertain: null,
        retroactiveFrom: null,
      },
    ]);
  });

  it('compares complete years per component; benefits and reimbursements stay outside', () => {
    const years = salaryYears(series);
    expect(years.map((y) => [y.year, y.development.complete, y.development.cents.total])).toEqual([
      ['2029', true, 4_355_000],
      ['2030', true, 4_473_000],
      ['2031', false, 330_750],
    ]);
    expect(years[1]!.paid).toEqual({
      base: 3_827_250,
      special: 645_750,
      variable: 0,
      benefit_in_kind: 240_000,
      reimbursement: 30_000,
      unmapped: 0,
      unreconciled: 0,
      undecomposed: 0,
    });
    expect(years[1]!.development.cents).toEqual({
      base: 3_827_250,
      special: 645_750,
      variable: 0,
      total: 4_473_000,
    });
    expect(years[1]!.development.change).toEqual({
      base: { deltaCents: 137_250, deltaBp: 372 },
      special: { deltaCents: 30_750, deltaBp: 500 },
      variable: { deltaCents: -50_000, deltaBp: -10_000 },
      total: { deltaCents: 118_000, deltaBp: 271 },
    });
    expect(years[2]!.development.change).toBeNull();
  });

  it('benefits in kind and reimbursements never move a development figure', () => {
    const other = salaryMonthlySeries({ payslips: scenarioA(7_700, 1_100), rules });
    const strip = (s: typeof series) =>
      s.map((m) => [m.month, m.developmentCents, m.components.base, m.comparable, m.partialBase]);
    expect(strip(other)).toEqual(strip(series));
    expect(baseSalarySteps(other)).toEqual(baseSalarySteps(series));
    expect(salaryYears(other).map((y) => y.development)).toEqual(
      salaryYears(series).map((y) => y.development),
    );
  });

  it('compares the same month of the previous year across December → January', () => {
    const rows = sameMonthPreviousYear(series);
    const march = rows.find((r) => r.month === '2030-03')!;
    expect(march).toMatchObject({
      previousMonth: '2029-03',
      comparable: true,
      previousHasVariable: true,
      hasVariable: false,
    });
    expect(march.change?.total).toEqual({ deltaCents: -35_000, deltaBp: -1_000 });
    const january = rows.find((r) => r.month === '2031-01')!;
    expect(january.previousMonth).toBe('2030-01');
    expect(january.change?.base).toEqual({ deltaCents: 15_750, deltaBp: 500 });
    expect(rows.find((r) => r.month === '2029-01')).toMatchObject({
      previousMonth: '2028-01',
      comparable: false,
      paid: { previous: null },
      reasons: { current: [], previous: ['gap'] },
      change: null,
    });
  });

  it('compares year to date on the same months', () => {
    const paidMonth = {
      special: 0,
      variable: 0,
      benefit_in_kind: 20_000,
      reimbursement: 2_500,
      unmapped: 0,
      unreconciled: 0,
      undecomposed: 0,
    };
    expect(yearToDate(series, '2031')).toEqual({
      year: '2031',
      months: ['01'],
      paid: {
        current: { base: 330_750, ...paidMonth },
        previous: { base: 315_000, ...paidMonth },
      },
      development: {
        months: ['01'],
        current: { base: 330_750, special: 0, variable: 0, total: 330_750 },
        previous: { base: 315_000, special: 0, variable: 0, total: 315_000 },
        change: {
          base: { deltaCents: 15_750, deltaBp: 500 },
          special: { deltaCents: 0, deltaBp: null },
          variable: { deltaCents: 0, deltaBp: null },
          total: { deltaCents: 15_750, deltaBp: 500 },
        },
        excluded: [],
      },
    });
  });

  it('reports variable pay per year; mixed payslips do not separate deductions', () => {
    expect(variablePayByYear(series, slips, rules)).toEqual([
      {
        year: '2029',
        paidVariableCents: 50_000,
        complete: true,
        grossCents: 50_000,
        annualBaseCents: 3_690_000,
        shareOfBaseBp: 136,
        attributable: null,
        excluded: [],
      },
    ]);
  });

  it('computes the deduction rate per year from the legacy totals', () => {
    expect(deductionRateByYear(slips)[0]).toEqual({
      year: '2029',
      grossCents: 4_355_000,
      svCents: 783_900,
      taxCents: 435_500,
      otherCents: 0,
      statutoryRateBp: 2_800,
      totalRateBp: 2_800,
    });
  });

  it('derives net per additional gross unit of the last raise from like-for-like months', () => {
    // Before: Jul–Sep 2030; after: Oct, Dec 2030 and Jan 2031 (November carries the 13th).
    expect(lastRaiseNetEffect(series)).toEqual({
      effectiveMonth: '2030-10',
      beforeMonths: ['2030-07', '2030-08', '2030-09'],
      afterMonths: ['2030-10', '2030-12', '2031-01'],
      deltaGrossCents: 47_250,
      deltaNetCents: 34_020,
      netPerGrossBp: 7_200,
      reason: null,
    });
    // Without January there are only two clean months after the raise: not determinable.
    const short = salaryMonthlySeries({
      payslips: slips.filter((s) => s.month !== '2031-01'),
      rules,
    });
    expect(lastRaiseNetEffect(short)).toMatchObject({
      netPerGrossBp: null,
      reason: 'too_few_months',
    });
  });
});

describe('gaps, unmapped wage types and partial months: scenario B (#1066)', () => {
  const slips: SalaryPayslip[] = [
    slip('2030-01', 300_000),
    slip('2030-02', 150_000), // partial month (e.g. unpaid days): not a cut
    slip('2030-03', 300_000),
    slip('2030-04', 300_000),
    slip('2031-01', 310_000),
    slip('2031-02', 310_000),
    // 2031-03 missing: a gap
    slip('2031-04', 310_000, [
      { code: '777', label: 'Sonderleistung', section: 'earning', cents: 10_000 },
    ]),
    slip('2031-05', 310_000),
  ];
  const series = salaryMonthlySeries({ payslips: slips, rules });

  it('marks gaps and unmapped months and lists them', () => {
    expect(series).toHaveLength(17);
    expect(series.filter((m) => m.isGap).map((m) => m.month)).toEqual([
      ...monthsBetween('2030-05', '2030-12'),
      '2031-03',
    ]);
    const gap = series.find((m) => m.month === '2031-03')!;
    expect(gap).toMatchObject({ developmentCents: 0, comparable: false, payslipIds: [] });
    const april = series.find((m) => m.month === '2031-04')!;
    expect(april).toMatchObject({ hasUnmapped: true, comparable: false });
    expect(april.unmapped).toEqual([
      {
        payslipId: 'p-2031-04',
        code: '777',
        label: 'Sonderleistung',
        amountCents: 10_000,
        reason: 'unmapped',
      },
    ]);
  });

  it('flags a partial base month instead of treating it as a cut', () => {
    expect(series.filter((m) => m.partialBase).map((m) => m.month)).toEqual(['2030-02']);
    expect(baseSalarySteps(series)).toEqual([
      {
        effectiveMonth: '2031-01',
        previousMonth: '2030-04',
        oldCents: 300_000,
        newCents: 310_000,
        deltaCents: 10_000,
        deltaBp: 333,
        uncertain: null,
        retroactiveFrom: null,
      },
    ]);
  });

  it('compares year to date only on months comparable in both years', () => {
    // 2031-01/02 have comparable months a year before, but 2030-01 rests on one month at the
    // series start (edge) and 2030-02 is partial: no like-for-like month is left.
    expect(series.find((m) => m.month === '2030-01')?.edgeLevel).toBe(true);
    const ytd = yearToDate(series, '2031')!;
    expect(ytd.development).toMatchObject({ months: [], change: null });
    expect(ytd.development.excluded.map((e) => [e.month, e.reasons, e.cents.base])).toEqual([
      ['2031-01', ['no_counterpart'], 310_000],
      ['2030-01', ['edge'], 300_000],
      ['2031-02', ['no_counterpart'], 310_000],
      ['2030-02', ['partial'], 150_000],
      ['2031-03', ['gap'], 0],
      ['2030-03', ['no_counterpart'], 300_000],
      ['2031-04', ['unmapped'], 310_000],
      ['2030-04', ['no_counterpart'], 300_000],
      ['2031-05', ['edge'], 310_000],
      ['2030-05', ['gap'], 0],
    ]);
    expect(
      salaryYears(series).map((y) => [
        y.year,
        y.development.complete,
        y.development.excluded.map((e) => [e.month, e.reasons, e.cents.base, e.cents.unmapped]),
      ]),
    ).toEqual([
      ['2030', false, monthsBetween('2030-05', '2030-12').map((m) => [m, ['gap'], 0, 0])],
      [
        '2031',
        false,
        [
          ['2031-03', ['gap'], 0, 0],
          ['2031-04', ['unmapped'], 310_000, 10_000],
        ],
      ],
    ]);
  });

  it('blocks payslips without wage lines or with an unreconciled reading', () => {
    const legacy: SalaryPayslip = { ...slip('2032-01', 300_000), wage: null };
    const legacySpecial: SalaryPayslip = { ...special('2032-06', 300_000, 'salary14'), wage: null };
    const mismatch = slip('2032-02', 300_000, [], { lineCheck: 'gross_mismatch' });
    const s = salaryMonthlySeries({
      payslips: [legacy, mismatch, legacySpecial],
      rules,
      to: '2032-06',
    });
    expect(s[0]).toMatchObject({
      comparable: false,
      issues: ['no_wage_lines'],
      paid: { base: 0, undecomposed: 300_000 },
    });
    expect(s[1]).toMatchObject({
      comparable: false,
      issues: ['line_check'],
      paid: { base: 300_000, unreconciled: 0 },
    });
    // A month holding only a special payslip is a gap for base comparisons (still reported).
    expect(s[5]).toMatchObject({ comparable: false, isGap: true, paid: { special: 300_000 } });
  });

  it('attributes deductions only to payslips that carry nothing but variable pay', () => {
    const bonus = slip(
      '2032-06',
      0,
      [{ code: '900', label: 'Mitarbeiterbonus', section: 'earning', cents: 100_000 }],
      {
        kind: 'special',
        specialType: 'other',
        id: 'b-2032-06',
      },
    );
    const s = [slip('2032-06', 300_000), bonus];
    expect(variablePayByYear(salaryMonthlySeries({ payslips: s, rules }), s, rules)).toEqual([
      {
        year: '2032',
        paidVariableCents: 100_000,
        complete: false,
        grossCents: 100_000,
        annualBaseCents: 300_000,
        shareOfBaseBp: 3_333,
        attributable: { svCents: 18_000, taxCents: 10_000, netCents: 72_000 },
        excluded: [],
      },
    ]);
  });
});

describe('real against nominal development (#1066)', () => {
  const values = [
    { month: '2030-01', cents: 300_000 },
    { month: '2030-02', cents: 300_000 },
    // 2030-03 missing: a gap
    { month: '2030-04', cents: 315_000 },
  ];
  const rising = [
    { month: '2030-01', indexMicro: 100_000_000 },
    { month: '2030-02', indexMicro: 101_000_000 },
    { month: '2030-03', indexMicro: 102_000_000 },
    { month: '2030-04', indexMicro: 103_000_000n },
  ];

  it('rising prices: real index, cumulative gap in basis points and cents', () => {
    const result = realDevelopment({ values, index: rising, startMonth: '2030-01' })!;
    expect(result.points).toEqual([
      {
        month: '2030-01',
        valueCents: 300_000,
        nominalIndexMicro: 1_000_000,
        priceIndexMicro: 1_000_000,
        realIndexMicro: 1_000_000,
        realChangeBp: 0,
        priceAdjustedCents: 300_000,
        gapCents: 0,
      },
      {
        month: '2030-02',
        valueCents: 300_000,
        nominalIndexMicro: 1_000_000,
        priceIndexMicro: 1_010_000,
        realIndexMicro: 990_099,
        realChangeBp: -99,
        priceAdjustedCents: 303_000,
        gapCents: -3_000,
      },
      {
        month: '2030-03',
        valueCents: null,
        nominalIndexMicro: null,
        priceIndexMicro: null,
        realIndexMicro: null,
        realChangeBp: null,
        priceAdjustedCents: null,
        gapCents: null,
      },
      {
        month: '2030-04',
        valueCents: 315_000,
        nominalIndexMicro: 1_050_000,
        priceIndexMicro: 1_030_000,
        realIndexMicro: 1_019_417,
        realChangeBp: 194,
        priceAdjustedCents: 309_000,
        gapCents: 6_000,
      },
    ]);
    expect(result.years).toEqual([
      { year: '2030', months: 3, gapCents: 3_000, realChangeBp: 194, lastMonth: '2030-04' },
    ]);
  });

  it('accepts an arbitrary start month', () => {
    const result = realDevelopment({ values, index: rising, startMonth: '2030-02' })!;
    expect(result.points.at(-1)).toMatchObject({
      realIndexMicro: 1_029_612,
      realChangeBp: 296,
      priceAdjustedCents: 305_941,
      gapCents: 9_059,
    });
  });

  it('falling prices raise the real value; a year boundary splits the yearly gap', () => {
    const result = realDevelopment({
      values: [
        { month: '2030-12', cents: 300_000 },
        { month: '2031-01', cents: 300_000 },
      ],
      index: [
        { month: '2030-12', indexMicro: 100_000_000 },
        { month: '2031-01', indexMicro: 98_000_000 },
      ],
      startMonth: '2030-12',
    })!;
    expect(result.points[1]).toMatchObject({
      realIndexMicro: 1_020_408,
      realChangeBp: 204,
      priceAdjustedCents: 294_000,
      gapCents: 6_000,
    });
    expect(result.years).toEqual([
      { year: '2030', months: 1, gapCents: 0, realChangeBp: 0, lastMonth: '2030-12' },
      { year: '2031', months: 1, gapCents: 6_000, realChangeBp: 204, lastMonth: '2031-01' },
    ]);
  });

  it('works on the base salary series with the personal index and needs a start value', () => {
    const series = salaryMonthlySeries({ payslips: scenarioA(), rules });
    const personal = personalIndexMicro(
      monthsBetween('2029-01', '2029-12').map((month, i) => ({ month, index: 100 + i * 0.25 })),
    );
    expect(personal[1]).toEqual({ month: '2029-02', indexMicro: 100_250_000n });
    const result = realDevelopment({
      values: baseSalaryValues(series),
      index: personal,
      startMonth: '2029-01',
      endMonth: '2029-12',
    })!;
    // December: 315.000 against 300.000 × 102,75 / 100.
    expect(result.points.at(-1)).toMatchObject({
      priceAdjustedCents: 308_250,
      gapCents: 6_750,
      realChangeBp: 219,
    });
    expect(realDevelopment({ values: [], index: personal, startMonth: '2029-01' })).toBeNull();
  });
});

describe('review blockers of PR #1082', () => {
  const index = (months: string[]) =>
    months.map((month, i) => ({ month, indexMicro: 100_000_000 + i * 1_000_000 }));

  it('1: a single comparable neighbour never makes a month partial (first month, after a gap)', () => {
    const first = salaryMonthlySeries({
      payslips: [slip('2029-12', 400_000), slip('2030-01', 420_000), slip('2030-02', 420_000)],
      rules,
    });
    expect(first.filter((m) => m.partialBase)).toEqual([]);
    // One month of evidence at the series start: reported, but marked uncertain.
    expect(baseSalarySteps(first)).toEqual([
      {
        effectiveMonth: '2030-01',
        previousMonth: '2029-12',
        oldCents: 400_000,
        newCents: 420_000,
        deltaCents: 20_000,
        deltaBp: 500,
        uncertain: 'edge',
        retroactiveFrom: null,
      },
    ]);
    // Anchor rule: the first level supported by at least two months.
    expect(baseSalaryAnchor(first)).toBe('2030-01');
    expect(
      realDevelopment({
        values: baseSalaryValues(first),
        index: index(['2029-12', '2030-01', '2030-02']),
        startMonth: baseSalaryAnchor(first)!,
      }),
    ).not.toBeNull();
    const afterGap = salaryMonthlySeries({
      payslips: [
        slip('2029-10', 420_000),
        slip('2029-12', 400_000),
        slip('2030-01', 420_000),
        slip('2030-02', 420_000),
      ],
      rules,
    });
    expect(afterGap.filter((m) => m.partialBase)).toEqual([]);
    expect(
      baseSalarySteps(afterGap).map((x) => [x.effectiveMonth, x.deltaCents, x.uncertain]),
    ).toEqual([
      ['2029-12', -20_000, 'edge'],
      ['2030-01', 20_000, 'edge'],
    ]);
    // Two comparable neighbours, one on each side, both higher: partial.
    const middle = salaryMonthlySeries({
      payslips: [slip('2030-01', 420_000), slip('2030-02', 210_000), slip('2030-03', 420_000)],
      rules,
    });
    expect(middle.filter((m) => m.partialBase).map((m) => m.month)).toEqual(['2030-02']);
  });

  it('2: a month with only a special payslip is a gap for base comparisons', () => {
    const slips = [
      ...monthsBetween('2030-01', '2030-12')
        .filter((m) => m !== '2030-06')
        .map((m) => slip(m, 400_000)),
      special('2030-06', 400_000, 'salary14'),
    ];
    const series = salaryMonthlySeries({ payslips: slips, rules });
    expect(series.find((m) => m.month === '2030-06')).toMatchObject({
      isGap: true,
      comparable: false,
      components: { base: 0, special: 400_000 },
    });
    const [year] = salaryYears(series);
    // Paid: every cent, the 14th included. Development: June excluded with its amounts.
    expect(year!.paid).toMatchObject({ base: 4_400_000, special: 400_000 });
    expect(year!.development).toEqual({
      complete: false,
      cents: { base: 4_400_000, special: 0, variable: 0, total: 4_400_000 },
      excluded: [
        {
          month: '2030-06',
          reasons: ['gap'],
          cents: {
            base: 0,
            special: 400_000,
            variable: 0,
            benefit_in_kind: 0,
            reimbursement: 0,
            unmapped: 0,
            unreconciled: 0,
            undecomposed: 0,
          },
        },
      ],
      change: null,
    });
  });

  it('3: attributable deductions use comparable months only', () => {
    const slips: SalaryPayslip[] = monthsBetween('2031-01', '2031-12').map((m) =>
      m === '2031-03'
        ? slip(m, 400_000, [
            { code: '777', label: 'Sonderleistung', section: 'earning', cents: 1_000 },
          ])
        : slip(m, 400_000),
    );
    const bonus = (month: string, cents: number, sv: number, tax: number) =>
      slip(month, 0, [{ code: '900', label: 'Bonus', section: 'earning', cents }], {
        kind: 'special',
        specialType: 'other',
        id: `b-${month}`,
        svCents: sv,
        taxCents: tax,
      });
    slips.push(
      bonus('2031-03', 500_000, 70_000, 150_000),
      bonus('2031-09', 100_000, 14_000, 30_000),
    );
    const series = salaryMonthlySeries({ payslips: slips, rules });
    expect(variablePayByYear(series, slips, rules)).toEqual([
      {
        year: '2031',
        paidVariableCents: 600_000,
        complete: false,
        grossCents: 100_000,
        annualBaseCents: 4_400_000,
        shareOfBaseBp: 227,
        attributable: { svCents: 14_000, taxCents: 30_000, netCents: 56_000 },
        excluded: [
          {
            month: '2031-03',
            reasons: ['unmapped'],
            cents: {
              base: 400_000,
              special: 0,
              variable: 500_000,
              benefit_in_kind: 0,
              reimbursement: 0,
              unmapped: 1_000,
              unreconciled: 0,
              undecomposed: 0,
            },
          },
        ],
      },
    ]);
  });

  it('5: a benefit in kind only through the owner mapping, never from a label', () => {
    const line: SalaryWageLine = {
      code: '830',
      label: 'Zulage statt Sachbezug',
      section: 'earning',
      referenceMonth: null,
      amountCents: 20_000,
    };
    const slipLike = { kind: 'regular', specialType: null, employerContactId: 'emp' } as const;
    expect(classifyWageLine(line, slipLike, rules)).toBe('unmapped');
    expect(
      classifyWageLine(line, slipLike, [
        { employerContactId: null, wageCode: '830', labelNorm: null, component: 'benefit_in_kind' },
      ]),
    ).toBe('benefit_in_kind');
  });

  it('6: owner mappings precede whole-slip rules; a bonus document is classified per line', () => {
    const bonusDocument = slip(
      '2030-05',
      400_000,
      [{ code: null, label: 'Mitarbeiterbonus', section: 'earning', cents: 50_000 }],
      { kind: 'special', specialType: 'other', id: 'b-2030-05' },
    );
    const series = salaryMonthlySeries({
      payslips: [slip('2030-05', 400_000), bonusDocument],
      rules,
    });
    expect(series[0]!.components).toMatchObject({ base: 800_000, variable: 0 });
    expect(series[0]!.unmapped).toEqual([
      {
        payslipId: 'b-2030-05',
        code: null,
        label: 'Mitarbeiterbonus',
        amountCents: 50_000,
        reason: 'unmapped',
      },
    ]);
    const special14 = {
      kind: 'special',
      specialType: 'salary14',
      employerContactId: 'emp',
    } as const;
    const mapped: SalaryWageLine = {
      code: '105',
      label: 'Grundgehalt',
      section: 'earning',
      referenceMonth: null,
      amountCents: 1,
    };
    expect(classifyWageLine(mapped, special14, rules)).toBe('base');
    expect(
      classifyWageLine({ ...mapped, code: '503' }, special14, rules, { singleEarningLine: true }),
    ).toBe('special');
    expect(classifyWageLine({ ...mapped, code: '503' }, special14, rules)).toBe('unmapped');
  });

  it('minor: change of a non-positive start is null; divRound rounds ties away from zero', () => {
    expect(changeBp(0, 100)).toBeNull();
    expect(changeBp(-100, 100)).toBeNull();
    expect([
      divRound(5n, 2n),
      divRound(-5n, 2n),
      divRound(5n, -2n),
      divRound(-5n, -2n),
      divRound(1n, 3n),
      divRound(2n, 3n),
      divRound(-2n, 3n),
      divRound(7n, 7n),
    ]).toEqual([3n, -3n, -3n, 3n, 0n, 1n, -1n, 1n]);
  });

  it('minor: index points are exact and invalid ones are ignored', () => {
    expect(
      personalIndexMicro([
        { month: '2030-01', index: 102.3456 },
        { month: '2030-02', index: 0.1 },
        { month: '2030-03', index: Number.NaN },
        { month: '2030-04', index: Number.POSITIVE_INFINITY },
        { month: '2030-05', index: -1 },
      ]),
    ).toEqual([
      { month: '2030-01', indexMicro: 102_345_600n },
      { month: '2030-02', indexMicro: 100_000n },
    ]);
    const result = realDevelopment({
      values: [
        { month: '2030-01', cents: 100 },
        { month: '2030-02', cents: 100 },
      ],
      index: [
        { month: '2030-01', indexMicro: 100 },
        { month: '2030-02', indexMicro: Number.NaN },
      ],
      startMonth: '2030-01',
    })!;
    expect(result.points[1]!.realIndexMicro).toBeNull();
  });
});

describe('money re-review of PR #1082: cash basis, edges, raise effect', () => {
  const backPay = (referenceMonth: string, cents = 10_000): Extra => ({
    code: '105',
    label: 'Grundgehalt',
    section: 'earning',
    cents,
    referenceMonth,
  });
  const sumCheck = (slips: SalaryPayslip[], year: string) => {
    const y = salaryYears(salaryMonthlySeries({ payslips: slips, rules })).find(
      (r) => r.year === year,
    )!;
    const own = slips.filter((p) => p.month.startsWith(year));
    const reimbursed = own.flatMap((p) => p.lines).filter((l) => l.section === 'reimbursement');
    return {
      components:
        y.paid.base + y.paid.special + y.paid.variable + y.paid.benefit_in_kind + y.paid.unmapped,
      gross: own.reduce((n, p) => n + p.grossCents, 0),
      reimbursement: y.paid.reimbursement,
      reimbursed: reimbursed.reduce((n, l) => n + l.amountCents, 0),
    };
  };

  it('blocker: back pay stays in its payment month; no month is added', () => {
    const slips = monthsBetween('2030-01', '2030-12').map((m) =>
      m === '2030-01' ? slip(m, 400_000, [backPay('2029-12')]) : slip(m, 400_000),
    );
    const series = salaryMonthlySeries({ payslips: slips, rules });
    expect(series.map((m) => m.month)).toEqual(monthsBetween('2030-01', '2030-12'));
    expect(series[0]).toMatchObject({
      components: { base: 410_000 },
      backPayCents: { base: 10_000 },
      baseLevelCents: 400_000,
      backPay: [
        {
          payslipId: 'p-2030-01',
          code: '105',
          referenceMonth: '2029-12',
          component: 'base',
          amountCents: 10_000,
        },
      ],
    });
    expect(series.every((m) => m.baseLevelCents === 400_000)).toBe(true);
    expect(baseSalarySteps(series)).toEqual([]);
    const [year] = salaryYears(series);
    expect(year).toMatchObject({
      year: '2030',
      paid: { base: 4_810_000 },
      paidBackPay: { base: 10_000 },
      development: { complete: true, cents: { base: 4_810_000 } },
    });
    expect(sumCheck(slips, '2030')).toEqual({
      components: 4_810_000,
      gross: 4_810_000,
      reimbursement: 0,
      reimbursed: 0,
    });
  });

  it('blocker: a retroactive raise is one step in its payment month, retroactive from January', () => {
    const slips = [
      slip('2030-01', 400_000),
      slip('2030-02', 400_000),
      slip('2030-03', 410_000, [backPay('2030-01'), backPay('2030-02')]),
      slip('2030-04', 410_000),
    ];
    const series = salaryMonthlySeries({ payslips: slips, rules });
    expect(baseSalarySteps(series)).toEqual([
      {
        effectiveMonth: '2030-03',
        previousMonth: '2030-02',
        oldCents: 400_000,
        newCents: 410_000,
        deltaCents: 10_000,
        deltaBp: 250,
        uncertain: null,
        retroactiveFrom: '2030-01',
      },
    ]);
    expect(series.map((m) => [m.month, m.components.base, m.baseLevelCents])).toEqual([
      ['2030-01', 400_000, 400_000],
      ['2030-02', 400_000, 400_000],
      ['2030-03', 430_000, 410_000],
      ['2030-04', 410_000, 410_000],
    ]);
    expect(sumCheck(slips, '2030')).toMatchObject({ components: 1_640_000, gross: 1_640_000 });
  });

  it('sum check: yearly components equal the gross of the year as paid (scenario A)', () => {
    const slips = scenarioA();
    for (const year of ['2029', '2030']) {
      const c = sumCheck(slips, year);
      expect(c.components).toBe(c.gross);
      expect(c.reimbursement).toBe(c.reimbursed);
    }
  });

  it('major: steps that rest on one month at an edge or beside a gap are uncertain', () => {
    const steps = (bases: [string, number][]) =>
      baseSalarySteps(
        salaryMonthlySeries({ payslips: bases.map(([m, b]) => slip(m, b)), rules }),
      ).map((x) => [x.effectiveMonth, x.deltaCents, x.deltaBp, x.uncertain]);
    expect(
      steps([
        ['2030-01', 200_000],
        ['2030-02', 400_000],
        ['2030-03', 400_000],
      ]),
    ).toEqual([['2030-02', 200_000, 10_000, 'edge']]);
    expect(
      steps([
        ['2030-01', 400_000],
        ['2030-02', 400_000],
        ['2030-03', 200_000],
      ]),
    ).toEqual([['2030-03', -200_000, -5_000, 'edge']]);
    expect(
      steps([
        ['2030-01', 400_000],
        ['2030-02', 400_000],
        ['2030-04', 420_000],
        ['2030-05', 420_000],
      ]),
    ).toEqual([['2030-04', 20_000, 500, null]]);
    expect(
      steps([
        ['2030-01', 400_000],
        ['2030-02', 400_000],
        ['2030-04', 300_000],
        ['2030-06', 420_000],
        ['2030-07', 420_000],
      ]),
    ).toEqual([
      ['2030-04', -100_000, -2_500, 'edge'],
      ['2030-06', 120_000, 4_000, 'edge'],
    ]);
  });

  it('major: the raise effect needs identical non-base components, else a reason', () => {
    const before = monthsBetween('2030-01', '2030-03').map((m) => slip(m, 400_000));
    const same = monthsBetween('2030-04', '2030-06').map((m) => slip(m, 420_000));
    expect(
      lastRaiseNetEffect(salaryMonthlySeries({ payslips: [...before, ...same], rules })),
    ).toEqual({
      effectiveMonth: '2030-04',
      beforeMonths: ['2030-01', '2030-02', '2030-03'],
      afterMonths: ['2030-04', '2030-05', '2030-06'],
      deltaGrossCents: 60_000,
      deltaNetCents: 43_200,
      netPerGrossBp: 7_200,
      reason: null,
    });
    const withBenefit = monthsBetween('2030-04', '2030-06').map((m) =>
      slip(m, 420_000, [benefit(20_000)]),
    );
    expect(
      lastRaiseNetEffect(salaryMonthlySeries({ payslips: [...before, ...withBenefit], rules })),
    ).toEqual({
      effectiveMonth: '2030-04',
      beforeMonths: [],
      afterMonths: [],
      deltaGrossCents: null,
      deltaNetCents: null,
      netPerGrossBp: null,
      reason: 'components_differ',
    });
    expect(lastRaiseNetEffect(salaryMonthlySeries({ payslips: before, rules }))).toMatchObject({
      netPerGrossBp: null,
      reason: 'no_step',
    });
  });

  it('a benefit-in-kind section alone decides nothing; owner rule ties are deterministic', () => {
    const line: SalaryWageLine = {
      code: '820',
      label: 'Sachbezug',
      section: 'benefit_in_kind',
      referenceMonth: null,
      amountCents: 1,
    };
    const regular = { kind: 'regular', specialType: null, employerContactId: 'emp' } as const;
    expect(classifyWageLine(line, regular, [])).toBe('unmapped');
    const tie: WageComponentRule[] = [
      {
        employerContactId: null,
        wageCode: '820',
        labelNorm: null,
        component: 'base',
        updatedAt: '2030-01-01T00:00:00.000Z',
      },
      {
        employerContactId: null,
        wageCode: '820',
        labelNorm: null,
        component: 'variable',
        updatedAt: '2030-02-01T00:00:00.000Z',
      },
    ];
    expect(classifyWageLine(line, regular, tie)).toBe('variable');
    expect(classifyWageLine(line, regular, [...tie].reverse())).toBe('variable');
    // Employer + code beats code beats label.
    const specific: WageComponentRule[] = [
      { employerContactId: null, wageCode: null, labelNorm: 'sachbezug', component: 'special' },
      { employerContactId: null, wageCode: '820', labelNorm: null, component: 'variable' },
      { employerContactId: 'emp', wageCode: '820', labelNorm: null, component: 'benefit_in_kind' },
    ];
    expect(classifyWageLine(line, regular, specific)).toBe('benefit_in_kind');
    expect(classifyWageLine(line, regular, specific.slice(0, 2))).toBe('variable');
  });

  it('year to date leaves out partial and edge-uncertain months', () => {
    const slips = [
      slip('2029-12', 300_000),
      slip('2030-01', 300_000),
      slip('2030-02', 150_000), // partial
      slip('2030-03', 300_000),
      slip('2031-01', 310_000),
      slip('2031-02', 310_000),
      slip('2031-03', 310_000),
    ];
    const series = salaryMonthlySeries({ payslips: slips, rules });
    // February 2030 is partial; March 2030 rests on one month beside a gap (edge).
    expect(yearToDate(series, '2031')!.development.months).toEqual(['01']);
    // Without December 2029, January 2030 rests on one month at the series start: excluded too.
    const edge = salaryMonthlySeries({ payslips: slips.slice(1), rules });
    expect(series.find((m) => m.month === '2030-01')?.edgeLevel).toBe(false);
    expect(edge.find((m) => m.month === '2030-01')?.edgeLevel).toBe(true);
    expect(yearToDate(edge, '2031')!.development).toMatchObject({ months: [], change: null });
  });
});

describe('third money review of PR #1082: two layers, literal cases, invariants', () => {
  const regular = { kind: 'regular', specialType: null, employerContactId: 'emp' } as const;
  const benefitSection: SalaryWageLine = {
    code: '830',
    label: 'Sachbezug Wohnung',
    section: 'benefit_in_kind',
    referenceMonth: null,
    amountCents: 5_000,
  };

  it('blocker 1: an unmapped benefit-section line is never special or bonus pay', () => {
    expect(
      classifyWageLine(
        benefitSection,
        { ...regular, kind: 'special', specialType: 'salary14' },
        rules,
      ),
    ).toBe('unmapped');
    expect(
      classifyWageLine(
        benefitSection,
        { ...regular, kind: 'special', specialType: 'other' },
        rules,
      ),
    ).toBe('unmapped');
    const fourteenth = {
      ...special('2030-06', 400_000, 'salary14'),
      grossCents: 405_000,
      wage: {
        lineCheck: 'ok' as const,
        split: null,
        lines: [
          {
            code: '503',
            label: 'Sonderzahlung',
            section: 'earning' as const,
            referenceMonth: null,
            amountCents: 400_000,
          },
          benefitSection,
        ],
      },
    };
    const [june] = salaryMonthlySeries({ payslips: [fourteenth], rules });
    expect(june!.paid).toEqual({
      base: 0,
      special: 400_000,
      variable: 0,
      benefit_in_kind: 0,
      reimbursement: 0,
      unmapped: 5_000,
      unreconciled: 0,
      undecomposed: 0,
    });
  });

  it('blocker 3: edge levels stay out of the real series', () => {
    const series = salaryMonthlySeries({
      payslips: [slip('2030-01', 400_000), slip('2030-02', 400_000), slip('2030-03', 200_000)],
      rules,
    });
    expect(baseSalaryValues(series)).toEqual([
      { month: '2030-01', cents: 400_000 },
      { month: '2030-02', cents: 400_000 },
    ]);
    const real = realDevelopment({
      values: baseSalaryValues(series),
      index: monthsBetween('2030-01', '2030-03').map((month) => ({
        month,
        indexMicro: 100_000_000,
      })),
      startMonth: baseSalaryAnchor(series)!,
      endMonth: '2030-03',
    })!;
    expect(real.points.map((p) => p.realChangeBp)).toEqual([0, 0, null]);
    // The exit month stays in the paid layer.
    expect(salaryYears(series)[0]!.paid.base).toBe(1_000_000);
  });

  it('minor: the raise effect uses only the runs adjacent to the step', () => {
    // Old level 400.000 three times, a different level, then 410.000 once before the step.
    const months = [
      ...monthsBetween('2030-01', '2030-03').map((m) => slip(m, 400_000)),
      slip('2030-04', 410_000),
      slip('2030-05', 410_000),
      ...monthsBetween('2030-06', '2030-08').map((m) => slip(m, 430_000)),
    ];
    const effect = lastRaiseNetEffect(salaryMonthlySeries({ payslips: months, rules }));
    expect(effect).toMatchObject({ effectiveMonth: '2030-06', reason: 'too_few_months' });
  });

  it('minor: same-month rows carry partial and edge markers', () => {
    const series = salaryMonthlySeries({
      payslips: [
        slip('2029-01', 400_000),
        slip('2029-02', 200_000),
        slip('2029-03', 400_000),
        slip('2030-01', 400_000),
        slip('2030-02', 400_000),
        slip('2030-03', 400_000),
      ],
      rules,
    });
    const rows = sameMonthPreviousYear(series);
    expect(rows.find((r) => r.month === '2030-02')).toMatchObject({
      comparable: false,
      reasons: { current: [], previous: ['partial'] },
      change: null,
    });
  });

  it('minor: equal owner rules resolve the same in any input order', () => {
    const a: WageComponentRule = {
      employerContactId: null,
      wageCode: '1',
      labelNorm: null,
      component: 'base',
      id: 'b',
    };
    const b: WageComponentRule = { ...a, component: 'variable', id: 'a' };
    const c: WageComponentRule = { ...a, component: 'special', id: null };
    const line: SalaryWageLine = {
      code: '1',
      label: 'X',
      section: 'earning',
      referenceMonth: null,
      amountCents: 1,
    };
    const orders = [
      [a, b, c],
      [c, b, a],
      [b, c, a],
    ];
    expect(orders.map((o) => classifyWageLine(line, regular, o))).toEqual([
      'variable',
      'variable',
      'variable',
    ]);
    const noId = [
      { ...a, id: null },
      { ...a, component: 'variable' as const, id: null },
    ];
    expect([
      classifyWageLine(line, regular, noId),
      classifyWageLine(line, regular, [...noId].reverse()),
    ]).toEqual(['base', 'base']);
  });

  it('literal: non-base back pay, clawback and a reference month equal to the payment month', () => {
    const series = salaryMonthlySeries({
      payslips: [
        slip('2030-01', 400_000),
        slip('2030-02', 400_000, [
          {
            code: '129',
            label: 'Bonus',
            section: 'earning',
            cents: 30_000,
            referenceMonth: '2029-12',
          },
        ]),
        slip('2030-03', 400_000, [
          {
            code: '105',
            label: 'Grundgehalt',
            section: 'earning',
            cents: -10_000,
            referenceMonth: '2030-02',
          },
        ]),
        slip('2030-04', 400_000, [
          {
            code: '105',
            label: 'Grundgehalt',
            section: 'earning',
            cents: 5_000,
            referenceMonth: '2030-04',
          },
        ]),
      ],
      rules,
    });
    expect(
      series.map((m) => [
        m.month,
        m.paid.base,
        m.paid.variable,
        m.backPayCents.base,
        m.backPayCents.variable,
        m.baseLevelCents,
      ]),
    ).toEqual([
      ['2030-01', 400_000, 0, 0, 0, 400_000],
      ['2030-02', 400_000, 30_000, 0, 30_000, 400_000],
      ['2030-03', 390_000, 0, -10_000, 0, 400_000],
      // Same reference month: ordinary pay, part of the level.
      ['2030-04', 405_000, 0, 0, 0, 405_000],
    ]);
    expect(
      baseSalarySteps(series).map((x) => [x.effectiveMonth, x.deltaCents, x.uncertain]),
    ).toEqual([['2030-04', 5_000, 'edge']]);
    expect(salaryYears(series)[0]!.paidBackPay).toEqual({
      base: -10_000,
      special: 0,
      variable: 30_000,
      benefit_in_kind: 0,
      reimbursement: 0,
    });
  });

  it('literal: 400.000, gap, 420.000, 420.000', () => {
    const series = salaryMonthlySeries({
      payslips: [slip('2030-01', 400_000), slip('2030-03', 420_000), slip('2030-04', 420_000)],
      rules,
    });
    expect(baseSalarySteps(series)).toEqual([
      {
        effectiveMonth: '2030-03',
        previousMonth: '2030-01',
        oldCents: 400_000,
        newCents: 420_000,
        deltaCents: 20_000,
        deltaBp: 500,
        uncertain: 'edge',
        retroactiveFrom: null,
      },
    ]);
    expect(baseSalaryAnchor(series)).toBe('2030-03');
    expect(baseSalaryValues(series).map((v) => v.month)).toEqual(['2030-03', '2030-04']);
  });

  it('literal: six months at 400.000 and six at 420.000', () => {
    const series = salaryMonthlySeries({
      payslips: monthsBetween('2030-01', '2030-12').map((m) =>
        slip(m, m < '2030-07' ? 400_000 : 420_000),
      ),
      rules,
    });
    expect(baseSalarySteps(series)).toEqual([
      {
        effectiveMonth: '2030-07',
        previousMonth: '2030-06',
        oldCents: 400_000,
        newCents: 420_000,
        deltaCents: 20_000,
        deltaBp: 500,
        uncertain: null,
        retroactiveFrom: null,
      },
    ]);
    const [year] = salaryYears(series);
    expect(year!.paid.base).toBe(4_920_000);
    expect(year!.development).toMatchObject({
      complete: true,
      cents: { total: 4_920_000 },
      excluded: [],
    });
    expect(lastRaiseNetEffect(series)).toMatchObject({
      deltaGrossCents: 60_000,
      deltaNetCents: 43_200,
      netPerGrossBp: 7_200,
      reason: null,
    });
  });

  it('blocker: an unreconciled payslip keeps every cent in paid and blocks its month', () => {
    const unknown: Extra = { code: '777', label: 'Unbekannt', section: 'unknown', cents: 20_000 };
    const memo: Extra = {
      code: '9770',
      label: 'MA-Vorsorge Beitrag',
      section: 'memo',
      cents: 8_415,
    };
    const series = salaryMonthlySeries({
      payslips: [
        slip('2030-01', 280_000, [unknown, memo], {
          grossCents: 300_000,
          lineCheck: 'gross_mismatch',
        }),
      ],
      rules,
    });
    expect(series[0]).toMatchObject({
      comparable: false,
      issues: ['line_check'],
      paid: { base: 280_000, unmapped: 0, unreconciled: 20_000, undecomposed: 0 },
      unmapped: [
        {
          payslipId: 'p-2030-01',
          code: '777',
          label: 'Unbekannt',
          amountCents: 20_000,
          reason: 'unknown_line',
        },
        {
          payslipId: 'p-2030-01',
          code: '9770',
          label: 'MA-Vorsorge Beitrag',
          amountCents: 8_415,
          reason: 'memo_line',
        },
      ],
    });
    expect(paidTotal(series[0]!.paid)).toBe(300_000);
    expect(salaryYears(series)[0]!.development.excluded).toEqual([
      {
        month: '2030-01',
        reasons: ['line_check'],
        cents: {
          base: 280_000,
          special: 0,
          variable: 0,
          benefit_in_kind: 0,
          reimbursement: 0,
          unmapped: 0,
          unreconciled: 20_000,
          undecomposed: 0,
        },
      },
    ]);
    // A memo line alone does not block: the gross is reconciled.
    const memoOnly = salaryMonthlySeries({ payslips: [slip('2030-01', 280_000, [memo])], rules });
    expect(memoOnly[0]).toMatchObject({ comparable: true, issues: [], paid: { unreconciled: 0 } });
    // Without a known gross the lines are all there is: flagged, not comparable.
    const noGross = salaryMonthlySeries({
      payslips: [slip('2030-01', 280_000, [], { lineCheck: 'no_gross' })],
      rules,
    });
    expect(noGross[0]).toMatchObject({
      comparable: false,
      issues: ['gross_unknown'],
      paid: { base: 280_000 },
    });
  });

  it('major (i): a payslip without wage lines is paid only; its month is not comparable', () => {
    const legacy14: SalaryPayslip = { ...special('2030-06', 405_000, 'salary14'), wage: null };
    const [june] = salaryMonthlySeries({ payslips: [slip('2030-06', 400_000), legacy14], rules });
    expect(june).toMatchObject({
      comparable: false,
      issues: ['no_wage_lines'],
      paid: { base: 400_000, special: 405_000, undecomposed: 0 },
    });
    // A year made only of legacy payslips: paid complete, development empty with reasons.
    const legacyYear = monthsBetween('2031-01', '2031-12').map((m): SalaryPayslip => ({
      ...slip(m, 400_000, [reimbursement(1_000)]),
      wage: null,
    }));
    const [year] = salaryYears(salaryMonthlySeries({ payslips: legacyYear, rules }));
    expect(year!.paid).toEqual({
      base: 0,
      special: 0,
      variable: 0,
      benefit_in_kind: 0,
      reimbursement: 12_000,
      unmapped: 0,
      unreconciled: 0,
      undecomposed: 4_800_000,
    });
    expect(year!.development.cents).toEqual({ base: 0, special: 0, variable: 0, total: 0 });
    expect(year!.development.excluded.map((e) => [e.month, e.reasons, paidTotal(e.cents)])).toEqual(
      monthsBetween('2031-01', '2031-12').map((m) => [m, ['no_wage_lines'], 401_000]),
    );
  });

  it('major (ii): further earnings on a 13th/14th payslip are unmapped, never special', () => {
    const fourteenth = slip(
      '2030-06',
      0,
      [
        { code: '503', label: 'Sonderzahlung', section: 'earning', cents: 400_000 },
        { code: '140', label: 'Überstunden', section: 'earning', cents: 30_000 },
      ],
      { kind: 'special', specialType: 'salary14', id: 's-2030-06' },
    );
    const [june] = salaryMonthlySeries({ payslips: [slip('2030-06', 400_000), fourteenth], rules });
    expect(june).toMatchObject({
      comparable: false,
      issues: ['unmapped'],
      paid: { base: 400_000, special: 0, unmapped: 430_000 },
    });
    // With an owner mapping for the 14th, only the overtime stays unmapped.
    const mapped = salaryMonthlySeries({
      payslips: [slip('2030-06', 400_000), fourteenth],
      rules: [
        ...rules,
        { employerContactId: null, wageCode: '503', labelNorm: null, component: 'special' },
      ],
    });
    expect(mapped[0]!.paid).toMatchObject({ special: 400_000, unmapped: 30_000 });
  });

  it('minor: ratios out of the safe range are null', () => {
    expect(ratioBp(Number.MAX_SAFE_INTEGER, 1)).toBeNull();
    expect(ratioBp(1.5, 1)).toBeNull();
    expect(
      realDevelopment({
        values: [
          { month: '2030-01', cents: 100 },
          { month: '2030-02', cents: 0.5 },
        ],
        index: [
          { month: '2030-01', indexMicro: 100 },
          { month: '2030-02', indexMicro: 100 },
        ],
        startMonth: '2030-01',
        endMonth: '2030-02',
      })!.points[1],
    ).toMatchObject({ valueCents: null, realChangeBp: null });
  });

  // --- Invariants over seeded synthetic series ---------------------------------------------------
  /** Deterministic 32-bit generator (mulberry32). */
  const generator = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  /** A synthetic payslip with the fixture's own money: what it paid (gross + reimbursements). */
  type Fixture = { slip: SalaryPayslip; paidCents: number };
  function syntheticSeries(seed: number): Fixture[] {
    const r = generator(seed);
    const int = (min: number, max: number) => min + Math.floor(r() * (max - min + 1));
    // Every third series is clean (no gaps, unmapped/unknown lines, legacy or partial months) and
    // long enough to hold complete consecutive years, so year changes are exercised too.
    const clean = seed % 3 === 0;
    const start = `${int(2027, 2030)}-${String(int(1, 12)).padStart(2, '0')}`;
    const months = monthsBetween(start, addMonths(start, clean ? int(30, 47) : int(12, 35)));
    let level = int(250, 450) * 1_000;
    const out: Fixture[] = [];
    // `gross` and `reimbursed` are tracked here, independent of the module's line handling.
    const add = (s: SalaryPayslip, gross: number, reimbursed: number) => {
      expect(s.grossCents).toBe(gross);
      out.push({ slip: s, paidCents: gross + reimbursed });
    };
    for (const month of months) {
      if (r() < 0.06) level += int(-20, 50) * 1_000;
      if (!clean && r() < 0.08) continue; // gap
      const base = !clean && r() < 0.05 ? Math.floor(level / 2) : level;
      let gross = base,
        reimbursed = 0;
      const extras: Extra[] = [];
      const earn = (e: Extra) => {
        extras.push(e);
        gross += e.cents;
      };
      if (r() < 0.3) {
        const cents = int(1, 9_000);
        extras.push(reimbursement(cents));
        reimbursed += cents;
      }
      if (r() < 0.3) earn(benefit(int(1, 30_000)));
      if (r() < 0.1)
        earn({ code: '129', label: 'Bonus', section: 'earning', cents: int(1, 80_000) });
      if (r() < 0.08)
        earn({
          code: r() < 0.7 ? '105' : '129',
          label: 'Nachzahlung',
          section: 'earning',
          cents: int(1, 20_000) * (r() < 0.2 ? -1 : 1),
          referenceMonth: addMonths(month, -int(1, 3)),
        });
      if (!clean && r() < 0.07)
        earn({ code: '777', label: 'Sonderleistung', section: 'earning', cents: int(1, 50_000) });
      if (r() < 0.2)
        extras.push({ code: '9770', label: 'MA-Vorsorge', section: 'memo', cents: int(1, 9_000) });
      let lineCheck: 'ok' | 'gross_mismatch' = 'ok';
      if (!clean && r() < 0.06) {
        // A line the parser could not place, inside the printed gross.
        const cents = int(1, 30_000);
        extras.push({ code: '888', label: 'Unbekannt', section: 'unknown', cents });
        gross += cents;
        lineCheck = 'gross_mismatch';
      }
      const regular = slip(month, base, extras, { grossCents: gross, lineCheck });
      if (!clean && r() < 0.05) add({ ...regular, wage: null }, gross, reimbursed);
      else add(regular, gross, reimbursed);
      const mm = month.slice(5);
      if ((mm === '06' || mm === '11') && r() < 0.8) {
        const type = mm === '06' ? 'salary14' : 'salary13';
        const s14 = special(month, level, type);
        if (!clean && r() < 0.1) add({ ...s14, wage: null }, level, 0);
        else {
          let g = level;
          if (r() < 0.2) {
            const cents = int(1, 9_000);
            s14.wage!.lines.push({ ...benefitSection, amountCents: cents });
            g += cents;
          }
          add({ ...s14, grossCents: g }, g, 0);
        }
      }
      if (r() < 0.06) {
        const cents = int(1, 200_000);
        add(
          slip(month, 0, [{ code: '900', label: 'Bonus', section: 'earning', cents }], {
            kind: 'special',
            specialType: 'other',
            id: `b-${month}`,
          }),
          cents,
          0,
        );
      }
    }
    return out;
  }
  const developmentView = (slips: SalaryPayslip[]) => {
    const series = salaryMonthlySeries({ payslips: slips, rules });
    const years = salaryYears(series);
    return {
      years: years.map((y) => [
        y.year,
        y.development.complete,
        y.development.cents,
        y.development.change,
      ]),
      steps: baseSalarySteps(series),
      ytd: years.map((y) => {
        const d = yearToDate(series, y.year)!.development;
        return [d.months, d.current, d.previous, d.change];
      }),
      months: sameMonthPreviousYear(series).map((m) => [m.month, m.comparable, m.change]),
      values: baseSalaryValues(series),
      anchor: baseSalaryAnchor(series),
    };
  };
  const SEEDS = Array.from({ length: 222 }, (_, i) => 1_066 + i);
  /** The fixture's money of one month: gross plus reimbursements of its payslips. */
  const fixtureMonth = (fixtures: Fixture[], month: string) =>
    fixtures.filter((f) => f.slip.month === month).reduce((n, f) => n + f.paidCents, 0);

  it("invariant a: paid sums equal the fixtures' gross and reimbursements, per year and overall", () => {
    for (const seed of SEEDS) {
      const fixtures = syntheticSeries(seed);
      const years = salaryYears(
        salaryMonthlySeries({ payslips: fixtures.map((f) => f.slip), rules }),
      );
      for (const y of years)
        expect([seed, y.year, paidTotal(y.paid)]).toEqual([
          seed,
          y.year,
          fixtures
            .filter((f) => f.slip.month.startsWith(y.year))
            .reduce((n, f) => n + f.paidCents, 0),
        ]);
      expect(years.reduce((n, y) => n + paidTotal(y.paid), 0)).toBe(
        fixtures.reduce((n, f) => n + f.paidCents, 0),
      );
    }
  });

  it('invariant b: reimbursements, benefits in kind and unmapped amounts never move development', () => {
    for (const seed of SEEDS) {
      const slips = syntheticSeries(seed).map((f) => f.slip);
      const r = generator(seed ^ 0x5eed);
      const changed = slips.map((p) => {
        if (!p.wage) return p;
        let extra = 0;
        const lines = p.wage.lines.map((l) => {
          if (!['1260', '820', '777', '830', '9770'].includes(l.code ?? '')) return l;
          const delta = 1 + Math.floor(r() * 5_000);
          if (l.section !== 'reimbursement' && l.section !== 'memo') extra += delta;
          return { ...l, amountCents: l.amountCents + delta };
        });
        if (r() < 0.3)
          lines.push({
            code: '1260',
            label: 'Telearbeit',
            section: 'reimbursement',
            referenceMonth: null,
            amountCents: 777,
          });
        if (r() < 0.3) {
          lines.push({
            code: '820',
            label: 'Sachbezug',
            section: 'earning',
            referenceMonth: null,
            amountCents: 999,
          });
          extra += 999;
        }
        // The printed gross moves with the earning lines, as on a real payslip.
        return { ...p, grossCents: p.grossCents + extra, wage: { ...p.wage, lines } };
      });
      expect([seed, developmentView(changed)]).toEqual([seed, developmentView(slips)]);
    }
  });

  it("invariant c: every month is comparable or excluded with the fixture's amounts", () => {
    for (const seed of SEEDS) {
      const fixtures = syntheticSeries(seed);
      const series = salaryMonthlySeries({ payslips: fixtures.map((f) => f.slip), rules });
      const years = salaryYears(series);
      const excluded = new Map(
        years.flatMap((y) => y.development.excluded.map((e) => [e.month, e] as const)),
      );
      for (const m of series) {
        if (m.comparable) expect(excluded.has(m.month)).toBe(false);
        else
          expect([seed, m.month, paidTotal(excluded.get(m.month)!.cents)]).toEqual([
            seed,
            m.month,
            fixtureMonth(fixtures, m.month),
          ]);
      }
      for (const y of years) {
        const ytd = yearToDate(series, y.year)!;
        for (const e of ytd.development.excluded)
          expect([seed, e.month, paidTotal(e.cents)]).toEqual([
            seed,
            e.month,
            fixtureMonth(fixtures, e.month),
          ]);
        const ytdMonths = ytd.months.map((mm) => `${y.year}-${mm}`);
        expect(paidTotal(ytd.paid.current)).toBe(
          ytdMonths.reduce((n, m) => n + fixtureMonth(fixtures, m), 0),
        );
      }
      for (const row of sameMonthPreviousYear(series)) {
        expect(paidTotal(row.paid.current)).toBe(fixtureMonth(fixtures, row.month));
        if (row.paid.previous)
          expect(paidTotal(row.paid.previous)).toBe(fixtureMonth(fixtures, row.previousMonth));
      }
    }
  });

  it('invariant d: no step, change or index from fewer months than documented', () => {
    for (const seed of SEEDS) {
      const series = salaryMonthlySeries({
        payslips: syntheticSeries(seed).map((f) => f.slip),
        rules,
      });
      const byMonth = new Map(series.map((m) => [m.month, m]));
      const level = new Set(baseLevelMonths(series).map((m) => m.month));
      for (const step of baseSalarySteps(series)) {
        expect(level.has(step.previousMonth) && level.has(step.effectiveMonth)).toBe(true);
        if (step.uncertain === null)
          expect([
            byMonth.get(step.previousMonth)!.edgeLevel,
            byMonth.get(step.effectiveMonth)!.edgeLevel,
          ]).toEqual([false, false]);
      }
      for (const y of salaryYears(series))
        if (y.development.change)
          for (const year of [y.year, String(Number(y.year) - 1)])
            expect(series.filter((m) => m.month.startsWith(year) && m.comparable)).toHaveLength(12);
      const anchor = baseSalaryAnchor(series);
      if (anchor) {
        const next = byMonth.get(addMonths(anchor, 1));
        expect(level.has(anchor) && next !== undefined && level.has(next.month)).toBe(true);
        expect(next!.baseLevelCents).toBe(byMonth.get(anchor)!.baseLevelCents);
      }
      expect(baseSalaryValues(series).every((v) => !byMonth.get(v.month)!.edgeLevel)).toBe(true);
      for (const y of salaryYears(series))
        for (const mm of yearToDate(series, y.year)!.development.months)
          for (const year of [y.year, String(Number(y.year) - 1)]) {
            const m = byMonth.get(`${year}-${mm}`)!;
            expect(m.comparable && !m.partialBase && !m.edgeLevel).toBe(true);
          }
    }
  });

  it('the generated series cover every case the invariants speak about', () => {
    const c: Record<string, number> = {};
    const count = (key: string, n: number) => (c[key] = (c[key] ?? 0) + n);
    for (const seed of SEEDS) {
      const fixtures = syntheticSeries(seed);
      const slips = fixtures.map((f) => f.slip);
      const s = salaryMonthlySeries({ payslips: slips, rules });
      const lines = slips.flatMap((p) => p.wage?.lines ?? []);
      count('gap', s.filter((m) => m.isGap).length);
      count('partial', s.filter((m) => m.partialBase).length);
      count('unmappedMonth', s.filter((m) => m.hasUnmapped).length);
      count('lineCheckNotOk', slips.filter((p) => p.wage && p.wage.lineCheck !== 'ok').length);
      count('unknownLine', lines.filter((l) => l.section === 'unknown').length);
      count('memoLine', lines.filter((l) => l.section === 'memo').length);
      count('benefitSection', lines.filter((l) => l.section === 'benefit_in_kind').length);
      count('bonusSlip', slips.filter((p) => p.specialType === 'other').length);
      count('legacyRegular', slips.filter((p) => !p.wage && p.kind === 'regular').length);
      count('legacySpecial', slips.filter((p) => !p.wage && p.kind === 'special').length);
      count('backPay', s.filter((m) => m.hasBackPay).length);
      count('clawback', s.filter((m) => m.backPayCents.base < 0).length);
      count('edge', s.filter((m) => m.edgeLevel).length);
      count('certainStep', baseSalarySteps(s).filter((x) => !x.uncertain).length);
      count('yearChange', salaryYears(s).filter((y) => y.development.change).length);
    }
    expect(Object.keys(c)).toHaveLength(15);
    expect(Object.entries(c).filter(([, n]) => n < 10)).toEqual([]);
  });
});
