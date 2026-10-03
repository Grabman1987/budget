import {
  account,
  cashValuer,
  bankBalanceForAccount,
  lockBankBalance,
  accounts,
  accountSummaries,
  balanceSeries,
  netWorthValuationAsOf,
  booking,
  listReconciliations,
  orderAccounts,
  previewReconciliation,
  reconcileAccount,
  type AccountSummary,
  type Db,
} from '@budget/db';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { Hono, type Context } from 'hono';
import type { CashValuation } from '@budget/domain';
import { ACTOR, ApiError, defined, readBody, readQuery } from './http';
import {
  accountClose,
  accountCreate,
  accountPatch,
  accountOrder,
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

/** EUR valuation fields can be null when a required security quote or exchange rate is missing. */
export type AccountView = AccountSummary & {
  cashValuation: CashValuation;
  pendingValuation: CashValuation;
  holdingsCents: number | null;
  valueEurCents: number | null;
  missingFxCurrencies: string[];
  missingPriceSecurityIds: string[];
};

export function accountRoutes(db: Db, today: () => string): Hono {
  const app = new Hono();

  const accountList = (asOf: string) => {
    const value = cashValuer(db);
    const valuation = netWorthValuationAsOf(db, asOf);
    return {
      netWorthEurCents: valuation.totalCents,
      missingFxCurrencies: valuation.missingFxCurrencies,
      missingPriceSecurityIds: valuation.missingPriceSecurityIds,
      accounts: accountSummaries(db, asOf).map((a) => {
        const bankBalance =
          a.closedAt || asOf !== today() ? null : bankBalanceForAccount(db, a.id, today());
        return {
          ...a,
          cashValuation: value(a.balanceCents, a.currency, asOf),
          pendingValuation: value(a.unclearedCents, a.currency, asOf),
          bankBalance: bankBalance
            ? {
                ...bankBalance,
                valuation:
                  bankBalance.amountCents !== null && bankBalance.date !== null
                    ? value(bankBalance.amountCents, a.currency, bankBalance.date)
                    : null,
              }
            : null,
          holdingsCents: Object.hasOwn(valuation.holdingsByAccount, a.id)
            ? valuation.holdingsByAccount[a.id]!
            : 0,
          valueEurCents: Object.hasOwn(valuation.byAccount, a.id) ? valuation.byAccount[a.id]! : 0,
          missingFxCurrencies: valuation.missingFxByAccount[a.id] ?? [],
          missingPriceSecurityIds: valuation.missingPriceByAccount[a.id] ?? [],
        };
      }),
    };
  };
  const listAccounts = (asOf: string): AccountView[] => accountList(asOf).accounts;
  const summary = (id: string, asOf = today()): AccountView => {
    const found = listAccounts(asOf).find((a) => a.id === id);
    if (!found) throw new ApiError(404, 'not_found', `Account ${id} not found`);
    return found;
  };
  const audit = () => ({ actor: ACTOR, groupId: randomUUID() });

  app.get('/', (c) => {
    const { asOf } = readQuery(c, asOfQuery);
    const day = asOf ?? today();
    return c.json({ asOf: day, ...accountList(day) });
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

  /**
   * The owner's account order (sidebar, Konten › Übersicht, selects): ordered ids become
   * `sortOrder` 1..n, one audit group so a single undo restores the old order. Registered before
   * `/:id`. `POST /sort` is the older name of the same write.
   */
  const order = async (c: Context) => {
    const { ids } = await readBody(c, accountOrder);
    const result = orderAccounts(db, ids, audit());
    return c.json({ accounts: listAccounts(today()), groupId: result.groupId });
  };
  app.patch('/order', order);
  app.post('/sort', order);

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
    const acct = summary(id);
    const value = cashValuer(db);
    return c.json({
      accountId: id,
      currency: acct.currency,
      points: balanceSeries(db, id, range).map((p) => ({
        ...p,
        valuation: value(p.balanceCents, acct.currency, p.date),
      })),
    });
  });

  app.get('/:id/reconciliations', (c) => {
    const id = c.req.param('id');
    summary(id);
    return c.json({ reconciliations: listReconciliations(db, id) });
  });

  app.post('/:id/reconciliation/preview', async (c) => {
    const id = c.req.param('id');
    const input = await readBody(c, reconcilePreview);
    const acct = accounts.get(db, id);
    const preview = previewReconciliation(db, { accountId: id, ...input, today: today() });
    const value = cashValuer(db);
    const currency = acct!.currency;
    return c.json({
      preview: {
        ...preview,
        currency,
        valuations: {
          booked: value(preview.bookedBalanceCents, currency, input.date),
          pending: value(preview.pendingCents, currency, input.date),
          statement: value(preview.statementBalanceCents, currency, input.date),
          difference: value(preview.differenceCents, currency, input.date),
        },
        duplicates: preview.duplicates.map((d) => ({
          ...d,
          valuation: value(d.amountCents, currency, d.date),
        })),
      },
    });
  });

  app.post('/:id/bank-lock', async (c) => {
    await readBody(c, reconcileBody.pick({}).strict());
    return c.json(lockBankBalance(db, c.req.param('id'), today(), audit()));
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
