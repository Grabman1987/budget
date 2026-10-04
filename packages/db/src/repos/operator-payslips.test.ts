import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { INCOME_TYPES, auditLog } from '../schema';
import { undo } from './audit';
import { createBooking } from './bookings';
import { createEntity, listEntities } from './entities';
import {
  applyPayslips,
  parsePayslipsFile,
  summarizePayslips,
  type PayslipOutcome,
} from './operator-payslips';
import { OperatorInputError } from './operator-ops';
import { listPayslips } from './payroll-projects';
import { payee, payslip, payslipLine } from '../schema';
import { seedBasics } from './test-helpers';

const operator = { actor: 'operator' };
const owner = { actor: 'owner' };

let opened: OpenedDatabase;
let db: OpenedDatabase['db'];

beforeEach(() => {
  opened = createTestDatabase();
  db = opened.db;
  seedBasics(db);
  createEntity(db, payee, { id: 'arbeitgeber', name: 'Beispiel Arbeitgeber' }, owner);
});
afterEach(() => opened.close());

/** A salary inflow on the synthetic "Giro" account, income type salary. */
const salary = (date: string, amountCents: number, extra: { payeeId?: string } = {}) =>
  createBooking(
    db,
    {
      accountId: 'giro',
      date,
      amountCents,
      payeeId: extra.payeeId ?? 'arbeitgeber',
      splits: [{ categoryId: null, amountCents, incomeTypeId: INCOME_TYPES.salary.id }],
    },
    owner,
  );

// Net: 3000 + 100 - 500 - 400 - 50 + 120 = 2270 euros, in cents.
const regular = (month: string, extra: Record<string, unknown> = {}) => ({
  month,
  kind: 'regular',
  grossCents: 300000,
  svCents: 50000,
  taxCents: 40000,
  netCents: 227000,
  lines: [
    { section: 'earning', label: 'Prämie', amountCents: 10000 },
    { section: 'deduction', label: 'Essen', amountCents: 5000 },
    { section: 'reimbursement', label: 'Telearbeit', amountCents: 12000 },
  ],
  salaryBooking: { account: 'Giro', date: `${month}-15`, amountCents: 227000 },
  ...extra,
});
const special = (month: string, extra: Record<string, unknown> = {}) => ({
  month,
  kind: 'special',
  specialType: 'salary13',
  grossCents: 100000,
  svCents: 18000,
  taxCents: 6000,
  netCents: 76000,
  lines: [],
  ...extra,
});

const file = (...payslips: unknown[]) => ({ payslips });
const run = (json: unknown, options: { dryRun?: boolean; replace?: boolean } = {}) =>
  applyPayslips(db, parsePayslipsFile(json), operator, options);
const auditCount = () => db.select().from(auditLog).all().length;
const state = () => ({
  slips: listEntities(db, payslip, { includeDeleted: true }).map((p) => ({ ...p, updatedAt: 0 })),
  lines: listEntities(db, payslipLine, { includeDeleted: true }),
  audit: auditCount(),
});
const strip = (o: PayslipOutcome[]) =>
  o.map(({ groupId, id, ...rest }) => (void groupId, void id, rest));

describe('parsePayslipsFile', () => {
  it('maps the entry onto the savePayslip input and defaults the optional fields', () => {
    const [entry] = parsePayslipsFile(
      file({ month: '2024-02', kind: 'regular', grossCents: 100, netCents: 100 }),
    );
    expect(entry!.input).toEqual({
      month: '2024-02',
      kind: 'regular',
      specialType: null,
      grossCents: 100,
      svCents: 0,
      taxCents: 0,
      netCents: 100,
      lines: [],
    });
    expect(entry!.salaryBooking).toBeUndefined();
  });

  it('rejects what the app would refuse, naming the payslip', () => {
    const bad = (value: unknown) => () => parsePayslipsFile(value);
    expect(bad([])).toThrow(OperatorInputError);
    expect(bad({})).toThrow('"payslips" list');
    expect(bad(file(regular('2024-02', { netCents: 1 })))).toThrow(
      /payslip 1 \(2024-02\).*netCents/,
    );
    expect(bad(file(regular('2024-02', { specialType: 'salary13' })))).toThrow(/specialType/);
    expect(bad(file(special('2024-06', { specialType: null })))).toThrow(/specialType/);
    expect(bad(file(regular('2024-13')))).toThrow(/month/);
    expect(bad(file(regular('2024-02', { surprise: 1 })))).toThrow('not a known field');
    expect(
      bad(
        file(
          regular('2024-02', { lines: [{ section: 'aufrollung', label: 'x', amountCents: 1 }] }),
        ),
      ),
    ).toThrow(/section/);
    expect(
      bad(
        file(
          regular('2024-02', {
            salaryBooking: { account: 'Giro', date: '2024-02-30', amountCents: 1 },
          }),
        ),
      ),
    ).toThrow(/date/);
    expect(
      bad(
        file(
          regular('2024-02', {
            salaryBooking: { account: 'Giro', date: '2024-02-15', amountCents: 0 },
          }),
        ),
      ),
    ).toThrow(/amountCents/);
  });

  it('refuses a month, kind and special type twice, but allows several "other" payments', () => {
    expect(() => parsePayslipsFile(file(regular('2024-02'), regular('2024-02')))).toThrow(
      /appears twice/,
    );
    const other = (net: number) =>
      special('2024-12', {
        specialType: 'other',
        grossCents: net,
        svCents: 0,
        taxCents: 0,
        netCents: net,
      });
    expect(() => parsePayslipsFile(file(other(100), other(200)))).not.toThrow();
  });
});

