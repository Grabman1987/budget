import {
  planMonthViews,
  assignMany,
  quickAssignMany,
  categoryTree,
  coverOverspending,
  coverAllOverspending,
  createCategory,
  createCategoryGroup,
  deleteCategoryGroup,
  mergeCategories,
  moveMoney,
  renameCategoryGroup,
  setCategoryHidden,
  setCategoryPinned,
  setCategoryTarget,
  sortCategories,
  splitOffCandidates,
  splitOffCategory,
  updateCategory,
  withGroup,
  type Db,
  appSetting,
  getEntity,
  createEntity,
} from '@budget/db';
import { addMonths } from '@budget/domain';
import { Hono } from 'hono';
import { z } from 'zod';
import { ACTOR, ApiError, defined, readBody, readQuery } from './http';
import {
  assignBody,
  quickAssignBody,
  budgetMonthsQuery,
  budgetQuery,
  categoryCreate,
  categoryMerge,
  categoryPatch,
  categorySort,
  coverBody,
  groupBody,
  month,
  moveBody,
  splitOffBody,
  splitOffQuery,
  targetBody,
} from './schemas';

const audit = () => withGroup({ actor: ACTOR });

/** A target version (or `null`: no target) from `validFrom` on, in the caller's audit group. */
function setTarget(
  db: Parameters<typeof setCategoryTarget>[0],
  categoryId: string,
  { target, validFrom }: z.infer<typeof targetBody>,
  ctx: ReturnType<typeof audit>,
) {
  setCategoryTarget(db, categoryId, target && defined(target), validFrom, ctx);
}

/** Einstellungen › Kategorien: groups, categories, targets, sort, merge and split-off. */
export function categoryRoutes(db: Db): Hono {
  const app = new Hono();

  app.get('/', (c) => c.json(categoryTree(db)));

  app.post('/', async (c) => {
    const { target, ...input } = await readBody(c, categoryCreate);
    const ctx = audit();
    const row = db.transaction((tx) => {
      const created = createCategory(tx, defined(input), ctx);
      if (target) setTarget(tx, created.id, target, ctx);
      return created;
    });
    return c.json({ category: row, groupId: ctx.groupId }, 201);
  });

  app.post('/sort', async (c) => {
    const { groups } = await readBody(c, categorySort);
    return c.json(sortCategories(db, groups, audit()));
  });

  app.post('/merge', async (c) => {
    const { sourceIds, targetId } = await readBody(c, categoryMerge);
    return c.json(mergeCategories(db, sourceIds, targetId, audit()));
  });

  app.post('/groups', async (c) => {
    const { name } = await readBody(c, groupBody);
    const ctx = audit();
    return c.json({ group: createCategoryGroup(db, name, ctx), groupId: ctx.groupId }, 201);
  });

  app.patch('/groups/:id', async (c) => {
    const { name } = await readBody(c, groupBody);
    const ctx = audit();
    return c.json({
      group: renameCategoryGroup(db, c.req.param('id'), name, ctx),
      groupId: ctx.groupId,
    });
  });

  app.delete('/groups/:id', (c) => {
    const ctx = audit();
    deleteCategoryGroup(db, c.req.param('id'), ctx);
    return c.json({ groupId: ctx.groupId });
  });

  app.patch('/:id', async (c) => {
    const { hidden, pinned, target, ...patch } = await readBody(c, categoryPatch);
    const id = c.req.param('id');
    const ctx = audit();
    const row = db.transaction((tx) => {
      const changes = defined<Parameters<typeof updateCategory>[2]>(patch);
      let updated = updateCategory(tx, id, changes, ctx);
      if (hidden !== undefined) updated = setCategoryHidden(tx, id, hidden, ctx);
      if (pinned !== undefined) updated = setCategoryPinned(tx, id, pinned, ctx);
      if (target) setTarget(tx, id, target, ctx);
      return updated;
    });
    return c.json({ category: row, groupId: ctx.groupId });
  });

  app.put('/:id/target', async (c) => {
    const body = await readBody(c, targetBody);
    const ctx = audit();
    setTarget(db, c.req.param('id'), body, ctx);
    return c.json({ groupId: ctx.groupId });
  });

  app.get('/:id/split-off', (c) => {
    const filter = readQuery(c, splitOffQuery);
    return c.json({ splits: splitOffCandidates(db, c.req.param('id'), defined(filter)) });
  });

  app.post('/:id/split-off', async (c) => {
    const body = await readBody(c, splitOffBody);
    let into: Parameters<typeof splitOffCategory>[3];
    if ('targetId' in body) into = { targetId: body.targetId };
    else {
      const { target, ...fields } = body.newCategory;
      into = {
        newCategory: defined(fields) as never,
        ...(target && {
          target: { target: target.target && defined(target.target), validFrom: target.validFrom },
        }),
      };
    }
    return c.json(splitOffCategory(db, c.req.param('id'), body.splitIds, into, audit()));
  });

  return app;
}

/** Plan › Monat: month summary, assign, move, cover (`/api/budget/:month`). */
export function budgetRoutes(db: Db, today: () => string): Hono {
  const app = new Hono();
  const monthParam = (value: string) => month.parse(value);

  /** Several months at once: `{ months: { 'YYYY-MM': <the answer of GET /:month> } }`. */
  app.get('/months', (c) => {
    const { months, cardRule } = readQuery(c, budgetMonthsQuery);
    return c.json({ months: planMonthViews(db, months, cardRule ? { cardRule } : {}, today()) });
  });

  app.get('/:month', (c) => {
    const m = monthParam(c.req.param('month'));
    const { cardRule } = readQuery(c, budgetQuery);
    return c.json(planMonthViews(db, [m], cardRule ? { cardRule } : {}, today())[m]);
  });

  app.put('/:month/assigned', async (c) => {
    const m = monthParam(c.req.param('month'));
    const { items, closeMonth } = await readBody(c, assignBody);
    if (!closeMonth) return c.json(assignMany(db, m, items, audit()));
    if (addMonths(closeMonth, 1) !== m)
      throw new ApiError(422, 'close_plan_month', 'Der Plan muss zum nächsten Monat gehören.');
    return c.json(
      db.transaction((tx) => {
        const id = `month_close_plan.${closeMonth}`;
        const stored = getEntity(tx, appSetting, id);
        const ctx = stored ? { actor: ACTOR, groupId: z.uuid().parse(stored.value) } : audit();
        const result = assignMany(tx, m, items, ctx);
        if (!stored) createEntity(tx, appSetting, { id, value: ctx.groupId }, ctx);
        return result;
      }),
    );
  });

  app.post('/:month/quick-assign', async (c) => {
    const m = monthParam(c.req.param('month'));
    const { mode, categoryIds } = await readBody(c, quickAssignBody);
    return c.json(quickAssignMany(db, m, mode, categoryIds, audit(), today()));
  });

  app.post('/:month/move', async (c) => {
    const m = monthParam(c.req.param('month'));
    const body = await readBody(c, moveBody);
    if ('coverAll' in body)
      return c.json(coverAllOverspending(db, m, body.fromId, audit(), today()));
    return c.json(moveMoney(db, m, body.fromId, body.toId, body.amountCents, audit()));
  });

  app.post('/:month/cover', async (c) => {
    const m = monthParam(c.req.param('month'));
    const { categoryId, fromId } = await readBody(c, coverBody);
    return c.json(
      coverOverspending(db, m, categoryId, fromId, audit(), {
        today: today(),
      }),
    );
  });

  return app;
}
