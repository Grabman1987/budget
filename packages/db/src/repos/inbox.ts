import {
  INBOX_GROUPS,
  STALE_VALUE_DAYS,
  addDays,
  daysBetween,
  inboxGroupOf,
  inboxMinutes,
  isStaleValue,
  missedText,
  monthOf,
  overspentText,
  priceMicroForValue,
  revisionText,
  staleText,
  suggestCategory,
  uncategorizedText,
  versionActionLabel,
  versionText,
  type InboxGroupDef,
  type InboxGroupId,
} from '@budget/domain';
import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import {
  account,
  assignmentRule,
  booking,
  bookingSplit,
  category,
  inboxItem,
  payee,
  price,
  valuation,
} from '../schema';
import { insertTracked, updateTracked, withGroup, type AuditContext } from './audit';
import { updateBooking, type SplitInput } from './bookings';
import { addExpectedVersion, occurrenceHorizon, upcoming } from './expected';
import { ConflictError, EntityNotFoundError } from './errors';
import { holdingValuesAsOf } from './portfolio';
import { latestPriceOnOrBefore } from './prices';
import { budget } from './queries';
import { listRules } from './rules';
import { runInTransaction, type Executor } from './types';

/**
 * Posteingang (concept §4): the work list of everything that needs a decision. `refreshInbox`
 * derives the items of the app's own rules from the ledger, idempotently: an item is identified
 * by kind + ref_type + ref_id, an open item whose cause is gone is resolved (`resolved`), a
 * decision of the owner (`accepted`, `dismissed`, `rule`) is final for that key. Keys carry the
 * period that makes the cause new (the month of an overspend, the date of the last value), so a
 * dismissed item does not come back until there is a new reason. Items written by other parts
 * (market data, backup, savings plans, later P4) are never touched here and are rendered
 * generically. Decisions are audited, so one undo group restores the item and what it changed.
 */

/** `kind|ref_type` pairs whose open items this generator owns (and may resolve). */
const OWNED = new Set([
  'overspent|category',
  'uncategorized|booking',
  'expected_payment|expected_occurrence',
  'stale_value|manual_price',
  'stale_value|account_valuation',
  'revision|rule',
]);
/** Resolutions that are a decision of the owner; the generator never reopens such a key. */
const DECIDED = ['accepted', 'dismissed', 'rule'] as const;
const AUTO = 'resolved';
/** Recent bookings of a payee that vote for the category suggestion. */
const SUGGESTION_HISTORY = 20;

export interface RefreshInboxOptions {
  /** Days after which a manually valued position counts as stale (default 30). */
  staleDays?: number;
}

export interface RefreshInboxResult {
  opened: number;
  resolved: number;
}

interface Candidate {
  kind: (typeof inboxItem.$inferInsert)['kind'];
  refType: string;
  refId: string;
  title: string;
  detail: string;
  urgent: boolean;
}
const keyOf = (kind: string, refType: string | null, refId: string | null) =>
  `${kind}|${refType ?? ''}|${refId ?? ''}`;

// ---------------------------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------------------------

function overspentCandidates(db: Executor, today: string): Candidate[] {
  const month = monthOf(today);
  const [m] = budget(db, [month]);
  if (!m) return [];
  const cats = db
    .select({ id: category.id, name: category.name })
    .from(category)
    .where(isNull(category.deletedAt))
    .orderBy(asc(category.sortOrder), asc(category.name))
    .all();
  const out: Candidate[] = [];
  for (const c of cats) {
    const over = m.envelopes[c.id]?.cashOverspentCents ?? 0;
    if (over > 0)
      out.push({
        kind: 'overspent',
        refType: 'category',
        refId: `${c.id}@${month}`,
        ...overspentText(c.name, over),
        urgent: true,
      });
  }
  return out;
}

/** Uncategorised outflows on budget accounts: the splits that need a category, per booking. */
interface UncategorizedBooking {
  bookingId: string;
  payeeId: string | null;
  payeeName: string | null;
  date: string;
  accountName: string;
  amountCents: number;
}

