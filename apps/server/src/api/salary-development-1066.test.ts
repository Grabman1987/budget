import {
  createTestDatabase,
  savePayslip,
  saveWageComponentMapping,
  deletePayslip,
  sqliteOf,
  storePayslipWageRead,
  type OpenedDatabase,
} from '@budget/db';
import type { PayslipInput, SalaryComponent } from '@budget/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLedgerApi } from './index';
import type { readSalaryDevelopment } from './salary-development';
import { createApp } from '../app';
import { createAuth } from '../auth/routes';
import { AuthStore } from '../auth/store';
import { sha256Hex } from '../auth/crypto';

type Report = ReturnType<typeof readSalaryDevelopment>;
let opened: OpenedDatabase;
let app: ReturnType<typeof createLedgerApi>;
const ctx = { actor: 'synthetic-test' };

beforeEach(() => {
  opened = createTestDatabase();
  app = createLedgerApi({
    db: opened.db,
    today: () => '2026-06-15',
    stepUp: async (_c, next) => next(),
  });
});
afterEach(() => opened.close());

function map(code: string, component: SalaryComponent) {
  saveWageComponentMapping(
    opened.db,
    { employerContactId: null, wageCode: code, label: null, component },
    ctx,
  );
}

function slip(
  month: string,
  baseCents: number,
  options: {
    variable?: number;
    benefit?: number;
    reimbursement?: number;
    noReading?: boolean;
  } = {},
) {
  const variable = options.variable ?? 0;
  const benefit = options.benefit ?? 0;
  const reimbursement = options.reimbursement ?? 0;
  const draft: PayslipInput = {
    month,
    kind: 'regular',
    specialType: null,
    grossCents: baseCents + variable + benefit,
    svCents: 10000,
    taxCents: 20000,
    netCents: baseCents + variable - 30000 + reimbursement,
    bookingId: null,
    receiptId: null,
    lines: [
      ...(benefit
        ? [{ section: 'deduction' as const, label: 'Synthetic benefit', amountCents: benefit }]
        : []),
      ...(reimbursement
        ? [
            {
              section: 'reimbursement' as const,
              label: 'Synthetic expenses',
              amountCents: reimbursement,
            },
          ]
        : []),
    ],
  };
  const saved = savePayslip(opened.db, draft, ctx);
  if (!options.noReading)
    storePayslipWageRead(
      opened.db,
      saved.id,
      {
        documentType: 'payslip',
        periodSource: 'content',
        payoutDate: null,
        draft,
        differenceCents: 0,
        warnings: [],
        statutorySplit: null,
        wageLines: [
          {
            code: '100',
            label: 'Synthetic base',
            section: 'earning' as const,
            amountCents: baseCents,
          },
          ...(variable
            ? [
                {
                  code: '200',
                  label: 'Synthetic bonus',
                  section: 'earning' as const,
                  amountCents: variable,
                },
              ]
            : []),
          ...(benefit
            ? [
                {
                  code: '300',
                  label: 'Synthetic benefit',
                  section: 'benefit_in_kind' as const,
                  amountCents: benefit,
                },
              ]
            : []),
          ...(reimbursement
            ? [
                {
                  code: '400',
                  label: 'Synthetic expenses',
                  section: 'reimbursement' as const,
                  amountCents: reimbursement,
                },
              ]
            : []),
        ].map((line, order) => ({
          ...line,
          order,
          referenceMonth: null,
          quantity: null,
          rate: null,
        })),
      },
      { origin: 'intake', receiptId: null },
      ctx,
    );
  return saved.id;
}

async function report(query = ''): Promise<Report> {
  const response = await app.request(`/payslips/development${query}`);
  expect(response.status).toBe(200);
  return response.json() as Promise<Report>;
}

