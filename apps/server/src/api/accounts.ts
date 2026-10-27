import { accountReminders, accountReviewSummaries } from '@budget/db';
import {
  account,
  valuation,
  createEntity,
  updateEntity,
  restoreEntity,
  holdingValuationAsOf,
  cashValuer,
  bankBalanceForAccount,
  lockBankBalance,
  accounts,
  balanceSeries,
  holdingAccountValueSeries,
  accountPreview,
  netWorthValuationAsOf,
  currentValuationSources,
  type ValuationSource,
  booking,
  category,
  listReconciliations,
  orderAccounts,
  previewReconciliation,
  reconcileAccount,
  type AccountSummary,
  type Db,
  type Executor,
} from '@budget/db';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { Hono, type Context } from 'hono';
import {
  eachDay,
  isReconcileAdjustCategoryKind,
  worstQuality,
  type CashValuation,
  type AccountReviewStatus,
  type ValuationQuality,
} from '@budget/domain';
import { ACTOR, ApiError, defined, readBody, readQuery } from './http';
import {
  accountClose,
  day,
  cents,
  accountCreate,
  accountPatch,
  accountOrder,
  asOfQuery,
  reconcileBody,
  reconcilePreview,
  seriesBatchQuery,
  seriesQuery,
} from './schemas';

// Only the explicit enriched read is strict; existing batch parsing/default JSON stay unchanged.
const qualitySeriesQuery = seriesBatchQuery.extend({ quality: z.literal('1') }).strict();
interface AccountSeriesDayQuality {
  source: 'native_cash' | 'account_value_eur';
  currency: string;
  known: boolean;
  quality: ValuationQuality;
  missing: 'price' | 'fx' | null;
}
type PositionSeriesQuality = Pick<AccountSeriesDayQuality, 'quality' | 'missing'>;

/** Shared existing category guard for ordinary and month-close reconciliation. */
export function assertReconcileAdjustmentCategory(
  db: Executor,
  categoryId: string | undefined,
): void {
  if (categoryId !== undefined) {
    const picked = db
      .select({ kind: category.kind })
      .from(category)
      .where(eq(category.id, categoryId))
      .get();
    if (picked && !isReconcileAdjustCategoryKind(picked.kind))
      throw new ApiError(
        400,
        'invalid',
        'Für den Ausgleich ist nur eine Ausgaben-Kategorie erlaubt (keine Einnahmen-, Auslagen-, Karten-, Schulden- oder Investment-Kategorie).',
      );
  }
}

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

/** The loan term must not end before it starts. */
function assertTermOrder(start: string | null | undefined, end: string | null | undefined) {
  if (start && end && end < start)
    throw new ApiError(422, 'invalid', 'Das Laufzeitende liegt vor dem Laufzeitbeginn.');
}

/** EUR valuation fields can be null when a required security quote or exchange rate is missing. */
export type AccountView = AccountSummary & {
  reviewStatus: AccountReviewStatus;
  lastValuedOn: string | null;
  manualValueCents: number | null;
  hasHoldings: boolean;
  cashValuation: CashValuation;
  pendingValuation: CashValuation;
  holdingsCents: number | null;
  valueEurCents: number | null;
  missingFxCurrencies: string[];
  missingPriceSecurityIds: string[];
  valuationSources: ValuationSource[];
};

