import { createHash } from 'node:crypto';
import { and, eq, gte, isNull, lte, ne, inArray } from 'drizzle-orm';
import {
  addDays,
  cleanBankPayee,
  counterpartyKey,
  detectRecurrence,
  monthOf,
  type Rhythm,
} from '@budget/domain';
import {
  appSetting,
  booking,
  bookingSplit,
  expectedOccurrence,
  expectedPayment,
  payee,
} from '../schema';
import { insertTracked, withGroup, type AuditContext } from './audit';
import { readPayeeCleanup } from './assignment-rules';
import { ConflictError } from './errors';
import { createExpectedPayment, type ExpectedPaymentInput } from './expected';
import { runInTransaction, type Executor } from './types';

/** How far back the history is read for detection. */
const HISTORY_DAYS = 800;
const DISMISSED_PREFIX = 'rd:';

export interface RecurringSuggestion {
  id: string;
  name: string;
  kind: 'outflow' | 'inflow';
  accountId: string;
  payeeId: string | null;
  categoryId: string | null;
  incomeTypeId: string | null;
  rhythm: Rhythm;
  intervalWeeks: number | null;
  dueDay: number;
  dueMonth: number | null;
  startDate: string | null;
  /** Positive cents. */
  amountCents: number;
  toleranceCents: number;
  currency: string;
  count: number;
  lastDate: string;
}

const mostCommon = (values: (string | null)[]): string | null => {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};

/**
 * Recurring bookings without an expected payment: three or more confirmed bookings of one payee
 * (or bank counterparty key) on one account and direction with a regular interval and a steady
 * amount (`detectRecurrence`). Read-only; dismissed suggestions and groups an expected payment
 * already covers (same payee or name, or linked bookings) stay out.
 */
export function recurringSuggestions(db: Executor, today: string): RecurringSuggestion[] {
  const rows = db
    .select({ b: booking, s: bookingSplit })
    .from(booking)
    .leftJoin(bookingSplit, eq(bookingSplit.bookingId, booking.id))
    .where(
      and(
        isNull(booking.deletedAt),
        isNull(booking.transferId),
        ne(booking.source, 'system'),
        inArray(booking.status, ['confirmed', 'reconciled']),
        gte(booking.date, addDays(today, -HISTORY_DAYS)),
        lte(booking.date, today),
        ne(booking.amountCents, 0),
      ),
    )
    .all();
  const byBooking = new Map<
    string,
    { b: typeof booking.$inferSelect; s: (typeof bookingSplit.$inferSelect)[] }
  >();
  for (const { b, s } of rows) {
    const entry = byBooking.get(b.id) ?? { b, s: [] };
    if (s) entry.s.push(s);
    byBooking.set(b.id, entry);
  }
  const cleanup = new Map<string, ReturnType<typeof readPayeeCleanup>>();
  const groups = new Map<
    string,
    { b: typeof booking.$inferSelect; s: (typeof bookingSplit.$inferSelect)[]; text: string }[]
  >();
  for (const entry of byBooking.values()) {
    const { b, s } = entry;
    if (s.some((split) => split.transferId)) continue;
    let key: string;
    let text = '';
    if (b.payeeId) key = 'p:' + b.payeeId;
    else {
      const source = b.bankSourceId ?? '';
      const options = cleanup.get(source) ?? readPayeeCleanup(db, source);
      cleanup.set(source, options);
      text = cleanBankPayee(b.bankRawPayee, b.bankRawText ?? '', options);
      const bankKey = b.source === 'bank' ? counterpartyKey(text) : '';
      if (!bankKey) continue;
      key = 'c:' + bankKey;
    }
    const gk = JSON.stringify([b.accountId, key, Math.sign(b.amountCents)]);
    const list = groups.get(gk) ?? [];
    list.push({ ...entry, text });
    groups.set(gk, list);
  }
  const payments = db.select().from(expectedPayment).where(isNull(expectedPayment.deletedAt)).all();
  const linked = new Set(
    db
      .select({ id: expectedOccurrence.bookingId })
      .from(expectedOccurrence)
      .where(isNull(expectedOccurrence.deletedAt))
      .all()
      .flatMap((r) => (r.id ? [r.id] : [])),
  );
  const dismissed = new Set(
    db
      .select({ id: appSetting.id })
      .from(appSetting)
      .all()
      .filter((r) => r.id.startsWith(DISMISSED_PREFIX))
      .map((r) => r.id.slice(DISMISSED_PREFIX.length)),
  );
  const payees = new Map(
    db
      .select()
      .from(payee)
      .all()
      .map((p) => [p.id, p.name]),
  );
  const out: RecurringSuggestion[] = [];
  for (const [gk, list] of groups) {
    if (list.length < 3) continue;
    const [accountId, key, sign] = JSON.parse(gk) as [string, string, number];
    const kind = sign < 0 ? 'outflow' : 'inflow';
    const id = createHash('sha256')
      .update(JSON.stringify([accountId, key, kind]))
      .digest('hex')
      .slice(0, 16);
    if (dismissed.has(id)) continue;
    list.sort((a, b) => b.b.date.localeCompare(a.b.date) || b.b.id.localeCompare(a.b.id));
    const latest = list[0]!.b;
    if (list.some((x) => x.b.currency !== latest.currency)) continue;
    const payeeId = key.startsWith('p:') ? key.slice(2) : null;
    const name = (payeeId ? payees.get(payeeId) : list[0]!.text)?.trim().slice(0, 120);
    if (!name) continue;
    const nameKey = counterpartyKey(name);
    const covered = payments.some(
      (p) =>
        p.kind === kind &&
        (p.accountId === null || p.accountId === accountId) &&
        ((payeeId !== null && p.payeeId === payeeId) || counterpartyKey(p.name) === nameKey),
    );
    if (covered || list.some((x) => linked.has(x.b.id))) continue;
    const found = detectRecurrence(
      list.map((x) => ({ date: x.b.date, amountCents: x.b.amountCents })),
      today,
    );
    if (!found) continue;
    const recent = list.slice(0, 6).flatMap((x) => (x.s.length === 1 ? [x.s[0]!] : []));
    out.push({
      id,
      name,
      kind,
      accountId,
      payeeId,
      categoryId: mostCommon(recent.map((s) => s.categoryId)),
      incomeTypeId: kind === 'inflow' ? mostCommon(recent.map((s) => s.incomeTypeId)) : null,
      rhythm: found.rhythm,
      intervalWeeks: found.intervalWeeks,
      dueDay: found.dueDay,
      dueMonth: found.dueMonth,
      startDate: found.startDate,
      amountCents: found.amountCents,
      toleranceCents: found.toleranceCents,
      currency: latest.currency,
      count: found.count,
      lastDate: found.lastDate,
    });
  }
  return out.sort((a, b) => b.lastDate.localeCompare(a.lastDate) || a.name.localeCompare(b.name));
}