describe('salary development read API (#1066)', () => {
  it('returns an explicit empty report and validates the month and query keys', async () => {
    expect(await report()).toMatchObject({
      throughMonth: '2026-06',
      months: [],
      years: [],
      yearToDate: null,
      base: { anchorMonth: null, steps: [] },
      variablePay: [],
      deductionRates: [],
      lastRaise: { reason: 'no_step' },
    });
    for (const query of [
      'throughMonth=2026-13',
      'throughMonth=2026-6',
      'throughMonth=2026-06-01',
      'unknown=1',
    ])
      expect((await app.request(`/payslips/development?${query}`)).status).toBe(400);
  });

  it('reads saved mappings, exposes gaps and unmapped lines, and never writes on GET', async () => {
    slip('2026-01', 300001);
    slip('2026-03', 300001, { variable: 12345 });
    slip('2026-04', 300001, { noReading: true });
    map('100', 'base');
    const before = sqliteOf(opened.db).serialize();
    const result = await report();
    // Byte comparison: a deep equality check of two database images takes seconds on CI.
    expect(Buffer.compare(sqliteOf(opened.db).serialize(), before)).toBe(0);
    expect(result.months.map((m) => m.month)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
    ]);
    expect(result.months[0]).toMatchObject({ comparable: true, developmentCents: 300001 });
    expect(result.months[1]).toMatchObject({ isGap: true, comparable: false });
    expect(result.months[2]).toMatchObject({
      comparable: false,
      hasUnmapped: true,
      unmapped: [{ code: '200', amountCents: 12345 }],
    });
    expect(result.months[3]!.issues).toContain('no_wage_lines');
    expect(result.years[0]!.development.change).toBeNull();
    map('200', 'variable');
    const mapped = await report();
    expect(mapped.months[2]).toMatchObject({
      comparable: true,
      hasVariable: true,
      developmentCents: 312346,
    });
    expect(mapped.variablePay[0]).toMatchObject({ grossCents: 12345, attributable: null });
  });

  it('keeps benefits and reimbursements outside comparisons and detects a supported raise', async () => {
    map('100', 'base');
    map('300', 'benefit_in_kind');
    for (const month of ['2025-01', '2025-02', '2025-03']) slip(month, 300000);
    for (const month of ['2026-01', '2026-02', '2026-03'])
      slip(month, 330000, { benefit: 101, reimbursement: 202 });
    const result = await report('?throughMonth=2026-03');
    expect(result.months.at(-1)).toMatchObject({
      components: { base: 330000, benefit_in_kind: 101, reimbursement: 202 },
      developmentCents: 330000,
    });
    expect(result.monthComparisons.at(-1)).toMatchObject({
      comparable: true,
      change: { base: { deltaCents: 30000, deltaBp: 1000 } },
    });
    expect(result.yearToDate!.development).toMatchObject({
      months: ['01', '02', '03'],
      current: { base: 990000 },
      previous: { base: 900000 },
    });
    expect(result.months.find((m) => m.month === '2025-04')!.isGap).toBe(true);
    slip('2026-04', 360000);
    slip('2026-05', 360000);
    slip('2026-06', 360000);
    const raised = await report();
    expect(raised.base.steps).toContainEqual(
      expect.objectContaining({
        effectiveMonth: '2026-04',
        oldCents: 330000,
        newCents: 360000,
        deltaCents: 30000,
        deltaBp: 909,
      }),
    );
  });

  it('excludes later and deleted payslips from every analysis, and leaves the old report reachable', async () => {
    map('100', 'base');
    slip('2026-01', 300001);
    slip('2026-07', 999999, { variable: 11111 });
    const deleted = slip('2026-02', 888888);
    deletePayslip(opened.db, deleted, ctx);
    const result = await report();
    expect(result.months.flatMap((m) => m.payslipIds)).toHaveLength(1);
    expect(result.years[0]!.paid.base).toBe(300001);
    expect(result.variablePay).toEqual([]);
    expect(result.deductionRates[0]).toMatchObject({ grossCents: 300001 });
    expect((await report('?throughMonth=2025-12')).months).toEqual([]);
    expect((await app.request('/payslips?month=2026-01')).status).toBe(200);
  });

  it('requires a session at the application boundary without demanding fresh step-up', async () => {
    const token = 'synthetic-salary-session';
    const now = new Date('2026-06-15T12:00:00Z');
    const store = new AuthStore(opened.db);
    store.createSession({
      id: sha256Hex(token),
      passkeyId: null,
      now,
      expiresAt: new Date('2026-06-16T12:00:00Z'),
      stepUp: false,
      viaRecovery: true,
    });
    const auth = createAuth({
      store,
      clock: () => now,
      config: {
        rpID: 'localhost',
        rpName: 'Budget',
        origin: 'http://localhost:3000',
        cookieSecure: false,
        setupToken: undefined,
        trustProxy: false,
        sessionDays: 30,
        sessionMaxDays: 90,
        stepUpMinutes: 5,
        pepper: Buffer.from('synthetic-pepper-0123456789abcdef'),
      },
    });
    const guarded = createApp({
      webDir: 'synthetic-nonexistent-web',
      auth,
      ledger: {
        db: opened.db,
        today: () => '2026-06-15',
        receiptsDir: 'synthetic-nonexistent-receipts',
      },
    });
    expect((await guarded.request('/api/payslips/development')).status).toBe(401);
    const response = await guarded.request('/api/payslips/development', {
      headers: { cookie: `budget_session=${token}` },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
});