function uncategorizedBookings(db: Executor, today: string): UncategorizedBooking[] {
  const rows = db
    .select({
      bookingId: booking.id,
      payeeId: booking.payeeId,
      payeeName: payee.name,
      date: booking.date,
      accountName: account.name,
      amountCents: bookingSplit.amountCents,
    })
    .from(bookingSplit)
    .innerJoin(booking, eq(booking.id, bookingSplit.bookingId))
    .innerJoin(account, eq(account.id, booking.accountId))
    .leftJoin(payee, eq(payee.id, booking.payeeId))
    .where(
      and(
        isNull(booking.deletedAt),
        isNull(account.deletedAt),
        eq(account.onBudget, true),
        isNull(booking.transferId),
        isNull(bookingSplit.transferId),
        isNull(bookingSplit.categoryId),
        isNull(bookingSplit.incomeTypeId),
        isNull(bookingSplit.contactId),
        lt(bookingSplit.amountCents, 0),
        // Scheduled (future) bookings are not decided yet.
        lt(booking.date, addDays(today, 1)),
      ),
    )
    .orderBy(desc(booking.date), asc(booking.id))
    .all();
  // A booking with a split-level transfer cannot be re-split; it is left to the booking panel.
  const withTransferSplit = new Set(
    rows.length === 0
      ? []
      : db
          .select({ id: bookingSplit.bookingId })
          .from(bookingSplit)
          .where(
            and(
              inArray(bookingSplit.bookingId, [...new Set(rows.map((r) => r.bookingId))]),
              isNotNull(bookingSplit.transferId),
            ),
          )
          .all()
          .map((r) => r.id),
  );
  const byBooking = new Map<string, UncategorizedBooking>();
  for (const r of rows) {
    if (withTransferSplit.has(r.bookingId)) continue;
    const cur = byBooking.get(r.bookingId);
    if (cur) cur.amountCents += r.amountCents;
    else byBooking.set(r.bookingId, { ...r });
  }
  return [...byBooking.values()];
}

function uncategorizedCandidates(db: Executor, today: string): Candidate[] {
  return uncategorizedBookings(db, today).map((b) => ({
    kind: 'uncategorized',
    refType: 'booking',
    refId: b.bookingId,
    ...uncategorizedText(b.payeeName, b.amountCents, b.date, b.accountName),
    urgent: false,
  }));
}

function expectedCandidates(db: Executor, today: string): Candidate[] {
  const out: Candidate[] = [];
  for (const r of upcoming(db, occurrenceHorizon(today).from, today)) {
    if (r.status === 'deviating' && r.suggestion)
      out.push({
        kind: 'expected_payment',
        refType: 'expected_occurrence',
        refId: r.occurrenceId,
        ...versionText(r.name, r.suggestion.fromMonth, r.suggestion.amountCents, r.amountCents),
        urgent: false,
      });
    else if (r.status === 'missed')
      out.push({
        kind: 'expected_payment',
        refType: 'expected_occurrence',
        refId: r.occurrenceId,
        ...missedText(r.name, r.dueDate),
        urgent: false,
      });
  }
  return out;
}

/** A manually valued thing: a position whose newest price is manual, or an account valuation. */
interface ManualValue {
  refType: 'manual_price' | 'account_valuation';
  /** Security id or account id. */
  subjectId: string;
  name: string;
  lastDate: string;
  valueCents: number;
  /** Units (e8) of a position; null for an account valuation. */
  unitsE8: number | null;
}

function manualValues(db: Executor, today: string): ManualValue[] {
  const out: ManualValue[] = [];
  const names = new Map(
    db
      .select({ id: account.id, name: account.name })
      .from(account)
      .where(isNull(account.deletedAt))
      .all()
      .map((a) => [a.id, a.name]),
  );
  const perSecurity = new Map<
    string,
    { accounts: string[]; unitsE8: number; valueCents: number }
  >();
  for (const h of holdingValuesAsOf(db, today)) {
    const cur = perSecurity.get(h.securityId) ?? { accounts: [], unitsE8: 0, valueCents: 0 };
    cur.accounts.push(h.accountId);
    cur.unitsE8 += h.unitsE8;
    cur.valueCents += h.valueCents;
    perSecurity.set(h.securityId, cur);
  }
  for (const [securityId, held] of perSecurity) {
    const last = latestPriceOnOrBefore(db, securityId, today);
    // Only EUR prices can be re-derived from a typed value; foreign prices come from the market.
    if (!last || last.source !== 'manual' || last.currency !== 'EUR') continue;
    out.push({
      refType: 'manual_price',
      subjectId: securityId,
      name: held.accounts.length === 1 ? (names.get(held.accounts[0]!) ?? securityId) : securityId,
      lastDate: last.date,
      valueCents: held.valueCents,
      unitsE8: held.unitsE8,
    });
  }
  const rows = db
    .select({
      accountId: valuation.accountId,
      date: valuation.date,
      valueCents: valuation.valueCents,
    })
    .from(valuation)
    .innerJoin(account, eq(account.id, valuation.accountId))
    .where(and(isNull(valuation.deletedAt), isNull(account.deletedAt), isNull(account.closedAt)))
    .orderBy(asc(valuation.accountId), desc(valuation.date))
    .all();
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.accountId) || r.date > today) continue;
    seen.add(r.accountId);
    out.push({
      refType: 'account_valuation',
      subjectId: r.accountId,
      name: names.get(r.accountId) ?? r.accountId,
      lastDate: r.date,
      valueCents: r.valueCents,
      unitsE8: null,
    });
  }
  return out;
}

