import { createHash, randomUUID } from 'node:crypto';
import { and, asc, eq, isNull } from 'drizzle-orm';
import {
  assignmentRuleSchema,
  assignmentMatchSchema,
  assignmentActionsSchema,
  assignmentSplits,
  learnAssignmentSplits,
  bankAliasKey,
  bankAssignmentText,
  cleanBankPayee,
  DEFAULT_PAYEE_CLEANUP,
  matchesAssignment,
  payeeCleanupSchema,
  type AssignmentRuleInput,
  type AssignmentRow,
  type PayeeCleanup,
} from '@budget/domain';
import {
  account,
  assignmentRule,
  bankPayeeAlias,
  bankPayeeCleanup,
  bankSyncAccount,
  bankSyncCandidate,
  booking,
  inboxItem,
  payee,
  category,
} from '../schema';
import { insertTracked, updateTracked, withGroup, type AuditContext } from './audit';
import { ConflictError, EntityNotFoundError } from './errors';
import {
  getBooking,
  updateBooking,
  markBankBookingTransfer,
  type BookingPatch,
  type SplitInput,
} from './bookings';
import { runInTransaction, type Executor } from './types';

export type AssignmentRule = AssignmentRuleInput & {
  id: string;
  priority: number;
  revision: string;
};
export function listAssignmentRules(db: Executor): AssignmentRule[] {
  return db
    .select()
    .from(assignmentRule)
    .where(isNull(assignmentRule.deletedAt))
    .orderBy(asc(assignmentRule.priority), asc(assignmentRule.id))
    .all()
    .map((r) => ({
      id: r.id,
      name: r.name,
      priority: r.priority,
      revision: createHash('sha256')
        .update(
          JSON.stringify([
            r.matchJson,
            r.actionJson,
            r.payeeId,
            r.categoryId,
            r.enabled,
            r.automatic,
          ]),
        )
        .digest('hex'),
      enabled: r.enabled,
      automatic: r.automatic,
      match: assignmentMatchSchema.parse(JSON.parse(r.matchJson)),
      actions: assignmentActionsSchema.parse({
        ...JSON.parse(r.actionJson),
        ...(r.payeeId !== null ? { payeeId: r.payeeId } : {}),
        ...(r.categoryId !== null ? { categoryId: r.categoryId } : {}),
      }),
    }));
}

function assertReferences(db: Executor, input: AssignmentRuleInput) {
  const live = (table: typeof payee | typeof category | typeof account, id: string) => {
    const row = db
      .select()
      .from(table)
      .where(and(eq(table.id, id), isNull(table.deletedAt)))
      .get();
    if (
      !row ||
      ('systemKind' in row && row.systemKind !== null) ||
      ('closedAt' in row && row.closedAt) ||
      ('kind' in row && row.kind === 'card_payment')
    )
      throw new ConflictError('Empfänger, Kategorie oder Konto nicht verfügbar.');
  };
  for (const c of input.match.conditions) {
    if (c.type === 'payee') live(payee, c.payeeId);
    if (c.type === 'account') live(account, c.accountId);
  }
  if (input.actions.payeeId) live(payee, input.actions.payeeId);
  if (input.actions.categoryId) live(category, input.actions.categoryId);
  for (const s of input.actions.splits ?? []) live(category, s.categoryId);
  if (input.actions.transferAccountId) live(account, input.actions.transferAccountId);
}

