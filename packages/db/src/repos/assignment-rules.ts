import { createHash, randomUUID } from 'node:crypto';
import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  lte,
  or,
} from 'drizzle-orm';
import {
  assignmentRuleSchema,
  assignmentMatchSchema,
  assignmentActionsSchema,
  assignmentSplits,
  learnAssignmentSplits,
  bankAliasKey,
  addDays,
  bankAssignmentText,
  cleanBankPayee,
  counterpartyKey,
  looseKeyUsable,
  DEFAULT_PAYEE_CLEANUP,
  matchesAssignment,
  matchPayeeAlias,
  ownAccountTransferTarget,
  type OwnAccountRef,
  PAYEE_ALIAS_ALL_SOURCES,
  payeeCleanupSchema,
  type AssignmentRuleInput,
  type AssignmentRow,
  type PayeeCleanup,
} from '@budget/domain';
import {
  account,
  appSetting,
  assignmentRule,
  bankPayeeAlias,
  bankPayeeCleanup,
  bankSyncAccount,
  bankSyncCandidate,
  booking,
  inboxItem,
  payee,
  category,
  incomeType,
  statementSettlement,
  statementSettlementConfig,
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
import { SETTLEMENT_DEBIT_WINDOW_DAYS } from './statement-settlement';
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
  const live = (
    table: typeof payee | typeof category | typeof account | typeof incomeType,
    id: string,
  ) => {
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
  if (input.actions.accountId) live(account, input.actions.accountId);
  if (input.actions.incomeTypeId) live(incomeType, input.actions.incomeTypeId);
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

let deferredLearning: (() => void)[] | null = null;
/**
 * Bulk confirmation applies every row as previewed: payee aliases and inbox rules learned from
 * earlier rows would change what later rows suggest, so learning runs once after the last row.
 * Synchronous only; the caller's transaction wraps both the rows and the deferred learning.
 */
export function deferLearning<T>(run: () => T): T {
  if (deferredLearning) return run();
  const queue: (() => void)[] = (deferredLearning = []);
  try {
    const result = run();
    deferredLearning = null;
    for (const job of queue) job();
    return result;
  } finally {
    deferredLearning = null;
  }
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
  if (deferredLearning) {
    deferredLearning.push(() => learnBankPayee(db, sourceId, raw, payeeId, ctx));
    return;
  }
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
    .where(
      and(
        inArray(bankPayeeAlias.sourceId, [sourceId, PAYEE_ALIAS_ALL_SOURCES]),
        isNull(bankPayeeAlias.deletedAt),
      ),
    )
    .all();
  // A learned alias of this very source wins; merged-payee aliases hold for every source.
  const aliasKey = bankAliasKey(rawPayee || rawText);
  const noiseKey = counterpartyKey(rawPayee || rawText);
  const alias =
    aliases.find((a) => a.sourceId === sourceId && a.rawKey === aliasKey) ??
    // Same merchant behind processor prefixes or changing reference digits.
    aliases.find((a) => a.sourceId === sourceId && counterpartyKey(a.rawKey) === noiseKey) ??
    matchPayeeAlias(
      aliases.filter((a) => a.sourceId === PAYEE_ALIAS_ALL_SOURCES),
      [rawPayee || rawText, cleaned],
    );
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
      : named.length === 0
        ? prefixPayee(payees, bankAliasKey(cleaned))
        : undefined;
  return {
    cleaned,
    payeeId: found?.id ?? null,
    payeeName: found?.name ?? null,
    learned: !!alias && !!found,
  };
}

/**
 * Fallback without alias or exact name: a payee whose name is a whole-word prefix of the cleaned
 * bank text ("Amazon" for "AMAZON PAYMENTS EUROPE S.C.A."). The longest name wins; a tie between
 * different payees gives no suggestion.
 */
function prefixPayee<T extends { name: string }>(payees: T[], cleanedKey: string): T | undefined {
  let best: T[] = [];
  let bestLength = 0;
  for (const p of payees) {
    const key = bankAliasKey(p.name);
    if (key.length < 4 || key.length < bestLength || !cleanedKey.startsWith(key)) continue;
    const next = cleanedKey.charAt(key.length);
    if (next !== '' && /[\p{L}\p{N}]/u.test(next)) continue;
    if (key.length > bestLength) best = [];
    bestLength = key.length;
    best.push(p);
  }
  return best.length === 1 ? best[0] : undefined;
}

export function assignmentSuggestions(db: Executor, row: AssignmentRow) {
  return listAssignmentRules(db)
    .filter(
      (r) =>
        r.enabled &&
        matchesAssignment(r.match, row, !r.automatic && !r.id.startsWith('inbox-learn:')),
    )
    .map((rule) => {
      let unavailable: string | null = null;
      try {
        assertReferences(db, rule);
        if (rule.actions.incomeTypeId && row.amountCents <= 0)
          throw new ConflictError('Einnahmeart benötigt einen Zufluss.');
        if (rule.actions.accountId) {
          if (row.source === 'bank' && rule.actions.accountId !== row.accountId)
            throw new ConflictError('Das Bankkonto bleibt an seine Datenquelle gebunden.');
          const source = db.select().from(account).where(eq(account.id, row.accountId)).get();
          const target = db
            .select()
            .from(account)
            .where(eq(account.id, rule.actions.accountId))
            .get();
          if (!source || !target || source.currency !== target.currency)
            throw new ConflictError('Konto benötigt dieselbe Währung.');
        }
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

/** Two consecutive confirmed bank occurrences must prove the same own-account transfer. */
function recurringTransferTarget(
  db: Executor,
  candidate: typeof bankSyncCandidate.$inferSelect,
  counterparty: string,
): string | null {
  const normalized = bankAliasKey(counterparty);
  if (!normalized || candidate.amountCents === 0) return null;
  const recent = db
    .select({
      transferId: booking.transferId,
      date: booking.date,
      rawPayee: booking.bankRawPayee,
      rawText: booking.bankRawText,
      sourceId: booking.bankSourceId,
    })
    .from(booking)
    .where(
      and(
        eq(booking.accountId, candidate.accountId),
        eq(booking.currency, candidate.currency),
        inArray(booking.status, ['confirmed', 'reconciled']),
        lte(booking.date, candidate.date),
        isNotNull(booking.bankRawText),
        isNull(booking.deletedAt),
      ),
    )
    .orderBy(desc(booking.date), desc(booking.createdAt), desc(booking.id))
    .all();
  const cleanup = new Map<string, PayeeCleanup>();
  const occurrences: typeof recent = [];
  for (const row of recent) {
    if (occurrences.length >= 2 && row.date < occurrences[1]!.date) break;
    const source = row.sourceId ?? '';
    const options = cleanup.get(source) ?? readPayeeCleanup(db, source);
    cleanup.set(source, options);
    if (bankAliasKey(cleanBankPayee(row.rawPayee, row.rawText ?? '', options)) === normalized)
      occurrences.push(row);
  }
  if (occurrences.length < 2 || occurrences.some((entry) => !entry.transferId)) return null;
  const transferIds = occurrences.map((entry) => entry.transferId!);
  const partners = db
    .select({ accountId: booking.accountId })
    .from(booking)
    .innerJoin(account, eq(account.id, booking.accountId))
    .where(
      and(
        inArray(booking.transferId, transferIds),
        ne(booking.accountId, candidate.accountId),
        eq(account.currency, candidate.currency),
        lte(account.openingDate, candidate.date),
        isNull(account.deletedAt),
        isNull(account.closedAt),
        isNull(booking.deletedAt),
      ),
    )
    .all();
  return partners.length === occurrences.length &&
    partners.every((partner) => partner.accountId === partners[0]?.accountId)
    ? partners[0]!.accountId
    : null;
}

/** Id prefix of the generated own-account transfer proposal (never a stored rule). */
export const OWN_ACCOUNT_RULE_PREFIX = 'own-account:';

const IBAN_SHAPE = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/gu;

/** Own accounts with the IBAN evidence the app holds: IBANs in names, sync labels (full or last four). */
function ownAccountRefs(db: Executor, currency: string): (OwnAccountRef & { name: string })[] {
  const labels = db.select().from(bankSyncAccount).all();
  return db
    .select()
    .from(account)
    .where(and(isNull(account.deletedAt), isNull(account.closedAt), eq(account.currency, currency)))
    .all()
    .map((a) => {
      const texts = [a.name, ...labels.filter((l) => l.accountId === a.id).map((l) => l.label)];
      const ibans = texts.flatMap((t) => t.toUpperCase().match(IBAN_SHAPE) ?? []);
      const tails = texts.flatMap((t) =>
        [...t.matchAll(/(?:…|\.\.\.)\s?(\d{4})(?!\d)/gu)].flatMap((m) => (m[1] ? [m[1]] : [])),
      );
      return { id: a.id, name: a.name, ibans, ibanTails: tails };
    });
}

/**
 * A bank line whose text names another own account (its IBAN or its name) is proposed as a transfer
 * to that account. Read-only, exactly one account or no proposal; never automatic.
 */
function ownAccountSuggestion(
  db: Executor,
  accountId: string,
  currency: string,
  rawPayee: string | null,
  memo: string,
): (AssignmentRule & { unavailable: string | null }) | null {
  const refs = ownAccountRefs(db, currency);
  const target = ownAccountTransferTarget(bankAssignmentText(rawPayee, memo), accountId, refs);
  const found = refs.find((r) => r.id === target);
  if (!found) return null;
  return {
    id: OWN_ACCOUNT_RULE_PREFIX + found.id,
    name: `Eigenes Konto → Umbuchung auf ${found.name}`,
    priority: -1,
    revision: createHash('sha256')
      .update(JSON.stringify([found.id, found.name]))
      .digest('hex'),
    enabled: true,
    automatic: false,
    match: { mode: 'all', conditions: [] },
    actions: { transferAccountId: found.id },
    unavailable: null,
  };
}

const withOwnAccount = <T extends { actions: { transferAccountId?: string | undefined } }>(
  own: T | null,
  suggestions: T[],
): T[] =>
  own && !suggestions.some((s) => s.actions.transferAccountId === own.actions.transferAccountId)
    ? [own, ...suggestions]
    : suggestions;

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
  const recurringTransferAccountId = recurringTransferTarget(db, candidate, cleanup.cleaned);
  const suggestions = withOwnAccount(
    recurringTransferAccountId
      ? null
      : ownAccountSuggestion(
          db,
          candidate.accountId,
          candidate.currency,
          candidate.rawPayee,
          candidate.memo,
        ),
    assignmentSuggestions(db, {
      ...candidate,
      source: 'bank',
      rawText: bankAssignmentText(candidate.rawPayee, candidate.memo),
      payeeId: cleanup.payeeId,
      counterparty: cleanup.cleaned,
    }),
  );
  return {
    candidate,
    recurringTransferAccountId,
    candidateRevision: createHash('sha256')
      .update(
        JSON.stringify([
          candidate,
          cleanup,
          existingTransfer,
          recurringTransferAccountId,
          // Non-transfer previews track the selected category rule's revision separately.
          suggestions
            .filter(({ actions }) => recurringTransferAccountId || actions.transferAccountId)
            .map(({ id, revision, unavailable }) => [id, revision, unavailable]),
        ]),
      )
      .digest('hex'),
    cleanup,
    existingTransfer,
    suggestions,
  };
}

function uncheckedInboxBooking(db: Executor, id: string) {
  const row = getBooking(db, id);
  if (
    !row ||
    row.status === 'reconciled' ||
    row.transferId ||
    row.splits.some((s) => s.transferId || s.contactId) ||
    (row.status !== 'pending' &&
      row.splits.every((s) => s.categoryId !== null || s.incomeTypeId !== null))
  )
    throw new ConflictError('Nur offene, ungeprüfte Buchungen können einen Vorschlag übernehmen.');
  return row;
}
/** Id prefix of the generated card-settlement proposal (never a stored rule). */
export const CARD_SETTLEMENT_RULE_PREFIX = 'card-settlement:';

/**
 * #1319: a bank debit on the funding account of an enabled settlement configuration whose
 * counterparty paid an earlier settlement of that card (same payee or the same cleaned bank text)
 * is the card bill: it is proposed as a transfer to the card, never as a category. Without a
 * statement the existing statement automation does nothing, so the debit would stay uncategorised
 * while the card debt stays unchanged. Read-only; exactly one matching card or no proposal.
 */
function cardSettlementSuggestion(
  db: Executor,
  row: NonNullable<ReturnType<typeof getBooking>>,
  counterparty: string,
  payeeId: string | null,
): (AssignmentRule & { unavailable: string | null }) | null {
  if (row.source !== 'bank' || row.amountCents >= 0 || row.transferId) return null;
  const key = bankAliasKey(counterparty);
  const matches: { card: typeof account.$inferSelect; revision: string }[] = [];
  const configs = db
    .select()
    .from(statementSettlementConfig)
    .where(
      and(
        eq(statementSettlementConfig.fundingAccountId, row.accountId),
        eq(statementSettlementConfig.enabled, true),
        isNull(statementSettlementConfig.deletedAt),
      ),
    )
    .all();
  for (const config of configs) {
    const card = db.select().from(account).where(eq(account.id, config.cardAccountId)).get();
    if (
      !card ||
      card.deletedAt ||
      card.closedAt ||
      card.type !== 'credit_card' ||
      card.currency !== row.currency
    )
      continue;
    // The statement already accounts for this payment (or is waiting for it): proposing another
    // transfer would pay the bill twice. Open settlements block any amount; a represented one
    // blocks the same amount. The window covers a bank debit a few days off the printed date.
    const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
    const covered = db
      .select()
      .from(statementSettlement)
      .where(
        and(
          eq(statementSettlement.cardAccountId, card.id),
          eq(statementSettlement.fundingAccountId, row.accountId),
          isNull(statementSettlement.deletedAt),
          inArray(statementSettlement.state, ['open', 'represented']),
        ),
      )
      .all()
      .some(
        (r) =>
          Math.abs(day(r.debitDate) - day(row.date)) <= SETTLEMENT_DEBIT_WINDOW_DAYS * 86_400_000 &&
          (r.state === 'open' || r.payableCents === -row.amountCents),
      );
    if (covered) continue;
    const earlier = db
      .select({ booking })
      .from(statementSettlement)
      .innerJoin(booking, eq(booking.id, statementSettlement.fromBookingId))
      .where(
        and(
          eq(statementSettlement.cardAccountId, card.id),
          eq(statementSettlement.state, 'represented'),
          isNull(statementSettlement.deletedAt),
          isNull(booking.deletedAt),
        ),
      )
      .all()
      .map((r) => r.booking);
    const known = earlier.some(
      (b) =>
        (payeeId !== null && b.payeeId === payeeId) ||
        (key !== '' && bankAliasKey(bookingCounterparty(db, b)) === key),
    );
    if (known)
      matches.push({
        card,
        revision: createHash('sha256')
          .update(
            JSON.stringify([card.id, config.fundingAccountId, config.updatedAt, earlier.length]),
          )
          .digest('hex'),
      });
  }
  if (matches.length !== 1) return null;
  const { card, revision } = matches[0]!;
  return {
    id: CARD_SETTLEMENT_RULE_PREFIX + card.id,
    name: `Kartenabrechnung → Umbuchung auf ${card.name}`,
    priority: -1,
    revision,
    enabled: true,
    automatic: false,
    match: { mode: 'all', conditions: [] },
    actions: { transferAccountId: card.id },
    unavailable: null,
  };
}

export function readBookingAssignments(db: Executor, id: string) {
  const row = uncheckedInboxBooking(db, id);
  const cleanup = suggestedBankPayee(
    db,
    row.bankSourceId ?? '',
    row.bankRawPayee,
    row.bankRawText ?? row.memo ?? '',
  );
  const counterparty = bookingCounterparty(db, row);
  const card = cardSettlementSuggestion(db, row, counterparty, row.payeeId ?? cleanup.payeeId);
  const own =
    row.source === 'bank' && !card && !row.transferId
      ? ownAccountSuggestion(
          db,
          row.accountId,
          row.currency,
          row.bankRawPayee,
          row.bankRawText ?? row.memo ?? '',
        )
      : null;
  return {
    cleanup,
    suggestions: [
      ...(card ? [card] : []),
      ...(own ? [own] : []),
      // A card bill is never categorised: stored and learned category rules stay out of sight.
      ...assignmentSuggestions(db, {
        ...row,
        payeeId: row.payeeId ?? cleanup.payeeId,
        rawText: bankAssignmentText(row.bankRawPayee, row.bankRawText ?? row.memo ?? ''),
        counterparty,
      }).filter(
        (rule) =>
          (row.source === 'bank' || rule.id.startsWith('inbox-learn:')) &&
          !(card && !rule.actions.transferAccountId),
      ),
    ],
  };
}

export function assignmentPatch(
  amountCents: number,
  actions: AssignmentRuleInput['actions'],
): BookingPatch {
  const { categoryId, incomeTypeId, accountId, splits, transferAccountId, ...columns } = actions;
  const lines: SplitInput[] | undefined = splits
    ? assignmentSplits(amountCents, splits)
    : categoryId !== undefined || incomeTypeId !== undefined || transferAccountId
      ? [
          {
            amountCents,
            categoryId: categoryId ?? null,
            ...(incomeTypeId !== undefined ? { incomeTypeId } : {}),
            ...(transferAccountId ? { transferAccountId } : {}),
          },
        ]
      : undefined;
  return {
    ...columns,
    ...(accountId !== undefined ? { accountId } : {}),
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
    const row = uncheckedInboxBooking(tx, id);
    const rule = readBookingAssignments(tx, id).suggestions.find((r) => r.id === ruleId);
    if (!rule || rule.unavailable || (revision !== undefined && revision !== rule.revision))
      throw new ConflictError('Vorschlag hat sich geändert. Bitte neu prüfen.');
    if (rule.actions.transferAccountId) {
      const { transferAccountId, categoryId, ...metadata } = rule.actions;
      updateBooking(tx, id, assignmentPatch(row.amountCents, metadata), grouped);
      markBankBookingTransfer(tx, id, transferAccountId, categoryId ?? null, grouped);
    } else
      updateBooking(
        tx,
        id,
        {
          ...assignmentPatch(row.amountCents, rule.actions),
          ...(rule.id.startsWith('inbox-learn:') ? { status: 'confirmed' as const } : {}),
        },
        grouped,
      );
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
        counterparty: bookingCounterparty(db, b),
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
      counterparty: cleanup.cleaned,
    });
  }
  const matched = rows.filter((row) => matchesAssignment(input.match, row, !input.automatic));
  return {
    count: matched.length,
    examples: matched
      .slice(0, 20)
      .map((r) => ({ id: r.id, date: r.date, amountCents: r.amountCents, rawText: r.rawText })),
  };
}

function bookingCounterparty(db: Executor, row: typeof booking.$inferSelect) {
  if (row.source === 'bank')
    return cleanBankPayee(
      row.bankRawPayee,
      row.bankRawText ?? row.memo ?? '',
      readPayeeCleanup(db, row.bankSourceId ?? ''),
    );
  return row.payeeId
    ? (db.select().from(payee).where(eq(payee.id, row.payeeId)).get()?.name ?? '')
    : '';
}

/** Called only by owner confirmation paths, within their savepoint and undo group. */
export function learnInboxAssignment(db: Executor, id: string, ctx: AuditContext) {
  if (deferredLearning) {
    deferredLearning.push(() => learnInboxAssignment(db, id, ctx));
    return;
  }
  learnInboxRule(db, id, ctx);
  learnAutoRule(db, id, ctx);
}

// app_setting ids are at most 64 characters: a short digest of the rule id keeps the key bounded.
const fingerprintKey = (ruleId: string) =>
  'rf:' + createHash('sha256').update(ruleId).digest('hex').slice(0, 40);
const ruleFingerprint = (v: {
  name: string;
  matchJson: string;
  actionJson: string;
  payeeId: string | null;
  categoryId: string | null;
  enabled: boolean;
  automatic: boolean;
  priority: number;
}) =>
  createHash('sha256')
    .update(
      JSON.stringify([
        v.name,
        v.matchJson,
        v.actionJson,
        v.payeeId,
        v.categoryId,
        v.enabled,
        v.automatic,
        v.priority,
      ]),
    )
    .digest('hex');

/** Remember what the app wrote, so a later owner edit of the rule is recognisable and kept. */
function rememberRuleFingerprint(
  db: Executor,
  ruleId: string,
  values: Parameters<typeof ruleFingerprint>[0],
  ctx: AuditContext,
) {
  const key = fingerprintKey(ruleId);
  const value = ruleFingerprint(values);
  if (db.select().from(appSetting).where(eq(appSetting.id, key)).get())
    updateTracked(db, appSetting, [key], { value }, ctx);
  else insertTracked(db, appSetting, { id: key, value }, ctx);
}

/** A rule the owner deleted, disabled or changed since the app last wrote it is never touched. */
function ownerOwnsRule(db: Executor, row: typeof assignmentRule.$inferSelect): boolean {
  if (row.deletedAt || !row.enabled) return true;
  const fingerprint = db
    .select()
    .from(appSetting)
    .where(eq(appSetting.id, fingerprintKey(row.id)))
    .get();
  return !!fingerprint && fingerprint.value !== ruleFingerprint(row);
}

function learnInboxRule(db: Executor, id: string, ctx: AuditContext) {
  const row = getBooking(db, id);
  if (
    !row ||
    row.status !== 'confirmed' ||
    row.transferId ||
    !row.amountCents ||
    row.splits.length > 20 ||
    row.splits.some(
      (s) =>
        s.transferId ||
        s.contactId ||
        !s.amountCents ||
        Math.sign(s.amountCents) !== Math.sign(row.amountCents),
    )
  )
    return;
  const counterparty = bookingCounterparty(db, row);
  if (!counterparty) return;
  if (!row.payeeId && row.splits.every((s) => !s.categoryId && !s.incomeTypeId)) return;
  // Reuse category templates; mixed category/income templates stay in the manual editor.
  if (row.splits.length > 1 && row.splits.some((s) => !s.categoryId || s.incomeTypeId)) return;
  let actions: AssignmentRuleInput['actions'];
  if (row.splits.length === 1) {
    const s = row.splits[0]!;
    actions = {
      categoryId: s.categoryId,
      ...(s.incomeTypeId ? { incomeTypeId: s.incomeTypeId } : {}),
    };
  } else {
    try {
      actions = {
        splits: learnAssignmentSplits(
          row.splits.map((s) => ({ categoryId: s.categoryId!, amountCents: s.amountCents })),
        ),
      };
    } catch {
      return;
    } // Sub-basis-point splits cannot form a cent-safe reusable template.
  }
  actions = {
    ...actions,
    payeeId: row.payeeId,
    accountId: row.accountId,
  };
  const direction = row.amountCents < 0 ? 'outflow' : 'inflow';
  // Exact alias key as before: inbox-learn rules never match loosely.
  const alias = bankAliasKey(counterparty);
  const looseKey = counterpartyKey(counterparty);
  const ruleId =
    'inbox-learn:' +
    createHash('sha256')
      .update(JSON.stringify([alias, direction]))
      .digest('hex');
  const input: AssignmentRuleInput = {
    name: counterparty.slice(0, 120),
    enabled: true,
    automatic: false,
    match: {
      mode: 'all',
      conditions: [
        { type: 'counterparty', text: alias },
        { type: 'direction', direction },
      ],
    },
    actions,
  };
  const rules = listAssignmentRules(db);
  const stored = (id: string) =>
    db.select().from(assignmentRule).where(eq(assignmentRule.id, id)).get();
  let existing = stored(ruleId);
  if (!existing && looseKeyUsable(looseKey)) {
    // The same merchant under changed reference digits ("shop 1234" / "shop 5678"): reuse that
    // rule instead of adding a twin. Rules the owner made or the auto-learner wrote stay as they are.
    const sameMerchant = rules.find((r) => {
      const counter = r.match.conditions.find((c) => c.type === 'counterparty');
      const dir = r.match.conditions.find((c) => c.type === 'direction');
      const acc = r.match.conditions.find((c) => c.type === 'account');
      return (
        counter?.type === 'counterparty' &&
        counterpartyKey(counter.text) === looseKey &&
        dir?.type === 'direction' &&
        dir.direction === direction &&
        !acc
      );
    });
    if (sameMerchant) {
      if (!sameMerchant.id.startsWith('inbox-learn:')) return;
      existing = stored(sameMerchant.id);
    }
  }
  if (existing && ownerOwnsRule(db, existing)) return;
  // The existing rule limit bounds storage without preventing an owner from confirming a booking.
  if (!existing && rules.length >= 100) return;
  try {
    assertReferences(db, input);
  } catch (error) {
    if (error instanceof ConflictError) return;
    throw error;
  }
  const { payeeId, categoryId, ...other } = actions;
  const values = {
    name: existing?.name ?? input.name,
    matchJson: existing?.matchJson ?? JSON.stringify(input.match),
    actionJson: JSON.stringify({
      ...other,
      ...(categoryId === null ? { categoryId: null } : {}),
      ...(payeeId === null ? { payeeId: null } : {}),
    }),
    payeeId: payeeId ?? null,
    categoryId: categoryId ?? null,
    enabled: true,
    automatic: false,
    deletedAt: null,
  };
  const priority = existing?.priority ?? Math.max(-1, ...rules.map((r) => r.priority)) + 1;
  if (existing) updateTracked(db, assignmentRule, [existing.id], values, ctx);
  else insertTracked(db, assignmentRule, { id: ruleId, ...values, priority }, ctx);
  rememberRuleFingerprint(db, existing?.id ?? ruleId, { ...values, priority }, ctx);
}

type ClassifiedBooking = NonNullable<ReturnType<typeof getBooking>>;

/**
 * What the owner decided for a bank line, as rule actions: the own-account transfer target, or
 * payee plus category / split template / income type. Null when nothing reusable was decided.
 */
function bookingClassification(
  db: Executor,
  row: ClassifiedBooking,
): { sig: string; actions: AssignmentRuleInput['actions'] } | null {
  if (!row.amountCents || row.splits.length > 20 || row.splits.some((s) => s.contactId))
    return null;
  if (row.transferId) {
    const partner = db
      .select({ accountId: booking.accountId })
      .from(booking)
      .where(
        and(
          eq(booking.transferId, row.transferId),
          ne(booking.id, row.id),
          isNull(booking.deletedAt),
        ),
      )
      .get();
    if (!partner) return null;
    const categoryId = row.splits.find((s) => s.categoryId)?.categoryId ?? null;
    return {
      sig: JSON.stringify(['transfer', partner.accountId, categoryId]),
      actions: { transferAccountId: partner.accountId, ...(categoryId ? { categoryId } : {}) },
    };
  }
  if (
    row.splits.some(
      (s) =>
        s.transferId || !s.amountCents || Math.sign(s.amountCents) !== Math.sign(row.amountCents),
    ) ||
    (!row.payeeId && row.splits.every((s) => !s.categoryId && !s.incomeTypeId)) ||
    (row.splits.length > 1 && row.splits.some((s) => !s.categoryId || s.incomeTypeId))
  )
    return null;
  let actions: AssignmentRuleInput['actions'];
  if (row.splits.length === 1) {
    const s = row.splits[0]!;
    actions = {
      categoryId: s.categoryId,
      ...(s.incomeTypeId ? { incomeTypeId: s.incomeTypeId } : {}),
    };
  } else {
    try {
      actions = {
        splits: learnAssignmentSplits(
          row.splits.map((s) => ({ categoryId: s.categoryId!, amountCents: s.amountCents })),
        ),
      };
    } catch {
      return null;
    }
  }
  actions = { ...actions, payeeId: row.payeeId };
  return { sig: JSON.stringify(['classify', actions]), actions };
}

/** Earlier confirmed bank lines of the account that are compared when learning. */
const AUTO_LEARN_HISTORY = 200;

/**
 * Automatic rule learning: when the owner confirms a bank line and at least one earlier confirmed
 * line of the same account, direction and counterparty key was classified the same way (payee +
 * category / split template / income type, or the same own-account transfer), a suggestion rule
 * (never automatic) named after the counterparty is created. Any live rule for the key and
 * direction, and a deleted rule of this very key, is left alone. Runs in the confirming write's
 * audit group, so one Undo removes rule and fingerprint with the confirmation.
 */
export function learnAutoRule(db: Executor, id: string, ctx: AuditContext) {
  const row = getBooking(db, id);
  if (
    !row ||
    row.source !== 'bank' ||
    !['confirmed', 'reconciled'].includes(row.status) ||
    !row.amountCents ||
    (!row.bankRawText && !row.bankRawPayee)
  )
    return;
  const counterparty = bookingCounterparty(db, row);
  const key = counterpartyKey(counterparty);
  if (!looseKeyUsable(key)) return;
  const mine = bookingClassification(db, row);
  if (!mine) return;
  const direction = row.amountCents < 0 ? 'outflow' : 'inflow';
  const ruleId =
    'auto-learn:' +
    createHash('sha256')
      .update(JSON.stringify([row.accountId, key, direction]))
      .digest('hex');
  if (db.select().from(assignmentRule).where(eq(assignmentRule.id, ruleId)).get()) return;
  const rules = listAssignmentRules(db);
  const covered = rules.some((r) => {
    const counter = r.match.conditions.find((c) => c.type === 'counterparty');
    const dir = r.match.conditions.find((c) => c.type === 'direction');
    const acc = r.match.conditions.find((c) => c.type === 'account');
    return (
      counter?.type === 'counterparty' &&
      counterpartyKey(counter.text) === key &&
      dir?.type === 'direction' &&
      dir.direction === direction &&
      (!acc || (acc.type === 'account' && acc.accountId === row.accountId))
    );
  });
  if (covered || rules.length >= 100) return;
  // SQL prefilter: same account and direction, confirmed bank lines with raw text or payee, last
  // 18 months, newest 200; only the key-matching ones are read in full.
  const history = db
    .select()
    .from(booking)
    .where(
      and(
        eq(booking.accountId, row.accountId),
        eq(booking.source, 'bank'),
        ne(booking.id, row.id),
        inArray(booking.status, ['confirmed', 'reconciled']),
        row.amountCents < 0 ? lt(booking.amountCents, 0) : gt(booking.amountCents, 0),
        or(isNotNull(booking.bankRawText), isNotNull(booking.bankRawPayee)),
        gte(booking.date, addDays(row.date, -548)),
        isNull(booking.deletedAt),
      ),
    )
    .orderBy(desc(booking.date), desc(booking.id))
    .limit(AUTO_LEARN_HISTORY)
    .all();
  const proven = history.some((h) => {
    if (counterpartyKey(bookingCounterparty(db, h)) !== key) return false;
    const earlier = getBooking(db, h.id);
    return !!earlier && bookingClassification(db, earlier)?.sig === mine.sig;
  });
  if (!proven) return;
  const input: AssignmentRuleInput = {
    name: counterparty.slice(0, 120),
    enabled: true,
    automatic: false,
    match: {
      mode: 'all',
      conditions: [
        { type: 'counterparty', text: key },
        { type: 'direction', direction },
        { type: 'account', accountId: row.accountId },
      ],
    },
    actions: mine.actions,
  };
  try {
    assertReferences(db, input);
  } catch (error) {
    if (error instanceof ConflictError) return;
    throw error;
  }
  const { payeeId, categoryId, ...other } = mine.actions;
  const values = {
    name: input.name,
    matchJson: JSON.stringify(input.match),
    actionJson: JSON.stringify({
      ...other,
      ...(categoryId === null ? { categoryId: null } : {}),
      ...(payeeId === null ? { payeeId: null } : {}),
    }),
    payeeId: payeeId ?? null,
    categoryId: categoryId ?? null,
    enabled: true,
    automatic: false,
  };
  const priority = Math.max(-1, ...rules.map((r) => r.priority)) + 1;
  insertTracked(db, assignmentRule, { id: ruleId, ...values, priority }, ctx);
  rememberRuleFingerprint(db, ruleId, { ...values, priority }, ctx);
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
