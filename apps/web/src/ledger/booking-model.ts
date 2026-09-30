import { formatDecimal, cents as toCents, parseAmount } from '@budget/domain';
import type { BookingCreate, BookingPatch, SplitInput } from './api';
import type { BookingFlag, ListedBooking } from './types';

/** Form state of the booking panel (texts as typed) and its translation to API payloads. */

export type BookingKind = 'expense' | 'income' | 'transfer';

export interface SplitDraft {
  key: string;
  categoryId: string;
  amount: string;
  memo: string;
}

export interface BookingDraft {
  kind: BookingKind;
  accountId: string;
  /** Transfers only: the account the money goes to. */
  toAccountId: string;
  date: string;
  /** Always positive as typed; the kind decides the sign. */
  amount: string;
  payee: string;
  /** `''` = no category. */
  categoryId: string;
  memo: string;
  status: 'pending' | 'confirmed';
  flag: '' | BookingFlag;
  splitOn: boolean;
  splits: SplitDraft[];
}

export type DraftErrors = Partial<
  Record<'amount' | 'account' | 'toAccount' | 'date' | 'splits', string>
>;

let splitSeq = 0;
export const newSplit = (over: Partial<SplitDraft> = {}): SplitDraft => ({
  key: `s${++splitSeq}`,
  categoryId: '',
  amount: '',
  memo: '',
  ...over,
});

export const emptyDraft = (accountId: string, date: string): BookingDraft => ({
  kind: 'expense',
  accountId,
  toAccountId: '',
  date,
  amount: '',
  payee: '',
  categoryId: '',
  memo: '',
  status: 'confirmed',
  flag: '',
  splitOn: false,
  splits: [],
});

const plain = (value: number) => formatDecimal(toCents(Math.abs(value)));

/** Draft that shows an existing booking; `reconciled` is shown as confirmed (status stays as is). */
export function draftFromBooking(b: ListedBooking): BookingDraft {
  const several = b.splits.length > 1;
  return {
    kind: b.transferId ? 'transfer' : b.amountCents < 0 ? 'expense' : 'income',
    accountId: b.accountId,
    toAccountId: b.transferAccountId ?? '',
    date: b.date,
    amount: plain(b.amountCents),
    payee: b.payeeName ?? '',
    categoryId: b.splits[0]?.categoryId ?? '',
    memo: b.memo ?? '',
    status: b.status === 'pending' ? 'pending' : 'confirmed',
    flag: b.flag ?? '',
    splitOn: several,
    splits: several
      ? b.splits.map((s) =>
          newSplit({
            categoryId: s.categoryId ?? '',
            amount: plain(s.amountCents),
            memo: s.memo ?? '',
          }),
        )
      : [],
  };
}

const amountOf = (text: string): number | undefined => {
  const parsed = parseAmount(text);
  return parsed.ok ? Math.abs(parsed.cents) : undefined;
};

/** Total minus the split amounts entered so far (in absolute cents); negative when over-allocated. */
export function splitRemainder(total: string, splits: ReadonlyArray<SplitDraft>): number {
  const sum = splits.reduce((s, x) => s + (amountOf(x.amount) ?? 0), 0);
  return (amountOf(total) ?? 0) - sum;
}

const sign = (kind: BookingKind, abs: number) => (kind === 'income' ? abs : -abs);

interface Built<T> {
  ok: true;
  value: T;
}
interface Failed {
  ok: false;
  errors: DraftErrors;
}

/** Common checks; returns the absolute amount and the split inputs (with signs) when valid. */
function validate(draft: BookingDraft): {
  errors: DraftErrors;
  abs?: number;
  splits?: SplitInput[];
} {
  const errors: DraftErrors = {};
  const abs = amountOf(draft.amount);
  if (abs === undefined || abs === 0) errors.amount = 'Bitte einen Betrag ungleich 0 eintragen.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) errors.date = 'Bitte ein Datum wählen.';
  if (!draft.accountId) errors.account = 'Bitte ein Konto wählen.';
  if (draft.kind === 'transfer') {
    if (!draft.toAccountId) errors.toAccount = 'Bitte das Zielkonto wählen.';
    else if (draft.toAccountId === draft.accountId)
      errors.toAccount = 'Quelle und Ziel müssen verschiedene Konten sein.';
  }
  let splits: SplitInput[] | undefined;
  if (draft.splitOn && draft.kind !== 'transfer') {
    if (draft.splits.length < 2) errors.splits = 'Eine Aufteilung braucht mindestens zwei Zeilen.';
    else if (draft.splits.some((s) => (amountOf(s.amount) ?? 0) === 0))
      errors.splits = 'Jede Zeile braucht einen Betrag.';
    else if (abs !== undefined && splitRemainder(draft.amount, draft.splits) !== 0)
      errors.splits = 'Die Aufteilung ergibt nicht den Gesamtbetrag.';
    else
      splits = draft.splits.map((s) => ({
        categoryId: s.categoryId || null,
        amountCents: sign(draft.kind, amountOf(s.amount) ?? 0),
        ...(s.memo.trim() ? { memo: s.memo.trim() } : {}),
      }));
  }
  return { errors, ...(abs !== undefined ? { abs } : {}), ...(splits ? { splits } : {}) };
}