export function saveAssignmentRule(
  db: Executor,
  id: string | null,
  input: AssignmentRuleInput,
  ctx: AuditContext,
) {
  input = assignmentRuleSchema.parse(input);
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    assertReferences(tx, input);
    const rules = listAssignmentRules(tx);
    if (id && !rules.some((r) => r.id === id)) throw new EntityNotFoundError('assignment_rule', id);
    if (!id && rules.length >= 100) throw new ConflictError('Höchstens 100 Zuordnungsregeln.');
    const { payeeId, categoryId, ...other } = input.actions;
    const values = {
      name: input.name,
      matchJson: JSON.stringify(input.match),
      actionJson: JSON.stringify({
        ...other,
        ...(payeeId === null ? { payeeId: null } : {}),
        ...(categoryId === null ? { categoryId: null } : {}),
      }),
      payeeId: payeeId ?? null,
      categoryId: categoryId ?? null,
      enabled: input.enabled,
      automatic: input.automatic,
    };
    const ruleId = id ?? randomUUID();
    if (id) updateTracked(tx, assignmentRule, [id], values, grouped);
    else
      insertTracked(
        tx,
        assignmentRule,
        { id: ruleId, ...values, priority: Math.max(-1, ...rules.map((r) => r.priority)) + 1 },
        grouped,
      );
    return {
      id: ruleId,
      revision: listAssignmentRules(tx).find((r) => r.id === ruleId)!.revision,
      groupId: grouped.groupId,
    };
  });
}

export function reorderAssignmentRules(db: Executor, ids: string[], ctx: AuditContext) {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const existing = listAssignmentRules(tx).map((r) => r.id);
    if (
      new Set(ids).size !== ids.length ||
      ids.length !== existing.length ||
      ids.some((id) => !existing.includes(id))
    )
      throw new ConflictError('Die Regelliste hat sich geändert. Bitte neu laden.');
    ids.forEach((id, priority) => updateTracked(tx, assignmentRule, [id], { priority }, grouped));
    return { groupId: grouped.groupId };
  });
}

export function removeAssignmentRule(db: Executor, id: string, ctx: AuditContext) {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    if (!listAssignmentRules(tx).some((r) => r.id === id))
      throw new EntityNotFoundError('assignment_rule', id);
    updateTracked(
      tx,
      assignmentRule,
      [id],
      { deletedAt: new Date().toISOString() },
      grouped,
      'delete',
    );
    return { groupId: grouped.groupId };
  });
}

export function readPayeeCleanup(db: Executor, sourceId: string): PayeeCleanup {
  const row = db
    .select()
    .from(bankPayeeCleanup)
    .where(and(eq(bankPayeeCleanup.id, sourceId), isNull(bankPayeeCleanup.deletedAt)))
    .get();
  return row ? payeeCleanupSchema.parse(JSON.parse(row.configJson)) : DEFAULT_PAYEE_CLEANUP;
}
export function listPayeeCleanup(db: Executor) {
  return [
    { id: '', label: 'Bankbuchungen ohne Datenquelle' },
    ...db
      .select({ id: bankSyncAccount.id, label: bankSyncAccount.label })
      .from(bankSyncAccount)
      .all(),
  ].map((s) => ({ ...s, config: readPayeeCleanup(db, s.id) }));
}
export function savePayeeCleanup(
  db: Executor,
  sourceId: string,
  config: PayeeCleanup,
  ctx: AuditContext,
) {
  config = payeeCleanupSchema.parse(config);
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    if (
      sourceId &&
      !tx.select().from(bankSyncAccount).where(eq(bankSyncAccount.id, sourceId)).get()
    )
      throw new EntityNotFoundError('bank_sync_account', sourceId);
    const values = { configJson: JSON.stringify(config), deletedAt: null };
    if (tx.select().from(bankPayeeCleanup).where(eq(bankPayeeCleanup.id, sourceId)).get())
      updateTracked(tx, bankPayeeCleanup, [sourceId], values, grouped);
    else insertTracked(tx, bankPayeeCleanup, { id: sourceId, ...values }, grouped);
    return { groupId: grouped.groupId };
  });
}

export function learnBankPayee(
  db: Executor,
  sourceId: string,
  raw: string,
  payeeId: string,
  ctx: AuditContext,
) {
  const recipient = db
    .select()
    .from(payee)
    .where(and(eq(payee.id, payeeId), isNull(payee.deletedAt)))
    .get();
  if (!recipient || recipient.systemKind !== null)
    throw new ConflictError('Empfänger nicht verfügbar.');
  const rawKey = bankAliasKey(raw);
  if (!rawKey) return;
  const id = createHash('sha256')
    .update(JSON.stringify([sourceId, rawKey]))
    .digest('hex');
  const existing = db.select().from(bankPayeeAlias).where(eq(bankPayeeAlias.id, id)).get();
  if (existing) updateTracked(db, bankPayeeAlias, [id], { payeeId, deletedAt: null }, ctx);
  else insertTracked(db, bankPayeeAlias, { id, sourceId, rawKey, payeeId }, ctx);
}

