import { cents as toCents, formatDecimal } from '@budget/domain';
import {
  buildCreate,
  distributeRest,
  emptyDraft,
  newSplit,
  splitRemainder,
  type BookingDraft,
  type SplitDraft,
} from '../ledger/booking-model';

/** Bank facts the "Alle Felder" section shows read-only and validates against. */
export interface BankLine {
  accountId: string;
  date: string;
  amountCents: number;
}

/** Owner input of the collapsed "Alle Felder" section of the bank confirmation (#1048). */
export interface BankAllFields {
  memo: string;
  projectId: string;
  splitOn: boolean;
  splits: SplitDraft[];
}

/** Same cap as the confirm API; the form says so instead of failing on the server. */
export const MAX_BANK_SPLIT_LINES = 50;
export const TOO_MANY_LINES = `Höchstens ${MAX_BANK_SPLIT_LINES} Zeilen.`;

export const emptyBankFields = (): BankAllFields => ({
  memo: '',
  projectId: '',
  splitOn: false,
  splits: [],
});

export interface BankSplitLine {
  categoryId: string | null;
  amountCents: number;
  memo?: string;
}

/**
 * The booking draft of a bank line: the bank amount and date are fixed facts, the kind follows
 * the sign. Split lines are typed relative to the booking (as in the booking form).
 */
export function bankDraft(line: BankLine, splits: ReadonlyArray<SplitDraft>): BookingDraft {
  return {
    ...emptyDraft(line.accountId, line.date),
    kind: line.amountCents < 0 ? 'expense' : 'income',
    amount: formatDecimal(toCents(Math.abs(line.amountCents))),
    splitOn: true,
    splits: [...splits],
  };
}

/** Lines when "Aufteilen" starts: the current category keeps the whole amount, plus one new line. */
export function startSplit(line: BankLine, categoryId: string): SplitDraft[] {
  return [
    newSplit({ categoryId, amount: formatDecimal(toCents(Math.abs(line.amountCents))) }),
    newSplit(),
  ];
}

/** Unsigned cents still to distribute (negative when over-allocated). */
export function bankSplitRest(line: BankLine, splits: ReadonlyArray<SplitDraft>): number {
  return splitRemainder(bankDraft(line, splits).amount, splits);
}

/** Fill one line with the rest, using the booking form's cent-exact helper. */
export function fillRest(line: BankLine, splits: ReadonlyArray<SplitDraft>, key: string) {
  return distributeRest(bankDraft(line, splits), key).splits;
}

/**
 * Validated, signed split lines for the confirm request, with the booking form's rules: at least
 * two lines, every line has an amount and the rest is exactly 0,00 €.
 */
export function bankSplitLines(
  line: BankLine,
  splits: ReadonlyArray<SplitDraft>,
): { ok: true; lines: BankSplitLine[] } | { ok: false; error: string } {
  if (splits.length > MAX_BANK_SPLIT_LINES) return { ok: false, error: TOO_MANY_LINES };
  const built = buildCreate(bankDraft(line, splits), null);
  if (!built.ok)
    return { ok: false, error: built.errors.splits ?? 'Die Aufteilung ist nicht vollständig.' };
  if (built.value.type !== 'booking') return { ok: false, error: 'Ungültige Aufteilung.' };
  return {
    ok: true,
    lines: built.value.splits.map((s) => ({
      categoryId: s.categoryId ?? null,
      amountCents: s.amountCents,
      ...(s.memo ? { memo: s.memo } : {}),
    })),
  };
}

/**
 * Optional confirm fields. Untouched fields are omitted so the request stays identical to the
 * previous one; an empty note keeps the bank's own text as before.
 */
export function bankConfirmExtras(
  line: BankLine,
  fields: BankAllFields,
  receiptIds: ReadonlyArray<string>,
):
  | {
      ok: true;
      extras: {
        memo?: string;
        projectId?: string;
        splits?: BankSplitLine[];
        receiptIds?: string[];
      };
    }
  | { ok: false; error: string } {
  const split = fields.splitOn ? bankSplitLines(line, fields.splits) : undefined;
  if (split && !split.ok) return split;
  const memo = fields.memo.trim();
  return {
    ok: true,
    extras: {
      ...(memo ? { memo } : {}),
      ...(fields.projectId ? { projectId: fields.projectId } : {}),
      ...(split?.ok ? { splits: split.lines } : {}),
      ...(receiptIds.length ? { receiptIds: [...receiptIds] } : {}),
    },
  };
}
