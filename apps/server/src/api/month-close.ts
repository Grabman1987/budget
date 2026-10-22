import {
  appSetting,
  createEntity,
  getEntity,
  updateEntity,
  readMonthClose,
  confirmMonthCloseReconciliation,
  reconcileAccount,
  type Db,
} from '@budget/db';
import {
  closeResultSnapshotSchema,
  monthCloseStateSchema,
  closeDecisionSchema,
} from '@budget/domain';
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { ACTOR, ApiError, defined, readBody } from './http';
import { assertReconcileAdjustmentCategory } from './accounts';
import { month, day, reconcileBody } from './schemas';

// Preserve existing direct imports while the implementation lives below HTTP.
export { readMonthClose };
const key = (m: string) => `month_close.${m}`;

export function monthCloseRoutes(db: Db, today: () => string): Hono {
  const app = new Hono();
  app.get('/:month', (c) => c.json(readMonthClose(db, month.parse(c.req.param('month')), today())));
  app.post('/:month/reconcile-unchanged', async (c) => {
    const m = month.parse(c.req.param('month')), currentToday = today();
    const body = await readBody(c, z.object({
      accountIds: z.array(z.string().min(1).max(64)).min(1).max(500)
        .refine((ids) => new Set(ids).size === ids.length, 'Duplicate accounts are not allowed'),
      asOf: day, revision: z.string().regex(/^[a-f0-9]{64}$/),
    }).strict());
    const ctx = { actor: ACTOR, groupId: randomUUID() };
    const result = db.transaction((tx) => {
      const view = readMonthClose(tx, m, currentToday);
      return confirmMonthCloseReconciliation(tx, { ...body, month: m, today: currentToday },
        view.accounts.map((a) => ({ id: a.id, manual: a.manual, done: a.done, hasHoldings: a.holdingValued })), ctx);
    });
    return c.json({ ...result, changedCount: result.reconciliations.length }, 201);
  });

  app.post('/:month/accounts/:id/reconciliation', async (c) => {
    const m = month.parse(c.req.param('month')), id = c.req.param('id'), currentToday = today();
    const { sourceRevision, ...input } = await readBody(c,
      reconcileBody.extend({ sourceRevision: z.string().regex(/^[a-f0-9]{64}$/) }).strict());
    const ctx = { actor: ACTOR, groupId: randomUUID() };
    const result = db.transaction((tx) => {
      const view = readMonthClose(tx, m, currentToday);
      if (sourceRevision !== view.sourceRevision || input.date !== view.asOf)
        throw new ApiError(409, 'stale_close', 'Der Abschlussstand hat sich geändert. Bitte neu laden.');
      if (!view.accounts.some((a) => a.id === id && !a.manual && !a.done))
        throw new ApiError(409, 'close_account_unavailable', 'Dieses Konto bleibt außerhalb dieser Kontoprüfung. Bitte den Abschluss neu laden.');
      assertReconcileAdjustmentCategory(tx, input.categoryId);
      const checked = reconcileAccount(tx, defined({ ...input, accountId: id, today: currentToday,
        note: input.note?.trim() || null }), ctx);
      // Enforce the actual residual difference, after the existing explicit duplicate/pending
      // actions. Missing reason rolls this whole request back; this is not a preview dry-run.
      if (checked.adjustmentBookingId !== null && checked.differenceCents !== 0 && !input.note?.trim())
        throw new ApiError(400, 'reconciliation_reason_required', 'Gib einen Grund für den verbleibenden Ausgleich an.');
      return checked;
    });
    return c.json({ result }, 201);
  });

  app.patch('/:month', async (c) => {
    const m = month.parse(c.req.param('month'));
    const patch = await readBody(
      c,
      z
        .strictObject({
          currentStep: z.int().min(1).max(5).optional(),
          decisions: z.array(closeDecisionSchema).max(1000).optional(),
          close: z.literal(true).optional(),
          sourceRevision: z.string().regex(/^[a-f0-9]{64}$/).optional(),
        })
        .refine((v) => v.currentStep !== undefined || v.decisions !== undefined || v.close)
        .refine((v) => !v.close || (v.currentStep === undefined && v.decisions === undefined),
          'Close separately after reviewing the current decisions')
        .refine((v) => !v.close || v.sourceRevision !== undefined,
          'Closing requires the reviewed source revision'),
    );
    const ctx = { actor: ACTOR, groupId: randomUUID() };
    const result = db.transaction((tx) => {
      const view = readMonthClose(tx, m, today());
      if (patch.close && patch.sourceRevision !== view.sourceRevision)
        throw new ApiError(409, 'stale_close', 'Der Monatsstand hat sich geändert. Bitte neu laden und erneut prüfen.');
      if (patch.close && view.state.snapshot?.sourceRevision === view.sourceRevision)
        return { state: view.state, changedCount: 0 };
      if (
        patch.close &&
        (view.end > today() || view.steps.slice(0, 4).some((s) => s.status === 'open'))
      )
        throw new ApiError(
          409,
          'close_incomplete',
          'Prüfe zuerst die offenen Schritte und verteile das vorhandene Geld für den nächsten Monat vollständig. Der Monatsletzte muss erreicht sein.',
        );
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
        ...view.state,
        currentStep: patch.close ? 5 : (patch.currentStep ?? view.state.currentStep),
        decisions: [...decisions.values()],
        ...(patch.close && {
          closedOn: view.state.closedOn ?? today(),
          closedAt: new Date().toISOString(),
          snapshot: closeResultSnapshotSchema.parse({
            version: 1, sourceRevision: view.sourceRevision, month: m,
            checkedAccounts: view.result!.checkedAccounts,
            totalAccounts: view.result!.totalAccounts,
            deferredAccounts: view.result!.deferredAccounts,
            assignedCents: view.result!.assignedCents,
            overspentCount: view.result!.overspentCount,
            overspentCents: view.result!.overspentCents,
            carryInCents: view.result!.carryInCents,
            destinationMonth: view.result!.destinationMonth,
            savingsRateBp: view.result!.report.result.savingsRateBp,
            allocationSavingsPercent: view.result!.report.allocation.incomeCents > 0
              ? view.result!.report.allocation.shares.future : null,
            spentCents: view.result!.report.pace.figures.spentCents,
            plannedCents: view.result!.report.pace.figures.limitCents,
          }),
        }),
      });
      const current = getEntity(tx, appSetting, key(m));
      const value = JSON.stringify(state);
      if (current?.value === value) return { state, changedCount: 0 };
      if (current) updateEntity(tx, appSetting, key(m), { value }, ctx);
      else createEntity(tx, appSetting, { id: key(m), value }, ctx);
      return { state, changedCount: 1 };
    });
    return c.json({ ...result, groupId: ctx.groupId });
  });
  return app;
}
