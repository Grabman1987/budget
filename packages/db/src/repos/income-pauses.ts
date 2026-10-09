import { incomePause, expectedPayment, expectedPaymentVersion } from '../schema';
import { and, asc, desc, eq, gte, isNull, lte, ne } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { withGroup, type AuditContext } from './audit';
import { createEntity, getEntity, softDeleteEntity, updateEntity } from './entities';
import { CategoryRuleError, ConflictError, EntityNotFoundError } from './errors';
import { runInTransaction, type Executor } from './types';

export interface IncomePauseInput {
  sourceId: string;
  startDate: string;
  endDate: string;
}

export type IncomePausePatch = Partial<IncomePauseInput>;

type IncomePauseRow = typeof incomePause.$inferSelect;

function checkRange(startDate: string, endDate: string): void {
  if (startDate > endDate)
    throw new CategoryRuleError('Das Ende der Einkommenspause darf nicht vor dem Beginn liegen.');
}

function checkSource(db: Executor, sourceId: string, today: string): void {
  const payment = getEntity(db, expectedPayment, sourceId);
  if (!payment) throw new EntityNotFoundError('expected_payment', sourceId);
  if (
    payment.kind !== 'inflow' ||
    (payment.startDate !== null && payment.startDate > today) ||
    (payment.endDate !== null && payment.endDate < today)
  )
    throw new CategoryRuleError('Eine Pause benötigt eine aktive, wiederkehrende Einnahmequelle.');

  const version = db
    .select()
    .from(expectedPaymentVersion)
    .where(
      and(
        eq(expectedPaymentVersion.expectedPaymentId, sourceId),
        isNull(expectedPaymentVersion.deletedAt),
        lte(expectedPaymentVersion.validFrom, today),
      ),
    )
    .orderBy(desc(expectedPaymentVersion.validFrom))
    .get();
  if (!version || version.currency !== 'EUR')
    throw new CategoryRuleError('Eine Pause benötigt eine native EUR-Einnahmequelle.');
}

function checkOverlap(
  db: Executor,
  sourceId: string,
  startDate: string,
  endDate: string,
  excludeId?: string,
): void {
  const overlap = db
    .select({ id: incomePause.id })
    .from(incomePause)
    .where(
      and(
        eq(incomePause.expectedPaymentId, sourceId),
        isNull(incomePause.deletedAt),
        lte(incomePause.startDate, endDate),
        gte(incomePause.endDate, startDate),
        excludeId ? ne(incomePause.id, excludeId) : undefined,
      ),
    )
    .get();
  if (overlap)
    throw new ConflictError(
      'Pausenintervalle derselben Einnahmequelle dürfen sich nicht überschneiden.',
    );
}

export function listIncomePauses(db: Executor): IncomePauseRow[] {
  return db
    .select()
    .from(incomePause)
    .where(isNull(incomePause.deletedAt))
    .orderBy(asc(incomePause.startDate), asc(incomePause.expectedPaymentId), asc(incomePause.id))
    .all();
}

export function createIncomePause(
  db: Executor,
  input: IncomePauseInput,
  today: string,
  ctx: AuditContext,
): { pause: IncomePauseRow; groupId: string } {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    checkRange(input.startDate, input.endDate);
    checkSource(tx, input.sourceId, today);
    checkOverlap(tx, input.sourceId, input.startDate, input.endDate);
    return {
      pause: createEntity(
        tx,
        incomePause,
        {
          id: randomUUID(),
          expectedPaymentId: input.sourceId,
          startDate: input.startDate,
          endDate: input.endDate,
        },
        grouped,
      ),
      groupId: grouped.groupId,
    };
  });
}

export function updateIncomePause(
  db: Executor,
  id: string,
  patch: IncomePausePatch,
  today: string,
  ctx: AuditContext,
): { pause: IncomePauseRow; groupId: string } {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const current = getEntity(tx, incomePause, id);
    if (!current) throw new EntityNotFoundError('income_pause', id);
    const sourceId = patch.sourceId ?? current.expectedPaymentId;
    const startDate = patch.startDate ?? current.startDate;
    const endDate = patch.endDate ?? current.endDate;
    checkRange(startDate, endDate);
    checkSource(tx, sourceId, today);
    checkOverlap(tx, sourceId, startDate, endDate, id);
    return {
      pause: updateEntity(
        tx,
        incomePause,
        id,
        { expectedPaymentId: sourceId, startDate, endDate },
        grouped,
      ),
      groupId: grouped.groupId,
    };
  });
}

export function deleteIncomePause(
  db: Executor,
  id: string,
  ctx: AuditContext,
): { groupId: string } {
  const grouped = withGroup(ctx);
  softDeleteEntity(db, incomePause, id, grouped);
  return { groupId: grouped.groupId };
}
