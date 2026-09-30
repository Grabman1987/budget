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
  /** Not edited in the panel, but kept: an edit must not drop the income type or contact share. */
  contactId: string | null;
  incomeTypeId: string | null;
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
  /** `''` = no category ("Zu verteilen" on an income). */
  categoryId: string;
  /** Income only: what kind of income this is (Gehalt, Sonderzahlung, …); `''` = none. */
  incomeTypeId: string;
  projectId: string;
  memo: string;
  status: 'pending' | 'confirmed';
  flag: '' | BookingFlag;
  splitOn: boolean;
  splits: SplitDraft[];
}

export type DraftErrors = Partial<
  Record<'amount' | 'account' | 'toAccount' | 'date' | 'splits' | 'category', string>
>;

let splitSeq = 0;
export const newSplit = (over: Partial<SplitDraft> = {}): SplitDraft => ({
  key: `s${++splitSeq}`,
  categoryId: '',
  amount: '',
  memo: '',
  contactId: null,
  incomeTypeId: null,
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
  incomeTypeId: '',
  projectId: '',
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
    incomeTypeId: b.splits[0]?.incomeTypeId ?? '',
    projectId: b.projectId ?? '',
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
            contactId: s.contactId,
            incomeTypeId: s.incomeTypeId,
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
export interface ValidateOptions {
  /** Capture wants a category on every new spend; editing an imported booking does not. */
  requireCategory?: boolean;
  /** A transfer between a budget and a tracking account is categorised (SPEC §5.3). */
  transferNeedsCategory?: boolean;
}

function validate(
  draft: BookingDraft,
  options: ValidateOptions = {},
): {
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
  if (options.requireCategory && !draft.categoryId && !draft.splitOn) {
    if (draft.kind === 'expense')
      errors.category = 'Kategorie fehlt. Wähle einen Vorschlag oder „Alle“.';
    if (draft.kind === 'transfer' && options.transferNeedsCategory)
      errors.category =
        'Umbuchungen auf Tracking-Konten brauchen eine Kategorie, z. B. Investieren.';
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
        ...(s.contactId ? { contactId: s.contactId } : {}),
        ...(s.incomeTypeId ? { incomeTypeId: s.incomeTypeId } : {}),
      }));
  }
  return { errors, ...(abs !== undefined ? { abs } : {}), ...(splits ? { splits } : {}) };
}

/** Payload for `POST /bookings`. `payeeId` was resolved from the typed name by the caller. */
export function buildCreate(
  draft: BookingDraft,
  payeeId: string | null,
  options: ValidateOptions = {},
): Built<BookingCreate> | Failed {
  const { errors, abs, splits } = validate(draft, options);
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
        ...(draft.projectId ? { projectId: draft.projectId } : {}),
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
      ...(draft.projectId ? { projectId: draft.projectId } : {}),
      splits: splits ?? [
        {
          categoryId: draft.categoryId || null,
          amountCents: sign(draft.kind, abs),
          ...(draft.kind === 'income' && draft.incomeTypeId
            ? { incomeTypeId: draft.incomeTypeId }
            : {}),
        },
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
  if (draft.projectId !== (original.projectId ?? '')) patch.projectId = draft.projectId || null;
  const status = original.status === 'pending' ? 'pending' : 'confirmed';
  if (draft.status !== status) patch.status = draft.status;
  // A single split keeps everything the panel does not edit (memo, contact share, income type):
  // the server stores a missing field as null, and a memo-only change must not touch the split
  // (that would trip the lock of a geprüft booking).
  const single = keepSplit(
    original.splits[0],
    draft.categoryId || null,
    amountCents,
    // The income type is edited for an income; a spend keeps whatever the booking carries.
    draft.kind === 'income' ? draft.incomeTypeId || null : undefined,
  );
  const key = (s: SplitInput) =>
    `${s.categoryId ?? ''}|${s.amountCents}|${s.memo ?? ''}|${s.contactId ?? ''}|${s.incomeTypeId ?? ''}`;
  const before = original.splits.map(key);
  const after = (splits ?? [single]).map(key);
  if (before.join(';') !== after.join(';')) {
    if (splits) patch.splits = splits;
    else if (original.splits.length <= 1) patch.splits = [single];
  }
  if (unlockReconciled) patch.unlockReconciled = true;
  return { ok: true, value: patch };
}

/** The split payload for a new category or amount that keeps the split's other fields. */
export function keepSplit(
  split: ListedBooking['splits'][number] | undefined,
  categoryId: string | null,
  amountCents: number,
  /** `undefined` keeps the split's income type, `null` clears it. */
  incomeTypeId?: string | null,
): SplitInput {
  const incomeType = incomeTypeId === undefined ? (split?.incomeTypeId ?? null) : incomeTypeId;
  return {
    categoryId,
    amountCents,
    ...(split?.memo ? { memo: split.memo } : {}),
    ...(split?.contactId ? { contactId: split.contactId } : {}),
    ...(incomeType ? { incomeTypeId: incomeType } : {}),
  };
}

/** Does the patch touch what a geprüft booking protects (everything except flag and memo)? */
export const touchesLocked = (patch: BookingPatch): boolean =>
  Object.keys(patch).some((k) => k !== 'flag' && k !== 'memo' && k !== 'unlockReconciled');