const staleRef = (v: ManualValue) => `${v.subjectId}@${v.lastDate}`;

function staleCandidates(db: Executor, today: string, staleDays: number): Candidate[] {
  const out: Candidate[] = [];
  for (const v of manualValues(db, today)) {
    const days = daysBetween(v.lastDate, today);
    if (!isStaleValue(days, staleDays)) continue;
    out.push({
      kind: 'stale_value',
      refType: v.refType,
      refId: staleRef(v),
      ...staleText(v.name, days, v.valueCents),
      urgent: false,
    });
  }
  return out;
}

/** Rules whose newest stored result needs action (the results are written by `evaluateRules`). */
function revisionCandidates(db: Executor, today: string): Candidate[] {
  const month = monthOf(today);
  return listRules(db, today)
    .rules.filter((r) => r.enabled && r.latest?.actionNeeded)
    .map((r) => ({
      kind: 'revision' as const,
      refType: 'rule',
      refId: `${r.code}@${month}`,
      ...revisionText(r.code, r.name, r.latest!.valueText, r.latest!.actionText ?? r.action),
      urgent: false,
    }));
}

// ---------------------------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------------------------

/**
 * Bring the open items in line with the ledger as of `today`: open what is new, resolve what is
 * gone, refresh the wording of what stays. Idempotent; a second run changes nothing. Not an
 * audited user action (like the market jobs), so it is not part of any undo group.
 */
export function refreshInbox(
  db: Executor,
  today: string,
  options: RefreshInboxOptions = {},
): RefreshInboxResult {
  const staleDays = options.staleDays ?? STALE_VALUE_DAYS;
  return runInTransaction(db, (tx) => {
    const candidates = new Map<string, Candidate>();
    for (const c of [
      ...overspentCandidates(tx, today),
      ...uncategorizedCandidates(tx, today),
      ...expectedCandidates(tx, today),
      ...staleCandidates(tx, today, staleDays),
      ...revisionCandidates(tx, today),
    ])
      candidates.set(keyOf(c.kind, c.refType, c.refId), c);

    const now = new Date().toISOString();
    const open = tx.select().from(inboxItem).where(isNull(inboxItem.resolvedAt)).all();
    let resolved = 0;
    let opened = 0;
    const present = new Set<string>();
    for (const item of open) {
      if (!OWNED.has(`${item.kind}|${item.refType ?? ''}`)) continue;
      const key = keyOf(item.kind, item.refType, item.refId);
      const cand = candidates.get(key);
      if (!cand || present.has(key)) {
        tx.update(inboxItem)
          .set({ resolvedAt: now, resolution: AUTO })
          .where(eq(inboxItem.id, item.id))
          .run();
        resolved++;
        continue;
      }
      present.add(key);
      if (item.title !== cand.title || item.detail !== cand.detail || item.urgent !== cand.urgent)
        tx.update(inboxItem)
          .set({ title: cand.title, detail: cand.detail, urgent: cand.urgent })
          .where(eq(inboxItem.id, item.id))
          .run();
    }
    const decided = new Set(
      tx
        .select({ kind: inboxItem.kind, refType: inboxItem.refType, refId: inboxItem.refId })
        .from(inboxItem)
        .where(inArray(inboxItem.resolution, [...DECIDED]))
        .all()
        .map((r) => keyOf(r.kind, r.refType, r.refId)),
    );
    for (const [key, c] of candidates) {
      if (present.has(key) || decided.has(key)) continue;
      tx.insert(inboxItem)
        .values({
          id: randomUUID(),
          kind: c.kind,
          title: c.title,
          detail: c.detail,
          refType: c.refType,
          refId: c.refId,
          urgent: c.urgent,
        })
        .run();
      opened++;
    }
    return { opened, resolved };
  });
}