export function suggestedBankPayee(
  db: Executor,
  sourceId: string,
  rawPayee: string | null,
  rawText: string,
) {
  const cleaned = cleanBankPayee(rawPayee, rawText, readPayeeCleanup(db, sourceId));
  const aliases = db
    .select()
    .from(bankPayeeAlias)
    .where(and(eq(bankPayeeAlias.sourceId, sourceId), isNull(bankPayeeAlias.deletedAt)))
    .all();
  const alias = aliases.find((a) => a.rawKey === bankAliasKey(rawPayee || rawText));
  const payees = db
    .select()
    .from(payee)
    .where(and(isNull(payee.deletedAt), isNull(payee.systemKind)))
    .all();
  const named = payees.filter((p) => bankAliasKey(p.name) === bankAliasKey(cleaned));
  const found = alias
    ? payees.find((p) => p.id === alias.payeeId)
    : named.length === 1
      ? named[0]
      : undefined;
  return {
    cleaned,
    payeeId: found?.id ?? null,
    payeeName: found?.name ?? null,
    learned: !!alias && !!found,
  };
}

export function assignmentSuggestions(db: Executor, row: AssignmentRow) {
  return listAssignmentRules(db)
    .filter((r) => r.enabled && matchesAssignment(r.match, row))
    .map((rule) => {
      let unavailable: string | null = null;
      try {
        assertReferences(db, rule);
        const target = rule.actions.transferAccountId;
        if (target === row.accountId)
          throw new ConflictError('Gegenkonto muss ein anderes Konto sein.');
        if (target) {
          const source = db.select().from(account).where(eq(account.id, row.accountId)).get();
          const destination = db.select().from(account).where(eq(account.id, target)).get();
          if (!source || !destination || source.currency !== destination.currency)
            throw new ConflictError('Umbuchung benötigt Konten derselben Währung.');
        }
      } catch {
        unavailable = 'Regelziele nicht verfügbar. Regel bearbeiten.';
      }
      return { ...rule, unavailable };
    });
}

export function readAssignmentCandidate(db: Executor, id: string) {
  const candidate = db.select().from(bankSyncCandidate).where(eq(bankSyncCandidate.id, id)).get();
  const item = db.select().from(inboxItem).where(eq(inboxItem.id, id)).get();
  if (!candidate || !item || item.resolvedAt)
    throw new ConflictError('Bankumsatz nicht mehr offen.');
  const cleanup = suggestedBankPayee(
    db,
    candidate.sourceId ?? '',
    candidate.rawPayee,
    candidate.memo,
  );
  const counterparts = db
    .select()
    .from(booking)
    .where(
      and(
        eq(booking.accountId, candidate.accountId),
        eq(booking.date, candidate.date),
        eq(booking.amountCents, candidate.amountCents),
        eq(booking.source, 'bank'),
        isNull(booking.bankRawText),
        isNull(booking.deletedAt),
      ),
    )
    .all()
    .filter((b) => b.transferId && b.importKey?.startsWith('bank-transfer:'));
  if (counterparts.length > 1)
    throw new ConflictError('Mehrere bereits gebuchte Gegenumsätze passen. Bitte einzeln prüfen.');
  const existingTransfer = counterparts[0]
    ? { bookingId: counterparts[0].id, transferId: counterparts[0].transferId }
    : null;
  return {
    candidate,
    candidateRevision: createHash('sha256')
      .update(JSON.stringify([candidate, cleanup]))
      .digest('hex'),
    cleanup,
    existingTransfer,
    suggestions: assignmentSuggestions(db, {
      ...candidate,
      rawText: bankAssignmentText(candidate.rawPayee, candidate.memo),
      payeeId: cleanup.payeeId,
    }),
  };
}

