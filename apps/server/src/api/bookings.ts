import {
  account,
  bookingDelivery,
  category,
  payee,
  createBooking,
  createPayee,
  createTransfer,
  deleteBooking,
  ensureAdvanceCategory,
  getBooking,
  queryBookings,
  ReconciledLockedError,
  relatedTransferBookings,
  runInTransaction,
  updateBooking,
  type AuditContext,
  type BookingPatch,
  type Db,
  type ListedBooking,
  type SplitInput,
} from '@budget/db';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { ACTOR, ApiError, defined, errorAnswer, readBody, readQuery } from './http';
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

/**
 * A contact share runs through the Auslagen category. The client may leave it out: the first
 * share creates it (see `ensureAdvanceCategory`), inside the booking's own audit group.
 */
function withAdvanceCategory(db: Db, splits: SplitInput[], ctx: AuditContext): SplitInput[] {
  if (!splits.some((s) => s.contactId && !s.categoryId)) return splits;
  const advanceId = ensureAdvanceCategory(db, ctx);
  return splits.map((s) => (s.contactId && !s.categoryId ? { ...s, categoryId: advanceId } : s));
}

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
    if (!row)
      throw new ApiError(
        404,
        'account_deleted',
        'Das Konto wurde gelöscht. Wähle ein anderes Konto.',
      );
    if (row.closedAt)
      throw new ApiError(
        409,
        'account_closed',
        'Das Konto ist geschlossen. Öffne es wieder oder wähle ein anderes Konto.',
      );
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
    const key = c.req.header('Idempotency-Key');
    if (key !== undefined && !/^[a-zA-Z0-9-]{16,80}$/.test(key))
      throw new ApiError(400, 'invalid', 'Ungültiger Sendeschlüssel.');
    const hash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const ctx = audit();
    const response = runInTransaction(db, (tx) => {
      if (key) {
        const previous = tx
          .select()
          .from(bookingDelivery)
          .where(eq(bookingDelivery.key, key))
          .get();
        if (previous) {
          if (previous.requestHash !== hash)
            throw new ApiError(
              409,
              'idempotency_conflict',
              'Dieser Eintrag wurde bereits mit anderen Feldern gesendet.',
            );
          return JSON.parse(previous.responseJson) as Record<string, unknown>;
        }
      }
      // Explicit reference conflicts keep queued captures actionable, without leaking ids.
      const accountIds =
        body.type === 'transfer'
          ? [body.fromAccountId, body.toAccountId]
          : [
              body.accountId,
              ...(body.splits ?? []).flatMap((s) =>
                s.transferAccountId ? [s.transferAccountId] : [],
              ),
            ];
      for (const id of accountIds) requireOpen(id);
      const categoryIds =
        body.type === 'transfer'
          ? [body.categoryId]
          : [body.categoryId, ...(body.splits ?? []).map((s) => s.categoryId)];
      for (const id of key ? categoryIds : []) {
        if (
          id &&
          !tx
            .select({ id: category.id })
            .from(category)
            .where(and(eq(category.id, id), isNull(category.deletedAt)))
            .get()
        )
          throw new ApiError(
            409,
            'category_deleted',
            'Die Kategorie wurde gelöscht. Wähle eine andere Kategorie.',
          );
      }
      let result: Record<string, unknown>;
      if (body.type === 'transfer') {
        requireOpen(body.fromAccountId);
        requireOpen(body.toAccountId);
        const transfer = createTransfer(tx, defined(withoutType(body)), ctx);
        result = {
          ...transfer,
          bookings: read([transfer.fromBookingId, transfer.toBookingId]),
          groupId: ctx.groupId,
        };
      } else {
        const { splits, categoryId, payeeName, ...columns } = withoutType(body);
        if (payeeName && columns.payeeId)
          throw new ApiError(400, 'invalid', 'Empfänger entweder als Name oder Auswahl senden.');
        if (payeeName) {
          const name = payeeName.replace(/\s+/g, ' ').trim();
          const singleCategory =
            body.amountCents < 0 && (!splits || splits.length === 1)
              ? splits?.[0]?.contactId || splits?.[0]?.transferAccountId
                ? null
                : (splits?.[0]?.categoryId ?? categoryId)
              : null;
          columns.payeeId =
            tx
              .select({ id: payee.id })
              .from(payee)
              .where(and(isNull(payee.deletedAt), sql`lower(${payee.name}) = lower(${name})`))
              .get()?.id ??
            createPayee(tx, { name, defaultCategoryId: singleCategory ?? null }, ctx).id;
        }
        const lines = (
          splits ?? [{ categoryId: categoryId ?? null, amountCents: body.amountCents }]
        ).map((s) => defined(s) as SplitInput);
        // One transaction: a refused booking must not leave a freshly created Auslagen category.
        const id = createBooking(
          tx,
          { ...defined(columns), splits: withAdvanceCategory(tx, lines, ctx) },
          ctx,
        );
        result = { id, bookings: read([id]), groupId: ctx.groupId };
      }
      if (key)
        tx.insert(bookingDelivery)
          .values({ key, requestHash: hash, responseJson: JSON.stringify(result) })
          .run();
      return result;
    });
    return c.json(response, 201);
  });

  app.patch('/:id', async (c) => {
    const id = c.req.param('id');
    const { unlockReconciled, splits, ...rest } = await readBody(c, bookingPatch);
    if (rest.accountId) requireOpen(rest.accountId);
    const ctx = audit();
    runInTransaction(db, (tx) => {
      const patch: BookingPatch = {
        ...defined(rest),
        ...(splits
          ? {
              splits: withAdvanceCategory(
                tx,
                splits.map((s) => defined(s) as SplitInput),
                ctx,
              ),
            }
          : {}),
      };
      updateBooking(tx, id, patch, ctx, { unlockReconciled: unlockReconciled ?? false });
    });
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
          skipped.push({
            id,
            reason,
            message: error instanceof Skip ? error.message : errorAnswer(error).body.message,
          });
        }
      }
    });
    return c.json({ changed, skipped, transferPairs, groupId: ctx.groupId });
  });

  return app;
}
