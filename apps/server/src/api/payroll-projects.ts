import { checkedReportPeriod, reportPeriodSchema } from './report-period';
import { salaryDevelopmentRoutes } from './salary-development';
import {
  createEntity,
  deletePayslip,
  projectsList,
  readPayroll,
  readProjects,
  savePayslip,
  updateEntity,
  project,
  type Db,
  getBooking,
  getEntity,
  payslip,
  updateBooking,
  runInTransaction,
} from '@budget/db';
import { payslipInput } from '@budget/domain';
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { ACTOR, ApiError, defined, readBody, readQuery } from './http';

export function payrollRoutes(db: Db, today: () => string) {
  const app = new Hono();
  app.route('/development', salaryDevelopmentRoutes(db, today));
  const audit = () => ({ actor: ACTOR, groupId: randomUUID() });
  app.get('/', (c) => {
    const { month } = readQuery(
      c,
      z.object({
        month: z
          .string()
          .regex(/^20\d{2}-(0[1-9]|1[0-2])$/)
          .optional(),
      }),
    );
    return c.json(readPayroll(db, month ?? today().slice(0, 7), today()));
  });
  app.post('/', async (c) => {
    const input = await readBody(c, payslipInput),
      ctx = audit();
    return c.json({ payslip: savePayslip(db, input, ctx), groupId: ctx.groupId }, 201);
  });
  app.put('/:id/bank-parts', async (c) => {
    const part = z.strictObject({
      id: z.string().min(1).max(64),
      amountCents: z.number().int(),
      incomeTypeId: z.string().nullable(),
    });
    const input = await readBody(
      c,
      z.strictObject({
        expectedParts: z.array(part).min(1).max(50),
        incomeTypeIds: z
          .array(z.enum(['income-salary', 'income-special', 'income-refund']))
          .min(1)
          .max(50),
      }),
    );
    const ctx = audit();
    runInTransaction(db, (tx) => {
      const slip = getEntity(tx, payslip, c.req.param('id'));
      const booking = slip?.bookingId ? getBooking(tx, slip.bookingId) : null;
      if (!booking || booking.transferId || booking.amountCents <= 0 || booking.currency !== 'EUR')
        throw new ApiError(422, 'invalid', 'Keine geeignete Gehaltsbuchung verknüpft.');
      const expected = new Map(input.expectedParts.map((p, index) => [p.id, { ...p, index }]));
      if (
        input.expectedParts.length !== booking.splits.length ||
        expected.size !== booking.splits.length ||
        input.incomeTypeIds.length !== booking.splits.length ||
        booking.splits.some((s) => {
          const before = expected.get(s.id);
          return (
            !before ||
            before.amountCents !== s.amountCents ||
            before.incomeTypeId !== s.incomeTypeId
          );
        })
      )
        throw new ApiError(409, 'conflict', 'Bankanteile wurden geändert. Bitte neu laden.');
      if (
        booking.splits.some(
          (s) =>
            s.contactId ||
            s.transferId ||
            s.categoryId ||
            !['income-salary', 'income-special', 'income-refund'].includes(s.incomeTypeId ?? ''),
        )
      )
        throw new ApiError(422, 'invalid', 'Diese Bankanteile bitte in der Buchung prüfen.');
      updateBooking(
        tx,
        booking.id,
        {
          splits: booking.splits.map((s) => ({
            amountCents: s.amountCents,
            categoryId: s.categoryId,
            contactId: s.contactId,
            memo: s.memo,
            incomeTypeId: input.incomeTypeIds[expected.get(s.id)!.index]!,
          })),
        },
        ctx,
      );
    });
    return c.json({ groupId: ctx.groupId });
  });
  app.put('/:id', async (c) => {
    const input = await readBody(c, payslipInput),
      ctx = audit();
    return c.json({
      payslip: savePayslip(db, input, ctx, c.req.param('id')),
      groupId: ctx.groupId,
    });
  });
  app.delete('/:id', (c) => {
    const ctx = audit();
    deletePayslip(db, c.req.param('id'), ctx);
    return c.json({ groupId: ctx.groupId });
  });
  return app;
}
export function projectRoutes(db: Db, today: () => string) {
  const app = new Hono();
  const name = z.string().trim().min(1).max(120);
  const audit = () => ({ actor: ACTOR, groupId: randomUUID() });
  app.get('/', (c) => c.json({ projects: projectsList(db) }));
  app.get('/report', (c) => {
    const { period: rawPeriod } = readQuery(
      c,
      z.object({ period: reportPeriodSchema.default('1J') }),
    );
    const period = checkedReportPeriod(rawPeriod, today());
    return c.json(readProjects(db, period, today()));
  });
  app.post('/', async (c) => {
    const input = await readBody(c, z.strictObject({ name })),
      ctx = audit();
    return c.json({ project: createEntity(db, project, input, ctx), groupId: ctx.groupId }, 201);
  });
  app.patch('/:id', async (c) => {
    const input = await readBody(
        c,
        z
          .strictObject({ name: name.optional(), archived: z.boolean().optional() })
          .refine((v) => v.name !== undefined || v.archived !== undefined),
      ),
      ctx = audit();
    const patch = defined<{ name?: string; archivedAt?: string | null }>({
      name: input.name,
      archivedAt:
        input.archived === undefined ? undefined : input.archived ? new Date().toISOString() : null,
    });
    return c.json({
      project: updateEntity(db, project, c.req.param('id'), patch, ctx),
      groupId: ctx.groupId,
    });
  });
  return app;
}