function uncheckedBankBooking(db: Executor, id: string) {
  const row = getBooking(db, id);
  if (
    !row ||
    row.source !== 'bank' ||
    row.status === 'reconciled' ||
    row.transferId ||
    row.splits.some((s) => s.transferId || s.contactId) ||
    (row.status !== 'pending' && row.splits.every((s) => s.categoryId !== null))
  )
    throw new ConflictError(
      'Nur offene, ungeprüfte Bankbuchungen können einen Vorschlag übernehmen.',
    );
  return row;
}
export function readBookingAssignments(db: Executor, id: string) {
  const row = uncheckedBankBooking(db, id);
  const cleanup = suggestedBankPayee(
    db,
    row.bankSourceId ?? '',
    row.bankRawPayee,
    row.bankRawText ?? row.memo ?? '',
  );
  return {
    cleanup,
    suggestions: assignmentSuggestions(db, {
      ...row,
      payeeId: row.payeeId ?? cleanup.payeeId,
      rawText: bankAssignmentText(row.bankRawPayee, row.bankRawText ?? row.memo ?? ''),
    }),
  };
}

export function assignmentPatch(
  amountCents: number,
  actions: AssignmentRuleInput['actions'],
): BookingPatch {
  const { categoryId, splits, transferAccountId, ...columns } = actions;
  const lines: SplitInput[] | undefined = splits
    ? assignmentSplits(amountCents, splits)
    : categoryId !== undefined || transferAccountId
      ? [
          {
            amountCents,
            categoryId: categoryId ?? null,
            ...(transferAccountId ? { transferAccountId } : {}),
          },
        ]
      : undefined;
  return {
    ...columns,
    ...(transferAccountId ? { payeeId: null } : {}),
    ...(lines ? { splits: lines } : {}),
  };
}
export function applyBookingAssignment(
  db: Executor,
  id: string,
  ruleId: string,
  ctx: AuditContext,
  revision?: string,
) {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const row = uncheckedBankBooking(tx, id);
    const rule = readBookingAssignments(tx, id).suggestions.find((r) => r.id === ruleId);
    if (!rule || rule.unavailable || (revision !== undefined && revision !== rule.revision))
      throw new ConflictError('Vorschlag hat sich geändert. Bitte neu prüfen.');
    if (rule.actions.transferAccountId) {
      const { transferAccountId, categoryId, ...metadata } = rule.actions;
      updateBooking(tx, id, assignmentPatch(row.amountCents, metadata), grouped);
      markBankBookingTransfer(tx, id, transferAccountId, categoryId ?? null, grouped);
    } else updateBooking(tx, id, assignmentPatch(row.amountCents, rule.actions), grouped);
    return { groupId: grouped.groupId, bookingId: id };
  });
}

/** Preview counts each bank row once, including confirmed history; never mutates the ledger. */
export function previewAssignmentRule(db: Executor, input: AssignmentRuleInput) {
  input = assignmentRuleSchema.parse(input);
  assertReferences(db, input);
  const rows: (AssignmentRow & { id: string; date: string })[] = db
    .select()
    .from(booking)
    .where(and(eq(booking.source, 'bank'), isNull(booking.deletedAt)))
    .all()
    .filter((b) => !(b.importKey?.startsWith('bank-transfer:') && b.bankRawText === null))
    .map((b) => {
      const cleanup = suggestedBankPayee(
        db,
        b.bankSourceId ?? '',
        b.bankRawPayee,
        b.bankRawText ?? b.memo ?? '',
      );
      return {
        ...b,
        payeeId: b.payeeId ?? cleanup.payeeId,
        rawText: bankAssignmentText(b.bankRawPayee, b.bankRawText ?? b.memo ?? ''),
      };
    });
  const bookedKeys = new Set(
    db
      .select({ key: booking.importKey, accountId: booking.accountId })
      .from(booking)
      .where(isNull(booking.deletedAt))
      .all()
      .map((b) => JSON.stringify([b.accountId, b.key])),
  );
  for (const c of db.select().from(bankSyncCandidate).all()) {
    const item = db.select().from(inboxItem).where(eq(inboxItem.id, c.id)).get();
    if (!item || item.resolvedAt) continue;
    if (bookedKeys.has(JSON.stringify([c.accountId, 'bank-sync:' + c.dedupeKey]))) continue;
    const cleanup = suggestedBankPayee(db, c.sourceId ?? '', c.rawPayee, c.memo);
    rows.push({
      ...c,
      payeeId: cleanup.payeeId,
      rawText: bankAssignmentText(c.rawPayee, c.memo),
    });
  }
  const matched = rows.filter((row) => matchesAssignment(input.match, row));
  return {
    count: matched.length,
    examples: matched
      .slice(0, 20)
      .map((r) => ({ id: r.id, date: r.date, amountCents: r.amountCents, rawText: r.rawText })),
  };
}