/** Payload for `POST /bookings`. `payeeId` was resolved from the typed name by the caller. */
export function buildCreate(
  draft: BookingDraft,
  payeeId: string | null,
): Built<BookingCreate> | Failed {
  const { errors, abs, splits } = validate(draft);
  if (Object.keys(errors).length > 0 || abs === undefined) return { ok: false, errors };
  const memo = draft.memo.trim() || null;
  if (draft.kind === 'transfer') {
    return {
      ok: true,
      value: {
        type: 'transfer',
        fromAccountId: draft.accountId,
        toAccountId: draft.toAccountId,
        date: draft.date,
        amountCents: abs,
        categoryId: draft.categoryId || null,
        memo,
        status: draft.status,
      },
    };
  }
  return {
    ok: true,
    value: {
      type: 'booking',
      accountId: draft.accountId,
      date: draft.date,
      amountCents: sign(draft.kind, abs),
      payeeId,
      memo,
      status: draft.status,
      flag: draft.flag || null,
      splits: splits ?? [
        { categoryId: draft.categoryId || null, amountCents: sign(draft.kind, abs) },
      ],
    },
  };
}

/** Only the fields that differ from the stored booking (`PATCH /bookings/:id`). */
export function buildPatch(
  original: ListedBooking,
  draft: BookingDraft,
  payeeId: string | null,
  unlockReconciled: boolean,
): Built<BookingPatch> | Failed {
  const { errors, abs, splits } = validate(draft);
  // The accounts of a transfer leg cannot change; do not complain about them.
  delete errors.toAccount;
  if (original.transferId) delete errors.account;
  if (Object.keys(errors).length > 0 || abs === undefined) return { ok: false, errors };
  const amountCents = original.transferId
    ? original.amountCents < 0
      ? -abs
      : abs
    : sign(draft.kind, abs);
  const patch: BookingPatch = {};
  if (draft.date !== original.date) patch.date = draft.date;
  if (amountCents !== original.amountCents) patch.amountCents = amountCents;
  if (!original.transferId && draft.accountId !== original.accountId)
    patch.accountId = draft.accountId;
  if (!original.transferId && payeeId !== original.payeeId) patch.payeeId = payeeId;
  const memo = draft.memo.trim() || null;
  if (memo !== original.memo) patch.memo = memo;
  if (draft.flag !== (original.flag ?? '')) patch.flag = draft.flag || null;
  const status = original.status === 'pending' ? 'pending' : 'confirmed';
  if (draft.status !== status) patch.status = draft.status;
  const before = original.splits.map(
    (s) => `${s.categoryId ?? ''}|${s.amountCents}|${s.memo ?? ''}`,
  );
  const after = (
    splits ?? [{ categoryId: draft.categoryId || null, amountCents, memo: undefined }]
  ).map((s) => `${s.categoryId ?? ''}|${s.amountCents}|${s.memo ?? ''}`);
  if (before.join(';') !== after.join(';')) {
    if (splits) patch.splits = splits;
    else if (original.splits.length <= 1)
      patch.splits = [{ categoryId: draft.categoryId || null, amountCents }];
  }
  if (unlockReconciled) patch.unlockReconciled = true;
  return { ok: true, value: patch };
}

/** Does the patch touch what a geprüft booking protects (everything except flag and memo)? */
export const touchesLocked = (patch: BookingPatch): boolean =>
  Object.keys(patch).some((k) => k !== 'flag' && k !== 'memo' && k !== 'unlockReconciled');
