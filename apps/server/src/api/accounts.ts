import {
  account,
  accounts,
  accountSummaries,
  balanceSeries,
  holdingValuesAsOf,
  booking,
  listReconciliations,
  previewReconciliation,
  reconcileAccount,
  runInTransaction,
  type AccountSummary,
  type Db,
} from '@budget/db';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { ACTOR, ApiError, defined, readBody, readQuery } from './http';
import {
  accountClose,
  accountCreate,
  accountPatch,
  accountSort,
  asOfQuery,
  reconcileBody,
  reconcilePreview,
  seriesQuery,
} from './schemas';

/** Role and budget membership that follow from an account type when the request says nothing. */
const DEFAULTS = {
  checking: { role: 'budget', onBudget: true },
  cash: { role: 'budget', onBudget: true },
  savings: { role: 'reserve', onBudget: true },
  credit_card: { role: 'budget', onBudget: true },
  loan: { role: 'debt', onBudget: false },
  brokerage: { role: 'investment', onBudget: false },
  crypto: { role: 'investment', onBudget: false },
  p2p: { role: 'investment', onBudget: false },
  receivable: { role: 'receivable', onBudget: false },
  other_asset: { role: 'investment', onBudget: false },
  other_liability: { role: 'debt', onBudget: false },
} as const;
const TRACKING_ONLY = new Set(['loan', 'brokerage', 'crypto', 'p2p', 'receivable']);

/** `holdingsCents` is the market value of the securities held in the account (0 without any). */
export type AccountView = AccountSummary & { holdingsCents: number };