export function accountRoutes(db: Db, today: () => string): Hono {
  const app = new Hono();
  app.get('/reminders', (c) => c.json({ reminders: accountReminders(db, today()) }));

  app.put('/:id/valuation', async (c) => {
    const id = c.req.param('id');
    const input = await readBody(c, z.strictObject({ date: day, valueCents: cents.min(0) }));
    const ctx = { actor: ACTOR, groupId: randomUUID() };
    db.transaction((tx) => {
      const acct = accounts.get(tx, id);
      if (!acct) throw new ApiError(404, 'not_found', 'Konto nicht gefunden.');
      if (input.date > today() || input.date < acct.openingDate)
        throw new ApiError(
          422,
          'invalid',
          'Bitte einen Stichtag zwischen Kontoeröffnung und heute wählen.',
        );
      if (acct.closedAt || !['p2p', 'other_asset'].includes(acct.type))
        throw new ApiError(422, 'invalid', 'Dieses Konto verwendet keine manuelle Bewertung.');
      if (listReconciliations(tx, id).some((r) => r.date >= input.date))
        throw new ApiError(409, 'reconciled_locked', 'Der Stichtag ist bereits festgeschrieben.');
      const holdings = holdingValuationAsOf(tx, input.date);
      if (
        [
          ...holdings.values,
          ...holdings.missingPricePositions,
          ...holdings.missingFxPositions,
        ].some((h) => h.accountId === id)
      )
        throw new ApiError(422, 'invalid', 'Dieses Konto wird über seine Produkte bewertet.');
      const current = tx
        .select()
        .from(valuation)
        .where(and(eq(valuation.accountId, id), eq(valuation.date, input.date)))
        .get();
      if (current?.deletedAt) restoreEntity(tx, valuation, current.id, ctx);
      if (current)
        updateEntity(
          tx,
          valuation,
          current.id,
          { valueCents: input.valueCents, source: 'manual' },
          ctx,
        );
      else createEntity(tx, valuation, { accountId: id, ...input, source: 'manual' }, ctx);
    });
    return c.json({ groupId: ctx.groupId });
  });

  const accountList = (asOf: string) => {
    const value = cashValuer(db);
    const netWorth = netWorthValuationAsOf(db, asOf);
    const provenance = currentValuationSources(db, asOf);
    const reviewModel = accountReviewSummaries(db, asOf);
    const latestValues = reviewModel.latestValuations;
    return {
      netWorthEurCents: netWorth.totalCents,
      valuationSources: provenance.sources,
      missingFxCurrencies: netWorth.missingFxCurrencies,
      missingPriceSecurityIds: netWorth.missingPriceSecurityIds,
      accounts: reviewModel.accounts.map((a) => {
        const manual = a.type === 'p2p' || a.type === 'other_asset';
        const latest = a.openingDate <= asOf ? latestValues.get(a.id) : undefined;
        const bankBalance =
          a.closedAt || asOf !== today() ? null : bankBalanceForAccount(db, a.id, today());
        return {
          ...a,
          reviewStatus: reviewModel.reviews.get(a.id)!,
          valuationSources: provenance.sources.filter((source) => source.accountId === a.id),
          lastValuedOn: manual ? (latest?.date ?? null) : null,
          manualValueCents: manual ? (latest?.valueCents ?? a.balanceCents) : null,
          hasHoldings:
            Object.hasOwn(netWorth.holdingsByAccount, a.id) ||
            Boolean(netWorth.missingPriceByAccount[a.id]?.length),
          cashValuation: value(a.balanceCents, a.currency, asOf),
          pendingValuation: value(a.unclearedCents, a.currency, asOf),
          bankBalance: bankBalance
            ? {
                ...bankBalance,
                valuation:
                  bankBalance.amountCents !== null && bankBalance.effectiveDate !== null
                    ? value(bankBalance.amountCents, a.currency, bankBalance.effectiveDate)
                    : null,
              }
            : null,
          holdingsCents: Object.hasOwn(netWorth.holdingsByAccount, a.id)
            ? netWorth.holdingsByAccount[a.id]!
            : 0,
          valueEurCents: Object.hasOwn(netWorth.byAccount, a.id) ? netWorth.byAccount[a.id]! : 0,
          missingFxCurrencies: netWorth.missingFxByAccount[a.id] ?? [],
          missingPriceSecurityIds: netWorth.missingPriceByAccount[a.id] ?? [],
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

  const validateReferenceAccount = (
    executor: Db,
    referenceAccountId: string | null | undefined,
    ownerId: string | undefined,
    ownerType: string,
    currency: string,
  ) => {
    if (referenceAccountId == null) return;
    if (ownerType !== 'brokerage' && ownerType !== 'crypto')
      throw new ApiError(
        422,
        'invariant',
        'Nur Depots und Krypto-Konten können ein Verrechnungskonto haben.',
      );
    if (referenceAccountId === ownerId)
      throw new ApiError(
        422,
        'invariant',
        'Ein Konto kann nicht sein eigenes Verrechnungskonto sein.',
      );
    const target = accounts.get(executor, referenceAccountId);
    if (
      !target ||
      target.closedAt ||
      target.currency !== currency ||
      !['checking', 'cash', 'savings'].includes(target.type)
    )
      throw new ApiError(
        422,
        'invariant',
        'Bitte ein offenes Verrechnungskonto in derselben Währung wählen.',
      );
  };

  app.get('/', (c) => {
    const { asOf } = readQuery(c, asOfQuery);
    const day = asOf ?? today();
    return c.json({ asOf: day, ...accountList(day) });
  });

  app.post('/', async (c) => {
    const input = await readBody(c, accountCreate);
    validateReferenceAccount(db, input.referenceAccountId, undefined, input.type, input.currency);
    const defaults = DEFAULTS[input.type];
    const onBudget = input.onBudget ?? defaults.onBudget;
    if (onBudget && TRACKING_ONLY.has(input.type)) {
      throw new ApiError(
        422,
        'invariant',
        'Loans, depots, crypto, P2P and receivables are never budget accounts',
      );
    }
    assertTermOrder(input.termStart, input.termEnd);
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

  /**
   * The series of every live account (or of `ids`) in one answer: `{ series: { [accountId]: <the
   * answer of GET /:id/series> } }`. Konten reads all open accounts at once instead of one call each.
   */
  app.get('/series', (c) => {
    if (c.req.query('quality') !== undefined) {
      if (new URL(c.req.url).searchParams.getAll('quality').length !== 1)
        throw new ApiError(400, 'invalid', 'Bitte die Verlaufsqualität genau einmal anfordern.');
      const query = readQuery(c, qualitySeriesQuery);
      const { ids } = query;
      const range = { from: query.from, to: query.to };
      return c.json(
        db.transaction((tx) => {
          const observations = new Map<string, Map<string, PositionSeriesQuality>>();
          const held = holdingAccountValueSeries(tx, eachDay(range.from, range.to), ids, (fact) => {
            const days =
              observations.get(fact.accountId) ?? new Map<string, PositionSeriesQuality>();
            const prior = days.get(fact.day);
            const missing =
              fact.missing === 'fx' || fact.fx.kind === 'missing'
                ? 'fx'
                : fact.kind === 'missing' || fact.missing === 'price-or-basis'
                  ? 'price'
                  : null;
            days.set(fact.day, {
              quality: worstQuality(prior?.quality ?? 'exact', fact.quality),
              missing:
                prior?.missing === 'fx' || missing === 'fx' ? 'fx' : (prior?.missing ?? missing),
            });
            observations.set(fact.accountId, days);
          });
          const wanted = ids ? new Set(ids) : undefined;
          const rows = tx
            .select({
              id: account.id,
              currency: account.currency,
              openingDate: account.openingDate,
            })
            .from(account)
            .where(isNull(account.deletedAt))
            .orderBy(account.sortOrder, account.name, account.id)
            .all()
            .filter((a) => !wanted || wanted.has(a.id));
          const value = cashValuer(tx);
          const entries = rows.map(
            (a) => [a.id, seriesOf(value, a.id, a.currency, range, held.get(a.id), tx)] as const,
          );
          const series = Object.fromEntries(entries);
          const quality: Record<string, Record<string, AccountSeriesDayQuality>> = {};
          for (const a of rows) {
            const holdings = a.currency === 'EUR' && held.has(a.id);
            quality[a.id] = Object.fromEntries(
              series[a.id]!.points.map((point) => {
                const fact = holdings ? observations.get(a.id)?.get(point.date) : undefined;
                const missing = fact?.missing ?? null;
                const factQuality: AccountSeriesDayQuality = {
                  source: holdings ? 'account_value_eur' : 'native_cash',
                  currency: a.currency,
                  known:
                    point.date >= a.openingDate &&
                    missing === null &&
                    (fact?.quality ?? 'exact') !== 'missing' &&
                    Number.isSafeInteger(point.balanceCents),
                  quality: fact?.quality ?? 'exact',
                  missing,
                };
                return [point.date, factQuality] as const;
              }),
            );
          }
          // Metadata is a sibling: even this enriched read leaves every legacy series object exact.
          return { series, quality };
        }),
      );
    }
    const { ids, ...range } = readQuery(c, seriesBatchQuery);
    const value = cashValuer(db);
    const held = holdingAccountValueSeries(db, eachDay(range.from, range.to), ids);
    const wanted = ids ? new Set(ids) : undefined;
    const rows = db
      .select({ id: account.id, currency: account.currency })
      .from(account)
      .where(isNull(account.deletedAt))
      .orderBy(account.sortOrder, account.name, account.id)
      .all()
      .filter((a) => !wanted || wanted.has(a.id));
    return c.json({
      series: Object.fromEntries(
        rows.map((a) => [a.id, seriesOf(value, a.id, a.currency, range, held.get(a.id))]),
      ),
    });
  });

  app.get('/:id', (c) => {
    const { asOf } = readQuery(c, asOfQuery);
    const day = asOf ?? today();
    return c.json({ asOf: day, account: summary(c.req.param('id'), day) });
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
    assertTermOrder(
      patch.termStart === undefined ? current.termStart : patch.termStart,
      patch.termEnd === undefined ? current.termEnd : patch.termEnd,
    );
    const nextReferenceAccountId =
      patch.referenceAccountId === undefined
        ? current.referenceAccountId
        : patch.referenceAccountId;
    const referenceChanged =
      patch.referenceAccountId !== undefined &&
      patch.referenceAccountId !== current.referenceAccountId;
    const typeChanged = patch.type !== undefined && patch.type !== current.type;
    if (
      nextReferenceAccountId != null &&
      typeChanged &&
      type !== 'brokerage' &&
      type !== 'crypto' &&
      !referenceChanged
    )
      throw new ApiError(
        422,
        'invariant',
        'Bitte das Verrechnungskonto beim Wechsel des Kontotyps ausdrücklich lösen.',
      );
    if (
      patch.referenceAccountId !== undefined ||
      (patch.currency !== undefined && patch.currency !== current.currency) ||
      typeChanged
    )
      validateReferenceAccount(
        db,
        nextReferenceAccountId,
        id,
        type,
        patch.currency ?? current.currency,
      );
    if (patch.currency !== undefined && patch.currency !== current.currency) {
      const dependents = db
        .select({ id: account.id })
        .from(account)
        .where(and(eq(account.referenceAccountId, id), isNull(account.deletedAt)))
        .all();
      if (
        dependents.some((dependent) => {
          const owner = accounts.get(db, dependent.id);
          return owner && owner.currency !== patch.currency;
        })
      )
        throw new ApiError(
          422,
          'invariant',
          'Die Währung passt nicht mehr zu einem verknüpften Depot.',
        );
    }
    if (
      typeChanged &&
      !['checking', 'cash', 'savings'].includes(type) &&
      db
        .select({ id: account.id })
        .from(account)
        .where(and(eq(account.referenceAccountId, id), isNull(account.deletedAt)))
        .get()
    )
      throw new ApiError(
        422,
        'invariant',
        'Bitte zuerst die Verrechnungskonten der verknüpften Depots lösen.',
      );
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
    // A new type brings its usual role, unless the request names one.
    const next =
      patch.type !== undefined && patch.type !== current.type && patch.role === undefined
        ? { ...patch, role: DEFAULTS[patch.type].role }
        : patch;
    accounts.update(db, id, defined(next), ctx);
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

  const seriesOf = (
    value: ReturnType<typeof cashValuer>,
    id: string,
    currency: string,
    range: { from: string; to: string },
    /** EUR value per day of an account with positions (cash plus securities), see below. */
    held?: number[],
    executor: Executor = db,
  ) => ({
    accountId: id,
    currency,
    points: balanceSeries(executor, id, range).map((p, i) => {
      // An EUR account with positions follows its value (cash + market value), the number the
      // value column shows; every other account keeps its cash balance.
      const total = currency === 'EUR' ? held?.[i] : undefined;
      return total === undefined
        ? { ...p, valuation: value(p.balanceCents, currency, p.date) }
        : { ...p, balanceCents: total, valuation: value(total, currency, p.date) };
    }),
  });

  app.get('/:id/series', (c) => {
    const id = c.req.param('id');
    const range = readQuery(c, seriesQuery);
    // Only the currency is needed: no valuation of every account and position for it.
    const acct = db
      .select({ currency: account.currency })
      .from(account)
      .where(and(eq(account.id, id), isNull(account.deletedAt)))
      .get();
    if (!acct) throw new ApiError(404, 'not_found', `Account ${id} not found`);
    const value = cashValuer(db);
    const held = holdingAccountValueSeries(db, eachDay(range.from, range.to), [id]);
    const preview = accountPreview(
      db,
      id,
      acct.currency,
      today(),
      range.previewDays,
      range.horizon ? { horizon: range.horizon, levers: range.levers } : undefined,
    );
    return c.json({
      ...seriesOf(value, id, acct.currency, range, held.get(id)),
      ...(range.previewDays > 0 || range.horizon
        ? {
            previewPoints: preview.points.map((p) => ({
              ...p,
              valuation: value(p.balanceCents, acct.currency, today()),
            })),
            unavailableCurrencies: preview.unavailableCurrencies,
            ...(preview.previewCoverage ? { previewCoverage: preview.previewCoverage } : {}),
          }
        : {}),
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
        pendingBookings: preview.pendingBookings.map((row) => ({
          ...row,
          valuation: value(row.amountCents, currency, row.date),
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
    assertReconcileAdjustmentCategory(db, input.categoryId);
    const ctx = audit();
    const result = reconcileAccount(db, defined({ ...input, accountId: id, today: today() }), ctx);
    return c.json({ result, account: summary(id) }, 201);
  });

  return app;
}