export function assignmentFromBooking(db: Executor, id: string): AssignmentRuleInput {
  const row = getBooking(db, id);
  if (
    !row ||
    row.source !== 'bank' ||
    row.transferId ||
    row.splits.some((s) => s.transferId || s.contactId) ||
    !row.splits.length ||
    row.splits.some(
      (s) =>
        !s.categoryId || !s.amountCents || Math.sign(s.amountCents) !== Math.sign(row.amountCents),
    )
  )
    throw new ConflictError('Eine vollständig kategorisierte Bankbuchung wählen.');
  const cleaned = cleanBankPayee(
    row.bankRawPayee,
    row.bankRawText ?? row.memo ?? '',
    readPayeeCleanup(db, row.bankSourceId ?? ''),
  );
  if (!row.payeeId && !cleaned)
    throw new ConflictError('Ein Empfänger oder Banktext wird benötigt.');
  return {
    name: 'Zuordnung ' + cleaned.slice(0, 90),
    match: {
      mode: 'all',
      conditions: [
        row.payeeId
          ? { type: 'payee', payeeId: row.payeeId }
          : { type: 'contains', text: cleaned.slice(0, 200) },
        { type: 'direction', direction: row.amountCents < 0 ? 'outflow' : 'inflow' },
      ],
    },
    actions: {
      ...(row.payeeId ? { payeeId: row.payeeId } : {}),
      ...(row.splits.length === 1
        ? { categoryId: row.splits[0]!.categoryId }
        : {
            splits: learnAssignmentSplits(
              row.splits.map((s) => ({ categoryId: s.categoryId!, amountCents: s.amountCents })),
            ),
          }),
    },
    enabled: true,
    automatic: false,
  };
}

/** Category/payee merges retain rule meaning and learned aliases in the merge's audit group. */
export function remapAssignmentReferences(
  db: Executor,
  kind: 'payee' | 'category',
  sourceId: string,
  targetId: string,
  ctx: AuditContext,
) {
  for (const row of db
    .select()
    .from(assignmentRule)
    .where(isNull(assignmentRule.deletedAt))
    .all()) {
    const match = JSON.parse(row.matchJson) as Partial<AssignmentRuleInput['match']>;
    const actions = JSON.parse(row.actionJson) as AssignmentRuleInput['actions'];
    if (kind === 'payee' && match.conditions)
      match.conditions = match.conditions.map((c) =>
        c.type === 'payee' && c.payeeId === sourceId ? { ...c, payeeId: targetId } : c,
      );
    if (kind === 'category' && actions.splits)
      actions.splits = actions.splits.map((s) =>
        s.categoryId === sourceId ? { ...s, categoryId: targetId } : s,
      );
    const matchJson = JSON.stringify(match),
      actionJson = JSON.stringify(actions);
    if (matchJson !== row.matchJson || actionJson !== row.actionJson)
      updateTracked(db, assignmentRule, [row.id], { matchJson, actionJson }, ctx);
  }
  if (kind === 'payee')
    for (const alias of db
      .select()
      .from(bankPayeeAlias)
      .where(eq(bankPayeeAlias.payeeId, sourceId))
      .all())
      updateTracked(db, bankPayeeAlias, [alias.id], { payeeId: targetId }, ctx);
}