export function accountRoutes(db: Db, today: () => string): Hono {
  const app = new Hono();

  /** Account list with the market value of its securities (depots, crypto) next to the cash balance. */
  const listAccounts = (asOf: string): AccountView[] => {
    const holdings = new Map<string, number>();
    for (const h of holdingValuesAsOf(db, asOf))
      holdings.set(h.accountId, (holdings.get(h.accountId) ?? 0) + h.valueCents);
    return accountSummaries(db, asOf).map((a) => ({
      ...a,
      holdingsCents: holdings.get(a.id) ?? 0,
    }));
  };
  const summary = (id: string, asOf = today()): AccountView => {
    const found = listAccounts(asOf).find((a) => a.id === id);
    if (!found) throw new ApiError(404, 'not_found', `Account ${id} not found`);
    return found;
  };
  const audit = () => ({ actor: ACTOR, groupId: randomUUID() });

  app.get('/', (c) => {
    const { asOf } = readQuery(c, asOfQuery);
    const day = asOf ?? today();
    return c.json({ asOf: day, accounts: listAccounts(day) });
  });

  app.post('/', async (c) => {
    const input = await readBody(c, accountCreate);
    const defaults = DEFAULTS[input.type];
    const onBudget = input.onBudget ?? defaults.onBudget;
    if (onBudget && TRACKING_ONLY.has(input.type)) {
      throw new ApiError(
        422,
        'invariant',
        'Loans, depots, crypto, P2P and receivables are never budget accounts',
      );
    }
    const ctx = audit();
    const sortOrder =
      (db
        .select({ max: sql<number>`COALESCE(MAX(${account.sortOrder}), 0)`.mapWith(Number) })
        .from(account)
        .where(isNull(account.deletedAt))
        .get()?.max ?? 0) + 1;
    const row = accounts.create(
      db,
      defined({ ...input, role: input.role ?? defaults.role, onBudget, sortOrder }),
      ctx,
    );
    return c.json({ account: summary(row.id), groupId: ctx.groupId }, 201);
  });

  app.post('/sort', async (c) => {
    const { ids } = await readBody(c, accountSort);
    const ctx = audit();
    // All or nothing: an unknown id leaves the old order untouched.
    runInTransaction(db, (tx) =>
      ids.forEach((id, index) => accounts.update(tx, id, { sortOrder: index + 1 }, ctx)),
    );
    return c.json({ accounts: listAccounts(today()), groupId: ctx.groupId });
  });

  app.get('/:id', (c) => {
    const { asOf } = readQuery(c, asOfQuery);
    return c.json({ account: summary(c.req.param('id'), asOf) });
  });

  app.patch('/:id', async (c) => {
    const id = c.req.param('id');
    const { unlockReconciled, ...patch } = await readBody(c, accountPatch);
    const current = accounts.get(db, id);
    if (!current) throw new ApiError(404, 'not_found', `Account ${id} not found`);
    const type = patch.type ?? current.type;
    if ((patch.onBudget ?? current.onBudget) && TRACKING_ONLY.has(type)) {
      throw new ApiError(
        422,
        'invariant',
        'Loans, depots, crypto, P2P and receivables are never budget accounts',
      );
    }
    if (patch.currency && patch.currency !== current.currency) {
      const used = db
        .select({ id: booking.id })
        .from(booking)
        .where(and(eq(booking.accountId, id), isNull(booking.deletedAt)))
        .get();
      if (used)
        throw new ApiError(
          409,
          'conflict',
          'The currency cannot change once the account has bookings',
        );
    }
    // The opening balance is part of every checked balance: a stored Kontostand prüfen locks it.
    const opening =
      (patch.openingBalanceCents !== undefined &&
        patch.openingBalanceCents !== current.openingBalanceCents) ||
      (patch.openingDate !== undefined && patch.openingDate !== current.openingDate);
    if (opening && !unlockReconciled) {
      const checks = listReconciliations(db, id);
      if (checks.length > 0)
        throw new ApiError(
          409,
          'reconciled_locked',
          'The account has checked balances (Kontostand prüfen); unlock explicitly to change the opening balance or date',
          { bookingIds: [], reconciliationIds: checks.map((r) => r.id) },
        );
    }
    const ctx = audit();
    accounts.update(db, id, defined(patch), ctx);
    return c.json({ account: summary(id), groupId: ctx.groupId });
  });

  app.post('/:id/close', async (c) => {
    const id = c.req.param('id');
    const { force } = await readBody(c, accountClose);
    const current = summary(id);
    if (current.closedAt) throw new ApiError(409, 'conflict', 'The account is closed already');
    if (
      !force &&
      (current.balanceCents !== 0 || current.pendingCount > 0 || current.scheduledCents !== 0)
    ) {
      throw new ApiError(
        409,
        'account_not_empty',
        'Only an account with balance 0 and without pending or scheduled bookings closes without force',
      );
    }
    const ctx = audit();
    accounts.update(db, id, { closedAt: new Date().toISOString() }, ctx);
    return c.json({ account: summary(id), groupId: ctx.groupId });
  });

  app.post('/:id/reopen', (c) => {
    const id = c.req.param('id');
    if (!summary(id).closedAt) throw new ApiError(409, 'conflict', 'The account is not closed');
    const ctx = audit();
    accounts.update(db, id, { closedAt: null }, ctx);
    return c.json({ account: summary(id), groupId: ctx.groupId });
  });

  app.get('/:id/series', (c) => {
    const id = c.req.param('id');
    const range = readQuery(c, seriesQuery);
    summary(id);
    return c.json({ accountId: id, points: balanceSeries(db, id, range) });
  });

  app.get('/:id/reconciliations', (c) => {
    const id = c.req.param('id');
    summary(id);
    return c.json({ reconciliations: listReconciliations(db, id) });
  });

  app.post('/:id/reconciliation/preview', async (c) => {
    const id = c.req.param('id');
    const input = await readBody(c, reconcilePreview);
    return c.json({
      preview: previewReconciliation(db, { accountId: id, ...input, today: today() }),
    });
  });

  app.post('/:id/reconciliation', async (c) => {
    const id = c.req.param('id');
    const input = await readBody(c, reconcileBody);
    const ctx = audit();
    const result = reconcileAccount(db, defined({ ...input, accountId: id, today: today() }), ctx);
    return c.json({ result, account: summary(id) }, 201);
  });

  return app;
}
