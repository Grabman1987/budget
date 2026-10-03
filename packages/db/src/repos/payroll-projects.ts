import {
  payrollReport,
  payslipInput,
  payrollTotals,
  isDuplicatePayslip,
  projectResult,
  monthsBetween,
  addMonths,
  monthOf,
  windowMonths,
  previousWindow,
  type CapturedPayslip,
  type PayslipInput,
  type ProjectFact,
  type SpendingPeriod,
} from '@budget/domain';
import { and, asc, eq, isNull, lte } from 'drizzle-orm';
import {
  account,
  booking,
  bookingSplit,
  category,
  INCOME_TYPES,
  payslip,
  payslipLine,
  payslipIntake,
  project,
  trade,
} from '../schema';
import { createEntity, getEntity, listEntities, softDeleteEntity, updateEntity } from './entities';
import { withGroup, type AuditContext } from './audit';
import { BookingInvariantError, EntityNotFoundError } from './errors';
import { getReceipt } from './receipts';
import { runInTransaction, type Executor } from './types';

export function listPayslips(db: Executor): CapturedPayslip[] {
  const lines = db
    .select()
    .from(payslipLine)
    .where(isNull(payslipLine.deletedAt))
    .orderBy(asc(payslipLine.sortOrder))
    .all();
  return listEntities(db, payslip).map((p) => ({
    ...p,
    lines: lines.filter((l) => l.payslipId === p.id),
  }));
}

/** One savepoint and audit group for the header and every captured line. */
export function savePayslip(
  db: Executor,
  raw: PayslipInput,
  ctx: AuditContext,
  id?: string,
  intakeId?: string,
) {
  const input = payslipInput.parse(raw),
    grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    if (isDuplicatePayslip(listEntities(tx, payslip), { ...input, ...(id ? { id } : {}) }))
      throw new BookingInvariantError(
        'Für diesen Monat und diese Zahlungsart ist bereits ein Gehaltszettel erfasst.',
      );
    if (input.bookingId) {
      const linked = getEntity(tx, booking, input.bookingId);
      const linkedAccount = linked ? getEntity(tx, account, linked.accountId) : undefined;
      const splits = tx
        .select()
        .from(bookingSplit)
        .where(eq(bookingSplit.bookingId, input.bookingId))
        .all();
      if (
        !linked ||
        !linkedAccount ||
        linked.date < linkedAccount.openingDate ||
        linked.currency !== 'EUR' ||
        linked.amountCents <= 0 ||
        linked.transferId ||
        !splits.some(
          (s) =>
            !s.contactId &&
            !s.transferId &&
            (s.incomeTypeId === INCOME_TYPES.salary.id ||
              s.incomeTypeId === INCOME_TYPES.special.id),
        )
      )
        throw new BookingInvariantError('Bitte eine bestehende EUR-Gehaltsbuchung verknüpfen.');
    }
    if (input.receiptId) {
      const pending = tx
        .select()
        .from(payslipIntake)
        .where(
          and(
            eq(payslipIntake.receiptId, input.receiptId),
            eq(payslipIntake.status, 'pending'),
            isNull(payslipIntake.deletedAt),
          ),
        )
        .get();
      if (pending && pending.id !== intakeId)
        throw new BookingInvariantError(
          'Bitte diesen Gehaltszettel zuerst im Posteingang bestätigen.',
        );
      try {
        getReceipt(tx, input.receiptId);
      } catch (error) {
        if (error instanceof EntityNotFoundError)
          throw new BookingInvariantError('Der Beleg ist nicht verfügbar.');
        throw error;
      }
    }
    const { lines, ...header } = input;
    const saved = id
      ? updateEntity(tx, payslip, id, header, grouped)
      : createEntity(tx, payslip, header, grouped);
    for (const line of listEntities(tx, payslipLine).filter((l) => l.payslipId === saved.id))
      softDeleteEntity(tx, payslipLine, line.id, grouped);
    lines.forEach((line, sortOrder) =>
      createEntity(tx, payslipLine, { ...line, payslipId: saved.id, sortOrder }, grouped),
    );
    return saved;
  });
}
export function deletePayslip(db: Executor, id: string, ctx: AuditContext) {
  const grouped = withGroup(ctx);
  runInTransaction(db, (tx) => {
    softDeleteEntity(tx, payslip, id, grouped);
    for (const line of listEntities(tx, payslipLine).filter((l) => l.payslipId === id))
      softDeleteEntity(tx, payslipLine, line.id, grouped);
  });
}

