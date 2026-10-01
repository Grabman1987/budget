import {
  createContact,
  contactLedger,
  deleteContact,
  getContact,
  listContacts,
  restoreContact,
  settleContact,
  updateContact,
  type ContactInput,
  type ContactPatch,
  type Db,
  type SettleInput,
} from '@budget/db';
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { ACTOR, defined, readBody, readQuery } from './http';
import {
  contactCreate,
  contactLedgerQuery,
  contactListQuery,
  contactPatch,
  contactSettleBody,
} from './schemas';

/**
 * Contacts (Kontakte) and their receivables. Every answer carries the figures of today: balance
 * (Forderung +, Verbindlichkeit −), open items (FIFO), expected contributions and pass-through
 * costs of the next 30 days. The receivable is not part of the net worth. Writes answer with the
 * `groupId` of their audit group; `POST /undo` reverts it.
 */
export function contactRoutes(db: Db, today: () => string): Hono {
  const app = new Hono();
  const audit = () => ({ actor: ACTOR, groupId: randomUUID() });

  app.get('/', (c) => {
    const { deleted } = readQuery(c, contactListQuery);
    return c.json(listContacts(db, today(), { includeDeleted: deleted === '1' }));
  });

  app.post('/', async (c) => {
    const ctx = audit();
    const row = createContact(db, defined<ContactInput>(await readBody(c, contactCreate)), ctx);
    return c.json({ contact: getContact(db, row.id, today()), groupId: ctx.groupId }, 201);
  });

  app.get('/:id', (c) => c.json({ contact: getContact(db, c.req.param('id'), today()) }));

  app.patch('/:id', async (c) => {
    const ctx = audit();
    const row = updateContact(
      db,
      c.req.param('id'),
      defined<ContactPatch>(await readBody(c, contactPatch)),
      ctx,
    );
    return c.json({ contact: getContact(db, row.id, today()), groupId: ctx.groupId });
  });

  app.delete('/:id', (c) => c.json(deleteContact(db, c.req.param('id'), audit())));

  app.post('/:id/restore', (c) => {
    const ctx = audit();
    const row = restoreContact(db, c.req.param('id'), ctx);
    return c.json({ contact: getContact(db, row.id, today()), groupId: ctx.groupId });
  });

  // Kontoblatt: rows of `from`..`to` (default: everything up to today), monthly statements, open
  // items and the outlook.
  app.get('/:id/ledger', (c) => {
    const { from, to } = readQuery(c, contactLedgerQuery);
    return c.json(contactLedger(db, c.req.param('id'), today(), defined({ from, to })));
  });

  // "Ausgleich buchen": an inflow with a contact split in Auslagen, settled FIFO. One audit group.
  app.post('/:id/settle', async (c) => {
    const body = await readBody(c, contactSettleBody);
    return c.json(
      settleContact(db, c.req.param('id'), defined<SettleInput>(body), audit(), today()),
      201,
    );
  });

  return app;
}
