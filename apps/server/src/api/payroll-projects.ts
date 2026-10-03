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
} from '@budget/db';
import { payslipInput, SPENDING_PERIODS } from '@budget/domain';
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { ACTOR, defined, readBody, readQuery } from './http';

export function payrollRoutes(db: Db, today: () => string) {
  const app = new Hono();
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
    const { period } = readQuery(c, z.object({ period: z.enum(SPENDING_PERIODS).default('1J') }));
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
