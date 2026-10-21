import {
  adoptGoalAsCategoryTarget,
  createGoal,
  completeGoal,
  fundGoalRate,
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
    return c.json({ month: view, goals: listGoals(db, view, { includeDeleted: deleted === '1', today: today() }) });
  });

  app.get('/report', (c) => {
    const { month } = readQuery(c, goalMonthQuery);
    return c.json(goalsReport(db, today(), monthOrToday(month)));
  });

  app.post('/', async (c) => {
    const { month } = readQuery(c, goalMonthQuery);
    const { goal, groupId } = createGoal(
      db,
      defined<GoalInput>(await readBody(c, goalCreate)),
      audit(),
      monthOrToday(month),
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
      monthOrToday(month),
    );
    return c.json({ goal: getGoal(db, goal.id, monthOrToday(month)), groupId });
  });

  app.post('/:id/fund', (c) => {
    const { month } = readQuery(c, goalMonthQuery);
    return c.json(fundGoalRate(db, c.req.param('id'), monthOrToday(month), audit()));
  });

  app.post('/:id/complete', (c) => c.json(completeGoal(db, c.req.param('id'), today(), audit())));

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
