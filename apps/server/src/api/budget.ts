import {
  assignMany,
  budgetSummary,
  categoryTree,
  coverOverspending,
  createCategory,
  createCategoryGroup,
  deleteCategoryGroup,
  mergeCategories,
  moveMoney,
  renameCategoryGroup,
  setCategoryHidden,
  setCategoryTarget,
  sortCategories,
  splitOffCandidates,
  splitOffCategory,
  updateCategory,
  withGroup,
  type Db,
} from '@budget/db';
import { Hono } from 'hono';
import { ACTOR, defined, readBody, readQuery } from './http';
import {
  assignBody,
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

/** Einstellungen › Kategorien: groups, categories, targets, sort, merge and split-off. */
export function categoryRoutes(db: Db): Hono {
  const app = new Hono();

  app.get('/', (c) => c.json(categoryTree(db)));

  app.post('/', async (c) => {
    const input = await readBody(c, categoryCreate);
    const ctx = audit();
    return c.json({ category: createCategory(db, defined(input), ctx), groupId: ctx.groupId }, 201);
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
    const { hidden, ...patch } = await readBody(c, categoryPatch);
    const id = c.req.param('id');
    const ctx = audit();
    const row = db.transaction((tx) => {
      const changes = defined<Parameters<typeof updateCategory>[2]>(patch);
      let updated = updateCategory(tx, id, changes, ctx);
      if (hidden !== undefined) updated = setCategoryHidden(tx, id, hidden, ctx);
      return updated;
    });
    return c.json({ category: row, groupId: ctx.groupId });
  });

  app.put('/:id/target', async (c) => {
    const { target, validFrom } = await readBody(c, targetBody);
    const ctx = audit();
    setCategoryTarget(db, c.req.param('id'), target && defined(target), validFrom, ctx);
    return c.json({ groupId: ctx.groupId });
  });

  app.get('/:id/split-off', (c) => {
    const filter = readQuery(c, splitOffQuery);
    return c.json({ splits: splitOffCandidates(db, c.req.param('id'), defined(filter)) });
  });

  app.post('/:id/split-off', async (c) => {
    const body = await readBody(c, splitOffBody);
    const into =
      'targetId' in body ? { targetId: body.targetId } : { newCategory: defined(body.newCategory) };
    return c.json(splitOffCategory(db, c.req.param('id'), body.splitIds, into as never, audit()));
  });

  return app;
}

/** Plan › Monat: month summary, assign, move, cover (`/api/budget/:month`). */
export function budgetRoutes(db: Db): Hono {
  const app = new Hono();
  const monthParam = (value: string) => month.parse(value);

  app.get('/:month', (c) => {
    const m = monthParam(c.req.param('month'));
    const { cardRule } = readQuery(c, budgetQuery);
    const { summary, tree } = budgetSummary(db, m, cardRule ? { cardRule } : {});
    return c.json({ summary, groups: tree.groups, categories: tree.categories });
  });

  app.put('/:month/assigned', async (c) => {
    const m = monthParam(c.req.param('month'));
    const { items } = await readBody(c, assignBody);
    return c.json(assignMany(db, m, items, audit()));
  });

  app.post('/:month/move', async (c) => {
    const m = monthParam(c.req.param('month'));
    const { fromId, toId, amountCents } = await readBody(c, moveBody);
    return c.json(moveMoney(db, m, fromId, toId, amountCents, audit()));
  });

  app.post('/:month/cover', async (c) => {
    const m = monthParam(c.req.param('month'));
    const { categoryId, fromId } = await readBody(c, coverBody);
    return c.json(coverOverspending(db, m, categoryId, fromId, audit()));
  });

  return app;
}