/** Combined regular/special slips can reference the same payout booking. Compare the sum once. */
export function readPayroll(db: Executor, month: string, today: string) {
  const slips = listPayslips(db);
  const salarySplits = db
    .select()
    .from(bookingSplit)
    .all()
    .filter(
      (s) =>
        !s.contactId &&
        !s.transferId &&
        (s.incomeTypeId === INCOME_TYPES.salary.id || s.incomeTypeId === INCOME_TYPES.special.id),
    );
  const salaryAmounts = new Map<string, number>();
  for (const s of salarySplits)
    salaryAmounts.set(s.bookingId, (salaryAmounts.get(s.bookingId) ?? 0) + s.amountCents);
  const links = slips.map((p) => {
    if (!p.bookingId)
      return {
        id: p.id,
        bookingId: null,
        accountId: null,
        status: 'unlinked' as const,
        differenceCents: null,
      };
    const b = getEntity(db, booking, p.bookingId);
    const accountRow = b ? getEntity(db, account, b.accountId) : undefined;
    const captured = payrollTotals(slips.filter((s) => s.bookingId === p.bookingId)).salaryNetCents;
    const differenceCents =
      b &&
      accountRow &&
      b.date >= accountRow.openingDate &&
      b.currency === 'EUR' &&
      b.amountCents > 0 &&
      !b.transferId &&
      salaryAmounts.has(b.id)
        ? salaryAmounts.get(b.id)! - captured
        : null;
    return {
      id: p.id,
      bookingId: p.bookingId,
      accountId: b?.accountId ?? null,
      status:
        differenceCents === null
          ? ('missing' as const)
          : differenceCents === 0
            ? ('ok' as const)
            : ('mismatch' as const),
      differenceCents,
    };
  });
  const candidates = db
    .select({
      id: booking.id,
      date: booking.date,
      amountCents: booking.amountCents,
      accountId: booking.accountId,
    })
    .from(booking)
    .innerJoin(account, eq(account.id, booking.accountId))
    .where(
      and(
        isNull(booking.deletedAt),
        isNull(account.deletedAt),
        eq(booking.currency, 'EUR'),
        isNull(booking.transferId),
      ),
    )
    .all()
    .filter((b) => salaryAmounts.has(b.id) && b.amountCents > 0)
    .map((b) => ({ ...b, amountCents: salaryAmounts.get(b.id)! }));
  return {
    ...payrollReport(slips, month),
    captured: slips,
    links,
    candidates,
    asOf: today,
    selectedMonth: month,
  };
}

export const projectsList = (db: Executor) =>
  listEntities(db, project, { orderBy: [asc(project.name), asc(project.id)] });

/** Project attribution is on the parent, financial effects are read once from each split. */
export function readProjects(db: Executor, period: SpendingPeriod, today: string) {
  const trades = new Set(
    db
      .select({ bookingId: trade.bookingId })
      .from(trade)
      .where(isNull(trade.deletedAt))
      .all()
      .map((t) => t.bookingId),
  );
  const rows = db
    .select({ b: booking, s: bookingSplit, a: account, c: category })
    .from(booking)
    .innerJoin(bookingSplit, eq(bookingSplit.bookingId, booking.id))
    .innerJoin(account, eq(account.id, booking.accountId))
    .leftJoin(category, eq(category.id, bookingSplit.categoryId))
    .where(and(isNull(booking.deletedAt), isNull(account.deletedAt), lte(booking.date, today)))
    .all();
  const first = rows.map((r) => monthOf(r.b.date)).sort()[0] ?? monthOf(today);
  // Closed months, like the prototype; YTD in January still means the current calendar year.
  const end = addMonths(monthOf(today), -1);
  const available = first <= end ? monthsBetween(first, end) : [];
  const months =
    period === 'YTD'
      ? available.filter((m) => m.startsWith(today.slice(0, 4)))
      : windowMonths(period, available);
  const priorMonths = previousWindow(months, available);
  const facts: (ProjectFact & { projectId: string | null; side: boolean; onBudget: boolean })[] =
    [];
  const unsupported: string[] = [];
  const unavailablePrior = new Set<string | null>();
  for (const { b, s, a, c } of rows) {
    if (
      b.date < a.openingDate ||
      b.transferId ||
      s.transferId ||
      s.contactId ||
      trades.has(b.id) ||
      s.incomeTypeId === INCOME_TYPES.capital.id ||
      c?.kind === 'advance' ||
      c?.kind === 'invest' ||
      c?.kind === 'debt' ||
      c?.kind === 'card_payment'
    )
      continue;
    const income =
      s.incomeTypeId !== null &&
      s.incomeTypeId !== INCOME_TYPES.refund.id &&
      (s.categoryId === null || c?.kind === 'income');
    const side = income && s.incomeTypeId === INCOME_TYPES.side.id;
    if (b.currency !== 'EUR') {
      if (months.includes(monthOf(b.date)) && (b.projectId || side)) unsupported.push(b.id);
      if (priorMonths?.includes(monthOf(b.date))) unavailablePrior.add(b.projectId);
      continue;
    }
    // Untyped inflows cannot be presumed earnings. Refunds are signed cost reductions.
    if (!income && s.amountCents >= 0 && s.incomeTypeId !== INCOME_TYPES.refund.id && !s.categoryId)
      continue;
    facts.push({
      month: monthOf(b.date),
      amountCents: s.amountCents,
      kind: income ? 'income' : 'cost',
      bookingId: b.id,
      projectId: b.projectId,
      side,
      onBudget: a.onBudget,
    });
  }
  const projects = projectsList(db).map((p) => {
    const attributed = facts.filter((f) => f.projectId === p.id);
    return {
      ...p,
      ...projectResult(attributed, months),
      previous:
        priorMonths && !unavailablePrior.has(p.id)
          ? projectResult(attributed, priorMonths).resultCents
          : null,
    };
  });
  return {
    period,
    asOf: today,
    months,
    projects,
    unsupportedBookingIds: [...new Set(unsupported)],
    total: projectResult(
      facts.filter((f) => projects.some((p) => p.id === f.projectId)),
      months,
    ),
    sideIncome: projectResult(
      facts.filter((f) => f.side && f.onBudget),
      months,
    ),
    unassignedSideIncome: projectResult(
      facts.filter((f) => f.side && f.onBudget && !f.projectId),
      months,
    ),
  };
}
