import { createHash, randomUUID } from 'node:crypto';
import { quickAssignPlan, waterfallFill, waterfallOrder } from '@budget/domain';
import { databaseStamp } from './request-memo';
import { assignMany } from './budget';
import { planMonthViews } from './plan-months';
import { withGroup, type AuditContext } from './audit';
import { CategoryRuleError, ConflictError } from './errors';
import { runInTransaction, type Executor } from './types';

export type SelectedFundingMode = 'fund' | 'reset';
const POLICY = 'waterfall-nine-stages-v1';
const TTL = 120_000;
const LIMIT = 100;
type Ticket = { month: string; mode: SelectedFundingMode; ids: string[]; digest: string; expiresAt: number };
// Short-lived, single-use process-local admission. A restart/other instance requires a fresh preview.
const tickets = new Map<string, Ticket>();

function proposal(db: Executor, month: string, mode: SelectedFundingMode, ids: ReadonlyArray<string>, today: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !ids.length || ids.length > LIMIT ||
    new Set(ids).size !== ids.length || ids.some((id) => !id || id.length > 64))
    throw new CategoryRuleError('Bitte eine eindeutige Auswahl mit höchstens 100 Kategorien wählen.');
  if (mode !== 'fund' && mode !== 'reset') throw new CategoryRuleError('Unbekannte Zuweisungsaktion.');
  const stamp = databaseStamp(db);
  const view = planMonthViews(db, [month], {}, today)[month]!;
  const { summary } = view;
  const tree = { categories: view.categories, groups: view.groups };
  const categories = new Map(tree.categories.map((row) => [row.id, row]));
  const envelopes = new Map(summary.envelopes.map((row) => [row.categoryId, row]));
  const groupOrder = new Map(tree.groups.map((group, i) => [group.id, i]));
  const ordered = waterfallOrder(ids.map((id, index) => {
    const category = categories.get(id);
    return { id, stage: category?.stage ?? null, groupOrder: groupOrder.get(category?.groupId ?? '') ?? Number.MAX_SAFE_INTEGER,
      sortOrder: category?.sortOrder ?? index };
  }));
  const rows = ordered.map(({ id }) => {
    const category = categories.get(id);
    const envelope = envelopes.get(id);
    const reason = !category || !envelope ? 'missing'
      : category.hiddenAt ? 'hidden'
        : !category.class || ['income', 'card_payment', 'advance'].includes(category.kind) ? 'ineligible'
          : mode === 'reset' && month !== today.slice(0, 7) ? 'current_month_only'
            : mode === 'fund' && !envelope.target ? 'no_target'
              : mode === 'fund' && envelope.target?.snoozedMonths?.includes(month) ? 'snoozed'
                : mode === 'fund' && envelope.needCents === 0 ? 'met'
                  : mode === 'reset' && envelope.assignedCents === 0 ? 'unchanged' : null;
    return { categoryId: id, name: category?.name ?? 'Nicht verfügbare Kategorie',
      assignedCents: envelope?.assignedCents ?? 0, needCents: envelope?.needCents ?? 0,
      proposedCents: envelope?.assignedCents ?? 0, deltaCents: 0, reason };
  });
  const eligible = rows.filter((row) => row.reason === null);
  let shortfallCents = 0;
  let resetShort = false;
  if (mode === 'fund') {
    const fill = waterfallFill(eligible.map((row) => ({
      id: row.categoryId, stage: categories.get(row.categoryId)!.stage,
      groupOrder: groupOrder.get(categories.get(row.categoryId)!.groupId) ?? 0,
      sortOrder: categories.get(row.categoryId)!.sortOrder, needCents: row.needCents,
    })), summary.toBeAssignedCents);
    for (const row of eligible) {
      row.deltaCents = fill[row.categoryId] ?? 0;
      row.proposedCents = row.assignedCents + row.deltaCents;
      shortfallCents += row.needCents - row.deltaCents;
    }
  } else {
    // Reuse release-first reset caps. A selected zero-reset is exact or blocked, never a partial zero.
    const reset = quickAssignPlan(eligible.map((row) => envelopes.get(row.categoryId)!), 'reset', summary.toBeAssignedCents);
    shortfallCents = reset.missingCents;
    resetShort = reset.openCount > 0;
    for (const row of eligible) { row.proposedCents = 0; row.deltaCents = -row.assignedCents; }
  }
  const items = rows.filter((row) => row.deltaCents !== 0).map((row) => ({ categoryId: row.categoryId, assignedCents: row.proposedCents }));
  const deltaCents = rows.reduce((sum, row) => sum + row.deltaCents, 0);
  if (![deltaCents, shortfallCents, ...items.map((item) => item.assignedCents)].every(Number.isSafeInteger))
    throw new CategoryRuleError('Die Auswahl überschreitet sichere Cent-Beträge.');
  const canApply = items.length > 0 && !resetShort;
  const result = { month, mode, rows, availableCents: summary.toBeAssignedCents, deltaCents, shortfallCents, canApply };
  const digest = createHash('sha256').update(JSON.stringify({ POLICY, stamp, today, ids, summary, tree, result })).digest('hex');
  return { ...result, items, digest };
}

/** Read-only preflight: no assignment/audit rows are written and client amounts are never trusted. */
export function previewSelectedFunding(db: Executor, month: string, mode: SelectedFundingMode, ids: string[], today: string) {
  const view = proposal(db, month, mode, ids, today);
  const now = Date.now();
  for (const [token, ticket] of tickets) if (ticket.expiresAt <= now) tickets.delete(token);
  if (tickets.size >= LIMIT) tickets.delete(tickets.keys().next().value!);
  const token = randomUUID();
  const expiresAt = now + TTL;
  tickets.set(token, { month, mode, ids: [...ids], digest: view.digest, expiresAt });
  return { month: view.month, mode: view.mode, rows: view.rows, availableCents: view.availableCents,
    deltaCents: view.deltaCents, shortfallCents: view.shortfallCents, canApply: view.canApply, token, expiresAt };
}

/** Single-use CAS, then the unchanged assignment guard/writer in one transaction and audit group. */
export function applySelectedFunding(db: Executor, month: string, token: string, ctx: AuditContext, today: string) {
  const ticket = tickets.get(token);
  tickets.delete(token);
  if (!ticket || ticket.month !== month || ticket.expiresAt <= Date.now())
    throw new ConflictError('Die Vorschau ist abgelaufen oder nicht mehr verfügbar. Bitte neu prüfen.');
  return runInTransaction(db, (tx) => {
    const current = proposal(tx, month, ticket.mode, ticket.ids, today);
    if (current.digest !== ticket.digest)
      throw new ConflictError('Ziele, Auswahl oder verfügbares Geld wurden geändert. Bitte eine neue Vorschau öffnen.');
    if (!current.canApply) throw new CategoryRuleError('Keine sichere Zuweisung erforderlich oder zu wenig freies Geld für die genaue Rücksetzung.');
    const grouped = withGroup(ctx);
    return { ...assignMany(tx, month, current.items, grouped), changedCount: current.items.length };
  });
}