function suggestionById(db: Executor, id: string, today: string): RecurringSuggestion {
  const found = recurringSuggestions(db, today).find((s) => s.id === id);
  if (!found) throw new ConflictError('Vorschlag nicht mehr verfügbar.');
  return found;
}

/** Accepting creates the expected payment with the detected cadence, amount, category and account. */
export function acceptRecurringSuggestion(
  db: Executor,
  id: string,
  ctx: AuditContext,
  today: string,
) {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const s = suggestionById(tx, id, today);
    const input: ExpectedPaymentInput = {
      name: s.name,
      kind: s.kind,
      accountId: s.accountId,
      payeeId: s.payeeId,
      categoryId: s.kind === 'outflow' || !s.incomeTypeId ? s.categoryId : null,
      incomeTypeId: s.kind === 'inflow' ? s.incomeTypeId : null,
      amountToleranceCents: s.toleranceCents,
      rhythm: s.rhythm,
      dueDay: s.dueDay,
      dueMonth: s.dueMonth,
      startDate: s.startDate,
      intervalWeeks: s.intervalWeeks,
    } as ExpectedPaymentInput;
    const result = createExpectedPayment(
      tx,
      input,
      {
        validFrom: s.startDate ?? `${monthOf(today)}-01`,
        amountCents: s.amountCents,
        currency: s.currency,
      },
      grouped,
      today,
    );
    return { paymentId: result.payment.id, groupId: grouped.groupId };
  });
}

/** Dismissing is remembered and undoable; the suggestion does not come back. */
export function dismissRecurringSuggestion(
  db: Executor,
  id: string,
  ctx: AuditContext,
  today: string,
) {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    suggestionById(tx, id, today);
    insertTracked(tx, appSetting, { id: DISMISSED_PREFIX + id, value: '1' }, grouped);
    return { groupId: grouped.groupId };
  });
}
