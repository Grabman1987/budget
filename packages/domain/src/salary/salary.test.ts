import { describe, expect, it } from 'vitest';
import { monthsBetween } from '../date';
import {
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
];
type Extra = { code: string; label: string; section: SalaryWageLine['section']; cents: number };
const reimbursement = (cents = 2_500): Extra => ({
  code: '1260',
  label: 'Telearbeit',
  section: 'reimbursement',
  cents,
});
const benefit = (cents = 20_000): Extra => ({
  code: '820',
  label: 'Sachbezug Dienstwagen',
  section: 'benefit_in_kind',
  cents,
});
function slip(
  month: string,
  base: number,
  extras: Extra[] = [],
  o: Partial<Pick<SalaryPayslip, 'kind' | 'specialType' | 'documentType' | 'id'>> = {},
): SalaryPayslip {
  const lines: SalaryWageLine[] = [
    ...(base
      ? [{ code: '105', label: 'Grundgehalt', section: 'earning' as const, amountCents: base }]
      : []),
    ...extras.map((e) => ({
      code: e.code,
      label: e.label,
      section: e.section,
      amountCents: e.cents,
    })),
  ];
  const gross = lines
    .filter((l) => l.section !== 'reimbursement')
    .reduce((n, l) => n + l.amountCents, 0);
  const reimbursed = lines
    .filter((l) => l.section === 'reimbursement')
    .reduce((n, l) => n + l.amountCents, 0);
  const sv = (gross * 18) / 100,
    tax = (gross * 10) / 100;
  return {
    id: o.id ?? `p-${month}`,
    month,
    kind: o.kind ?? 'regular',
    specialType: o.specialType ?? null,
    documentType: o.documentType ?? null,
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
    wage: { lineCheck: 'ok', split: null, lines },
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
    documentType: null,
    employerContactId: 'emp',
  } as const;
  const earning = (code: string | null, label = 'Zulage'): SalaryWageLine => ({
    code,
    label,
    section: 'earning',
    amountCents: 100,
  });
  it('uses only unambiguous built-in rules and never guesses', () => {
    expect(classifyWageLine({ ...earning('1'), section: 'reimbursement' }, regular, [])).toBe(
      'reimbursement',
    );
    expect(
      classifyWageLine(earning('1'), { ...regular, kind: 'special', specialType: 'salary14' }, []),
    ).toBe('special');
    expect(
      classifyWageLine(earning('1'), { ...regular, kind: 'special', specialType: 'other' }, []),
    ).toBe('unmapped');
    expect(classifyWageLine(earning(null), { ...regular, documentType: 'bonus' }, [])).toBe(
      'variable',
    );
    expect(classifyWageLine({ ...earning('820'), section: 'benefit_in_kind' }, regular, [])).toBe(
      'benefit_in_kind',
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
      },
      {
        effectiveMonth: '2030-10',
        previousMonth: '2030-09',
        oldCents: 315_000,
        newCents: 330_750,
        deltaCents: 15_750,
        deltaBp: 500,
      },
    ]);
  });

  it('compares complete years per component; benefits and reimbursements stay outside', () => {
    const years = salaryYears(series);
    expect(years.map((y) => [y.year, y.complete, y.developmentCents])).toEqual([
      ['2029', true, 4_355_000],
      ['2030', true, 4_473_000],
      ['2031', false, 330_750],
    ]);
    expect(years[1]!.components).toEqual({
      base: 3_827_250,
      special: 645_750,
      variable: 0,
      benefit_in_kind: 240_000,
      reimbursement: 30_000,
    });
    expect(years[1]!.change).toEqual({
      base: { deltaCents: 137_250, deltaBp: 372 },
      special: { deltaCents: 30_750, deltaBp: 500 },
      variable: { deltaCents: -50_000, deltaBp: -10_000 },
      benefit_in_kind: { deltaCents: 240_000, deltaBp: null },
      reimbursement: { deltaCents: 0, deltaBp: 0 },
      development: { deltaCents: 118_000, deltaBp: 271 },
    });
    expect(years[2]!.change).toBeNull();
  });

  it('benefits in kind and reimbursements never move a development figure', () => {
    const other = salaryMonthlySeries({ payslips: scenarioA(7_700, 1_100), rules });
    const strip = (s: typeof series) =>
      s.map((m) => [m.month, m.developmentCents, m.components.base, m.comparable, m.partialBase]);
    expect(strip(other)).toEqual(strip(series));
    expect(baseSalarySteps(other)).toEqual(baseSalarySteps(series));
    expect(salaryYears(other).map((y) => [y.developmentCents, y.change?.development])).toEqual(
      salaryYears(series).map((y) => [y.developmentCents, y.change?.development]),
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
    expect(march.change?.development).toEqual({ deltaCents: -35_000, deltaBp: -1_000 });
    const january = rows.find((r) => r.month === '2031-01')!;
    expect(january.previousMonth).toBe('2030-01');
    expect(january.change?.base).toEqual({ deltaCents: 15_750, deltaBp: 500 });
    expect(rows.find((r) => r.month === '2029-01')).toMatchObject({
      previousMonth: '2028-01',
      comparable: false,
      previous: null,
      change: null,
    });
  });

  it('compares year to date on the same months', () => {
    expect(yearToDate(series, '2031')).toEqual({
      year: '2031',
      months: ['01'],
      current: {
        base: 330_750,
        special: 0,
        variable: 0,
        benefit_in_kind: 20_000,
        reimbursement: 2_500,
      },
      previous: {
        base: 315_000,
        special: 0,
        variable: 0,
        benefit_in_kind: 20_000,
        reimbursement: 2_500,
      },
      change: {
        base: { deltaCents: 15_750, deltaBp: 500 },
        special: { deltaCents: 0, deltaBp: null },
        variable: { deltaCents: 0, deltaBp: null },
        benefit_in_kind: { deltaCents: 0, deltaBp: 0 },
        reimbursement: { deltaCents: 0, deltaBp: 0 },
        development: { deltaCents: 15_750, deltaBp: 500 },
      },
    });
  });

  it('reports variable pay per year; mixed payslips do not separate deductions', () => {
    expect(variablePayByYear(series, slips, rules)).toEqual([
      {
        year: '2029',
        complete: true,
        grossCents: 50_000,
        annualBaseCents: 3_690_000,
        shareOfBaseBp: 136,
        attributable: null,
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
    });
    // Without January there are only two clean months after the raise: not determinable.
    const short = salaryMonthlySeries({
      payslips: slips.filter((s) => s.month !== '2031-01'),
      rules,
    });
    expect(lastRaiseNetEffect(short)).toBeNull();
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
      },
    ]);
  });

  it('compares year to date only on months comparable in both years', () => {
    const ytd = yearToDate(series, '2031')!;
    expect(ytd.months).toEqual(['01', '02']);
    expect(ytd.current.base).toBe(620_000);
    expect(ytd.previous.base).toBe(450_000);
    expect(ytd.change.base).toEqual({ deltaCents: 170_000, deltaBp: 3_778 });
    expect(salaryYears(series).map((y) => [y.year, y.complete, y.excludedMonths.length])).toEqual([
      ['2030', false, 8],
      ['2031', false, 2],
    ]);
  });

  it('blocks payslips without wage lines or with an unreconciled reading', () => {
    const legacy: SalaryPayslip = { ...slip('2032-01', 300_000), wage: null };
    const legacySpecial: SalaryPayslip = { ...special('2032-06', 300_000, 'salary14'), wage: null };
    const mismatch: SalaryPayslip = {
      ...slip('2032-02', 300_000),
      wage: { ...slip('2032-02', 300_000).wage!, lineCheck: 'gross_mismatch' },
    };
    const s = salaryMonthlySeries({
      payslips: [legacy, mismatch, legacySpecial],
      rules,
      to: '2032-06',
    });
    expect(s[0]!.unmapped).toEqual([
      {
        payslipId: 'p-2032-01',
        code: null,
        label: null,
        amountCents: 300_000,
        reason: 'no_wage_lines',
      },
    ]);
    expect(s[1]!.unmapped.map((u) => u.reason)).toEqual(['line_check']);
    expect(s[5]).toMatchObject({ comparable: true, components: { special: 300_000 } });
  });

  it('attributes deductions only to payslips that carry nothing but variable pay', () => {
    const bonus = slip(
      '2032-06',
      0,
      [{ code: '900', label: 'Mitarbeiterbonus', section: 'earning', cents: 100_000 }],
      {
        kind: 'special',
        specialType: 'other',
        documentType: 'bonus',
        id: 'b-2032-06',
      },
    );
    const s = [slip('2032-06', 300_000), bonus];
    expect(variablePayByYear(salaryMonthlySeries({ payslips: s, rules }), s, rules)).toEqual([
      {
        year: '2032',
        complete: false,
        grossCents: 100_000,
        annualBaseCents: 300_000,
        shareOfBaseBp: 3_333,
        attributable: { svCents: 18_000, taxCents: 10_000, netCents: 72_000 },
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
