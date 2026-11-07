import { todayInVienna, type ContactAllocation } from '@budget/domain';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { booking, bookingSplit, contact } from '../schema';
import { withGroup, type AuditContext } from './audit';
import { chooseContactCredit, getContactStatement, reallocateContactRepayment } from './contacts';
import {
  BookingInvariantError,
  ConflictError,
  EntityNotFoundError,
  ReconciledLockedError,
} from './errors';
import { OperatorInputError } from './operator-ops';
import { runInTransaction, type Executor } from './types';

const id = z.string().trim().min(1).max(100);
const cents = z.number().int().safe().positive();
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().startsWith(value);
  });
const entrySchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('reallocate'),
      contactId: id,
      receiptSplitId: id,
      allocations: z.array(z.object({ outlaySplitId: id, amountCents: cents }).strict()).max(1000),
    })
    .strict(),
  z
    .object({
      action: z.literal('credit'),
      contactId: id,
      receiptSplitId: id,
      date: day,
      amountCents: cents,
      choice: z.enum(['free', 'category', 'gift']),
      categoryId: id.optional(),
      accountId: id.optional(),
    })
    .strict()
    .refine(
      (entry) =>
        (entry.choice === 'category' ? !!entry.categoryId : entry.categoryId === undefined) &&
        (entry.choice === 'gift' || entry.accountId === undefined),
    ),
]);
const fileSchema = z.object({ entries: z.array(entrySchema).max(1000) }).strict();
export type ContactAllocateFile = z.infer<typeof fileSchema>;
type Entry = ContactAllocateFile['entries'][number];

/** Reject malformed files before any entry writes; error text never echoes submitted data. */
export function parseContactAllocateFile(value: unknown): ContactAllocateFile {
  const parsed = fileSchema.safeParse(value);
  if (!parsed.success)
    throw new OperatorInputError(
      'Invalid contact-allocate file; expected entries with valid IDs, actions and integer cents',
    );
  return parsed.data;
}

const REFUSALS = {
  unknown_contact: 'The contact is missing or deleted.',
  invalid_receipt: 'The receipt is missing, deleted or belongs to another contact.',
  invalid_outlay: 'An outlay is missing, deleted or belongs to another contact.',
  future_decision: 'The credit decision date is in the future.',
  reconciled_locked:
    'An affected booking is reconciled; use the existing explicit unlock path first.',
  invalid_allocation:
    'The allocation is not permitted by the current contact balances or dependencies.',
  invalid_credit_choice:
    'The credit choice is not permitted by the current credit, category, account or dependencies.',
  conflict: 'The entry conflicts with the current stored state.',
  not_found: 'A referenced entity no longer exists.',
} as const;
type RefusalCode = keyof typeof REFUSALS;
class EntryRefusal extends Error {
  constructor(readonly code: RefusalCode) {
    super(REFUSALS[code]);
  }
}
class DryRunRollback extends Error {}

export interface ContactAllocateOutcome {
  /** Zero-based position in the submitted file; no account/contact data in the report. */
  index: number;
  action: Entry['action'];
  status: 'updated' | 'unchanged' | 'skipped';
  reason: RefusalCode | '';
  detail: string;
  groupId: string;
}