// ---------------------------------------------------------------------------------------------
// Read model
// ---------------------------------------------------------------------------------------------

export interface InboxSuggestion {
  categoryId: string;
  categoryName: string;
  categoryClass: string | null;
}

export interface InboxItemView {
  id: string;
  kind: string;
  group: InboxGroupId;
  /** A, B, C … across all groups. */
  letter: string;
  title: string;
  detail: string | null;
  urgent: boolean;
  refType: string | null;
  refId: string | null;
  createdAt: string;
  /** Uncategorised booking: the suggested category; `null` when there is no history. */
  suggestion: InboxSuggestion | null;
  /** Uncategorised booking with a payee: "Immer so zuordnen" is possible. */
  canRule: boolean;
  /** Deviating expected payment: the price change to take over. */
  version: { paymentId: string; fromMonth: string; amountCents: number; label: string } | null;
  /** Manual value: the last value and its age; the input starts with `valueCents`. */
  value: { valueCents: number; daysOld: number } | null;
}

export interface InboxGroupView {
  id: InboxGroupId;
  /** Position in the full list of groups (a missing group leaves a gap, as in the prototype). */
  no: number;
  title: string;
  sub: string;
  count: number;
  items: InboxItemView[];
}

export interface InboxView {
  count: number;
  /** "etwa m Minuten" of the head line. */
  minutes: number;
  groups: InboxGroupView[];
}

