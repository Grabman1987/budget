import {
  accountSummaries,
  appSetting,
  createEntity,
  getEntity,
  updateEntity,
  readInbox,
  planMonthViews,
  valuation,
  bankSyncCandidate,
  booking,
  holdingValuationAsOf,
  listReconciliations,
  type Db,
} from '@budget/db';
import {
  closeSteps,
  lastDayOfMonth,
  monthCloseStateSchema,
  closeDecisionSchema,
  type CloseWork,
} from '@budget/domain';
import { and, desc, eq, isNull, lte } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { ACTOR, ApiError, readBody } from './http';
import { month } from './schemas';

const fingerprint = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const key = (m: string) => `month_close.${m}`;

export function readMonthClose(db: Db, m: string, today: string) {
  const end = lastDayOfMonth(m);
  const asOf = end < today ? end : today;
  const holdings = holdingValuationAsOf(db, asOf);
  const holdingAccounts = new Set(
    [...holdings.values, ...holdings.missingPricePositions, ...holdings.missingFxPositions].map(
      (h) => h.accountId,
    ),
  );
  const stored = getEntity(db, appSetting, key(m));
  const state = monthCloseStateSchema.parse(stored ? JSON.parse(stored.value) : {});
  const inbox = readInbox(db, asOf).entries.filter((e) => {
    let date = e.type === 'stored' ? e.createdAt.slice(0, 10) : e.date;
    if (e.type === 'stored' && e.refId) {
      if (e.refType === 'bank-sync-candidate')
        date =
          db.select().from(bankSyncCandidate).where(eq(bankSyncCandidate.id, e.refId)).get()
            ?.date ?? date;
      if (e.refType === 'booking')
        date = db.select().from(booking).where(eq(booking.id, e.refId)).get()?.date ?? date;
    }
    return date.slice(0, 7) === m;
  });
  const accounts = accountSummaries(db, asOf)
    .filter(
      (a) =>
        !a.closedAt &&
        a.openingDate <= asOf &&
        (a.onBudget ||
          a.type === 'credit_card' ||
          ((a.type === 'p2p' || a.type === 'other_asset') && !holdingAccounts.has(a.id))),
    )
    .map((a) => {
      const manual = a.type === 'p2p' || a.type === 'other_asset';
      const value = manual
        ? db
            .select()
            .from(valuation)
            .where(
              and(
                eq(valuation.accountId, a.id),
                isNull(valuation.deletedAt),
                lte(valuation.date, asOf),
              ),
            )
            .orderBy(desc(valuation.date))
            .get()
        : undefined;
      const reconciled = listReconciliations(db, a.id).some((r) => r.date >= end);
      return {
        ...a,
        manual,
        valueCents: value?.valueCents ?? a.balanceCents,
        lastValuedOn: value?.date ?? null,
        done: manual ? value?.date === end : reconciled,
      };
    });
  const plan = planMonthViews(db, [m], {}, today)[m]!;
  const overspent = plan.summary.envelopes.filter((e) => e.overspentCents > 0);
  const work: CloseWork[] = [
    ...inbox.map((e) => ({ step: 1 as const, id: e.id, fingerprint: fingerprint(e) })),
    ...accounts
      .filter((a) => !a.done)
      .map((a) => ({
        step: 2 as const,
        id: a.id,
        fingerprint: fingerprint([
          a.balanceCents,
          a.clearedCents,
          a.lastReconciledOn,
          a.lastValuedOn,
          a.valueCents,
        ]),
      })),
    ...overspent.map((e) => ({
      step: 3 as const,
      id: e.categoryId,
      fingerprint: fingerprint(e.overspentCents),
    })),
  ];
  return {
    month: m,
    end,
    asOf,
    state,
    work,
    inbox,
    accounts,
    overspent,
    steps: closeSteps(work, state.decisions),
  };
}

export function monthCloseRoutes(db: Db, today: () => string): Hono {
  const app = new Hono();
  app.get('/:month', (c) => c.json(readMonthClose(db, month.parse(c.req.param('month')), today())));
  app.patch('/:month', async (c) => {
    const m = month.parse(c.req.param('month'));
    const patch = await readBody(
      c,
      z
        .strictObject({
          currentStep: z.int().min(1).max(5).optional(),
          decisions: z.array(closeDecisionSchema).max(1000).optional(),
        })
        .refine((v) => v.currentStep !== undefined || v.decisions !== undefined),
    );
    const ctx = { actor: ACTOR, groupId: randomUUID() };
    const result = db.transaction((tx) => {
      const view = readMonthClose(tx, m, today());
      for (const d of patch.decisions ?? []) {
        if (
          !view.work.some(
            (w) => w.step === d.step && w.id === d.id && w.fingerprint === d.fingerprint,
          )
        )
          throw new ApiError(409, 'stale_close', 'Der Stand hat sich geändert. Bitte neu laden.');
      }
      const decisions = new Map(view.state.decisions.map((d) => [`${d.step}:${d.id}`, d]));
      for (const d of patch.decisions ?? []) decisions.set(`${d.step}:${d.id}`, d);
      const state = monthCloseStateSchema.parse({
        currentStep: patch.currentStep ?? view.state.currentStep,
        decisions: [...decisions.values()],
      });
      const current = getEntity(tx, appSetting, key(m));
      if (current) updateEntity(tx, appSetting, key(m), { value: JSON.stringify(state) }, ctx);
      else createEntity(tx, appSetting, { id: key(m), value: JSON.stringify(state) }, ctx);
      return state;
    });
    return c.json({ state: result, groupId: ctx.groupId });
  });
  return app;
}