function preflight(tx: Executor, entry: Entry, today: string) {
  const owner = tx.select().from(contact).where(eq(contact.id, entry.contactId)).get();
  if (!owner || owner.deletedAt) throw new EntryRefusal('unknown_contact');
  const receipt = tx
    .select()
    .from(bookingSplit)
    .where(eq(bookingSplit.id, entry.receiptSplitId))
    .get();
  const source =
    receipt && tx.select().from(booking).where(eq(booking.id, receipt.bookingId)).get();
  if (
    !receipt ||
    receipt.contactId !== entry.contactId ||
    receipt.amountCents <= 0 ||
    !source ||
    source.deletedAt
  )
    throw new EntryRefusal('invalid_receipt');
  if (source.status === 'reconciled') throw new EntryRefusal('reconciled_locked');
  if (entry.action === 'credit') {
    if (entry.date > today) throw new EntryRefusal('future_decision');
    return;
  }
  for (const allocation of entry.allocations) {
    const split = tx
      .select()
      .from(bookingSplit)
      .where(eq(bookingSplit.id, allocation.outlaySplitId))
      .get();
    const outlay = split && tx.select().from(booking).where(eq(booking.id, split.bookingId)).get();
    if (
      !split ||
      split.contactId !== entry.contactId ||
      split.amountCents >= 0 ||
      !outlay ||
      outlay.deletedAt
    )
      throw new EntryRefusal('invalid_outlay');
  }
}

function refusal(error: unknown, entry: Entry): RefusalCode {
  if (error instanceof EntryRefusal) return error.code;
  if (error instanceof ReconciledLockedError) return 'reconciled_locked';
  if (error instanceof EntityNotFoundError) return 'not_found';
  if (error instanceof ConflictError) return 'conflict';
  if (error instanceof BookingInvariantError)
    return entry.action === 'reallocate' ? 'invalid_allocation' : 'invalid_credit_choice';
  // Unexpected failures abort the run, including previously successful entries.
  throw error;
}

/** The UI writers own financial validation. One group per run; one savepoint per entry. */
export function applyContactAllocations(
  db: Executor,
  file: ContactAllocateFile,
  ctx: AuditContext,
  options: { dryRun?: boolean; today?: string } = {},
): ContactAllocateOutcome[] {
  const input = parseContactAllocateFile(file);
  const today = options.today ?? todayInVienna();
  const grouped = withGroup(ctx);
  const outcomes: ContactAllocateOutcome[] = [];
  try {
    runInTransaction(db, (tx) => {
      for (const [index, entry] of input.entries.entries()) {
        try {
          const status = runInTransaction(tx, (inner) => {
            preflight(inner, entry, today);
            if (entry.action === 'reallocate') {
              const previous = getContactStatement(inner, entry.contactId, today).receipts.find(
                (receipt) => receipt.recorded && receipt.receiptSplitId === entry.receiptSplitId,
              );
              const canonical = (allocations: { allocations: ContactAllocation[] }) =>
                JSON.stringify(
                  allocations.allocations.map((a) => [a.outlaySplitId, a.amountCents]).sort(),
                );
              if (previous && canonical(previous) === canonical(entry)) return 'unchanged' as const;
              reallocateContactRepayment(
                inner,
                entry.contactId,
                entry.receiptSplitId,
                { allocations: entry.allocations },
                grouped,
                today,
              );
            } else {
              chooseContactCredit(
                inner,
                entry.contactId,
                {
                  receiptSplitId: entry.receiptSplitId,
                  amountCents: entry.amountCents,
                  date: entry.date,
                  choice: entry.choice,
                  ...(entry.categoryId === undefined ? {} : { categoryId: entry.categoryId }),
                  ...(entry.accountId === undefined ? {} : { accountId: entry.accountId }),
                },
                grouped,
                today,
              );
            }
            return 'updated' as const;
          });
          outcomes.push({
            index,
            action: entry.action,
            status,
            reason: '',
            detail:
              status === 'unchanged'
                ? 'The selected allocations are already saved.'
                : 'The contact decision was applied.',
            groupId: status === 'unchanged' ? '' : grouped.groupId,
          });
        } catch (error) {
          const reason = refusal(error, entry);
          outcomes.push({
            index,
            action: entry.action,
            status: 'skipped',
            reason,
            detail: REFUSALS[reason],
            groupId: '',
          });
        }
      }
      if (options.dryRun) throw new DryRunRollback();
    });
  } catch (error) {
    if (!(error instanceof DryRunRollback)) throw error;
    return outcomes.map((outcome) => ({ ...outcome, groupId: '' }));
  }
  return outcomes;
}