describe('applyPayslips', () => {
  it('creates payslips with the salary booking link, one audit group each, undoable', () => {
    const b1 = salary('2024-02-15', 227000);
    const b2 = salary('2024-06-14', 303000);
    const out = run(
      file(
        regular('2024-02'),
        regular('2024-06', {
          salaryBooking: { account: 'giro', date: '2024-06-15', amountCents: 303000 },
        }),
        special('2024-06', {
          salaryBooking: {
            account: 'Giro',
            date: '2024-06-14',
            amountCents: 303000,
            payee: 'beispiel arbeitgeber',
          },
        }),
      ),
    );
    expect(out.map((o) => [o.status, o.linked])).toEqual([
      ['created', true],
      ['created', true],
      ['created', true],
    ]);
    expect(summarizePayslips(out)).toEqual({
      payslips: 3,
      created: 3,
      replaced: 0,
      exists: 0,
      unlinked: 0,
      skipped: 0,
    });
    expect(new Set(out.map((o) => o.groupId)).size).toBe(3);
    const slips = listPayslips(db);
    expect(slips.map((p) => [p.month, p.kind, p.bookingId])).toEqual(
      expect.arrayContaining([
        ['2024-02', 'regular', b1],
        ['2024-06', 'regular', b2],
        ['2024-06', 'special', b2],
      ]),
    );
    expect(
      slips.find((p) => p.month === '2024-02')!.lines.map((l) => [l.section, l.label]),
    ).toEqual([
      ['earning', 'Prämie'],
      ['deduction', 'Essen'],
      ['reimbursement', 'Telearbeit'],
    ]);
    // Every payslip (header and lines) is one audit group with the operator as actor.
    const written = db
      .select()
      .from(auditLog)
      .all()
      .filter((e) => e.entityType === 'payslip' || e.entityType === 'payslip_line');
    expect(new Set(written.map((e) => e.actor))).toEqual(new Set(['operator']));
    expect(new Set(written.map((e) => e.groupId))).toEqual(new Set(out.map((o) => o.groupId)));
    undo(db, { groupId: out[0]!.groupId }, operator);
    expect(listPayslips(db).map((p) => p.month)).toEqual(['2024-06', '2024-06']);
  });

  it('imports without a link and says why: unknown, outside the window, wrong amount, ambiguous', () => {
    salary('2024-02-18', 227000); // 3 days away: inside the window
    salary('2024-03-19', 227000); // 4 days away: outside
    salary('2024-04-15', 227001); // wrong amount
    salary('2024-05-14', 227000);
    salary('2024-05-16', 227000); // two candidates
    salary('2024-06-15', 227000, { payeeId: 'p1' }); // another payee
    const out = run(
      file(
        regular('2024-02'),
        regular('2024-03'),
        regular('2024-04'),
        regular('2024-05'),
        regular('2024-06', {
          salaryBooking: {
            account: 'Giro',
            date: '2024-06-15',
            amountCents: 227000,
            payee: 'Beispiel Arbeitgeber',
          },
        }),
        regular('2024-07', {
          salaryBooking: { account: 'Nirgendwo', date: '2024-07-15', amountCents: 1 },
        }),
        regular('2024-08', { salaryBooking: undefined }),
      ),
    );
    expect(out.map((o) => [o.month, o.status, o.linked, o.unlinkedReason, o.candidates])).toEqual([
      ['2024-02', 'created', true, undefined, undefined],
      ['2024-03', 'created', false, 'no_booking', 0],
      ['2024-04', 'created', false, 'no_booking', 0],
      ['2024-05', 'created', false, 'ambiguous_booking', 2],
      ['2024-06', 'created', false, 'no_booking', 0],
      ['2024-07', 'created', false, 'unknown_account', 0],
      ['2024-08', 'created', false, 'no_salary_booking', 0],
    ]);
    expect(summarizePayslips(out)).toMatchObject({
      payslips: 7,
      created: 7,
      unlinked: 6,
      skipped: 0,
    });
  });

  it('imports unlinked when the app refuses the link (no salary split, transfer, outflow)', () => {
    createBooking(
      db,
      {
        accountId: 'giro',
        date: '2024-02-15',
        amountCents: 227000,
        splits: [{ categoryId: 'essen', amountCents: 227000 }],
      },
      owner,
    );
    const [o] = run(file(regular('2024-02')));
    expect(o).toMatchObject({ status: 'created', linked: false, unlinkedReason: 'link_refused' });
    expect(o!.detail).toMatch(/Gehaltsbuchung/);
    expect(listPayslips(db)).toHaveLength(1);
  });

  it('reports an existing payslip as exists and writes nothing, unless --replace', () => {
    const b = salary('2024-02-15', 227000);
    run(file(regular('2024-02'), special('2024-06')));
    const before = state();
    const again = run(file(regular('2024-02'), special('2024-06'), regular('2024-03')));
    expect(again.map((o) => o.status)).toEqual(['exists', 'exists', 'created']);
    expect(summarizePayslips(again)).toMatchObject({ payslips: 3, created: 1, exists: 2 });
    const changed = run(
      file(regular('2024-02', { grossCents: 310000, netCents: 237000, salaryBooking: undefined })),
    );
    expect(changed[0]!.status).toBe('exists');
    expect(listPayslips(db).find((p) => p.month === '2024-02')!.grossCents).toBe(300000);
    expect(before.slips).toHaveLength(2);

    const replaced = run(
      file(
        regular('2024-02', {
          grossCents: 310000,
          netCents: 237000,
          lines: [
            { section: 'reimbursement', label: 'Fahrgeld', amountCents: 12000 },
            { section: 'earning', label: 'Prämie', amountCents: 10000 },
          ].concat([{ section: 'deduction', label: 'Essen', amountCents: 5000 }]),
        }),
      ),
      { replace: true },
    );
    expect(replaced[0]).toMatchObject({ status: 'replaced', linked: true });
    const slip = listPayslips(db).find((p) => p.month === '2024-02')!;
    expect(slip.grossCents).toBe(310000);
    expect(slip.bookingId).toBe(b);
    expect(slip.lines.map((l) => l.label)).toEqual(['Fahrgeld', 'Prämie', 'Essen']);
    expect(listPayslips(db)).toHaveLength(3);
    // The replaced payslip keeps its id; the old lines are soft-deleted, not duplicated.
    expect(slip.id).toBe(replaced[0]!.id);
  });

  it('keeps a working link on --replace when the file no longer finds the booking', () => {
    const b = salary('2024-02-15', 227000);
    run(file(regular('2024-02')));
    const [o] = run(file(regular('2024-02', { salaryBooking: undefined })), { replace: true });
    expect(o).toMatchObject({ status: 'replaced', linked: true });
    expect(listPayslips(db)[0]!.bookingId).toBe(b);
  });

  it('pairs several "other" payments by their figures, and by position only with --replace', () => {
    const other = (net: number, label = 'Bonus') =>
      special('2024-12', {
        specialType: 'other',
        grossCents: net,
        svCents: 0,
        taxCents: 0,
        netCents: net,
        lines: [{ section: 'earning', label, amountCents: 0 }],
      });
    const first = run(file(other(100), other(200)));
    expect(first.map((o) => o.status)).toEqual(['created', 'created']);
    expect(run(file(other(200), other(100))).map((o) => o.status)).toEqual(['exists', 'exists']);
    expect(run(file(other(300))).map((o) => o.status)).toEqual(['created']);
    expect(listPayslips(db)).toHaveLength(3);
    // A lone unpaired "other" of the month is the one to replace; ambiguity creates instead.
    const lone = run(file(other(400)), { replace: true });
    expect(lone[0]!.status).toBe('created');
  });

  it('replaces the only unpaired "other" payment of a month by position', () => {
    const other = (net: number) =>
      special('2024-12', {
        specialType: 'other',
        grossCents: net,
        svCents: 0,
        taxCents: 0,
        netCents: net,
      });
    run(file(other(100)));
    const [o] = run(file(other(150)), { replace: true });
    expect(o!.status).toBe('replaced');
    expect(listPayslips(db).map((p) => p.netCents)).toEqual([150]);
  });

  it('a dry run reports exactly what the real run does and writes nothing', () => {
    salary('2024-02-15', 227000);
    salary('2024-06-14', 303000);
    run(file(regular('2024-02')));
    const json = file(
      regular('2024-02'),
      regular('2024-03'),
      regular('2024-06', {
        salaryBooking: { account: 'Giro', date: '2024-06-14', amountCents: 303000 },
      }),
      special('2024-06', {
        salaryBooking: { account: 'Giro', date: '2024-06-14', amountCents: 303000 },
      }),
    );
    const before = state();
    const dry = run(json, { dryRun: true });
    expect(state()).toEqual(before);
    expect(dry.every((o) => o.groupId === '')).toBe(true);
    const real = run(json);
    expect(strip(dry)).toEqual(strip(real));
    expect(summarizePayslips(real)).toMatchObject({
      payslips: 4,
      created: 3,
      exists: 1,
      unlinked: 1,
    });
    expect(real.filter((o) => o.groupId).length).toBe(3);
  });
});
