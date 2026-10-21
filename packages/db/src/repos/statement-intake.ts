import { randomUUID } from 'node:crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import {
  reviewStatement,
  statementFactsSchema,
  statementProposalSchema,
  statementFieldsSchema,
  type StatementCas,
  type StatementIntakeView,
  type StatementProposal,
  type StatementReply,
} from '@budget/domain';
import { account, receipt, statementIntake } from '../schema';
import {
  history,
  insertTracked,
  nowIso,
  updateTracked,
  withGroup,
  type AuditContext,
} from './audit';
import { addReceipt, getReceipt } from './receipts';
import { ConflictError, EntityNotFoundError } from './errors';
import { runInTransaction, type Executor } from './types';
import { assertStatementSourceWrite } from './statement-settlement-invariants';

export function statementAccount(db: Executor, id: string) {
  if (
    !db
      .select()
      .from(account)
      .where(and(eq(account.id, id), isNull(account.deletedAt)))
      .get()
  )
    throw new EntityNotFoundError('account', id);
}
function boundedProposal(p: StatementProposal) {
  statementProposalSchema.parse(p);
  if (
    p.schemaVersion !== 1 ||
    p.parserVersion !== 1 ||
    Buffer.byteLength(JSON.stringify(p), 'utf8') > 16384 ||
    p.relatedIntakeIds.length > 8 ||
    p.warnings.length > 16
  )
    throw new ConflictError('Ungültiger Abrechnungsvorschlag.');
  for (const f of Object.values(p.fields))
    if (f.candidates.length > 4 || f.evidence.page !== null)
      throw new ConflictError('Ungültiger Abrechnungsvorschlag.');
  if (p.draft) statementFactsSchema.parse(p.draft);
  return p;
}
export function getStatementIntake(db: Executor, id: string): StatementIntakeView {
  const r = db.select().from(statementIntake).where(eq(statementIntake.id, id)).get();
  if (!r) throw new EntityNotFoundError('statement_intake', id);
  return {
    id: r.id,
    accountId: r.accountId,
    receiptId: r.receiptId,
    sha256: r.sha256,
    status: r.status,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    deletedAt: r.deletedAt,
    revision: history(db, 'statement_intake', id)[0]?.id ?? '',
    proposal: boundedProposal(JSON.parse(r.proposalJson) as StatementProposal),
    reviewed: r.reviewedJson
      ? {
          fields: statementFieldsSchema.parse(
            (JSON.parse(r.reviewedJson) as { fields: unknown }).fields,
          ),
        }
      : null,
  };
}
export function listStatementIntakes(db: Executor, accountId: string) {
  statementAccount(db, accountId);
  return db
    .select({ id: statementIntake.id })
    .from(statementIntake)
    .where(and(eq(statementIntake.accountId, accountId), isNull(statementIntake.deletedAt)))
    .orderBy(desc(statementIntake.createdAt), statementIntake.id)
    .limit(50)
    .all()
    .map((r) => getStatementIntake(db, r.id));
}
export function findStatementIntake(db: Executor, sha256: string) {
  const r = db
    .select({ id: statementIntake.id })
    .from(statementIntake)
    .where(eq(statementIntake.sha256, sha256))
    .get();
  return r ? getStatementIntake(db, r.id) : undefined;
}
export function assertStatementCas(db: Executor, id: string, cas: StatementCas, deleted = false) {
  const r = getStatementIntake(db, id);
  if (
    r.revision !== cas.revision ||
    r.sha256 !== cas.sha256 ||
    r.accountId !== cas.accountId ||
    (!deleted && r.deletedAt)
  )
    throw new ConflictError('Die Abrechnung wurde geändert. Bitte neu laden.');
  return r;
}
export function stageStatementIntake(
  db: Executor,
  input: {
    accountId: string;
    sha256: string;
    sizeBytes: number;
    filename: string;
    proposal: StatementProposal;
  },
  ctx: AuditContext,
): StatementReply {
  const group = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    statementAccount(tx, input.accountId);
    const old = findStatementIntake(tx, input.sha256);
    if (old) {
      if (old.accountId !== input.accountId || old.deletedAt)
        throw new ConflictError(
          'Diese Datei ist bereits einer Abrechnung zugeordnet. Bitte die vorhandene Abrechnung prüfen.',
        );
      return { intake: old, duplicate: true, groupId: null };
    }
    const proposal = boundedProposal(input.proposal);
    if (proposal.sha256 !== input.sha256)
      throw new ConflictError('Abrechnungsquelle stimmt nicht überein.');
    const fact = (key: 'reference' | 'periodFrom' | 'periodTo') =>
      sql`CASE WHEN ${statementIntake.reviewedJson} IS NOT NULL THEN json_extract(${statementIntake.reviewedJson},${'$.fields.' + key + '.value'}) WHEN json_type(${statementIntake.proposalJson},'$.draft')='object' THEN json_extract(${statementIntake.proposalJson},${'$.draft.' + key}) ELSE json_extract(${statementIntake.proposalJson},${'$.fields.' + key + '.value'}) END`;
    const related = tx
      .select({ id: statementIntake.id })
      .from(statementIntake)
      .where(
        and(
          eq(statementIntake.accountId, input.accountId),
          isNull(statementIntake.deletedAt),
          sql`(${fact('reference')}=${proposal.fields.reference.value} OR lower(${fact('reference')})=${proposal.fields.reference.value?.toLowerCase() ?? null} OR (${fact('periodFrom')}=${proposal.fields.periodFrom.value} AND ${fact('periodTo')}=${proposal.fields.periodTo.value}))`,
        ),
      )
      .orderBy(desc(statementIntake.createdAt), statementIntake.id)
      .limit(8)
      .all()
      .map((r) => r.id);
    const saved = {
      ...proposal,
      relatedIntakeIds: related,
      warnings: [
        ...new Set([...proposal.warnings, ...(related.length ? ['possible_amendment'] : [])]),
      ].slice(0, 16),
    };
    const source = addReceipt(
      tx,
      {
        sha256: input.sha256,
        mime: 'application/pdf',
        sizeBytes: input.sizeBytes,
        originalFilename: input.filename,
      },
      undefined,
      group,
    );
    const id = randomUUID();
    insertTracked(
      tx,
      statementIntake,
      {
        id,
        sha256: input.sha256,
        accountId: input.accountId,
        receiptId: source.receipt.id,
        proposalJson: JSON.stringify(boundedProposal(saved)),
        reviewedJson: null,
        status: 'pending',
      },
      group,
    );
    return { intake: getStatementIntake(tx, id), groupId: group.groupId ?? null };
  });
}
export function mutateStatementIntake(
  db: Executor,
  id: string,
  cas: StatementCas,
  action: 'reparse' | 'review' | 'reopen' | 'reject' | 'delete' | 'restore',
  input: {
    proposal?: StatementProposal;
    facts?: unknown;
    savePending?: boolean | undefined;
    targetAccountId?: string | undefined;
  },
  ctx: AuditContext,
): StatementReply {
  const group = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const current = assertStatementCas(tx, id, cas, action === 'restore' || action === 'delete');
    const patch: Partial<typeof statementIntake.$inferInsert> = {};
    if (action === 'restore') {
      if (!current.deletedAt) return { intake: current, groupId: null };
      const source = tx.select().from(receipt).where(eq(receipt.id, current.receiptId)).get();
      if (!source || source.sha256 !== current.sha256)
        throw new ConflictError('Die Abrechnungsquelle ist nicht verfügbar.');
      updateTracked(tx, receipt, [source.id], { deletedAt: null }, group, 'restore');
      patch.deletedAt = null;
    } else if (action === 'delete') {
      if (current.deletedAt) return { intake: current, groupId: null };
      const refs = tx.get<{ used: number }>(
        sql`SELECT EXISTS(SELECT 1 FROM booking_receipt br WHERE br.receipt_id=${current.receiptId} AND br.deleted_at IS NULL) OR EXISTS(SELECT 1 FROM payslip WHERE receipt_id=${current.receiptId} AND deleted_at IS NULL) OR EXISTS(SELECT 1 FROM payslip_intake WHERE receipt_id=${current.receiptId} AND deleted_at IS NULL) OR EXISTS(SELECT 1 FROM statement_intake WHERE receipt_id=${current.receiptId} AND id!=${id} AND deleted_at IS NULL) AS used`,
      );
      if (refs?.used) throw new ConflictError('Der Beleg wird noch verwendet.');
      patch.deletedAt = nowIso();
      updateTracked(
        tx,
        receipt,
        [current.receiptId],
        { deletedAt: patch.deletedAt },
        group,
        'delete',
      );
    } else if (action === 'reopen') {
      patch.status = 'pending';
      patch.reviewedJson = null;
    } else if (action === 'reject') {
      patch.status = 'rejected';
      patch.reviewedJson = null;
    } else {
      if (
        action === 'review' &&
        current.status === 'reviewed' &&
        !input.savePending &&
        (!input.targetAccountId || input.targetAccountId === current.accountId)
      ) {
        const same = reviewStatement(current.proposal, input.facts, false);
        if (JSON.stringify(same) === JSON.stringify(current.reviewed))
          return { intake: current, groupId: null };
      }
      if (current.status !== 'pending')
        throw new ConflictError('Die Abrechnung zuerst erneut öffnen.');
      if (getReceipt(tx, current.receiptId).sha256 !== current.sha256)
        throw new ConflictError('Abrechnungsquelle stimmt nicht überein.');
      if (action === 'reparse') {
        if (!input.proposal || input.proposal.sha256 !== current.sha256)
          throw new ConflictError('Ungültige Quelle.');
        patch.proposalJson = JSON.stringify(
          boundedProposal({
            ...input.proposal,
            relatedIntakeIds: current.proposal.relatedIntakeIds,
          }),
        );
      } else {
        const facts = statementFactsSchema.parse(input.facts);
        let reviewed;
        try {
          reviewed = reviewStatement(current.proposal, facts, !input.savePending);
        } catch {
          throw new ConflictError(
            'Bitte die Abrechnungsdaten einschließlich Einzugsdatum vervollständigen.',
          );
        }
        if (input.targetAccountId) {
          statementAccount(tx, input.targetAccountId);
          patch.accountId = input.targetAccountId;
        }
        if (input.savePending)
          patch.proposalJson = JSON.stringify(
            boundedProposal({ ...current.proposal, draft: facts }),
          );
        else {
          patch.status = 'reviewed';
          patch.reviewedJson = JSON.stringify(reviewed);
        }
      }
    }
    const row = tx.select().from(statementIntake).where(eq(statementIntake.id, id)).get()!;
    if (Object.entries(patch).every(([k, v]) => row[k as keyof typeof row] === v))
      return { intake: current, groupId: null };
    assertStatementSourceWrite(tx, id, input.targetAccountId, action);
    updateTracked(
      tx,
      statementIntake,
      [id],
      patch,
      group,
      action === 'delete' ? 'delete' : action === 'restore' ? 'restore' : 'update',
    );
    return { intake: getStatementIntake(tx, id), groupId: group.groupId ?? null };
  });
}