/** Category suggestions per payee: the payee's default, else its most used recent category. */
function suggestions(db: Executor, payeeIds: string[]): Map<string, InboxSuggestion | null> {
  const out = new Map<string, InboxSuggestion | null>();
  if (payeeIds.length === 0) return out;
  const cats = new Map(
    db
      .select({ id: category.id, name: category.name, cls: category.class })
      .from(category)
      .where(isNull(category.deletedAt))
      .all()
      .map((c) => [c.id, c]),
  );
  const defaults = new Map(
    db
      .select({ id: payee.id, def: payee.defaultCategoryId })
      .from(payee)
      .where(inArray(payee.id, payeeIds))
      .all()
      .map((p) => [p.id, p.def && cats.has(p.def) ? p.def : null]),
  );
  const recent = new Map<string, string[]>();
  const rows = db
    .select({ payeeId: booking.payeeId, categoryId: bookingSplit.categoryId })
    .from(bookingSplit)
    .innerJoin(booking, eq(booking.id, bookingSplit.bookingId))
    .where(
      and(
        inArray(booking.payeeId, payeeIds),
        isNull(booking.deletedAt),
        isNull(booking.transferId),
        isNull(bookingSplit.transferId),
        lt(bookingSplit.amountCents, 0),
      ),
    )
    .orderBy(desc(booking.date), desc(booking.id))
    .all();
  for (const r of rows) {
    if (!r.payeeId || !r.categoryId || !cats.has(r.categoryId)) continue;
    const list = recent.get(r.payeeId) ?? [];
    if (list.length < SUGGESTION_HISTORY) list.push(r.categoryId);
    recent.set(r.payeeId, list);
  }
  for (const id of payeeIds) {
    const best = suggestCategory(defaults.get(id) ?? null, recent.get(id) ?? []);
    const c = best ? cats.get(best) : undefined;
    out.set(id, c ? { categoryId: c.id, categoryName: c.name, categoryClass: c.cls } : null);
  }
  return out;
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const letterOf = (i: number): string =>
  i < 26 ? LETTERS[i]! : `${LETTERS[Math.floor(i / 26) - 1]}${LETTERS[i % 26]}`;

/** Open items grouped as the page shows them (call `refreshInbox` first for a current list). */
export function listInbox(db: Executor, today: string): InboxView {
  const open = db
    .select()
    .from(inboxItem)
    .where(isNull(inboxItem.resolvedAt))
    .orderBy(sql`${inboxItem}.rowid`)
    .all();
  const groupOf = (i: (typeof open)[number]) => inboxGroupOf(i.kind, i.refType);

  const bookingIds = open.filter((i) => i.kind === 'uncategorized' && i.refId).map((i) => i.refId!);
  const bookings = new Map(
    (bookingIds.length === 0
      ? []
      : db
          .select({ id: booking.id, payeeId: booking.payeeId })
          .from(booking)
          .where(inArray(booking.id, bookingIds))
          .all()
    ).map((b) => [b.id, b.payeeId]),
  );
  const payeeIds = [...new Set([...bookings.values()].filter((p): p is string => p !== null))];
  const suggested = suggestions(db, payeeIds);

  const versions = new Map<string, InboxItemView['version']>();
  const occurrenceIds = new Set(
    open.filter((i) => i.kind === 'expected_payment' && i.refId).map((i) => i.refId!),
  );
  if (occurrenceIds.size > 0)
    for (const r of upcoming(db, occurrenceHorizon(today).from, today))
      if (occurrenceIds.has(r.occurrenceId) && r.suggestion)
        versions.set(r.occurrenceId, {
          paymentId: r.suggestion.paymentId,
          fromMonth: r.suggestion.fromMonth,
          amountCents: r.suggestion.amountCents,
          label: versionActionLabel(r.suggestion.fromMonth),
        });

  const manual = new Map(manualValues(db, today).map((v) => [`${v.refType}|${staleRef(v)}`, v]));

  const ordered = INBOX_GROUPS.flatMap((g) => open.filter((i) => groupOf(i) === g.id));
  const views = new Map<string, InboxItemView>();
  ordered.forEach((i, n) => {
    const payeeId = i.kind === 'uncategorized' && i.refId ? (bookings.get(i.refId) ?? null) : null;
    const suggestion = payeeId ? (suggested.get(payeeId) ?? null) : null;
    const mv =
      i.kind === 'stale_value' && i.refType && i.refId
        ? manual.get(`${i.refType}|${i.refId}`)
        : undefined;
    views.set(i.id, {
      id: i.id,
      kind: i.kind,
      group: groupOf(i),
      letter: letterOf(n),
      title: i.title,
      detail: i.detail,
      urgent: i.urgent,
      refType: i.refType,
      refId: i.refId,
      createdAt: i.createdAt,
      suggestion,
      canRule: payeeId !== null && suggestion !== null,
      version: i.kind === 'expected_payment' && i.refId ? (versions.get(i.refId) ?? null) : null,
      value: mv ? { valueCents: mv.valueCents, daysOld: daysBetween(mv.lastDate, today) } : null,
    });
  });
  const groups: InboxGroupView[] = INBOX_GROUPS.map((g: InboxGroupDef, index) => {
    const items = ordered.filter((i) => groupOf(i) === g.id).map((i) => views.get(i.id)!);
    return { id: g.id, no: index + 1, title: g.title, sub: g.sub, count: items.length, items };
  }).filter((g) => g.count > 0);
  return { count: open.length, minutes: inboxMinutes(open.length), groups };
}

/**
 * The open items as Heute's "Nächste Schritte": the first `limit` in the order of the page with
 * their letters, and the total count.
 */
export function inboxNextSteps(
  db: Executor,
  today: string,
  limit = 5,
): {
  items: Array<
    Pick<InboxItemView, 'id' | 'kind' | 'group' | 'letter' | 'title' | 'detail' | 'urgent'>
  >;
  count: number;
} {
  const view = listInbox(db, today);
  const items = view.groups
    .flatMap((g) => g.items)
    .slice(0, limit)
    .map(({ id, kind, group, letter, title, detail, urgent }) => ({
      id,
      kind,
      group,
      letter,
      title,
      detail,
      urgent,
    }));
  return { items, count: view.count };
}

// ---------------------------------------------------------------------------------------------
// Decisions (audited, one undo group each)
// ---------------------------------------------------------------------------------------------

export type InboxResolution = 'accepted' | 'dismissed' | 'rule';

export interface AcceptInput {
  /** Uncategorised booking: a category other than the suggestion. */
  categoryId?: string;
  /** Manual value: the new value in cents. */
  valueCents?: number;
}

export interface InboxDecision {
  groupId: string;
  /** Items closed by this action (more than one for a rule or "alle übernehmen"). */
  resolvedIds: string[];
}

export class InboxActionError extends Error {}

function openItem(db: Executor, id: string): typeof inboxItem.$inferSelect {
  const item = db.select().from(inboxItem).where(eq(inboxItem.id, id)).get();
  if (!item) throw new EntityNotFoundError('inbox_item', id);
  if (item.resolvedAt !== null) throw new ConflictError('This inbox item is already resolved');
  return item;
}

function close(
  tx: Executor,
  id: string,
  resolution: InboxResolution,
  ctx: ReturnType<typeof withGroup>,
): void {
  updateTracked(tx, inboxItem, [id], { resolvedAt: new Date().toISOString(), resolution }, ctx);
}

/** Set the category of the uncategorised outflow splits of a booking. */
function categorizeBooking(
  tx: Executor,
  bookingId: string,
  categoryId: string,
  ctx: ReturnType<typeof withGroup>,
): void {
  const splits = tx
    .select()
    .from(bookingSplit)
    .where(eq(bookingSplit.bookingId, bookingId))
    .orderBy(asc(bookingSplit.sortOrder), asc(bookingSplit.id))
    .all();
  const next: SplitInput[] = splits.map((s) => {
    const open =
      s.categoryId === null &&
      s.incomeTypeId === null &&
      s.contactId === null &&
      s.transferId === null &&
      s.amountCents < 0;
    return {
      categoryId: open ? categoryId : s.categoryId,
      amountCents: s.amountCents,
      memo: s.memo,
      contactId: s.contactId,
      incomeTypeId: s.incomeTypeId,
    };
  });
  // A category on a reconciled booking changes no balance; it must not block the work list.
  updateBooking(tx, bookingId, { splits: next }, ctx, { unlockReconciled: true });
}

function liveCategory(tx: Executor, id: string): string {
  const row = tx
    .select({ id: category.id })
    .from(category)
    .where(and(eq(category.id, id), isNull(category.deletedAt)))
    .get();
  if (!row) throw new EntityNotFoundError('category', id);
  return row.id;
}

function bookingPayee(tx: Executor, bookingId: string): string | null {
  return (
    tx.select({ p: booking.payeeId }).from(booking).where(eq(booking.id, bookingId)).get()?.p ??
    null
  );
}

/** "Übernehmen": do what the item proposes; the effect depends on the kind. */
export function acceptInboxItem(
  db: Executor,
  id: string,
  input: AcceptInput,
  ctx: AuditContext,
  today: string,
): InboxDecision {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const item = openItem(tx, id);
    if (item.kind === 'uncategorized' && item.refId) {
      const payeeId = bookingPayee(tx, item.refId);
      const categoryId =
        input.categoryId !== undefined
          ? liveCategory(tx, input.categoryId)
          : payeeId
            ? suggestions(tx, [payeeId]).get(payeeId)?.categoryId
            : undefined;
      if (!categoryId) throw new InboxActionError('There is no suggestion; choose a category');
      categorizeBooking(tx, item.refId, categoryId, grouped);
    } else if (item.kind === 'expected_payment' && item.refId) {
      const suggestion = upcoming(tx, occurrenceHorizon(today).from, today).find(
        (r) => r.occurrenceId === item.refId,
      )?.suggestion;
      // A missed payment has nothing to take over: accepting only confirms the gap.
      if (suggestion)
        addExpectedVersion(
          tx,
          suggestion.paymentId,
          { validFrom: `${suggestion.fromMonth}-01`, amountCents: suggestion.amountCents },
          grouped,
          today,
        );
    } else if (item.kind === 'stale_value' && item.refId && item.refType) {
      if (item.refType !== 'manual_price' && item.refType !== 'account_valuation') {
        // Market-data failure items carry no value to type: confirming closes them.
      } else {
        if (input.valueCents === undefined || input.valueCents < 0)
          throw new InboxActionError('Give the new value in cents');
        setManualValue(tx, item.refType, item.refId, input.valueCents, today, grouped);
      }
    } else if (item.kind === 'overspent') {
      throw new InboxActionError('An overspent envelope is covered in the plan');
    }
    close(tx, id, 'accepted', grouped);
    return { groupId: grouped.groupId, resolvedIds: [id] };
  });
}

