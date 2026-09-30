import {
  account,
  createBooking,
  createTransfer,
  deleteBooking,
  getBooking,
  queryBookings,
  ReconciledLockedError,
  relatedTransferBookings,
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

/** Why a bulk action left a booking out. */
type BulkSkipReason =
  'not_found' | 'reconciled_locked' | 'split' | 'transfer' | 'transfer_pair' | 'invalid';

class Skip extends Error {
  constructor(
    readonly reason: BulkSkipReason,
    message: string,
  ) {
    super(message);
  }
}

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
   * take the change is skipped and reported with a reason code, the rest goes through. Both legs
   * of a transfer in one selection are one Umbuchung: a delete takes the pair once (the second leg
   * counts as changed), a category is refused for both with `transfer_pair`.
   */
  app.post('/bulk', async (c) => {
    const body = await readBody(c, bulkBody);
    const ctx = audit();
    const ids = [...new Set(body.ids)];
    const selected = new Set(ids);
    const changed: string[] = [];
    const skipped: { id: string; reason: BulkSkipReason; message: string }[] = [];
    /** Legs deleted together with an earlier id of this request. */
    const goneWith = new Set<string>();
    const pairedLegs = new Set<string>();
    let transferPairs = 0;
    runInTransaction(db, (tx) => {
      for (const id of ids) {
        if (goneWith.has(id)) {
          changed.push(id);
          continue;
        }
        try {
          runInTransaction(tx, (inner) => {
            const current = getBooking(inner, id);
            if (!current) throw new Skip('not_found', 'Booking not found');
            const partners = relatedTransferBookings(inner, id).filter((leg) => leg !== id);
            const paired = partners.some((leg) => selected.has(leg));
            if (paired && !pairedLegs.has(id)) transferPairs += 1;
            if (paired) for (const leg of [id, ...partners]) pairedLegs.add(leg);
            const options = { unlockReconciled: body.unlockReconciled };
            if (body.action === 'delete') {
              deleteBooking(inner, id, ctx, options);
              for (const leg of partners) goneWith.add(leg);
              return;
            }
            const { categoryId, flag, status } = body.set;
            const patch: BookingPatch = defined({ flag, status });
            if (categoryId !== undefined) {
              const [only] = current.splits;
              if (current.transferId || current.splits.some((s) => s.transferId)) {
                throw new Skip(
                  paired ? 'transfer_pair' : 'transfer',
                  'A transfer leg takes no category in a bulk edit',
                );
              }
              if (!only || current.splits.length !== 1)
                throw new Skip('split', 'Only single-split bookings take a category');
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
          const reason: BulkSkipReason =
            error instanceof Skip
              ? error.reason
              : error instanceof ReconciledLockedError
                ? 'reconciled_locked'
                : 'invalid';
          skipped.push({ id, reason, message: error instanceof Error ? error.message : 'failed' });
        }
      }
    });
    return c.json({ changed, skipped, transferPairs, groupId: ctx.groupId });
  });

  return app;
}
