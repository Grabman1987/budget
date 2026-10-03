import { sql } from 'drizzle-orm';
/* eslint-disable @typescript-eslint/no-explicit-any -- API response assertions */
import {
  accounts,
  createBooking,
  createEntity,
  createTestDatabase,
  INCOME_TYPES,
  schema,
  undo,
  type Db,
} from '@budget/db';
import type { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { createLedgerApi } from './index';
let db: Db, app: Hono;
const input = {
  month: '2026-09',
  kind: 'regular',
  specialType: null,
  grossCents: 400000,
  svCents: 70000,
  taxCents: 50000,
  netCents: 279500,
  lines: [{ section: 'deduction', label: 'Umlage', amountCents: 500 }],
  bookingId: null,
  receiptId: null,
};
async function call(method: string, path: string, body?: unknown) {
  const response = await app.request(path, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  return { status: response.status, body: (await response.json()) as any };
}
beforeEach(() => {
  db = createTestDatabase().db;
  app = createLedgerApi({ db, today: () => '2026-10-02', stepUp: async (_c, next) => next() });
  accounts.create(
    db,
    {
      id: 'cash',
      name: 'Beispielkonto',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2025-01-01',
      openingBalanceCents: 0,
    },
    { actor: 'tester' },
  );
});
describe('payslip API and grouped audit', () => {
  it('persists reimbursements and signed corrections through edit, undo and redo', async () => {
    const created = await call('POST', '/payslips', input);
    const corrected = {
      ...input,
      svCents: -2000,
      taxCents: -6000,
      netCents: 417500,
      lines: [
        ...input.lines,
        { section: 'reimbursement', label: 'Telearbeit', amountCents: 2500 },
        { section: 'reimbursement', label: 'Fahrgeld', amountCents: 3000 },
        { section: 'reimbursement', label: 'Dienstreise-Auslagen und Diäten', amountCents: 4500 },
      ],
    };
    const changed = await call('PUT', `/payslips/${created.body.payslip.id}`, corrected);
    expect(changed.status).toBe(200);
    const report = () => call('GET', '/payslips?month=2026-09');
    expect((await report()).body.month).toMatchObject({
      grossCents: 400000,
      salaryNetCents: 407500,
      reimbursementsCents: 10000,
      netCents: 417500,
      calculatedNetCents: 417500,
      taxRefundCents: 6000,
      svRatio: -0.005,
      taxRatio: -0.015,
      deductionRatio: -0.01875,
    });
    expect((await report()).body.slips[0].lines).toHaveLength(4);
    const undone = await call('POST', '/undo', { groupId: changed.body.groupId });
    expect(undone.status).toBe(200);
    expect((await report()).body.month).toMatchObject({ netCents: 279500, reimbursementsCents: 0 });
    expect((await call('POST', '/undo', { groupId: undone.body.groupId })).status).toBe(200);
    expect((await report()).body.month.reimbursementsCents).toBe(10000);
    expect(
      (
        await call('PUT', `/payslips/${created.body.payslip.id}`, {
          ...corrected,
          netCents: 417501,
        })
      ).status,
    ).toBe(400);
    expect((await report()).body.month.netCents).toBe(417500);
    expect(db.select().from(schema.booking).all()).toHaveLength(0);
  });
  it('rejects duplicate regular/13th/14th positions and conflicting edits without audit writes', async () => {
    const regular = await call('POST', '/payslips', input);
    for (const data of [
      input,
      { ...input, kind: 'special', specialType: 'salary13' },
      { ...input, kind: 'special', specialType: 'salary14' },
    ]) {
      if (data !== input) expect((await call('POST', '/payslips', data)).status).toBe(201);
      const count = db.select().from(schema.auditLog).all().length;
      expect((await call('POST', '/payslips', data)).status).toBe(422);
      expect(db.select().from(schema.auditLog).all()).toHaveLength(count);
    }
    expect((await call('PUT', `/payslips/${regular.body.payslip.id}`, input)).status).toBe(200);
    const next = await call('POST', '/payslips', { ...input, month: '2026-10' });
    const count = db.select().from(schema.auditLog).all().length;
    expect((await call('PUT', `/payslips/${next.body.payslip.id}`, input)).status).toBe(422);
    expect(db.select().from(schema.auditLog).all()).toHaveLength(count);
    expect((await call('GET', '/payslips?month=2026-10')).body.slips).toHaveLength(1);
    for (let i = 0; i < 2; i++)
      expect(
        (await call('POST', '/payslips', { ...input, kind: 'special', specialType: 'other' }))
          .status,
      ).toBe(201);
  });
  it('allows replacement after deletion but refuses undo/redo that restores a duplicate', async () => {
    const created = await call('POST', '/payslips', input);
    const removed = await call('DELETE', `/payslips/${created.body.payslip.id}`);
    const replacement = await call('POST', '/payslips', input);
    expect(replacement.status).toBe(201);
    const count = db.select().from(schema.auditLog).all().length;
    expect((await call('POST', '/undo', { groupId: removed.body.groupId })).status).toBe(409);
    expect(() =>
      undo(db, { groupId: removed.body.groupId }, { actor: 'tester' }, { force: true }),
    ).toThrow('bereits');
    expect(db.select().from(schema.auditLog).all()).toHaveLength(count);
    expect((await call('GET', '/payslips?month=2026-09')).body.slips.map((p: any) => p.id)).toEqual(
      [replacement.body.payslip.id],
    );
    const undone = await call('POST', '/undo', { groupId: replacement.body.groupId });
    expect(undone.status).toBe(200);
    expect((await call('POST', '/undo', { groupId: removed.body.groupId })).status).toBe(200);
    expect((await call('POST', '/undo', { groupId: undone.body.groupId })).status).toBe(409);
    expect((await call('GET', '/payslips?month=2026-09')).body.slips).toHaveLength(1);
  });
  it('rolls back the header and its audit when a child write fails', async () => {
    const auditCount = db.select().from(schema.auditLog).all().length;
    db.run(
      sql.raw(
        "CREATE TRIGGER synthetic_payslip_failure BEFORE INSERT ON payslip_line BEGIN SELECT RAISE(ABORT, 'synthetic child failure'); END",
      ),
    );
    const failed = await call('POST', '/payslips', input);
    expect(failed.status).toBe(422);
    expect(db.select().from(schema.payslip).all()).toHaveLength(0);
    expect(db.select().from(schema.payslipLine).all()).toHaveLength(0);
    expect(db.select().from(schema.auditLog).all()).toHaveLength(auditCount);
  });
  it('creates, edits, deletes, undoes and redoes header plus lines without booking money', async () => {
    const created = await call('POST', '/payslips', input);
    expect(created.status).toBe(201);
    const id = created.body.payslip.id;
    const changed = await call('PUT', `/payslips/${id}`, {
      ...input,
      lines: [{ section: 'deduction', label: 'Beitrag', amountCents: 1500 }],
      netCents: 278500,
    });
    expect(changed.status).toBe(200);
    expect((await call('GET', '/payslips?month=2026-09')).body.month.netCents).toBe(278500);
    const undone = await call('POST', '/undo', { groupId: changed.body.groupId });
    expect(undone.status).toBe(200);
    let report = (await call('GET', '/payslips?month=2026-09')).body;
    expect(report.month.netCents).toBe(279500);
    expect(report.slips[0].lines).toHaveLength(1);
    expect(report.slips[0].lines[0].label).toBe('Umlage');
    expect((await call('POST', '/undo', { groupId: undone.body.groupId })).status).toBe(200);
    const removed = await call('DELETE', `/payslips/${id}`);
    expect((await call('GET', '/payslips?month=2026-09')).body.slips).toHaveLength(0);
    expect((await call('POST', '/undo', { groupId: removed.body.groupId })).status).toBe(200);
    report = (await call('GET', '/payslips?month=2026-09')).body;
    expect(report.month.netCents).toBe(278500);
    expect(db.select().from(schema.booking).all()).toHaveLength(0);
  });
  it('rejects invalid amounts and missing links atomically', async () => {
    expect((await call('POST', '/payslips', { ...input, netCents: 279501 })).status).toBe(400);
    expect((await call('POST', '/payslips', { ...input, svCents: 70000.5 })).status).toBe(400);
    expect((await call('POST', '/payslips', { ...input, receiptId: 'absent' })).status).toBe(422);
    db.run(sql`INSERT INTO receipt (id, storage_key, mime, size_bytes)
      VALUES ('legacy-receipt', 'synthetic-legacy-key', 'image/png', 1)`);
    expect(
      (await call('POST', '/payslips', { ...input, receiptId: 'legacy-receipt' })).status,
    ).toBe(422);
    expect((await call('POST', '/payslips', { ...input, bookingId: 'absent' })).status).toBe(422);
    expect(db.select().from(schema.payslip).all()).toHaveLength(0);
    expect(db.select().from(schema.payslipLine).all()).toHaveLength(0);
  });
  it('checks combined payouts, one-cent changes and deleted booking links', async () => {
    const b = createBooking(
      db,
      {
        accountId: 'cash',
        date: '2026-09-30',
        amountCents: 568000,
        splits: [
          { amountCents: 279500, incomeTypeId: INCOME_TYPES.salary.id },
          { amountCents: 278500, incomeTypeId: INCOME_TYPES.special.id },
          { amountCents: 10000, incomeTypeId: INCOME_TYPES.refund.id },
        ],
      },
      { actor: 'tester' },
    );
    const reimbursed = {
      ...input,
      netCents: 289500,
      lines: [
        ...input.lines,
        { section: 'reimbursement', label: 'Fahrgeld und Reisekosten', amountCents: 10000 },
      ],
    };
    const created = await call('POST', '/payslips', { ...reimbursed, bookingId: b });
    await call('POST', '/payslips', {
      ...input,
      kind: 'special',
      specialType: 'salary14',
      netCents: 278500,
      taxCents: 51000,
      bookingId: b,
    });
    expect((await call('GET', '/payslips')).body.links.map((l: any) => l.status)).toEqual([
      'ok',
      'ok',
    ]);
    expect((await call('GET', '/payslips')).body.candidates[0].amountCents).toBe(558000);
    await call('PUT', `/payslips/${created.body.payslip.id}`, {
      ...reimbursed,
      bookingId: b,
      netCents: 289501,
      taxCents: 49999,
    });
    expect((await call('GET', '/payslips')).body.links[0].differenceCents).toBe(-1);
    await call('DELETE', `/bookings/${b}`);
    expect((await call('GET', '/payslips')).body.links[0].status).toBe('missing');
  });
  it('refuses a stale undo and keeps the current captured values', async () => {
    const created = await call('POST', '/payslips', input);
    await call('PUT', `/payslips/${created.body.payslip.id}`, {
      ...input,
      taxCents: 49999,
      netCents: 279501,
    });
    expect((await call('POST', '/undo', { groupId: created.body.groupId })).status).toBe(409);
    expect((await call('GET', '/payslips?month=2026-09')).body.month.netCents).toBe(279501);
  });
});
describe('project management and P&L', () => {
  it('accepts calendar ranges including the live month and rejects malformed or future ranges', async () => {
    const project = (await call('POST', '/projects', { name: 'Synthetischer Zeitraumtest' })).body
      .project;
    for (const [date, amountCents] of [
      ['2026-09-03', 900],
      ['2026-10-01', 1200],
      ['2026-10-03', 9999],
    ] as const)
      createBooking(
        db,
        {
          accountId: 'cash',
          date,
          amountCents,
          projectId: project.id,
          splits: [{ amountCents, incomeTypeId: INCOME_TYPES.side.id }],
        },
        { actor: 'tester' },
      );
    const selected = await call('GET', '/projects/report?period=2026-09..2026-10');
    expect(selected.status).toBe(200);
    expect(selected.body.months).toEqual(['2026-09', '2026-10']);
    expect(selected.body.total.incomeCents).toBe(2100);
    expect((await call('GET', '/projects/report?period=1M')).body.total.incomeCents).toBe(900);
    for (const period of ['2026-10..2026-09', '2026-13..2026-13', '2026-10..2026-11', 'invalid'])
      expect((await call('GET', `/projects/report?period=${period}`)).status).toBe(400);
  });
  it('refuses booking redo until its retained project is restored', async () => {
    const created = await call('POST', '/projects', { name: 'Rückgängig-Projekt' });
    createBooking(
      db,
      {
        accountId: 'cash',
        date: '2026-09-02',
        amountCents: 100,
        projectId: created.body.project.id,
        splits: [{ amountCents: 100, incomeTypeId: INCOME_TYPES.side.id }],
      },
      { actor: 'tester', groupId: 'synthetic-project-booking' },
    );
    const undoneBooking = await call('POST', '/undo', { groupId: 'synthetic-project-booking' });
    expect(undoneBooking.status).toBe(200);
    const undoneProject = await call('POST', '/undo', { groupId: created.body.groupId });
    expect(undoneProject.status).toBe(200);
    expect((await call('POST', '/undo', { groupId: undoneBooking.body.groupId })).status).toBe(409);
    expect((await call('POST', '/undo', { groupId: undoneProject.body.groupId })).status).toBe(200);
    expect((await call('POST', '/undo', { groupId: undoneBooking.body.groupId })).status).toBe(200);
  });
  it('renames and archives with undo, retaining result and hiding new assignment choices', async () => {
    const created = await call('POST', '/projects', { name: 'Beispielprojekt' });
    expect(created.status).toBe(201);
    const id = created.body.project.id;
    const incomeBooking = createBooking(
      db,
      {
        accountId: 'cash',
        date: '2026-09-02',
        amountCents: 50000,
        projectId: id,
        splits: [{ amountCents: 50000, incomeTypeId: INCOME_TYPES.side.id }],
      },
      { actor: 'tester' },
    );
    createBooking(
      db,
      {
        accountId: 'cash',
        date: '2026-09-03',
        amountCents: -12000,
        projectId: id,
        splits: [{ amountCents: -12000 }],
      },
      { actor: 'tester' },
    );
    expect((await call('POST', '/undo', { groupId: created.body.groupId })).status).toBe(409);
    const renamed = await call('PATCH', `/projects/${id}`, { name: 'Neuer Projektname' });
    expect(renamed.status).toBe(200);
    const archived = await call('PATCH', `/projects/${id}`, { archived: true });
    expect((await call('GET', '/lookups')).body.projects).toHaveLength(0);
    expect((await call('GET', `/lookups?bookingId=${incomeBooking}`)).body.projects).toEqual([
      { id, name: 'Neuer Projektname', archivedAt: expect.any(String) },
    ]);
    expect((await call('GET', '/lookups?bookingId=absent')).body.projects).toHaveLength(0);
    expect(
      (await call('PATCH', `/bookings/${incomeBooking}`, { memo: 'Synthetische Änderung' })).status,
    ).toBe(200);
    expect(
      (
        await call('POST', '/bookings', {
          type: 'booking',
          accountId: 'cash',
          date: '2026-09-04',
          amountCents: 100,
          projectId: id,
          splits: [{ amountCents: 100, incomeTypeId: INCOME_TYPES.side.id }],
        })
      ).status,
    ).toBe(422);
    const report = (await call('GET', '/projects/report?period=1M')).body;
    expect(report.months).toEqual(['2026-09']);
    expect(report.total.resultCents).toBe(38000);
    expect(report.sideIncome.incomeCents).toBe(50000);
    expect(report.projects[0].name).toBe('Neuer Projektname');
    expect((await call('POST', '/undo', { groupId: archived.body.groupId })).status).toBe(200);
    expect((await call('GET', '/lookups')).body.projects).toHaveLength(1);
  });
  it('excludes transfers, capital, future and contact money, and reports unsupported FX', async () => {
    const p = createEntity(db, schema.project, { name: 'Projekt' }, { actor: 'tester' });
    createBooking(
      db,
      {
        accountId: 'cash',
        date: '2026-09-02',
        amountCents: 50000,
        projectId: p.id,
        splits: [
          { amountCents: 25000, incomeTypeId: INCOME_TYPES.side.id },
          { amountCents: 25000, incomeTypeId: INCOME_TYPES.capital.id },
        ],
      },
      { actor: 'tester' },
    );
    createBooking(
      db,
      {
        accountId: 'cash',
        date: '2026-11-02',
        amountCents: 10000,
        projectId: p.id,
        splits: [{ amountCents: 10000, incomeTypeId: INCOME_TYPES.side.id }],
      },
      { actor: 'tester' },
    );
    expect((await call('GET', '/projects/report?period=1M')).body.total.incomeCents).toBe(25000);
    accounts.create(
      db,
      {
        id: 'fx',
        name: 'Fremdwährung',
        type: 'checking',
        role: 'investment',
        currency: 'USD',
        onBudget: false,
        openingDate: '2026-01-01',
        openingBalanceCents: 0,
      },
      { actor: 'tester' },
    );
    createBooking(
      db,
      {
        accountId: 'fx',
        date: '2026-09-03',
        amountCents: 10000,
        projectId: p.id,
        splits: [{ amountCents: 10000, incomeTypeId: INCOME_TYPES.side.id }],
      },
      { actor: 'tester' },
    );
    expect(
      (await call('GET', '/projects/report?period=1M')).body.unsupportedBookingIds,
    ).toHaveLength(1);
    expect((await call('GET', '/projects/report?period=bad')).status).toBe(400);
  });
});
