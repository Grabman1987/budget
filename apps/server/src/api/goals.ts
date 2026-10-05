import {
  adoptGoalAsCategoryTarget,
  createGoal,
  deleteGoal,
  getGoal,
  listGoals,
  goalsReport,
  restoreGoal,
  updateGoal,
  type Db,
  type GoalInput,
  type GoalPatch,
} from '@budget/db';
import { monthOf } from '@budget/domain';
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { ACTOR, defined, readBody, readQuery } from './http';
import { goalAdoptBody, goalCreate, goalListQuery, goalMonthQuery, goalPatch } from './schemas';

/**
 * Savings goals (Sparziele): every answer carries the figures of the viewed month (`?month=`,
 * default the month of today): saved, missing, months left, needed monthly rate, forecast, status.
 */
export function goalRoutes(db: Db, today: () => string): Hono {
  const app = new Hono();
  const audit = () => ({ actor: ACTOR, groupId: randomUUID() });
  const monthOrToday = (month: string | undefined) => month ?? monthOf(today());

  app.get('/', (c) => {
    const { month, deleted } = readQuery(c, goalListQuery);
    const view = monthOrToday(month);
    return c.json({ month: view, goals: listGoals(db, view, { includeDeleted: deleted === '1' }) });
  });

  app.get('/report', (c) => c.json(goalsReport(db, today())));

  app.post('/', async (c) => {
    const { month } = readQuery(c, goalMonthQuery);
    const { goal, groupId } = createGoal(
      db,
      defined<GoalInput>(await readBody(c, goalCreate)),
      audit(),
    );
    return c.json({ goal: getGoal(db, goal.id, monthOrToday(month)), groupId }, 201);
  });

  app.patch('/:id', async (c) => {
    const { month } = readQuery(c, goalMonthQuery);
    const { goal, groupId } = updateGoal(
      db,
      c.req.param('id'),
      defined<GoalPatch>(await readBody(c, goalPatch)),
      audit(),
    );
    return c.json({ goal: getGoal(db, goal.id, monthOrToday(month)), groupId });
  });

  app.delete('/:id', (c) => c.json(deleteGoal(db, c.req.param('id'), audit())));

  app.post('/:id/restore', (c) => {
    const { month } = readQuery(c, goalMonthQuery);
    const { goal, groupId } = restoreGoal(db, c.req.param('id'), audit());
    return c.json({ goal: getGoal(db, goal.id, monthOrToday(month)), groupId });
  });

  // "Als Ziel der Kategorie übernehmen": a versioned by_date target, one undo.
  app.post('/:id/adopt', async (c) => {
    const { validFrom } = await readBody(c, goalAdoptBody);
    return c.json(
      adoptGoalAsCategoryTarget(db, c.req.param('id'), validFrom ?? monthOf(today()), audit()),
    );
  });

  return app;
}