/** The new value of a manual position (a manual price today) or account (a valuation today). */
function setManualValue(
  tx: Executor,
  refType: 'manual_price' | 'account_valuation',
  ref: string,
  valueCents: number,
  today: string,
  ctx: ReturnType<typeof withGroup>,
): void {
  const subjectId = ref.split('@')[0] as string;
  if (refType === 'account_valuation') {
    const existing = tx
      .select({ id: valuation.id })
      .from(valuation)
      .where(and(eq(valuation.accountId, subjectId), eq(valuation.date, today)))
      .get();
    if (existing)
      updateTracked(
        tx,
        valuation,
        [existing.id],
        { valueCents, source: 'manual', deletedAt: null },
        ctx,
      );
    else
      insertTracked(
        tx,
        valuation,
        { id: randomUUID(), accountId: subjectId, date: today, valueCents, source: 'manual' },
        ctx,
      );
    return;
  }
  const units = holdingValuesAsOf(tx, today)
    .filter((h) => h.securityId === subjectId)
    .reduce((sum, h) => sum + h.unitsE8, 0);
  if (units <= 0) throw new InboxActionError('The position is no longer held');
  if (valueCents <= 0) throw new InboxActionError('A held position needs a value above zero');
  const priceMicro = priceMicroForValue(valueCents, units);
  const existing = tx
    .select({ date: price.date })
    .from(price)
    .where(and(eq(price.securityId, subjectId), eq(price.date, today)))
    .get();
  if (existing)
    updateTracked(
      tx,
      price,
      [subjectId, today],
      { priceMicro, currency: 'EUR', source: 'manual' },
      ctx,
    );
  else
    insertTracked(
      tx,
      price,
      { securityId: subjectId, date: today, priceMicro, currency: 'EUR', source: 'manual' },
      ctx,
    );
}

