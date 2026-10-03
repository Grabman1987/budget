import {
  category,
  categoryGroup,
  contact,
  createPayee,
  incomeType,
  institution,
  listPayees,
  mergePayees,
  project,
  booking,
  getEntity,
  undo,
  updatePayee,
  type Db,
} from '@budget/db';
import { and, asc, eq, isNull, or } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { ACTOR, ApiError, defined, readBody, readQuery } from './http';
import { z } from 'zod';
import { payeeCreate, payeeMerge, payeePatch, undoBody } from './schemas';

/** Payees (create, rename, merge), the pick lists the pages need, and undo. */
export function payeeRoutes(db: Db): Hono {
  const app = new Hono();
  const audit = () => ({ actor: ACTOR, groupId: randomUUID() });

  app.get('/', (c) => c.json({ payees: listPayees(db) }));

  app.post('/', async (c) => {
    const input = await readBody(c, payeeCreate);
    const ctx = audit();
    const created = createPayee(db, defined(input), ctx);
    return c.json({ payee: created, groupId: ctx.groupId }, 201);
  });

  app.post('/merge', async (c) => {
    const { sourceIds, targetId, unlockReconciled } = await readBody(c, payeeMerge);
    const result = mergePayees(
      db,
      sourceIds,
      targetId,
      { actor: ACTOR, groupId: randomUUID() },
      { unlockReconciled },
    );
    return c.json(result);
  });

  app.patch('/:id', async (c) => {
    const { name, defaultCategoryId } = await readBody(c, payeePatch);
    const id = c.req.param('id');
    const ctx = audit();
    const row = updatePayee(db, id, defined({ name, defaultCategoryId }), ctx);
    return c.json({ payee: row, groupId: ctx.groupId });
  });

  return app;
}

/** Everything a pick list needs in one request: categories, groups, projects, income types, contacts. */
export function lookupRoutes(db: Db): Hono {
  const app = new Hono();
  app.get('/', (c) => {
    const { bookingId } = readQuery(
      c,
      z.object({ bookingId: z.string().min(1).max(64).optional() }),
    );
    const retainedProjectId = bookingId ? getEntity(db, booking, bookingId)?.projectId : null;
    return c.json({
      groups: db
        .select({
          id: categoryGroup.id,
          name: categoryGroup.name,
          sortOrder: categoryGroup.sortOrder,
        })
        .from(categoryGroup)
        .where(isNull(categoryGroup.deletedAt))
        .orderBy(asc(categoryGroup.sortOrder), asc(categoryGroup.name))
        .all(),
      categories: db
        .select({
          id: category.id,
          name: category.name,
          groupId: category.groupId,
          class: category.class,
          kind: category.kind,
          sortOrder: category.sortOrder,
        })
        .from(category)
        .where(isNull(category.deletedAt))
        .orderBy(asc(category.sortOrder), asc(category.name))
        .all(),
      projects: db
        .select({ id: project.id, name: project.name, archivedAt: project.archivedAt })
        .from(project)
        .where(
          and(
            isNull(project.deletedAt),
            retainedProjectId
              ? or(isNull(project.archivedAt), eq(project.id, retainedProjectId))
              : isNull(project.archivedAt),
          ),
        )
        .orderBy(asc(project.name))
        .all(),
      incomeTypes: db
        .select({ id: incomeType.id, name: incomeType.name })
        .from(incomeType)
        .where(isNull(incomeType.deletedAt))
        .orderBy(asc(incomeType.sortOrder))
        .all(),
      contacts: db
        .select({ id: contact.id, name: contact.name })
        .from(contact)
        .where(isNull(contact.deletedAt))
        .orderBy(asc(contact.name))
        .all(),
      institutions: db
        .select({ id: institution.id, name: institution.name, kind: institution.kind })
        .from(institution)
        .where(isNull(institution.deletedAt))
        .orderBy(asc(institution.name))
        .all(),
    });
  });
  return app;
}

/** Undo (or redo, by undoing the undo) a whole user action by its group id. */
export function undoRoutes(db: Db): Hono {
  const app = new Hono();
  app.post('/', async (c) => {
    const { groupId } = await readBody(c, undoBody);
    const ctx = { actor: ACTOR, groupId: randomUUID() };
    let result;
    try {
      result = undo(db, { groupId }, ctx);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found'))
        throw new ApiError(404, 'not_found', 'Nothing to undo for this action');
      throw error;
    }
    return c.json({ groupId: result.groupId, undone: result.entries.length });
  });
  return app;
}
