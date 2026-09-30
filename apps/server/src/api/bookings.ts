import {
  account,
  createBooking,
  createTransfer,
  deleteBooking,
  getBooking,
  queryBookings,
  runInTransaction,
  updateBooking,
  type BookingInput,
  type BookingPatch,
  type Db,
  type ListedBooking,
  type SplitInput,
} from '@budget/db';
import { and, eq, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { ACTOR, ApiError, defined, readBody, readQuery } from './http';
import { bookingDeleteQuery, bookingPatch, bookingQuery, bulkBody, createBody } from './schemas';

/** The request body without its `type` discriminator. */
const withoutType = <T extends { type: string }>({ type, ...rest }: T): Omit<T, 'type'> => {
  void type;
  return rest;
};

export function bookingRoutes(db: Db): Hono {
  const app = new Hono();
  const audit = () => ({ actor: ACTOR, groupId: randomUUID() });

  const read = (ids: string[]): ListedBooking[] => queryBookings(db, { ids, limit: 200 }).items;
  const requireOpen = (accountId: string) => {
    const row = db
      .select()
      .from(account)
      .where(and(eq(account.id, accountId), isNull(account.deletedAt)))
      .get();
    if (!row) throw new ApiError(404, 'not_found', `Account ${accountId} not found`);
    if (row.closedAt)
      throw new ApiError(409, 'account_closed', 'The account is closed; reopen it first');
  };

  app.get('/', (c) => {
    const { q, ids, ...rest } = readQuery(c, bookingQuery);
    const page = queryBookings(
      db,
      defined({
        ...rest,
        text: q,
        ids: ids ? ids.split(',').filter(Boolean).slice(0, 200) : undefined,
      }),
    );
    return c.json(page);
  });

  app.get('/:id', (c) => {
    const [found] = read([c.req.param('id')]);
    if (!found) throw new ApiError(404, 'not_found', 'Booking not found');
    return c.json({ booking: found });
  });

  app.post('/', async (c) => {
    const body = await readBody(c, createBody);
    const ctx = audit();
    if (body.type === 'transfer') {
      requireOpen(body.fromAccountId);
      requireOpen(body.toAccountId);
      const result = createTransfer(db, defined(withoutType(body)), ctx);
      return c.json(
        {
          ...result,
          bookings: read([result.fromBookingId, result.toBookingId]),
          groupId: ctx.groupId,
        },
        201,
      );
    }
    requireOpen(body.accountId);
    const { splits, categoryId, ...columns } = withoutType(body);
    const input: BookingInput = {
      ...defined(columns),
      splits: (splits ?? [{ categoryId: categoryId ?? null, amountCents: body.amountCents }]).map(
        (s) => defined(s) as SplitInput,
      ),
    };
    const id = createBooking(db, input, ctx);
    return c.json({ id, bookings: read([id]), groupId: ctx.groupId }, 201);
  });

  app.patch('/:id', async (c) => {
    const id = c.req.param('id');
    const { unlockReconciled, splits, ...rest } = await readBody(c, bookingPatch);
    if (rest.accountId) requireOpen(rest.accountId);
    const ctx = audit();
    const patch: BookingPatch = {
      ...defined(rest),
      ...(splits ? { splits: splits.map((s) => defined(s) as SplitInput) } : {}),
    };
    updateBooking(db, id, patch, ctx, { unlockReconciled: unlockReconciled ?? false });
    return c.json({ bookings: read([id]), groupId: ctx.groupId });
  });

  app.delete('/:id', (c) => {
    const id = c.req.param('id');
    const { unlock } = readQuery(c, bookingDeleteQuery);
    if (!getBooking(db, id)) throw new ApiError(404, 'not_found', 'Booking not found');
    const ctx = audit();
    deleteBooking(db, id, ctx, { unlockReconciled: unlock !== undefined });
    return c.json({ deleted: id, groupId: ctx.groupId });
  });

  /**
   * Bulk edit or delete for the multi-select: one audit group, so one undo. A booking that cannot
   * take the change (locked, several splits, a transfer leg) is skipped and reported, the rest goes
   * through.
   */
  app.post('/bulk', async (c) => {
    const body = await readBody(c, bulkBody);
    const ctx = audit();
    const changed: string[] = [];
    const skipped: { id: string; reason: string }[] = [];
    runInTransaction(db, (tx) => {
      for (const id of new Set(body.ids)) {
        try {
          runInTransaction(tx, (inner) => {
            const current = getBooking(inner, id);
            if (!current) throw new ApiError(404, 'not_found', 'Booking not found');
            const options = { unlockReconciled: body.unlockReconciled };
            if (body.action === 'delete') {
              deleteBooking(inner, id, ctx, options);
              return;
            }
            const { categoryId, flag, status } = body.set;
            const patch: BookingPatch = defined({ flag, status });
            if (categoryId !== undefined) {
              const [only] = current.splits;
              if (!only || current.splits.length !== 1 || current.transferId || only.transferId) {
                throw new ApiError(
                  422,
                  'invariant',
                  'Only single-split bookings that are not transfers take a category',
                );
              }
              patch.splits = [
                {
                  categoryId,
                  amountCents: only.amountCents,
                  memo: only.memo,
                  contactId: only.contactId,
                  incomeTypeId: only.incomeTypeId,
                },
              ];
            }
            updateBooking(inner, id, patch, ctx, options);
          });
          changed.push(id);
        } catch (error) {
          const reason =
            error instanceof ApiError || error instanceof Error
              ? (error as Error).name === 'ReconciledLockedError'
                ? 'reconciled_locked'
                : error.message
              : 'failed';
          skipped.push({ id, reason });
        }
      }
    });
    return c.json({ changed, skipped, groupId: ctx.groupId });
  });

  return app;
}