/** "Ignorieren" / "Erledigt": close the item without changing anything. */
export function dismissInboxItem(db: Executor, id: string, ctx: AuditContext): InboxDecision {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    openItem(tx, id);
    close(tx, id, 'dismissed', grouped);
    return { groupId: grouped.groupId, resolvedIds: [id] };
  });
}

/** "Alle n übernehmen": accept every open uncategorised item that has a suggestion. */
export function acceptAllSuggestions(
  db: Executor,
  ctx: AuditContext,
  today: string,
): InboxDecision {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const resolvedIds: string[] = [];
    for (const g of listInbox(tx, today).groups)
      for (const item of g.items)
        if (item.kind === 'uncategorized' && item.suggestion) {
          resolvedIds.push(...acceptInboxItem(tx, item.id, {}, grouped, today).resolvedIds);
        }
    return { groupId: grouped.groupId, resolvedIds };
  });
}

/**
 * "Immer so zuordnen": an assignment rule payee → category (the suggestion, or `categoryId`),
 * applied to every open uncategorised booking of that payee. Applying it to imported rows is P4.
 * `match_json` is `{"payeeId": …}`.
 */
export function ruleFromInboxItem(
  db: Executor,
  id: string,
  input: { categoryId?: string },
  ctx: AuditContext,
): InboxDecision & { ruleId: string; categoryId: string; applied: number } {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const item = openItem(tx, id);
    if (item.kind !== 'uncategorized' || !item.refId)
      throw new InboxActionError('Only an uncategorised booking can become a rule');
    const payeeId = bookingPayee(tx, item.refId);
    if (!payeeId) throw new InboxActionError('The booking has no payee to match');
    const categoryId =
      input.categoryId !== undefined
        ? liveCategory(tx, input.categoryId)
        : suggestions(tx, [payeeId]).get(payeeId)?.categoryId;
    if (!categoryId) throw new InboxActionError('There is no suggestion; choose a category');
    const names = tx
      .select({ payee: payee.name, category: category.name })
      .from(payee)
      .innerJoin(category, eq(category.id, categoryId))
      .where(eq(payee.id, payeeId))
      .get();
    const ruleId = randomUUID();
    insertTracked(
      tx,
      assignmentRule,
      {
        id: ruleId,
        name: `${names?.payee ?? 'Empfänger'} → ${names?.category ?? 'Kategorie'}`,
        matchJson: JSON.stringify({ payeeId }),
        payeeId,
        categoryId,
      },
      grouped,
    );
    const resolvedIds: string[] = [];
    const openOnes = tx
      .select()
      .from(inboxItem)
      .where(
        and(
          eq(inboxItem.kind, 'uncategorized'),
          eq(inboxItem.refType, 'booking'),
          isNull(inboxItem.resolvedAt),
        ),
      )
      .all();
    for (const o of openOnes) {
      if (!o.refId || bookingPayee(tx, o.refId) !== payeeId) continue;
      categorizeBooking(tx, o.refId, categoryId, grouped);
      close(tx, o.id, 'rule', grouped);
      resolvedIds.push(o.id);
    }
    return {
      groupId: grouped.groupId,
      resolvedIds,
      ruleId,
      categoryId,
      applied: resolvedIds.length,
    };
  });
}
