import { formatDecimal, cents as toCents, parseAmount } from '@budget/domain';
import type { ListedBooking } from '../ledger/types';
import type { DateShift, ExpectedKind, ExpectedPayment, PaymentFields, Rhythm } from './api';

/** Text state of the payment form and its reading into API fields (pure, unit-tested). */

export interface PaymentDraft {
  name: string;
  kind: ExpectedKind;
  accountId: string;
  payeeId: string;
  contactId: string;
  categoryId: string;
  incomeTypeId: string;
  /** Percent with up to two decimals (`50`, `33,33`). */
  sharePercent: string;
  tolerance: string;
  windowDays: string;
  rhythm: Rhythm;
  dueDay: string;
  dueMonth: string;
  dateShift: DateShift;
  startDate: string;
  endDate: string;
  note: string;
  // First version (creating only).
  amount: string;
  amountMax: string;
  currency: string;
  validFrom: string;
}

export const emptyDraft = (today: string): PaymentDraft => ({
  name: '',
  kind: 'outflow',
  accountId: '',
  payeeId: '',
  contactId: '',
  categoryId: '',
  incomeTypeId: '',
  sharePercent: '',
  tolerance: '',
  windowDays: '3',
  rhythm: 'monthly',
  dueDay: String(Number(today.slice(8, 10))),
  dueMonth: '',
  dateShift: 'none',
  startDate: '',
  endDate: '',
  note: '',
  amount: '',
  amountMax: '',
  currency: 'EUR',
  validFrom: '',
});

/** Basis points as percent text: 5000 -> `50`, 3333 -> `33,33`. */
export function percentText(bp: number): string {
  const whole = Math.trunc(bp / 100);
  const fraction = String(bp % 100)
    .padStart(2, '0')
    .replace(/0$/, '');
  return bp % 100 === 0 ? String(whole) : `${whole},${fraction}`;
}

/** `50`, `33,33` or `12.5` as basis points; undefined when it is not 0 to 100 with two decimals. */
export function parsePercentBp(text: string): number | undefined {
  const match = /^(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(text.trim());
  if (!match) return undefined;
  const bp = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0') || '0');
  return bp <= 10_000 ? bp : undefined;
}

export function draftFromPayment(p: ExpectedPayment): PaymentDraft {
  return {
    name: p.name,
    kind: p.kind,
    accountId: p.accountId ?? '',
    payeeId: p.payeeId ?? '',
    contactId: p.contactId ?? '',
    categoryId: p.categoryId ?? '',
    incomeTypeId: p.incomeTypeId ?? '',
    sharePercent: p.contactShareBp ? percentText(p.contactShareBp) : '',
    tolerance: p.amountToleranceCents ? formatDecimal(toCents(p.amountToleranceCents)) : '',
    windowDays: String(p.dateWindowDays),
    rhythm: p.rhythm,
    dueDay: String(p.dueDay),
    dueMonth: p.dueMonth === null ? '' : String(p.dueMonth),
    dateShift: p.dateShift,
    startDate: p.startDate ?? '',
    endDate: p.endDate ?? '',
    note: p.note ?? '',
    amount: '',
    amountMax: '',
    currency: p.version?.currency ?? 'EUR',
    validFrom: '',
  };
}

/** A booking as the template of a new payment ("Als erwartete Zahlung anlegen"). */
export function draftFromBooking(b: ListedBooking, today: string): PaymentDraft {
  const split = b.splits[0];
  const outflow = b.amountCents < 0;
  return {
    ...emptyDraft(today),
    name: (b.payeeName ?? b.memo ?? '').slice(0, 120),
    kind: outflow ? 'outflow' : 'inflow',
    accountId: b.accountId,
    payeeId: b.payeeId ?? '',
    categoryId: outflow ? (split?.categoryId ?? '') : '',
    incomeTypeId: outflow ? '' : (split?.incomeTypeId ?? ''),
    dueDay: String(Number(b.date.slice(8, 10))),
    startDate: b.date,
    amount: formatDecimal(toCents(Math.abs(b.amountCents))),
    currency: b.currency,
  };
}

export type DraftField = keyof PaymentDraft;
export type DraftErrors = Partial<Record<DraftField, string>>;

const isDay = (text: string) => /^\d{4}-\d{2}-\d{2}$/.test(text);

function readCents(text: string): number | undefined {
  if (text.trim() === '') return 0;
  const parsed = parseAmount(text);
  return parsed.ok ? parsed.cents : undefined;
}

export interface ReadResult {
  fields?: PaymentFields;
  version?: {
    amountCents: number;
    amountMaxCents: number | null;
    currency: string;
    validFrom?: string;
  };
  errors: DraftErrors;
}

/** Reads the draft; `errors` is empty when `fields` (and, when creating, `version`) are usable. */
export function readDraft(d: PaymentDraft, creating: boolean): ReadResult {
  const errors: DraftErrors = {};
  const name = d.name.replace(/\s+/g, ' ').trim();
  if (!name) errors.name = 'Bitte einen Namen eintragen.';
  const dueDay = Number(d.dueDay);
  if (!/^\d{1,2}$/.test(d.dueDay) || dueDay < 1 || dueDay > 31)
    errors.dueDay = 'Ein Tag von 1 bis 31.';
  let dueMonth: number | null = null;
  if (d.rhythm !== 'monthly') {
    dueMonth = Number(d.dueMonth);
    if (!/^\d{1,2}$/.test(d.dueMonth) || dueMonth < 1 || dueMonth > 12)
      errors.dueMonth = 'Bitte einen Monat wählen.';
  }
  const share = d.sharePercent.trim() === '' ? 0 : parsePercentBp(d.sharePercent);
  if (share === undefined) errors.sharePercent = 'Ein Anteil von 0 bis 100 %.';
  if (share && !d.contactId) errors.contactId = 'Für einen Anteil braucht es einen Kontakt.';
  const tolerance = readCents(d.tolerance);
  if (tolerance === undefined || tolerance < 0)
    errors.tolerance = 'Das lässt sich nicht als Betrag lesen.';
  const windowDays = Number(d.windowDays);
  if (!/^\d{1,2}$/.test(d.windowDays) || windowDays > 31) errors.windowDays = 'Null bis 31 Tage.';
  if (d.startDate && !isDay(d.startDate)) errors.startDate = 'Bitte ein Datum wählen.';
  if (d.endDate && !isDay(d.endDate)) errors.endDate = 'Bitte ein Datum wählen.';
  if (d.startDate && d.endDate && d.endDate < d.startDate)
    errors.endDate = 'Das Ende liegt vor dem Start.';

  let version: ReadResult['version'];
  if (creating) {
    const amount = parseAmount(d.amount);
    if (!amount.ok || amount.cents <= 0) errors.amount = 'Bitte einen Betrag über 0 eintragen.';
    const max = d.amountMax.trim() === '' ? null : parseAmount(d.amountMax);
    if (max !== null && (!max.ok || max.cents <= 0))
      errors.amountMax = 'Das lässt sich nicht als Betrag lesen.';
    else if (max?.ok && amount.ok && max.cents < amount.cents)
      errors.amountMax = 'Das Maximum liegt unter dem Betrag.';
    if (d.validFrom && !isDay(d.validFrom)) errors.validFrom = 'Bitte ein Datum wählen.';
    if (!/^[A-Z]{3}$/.test(d.currency)) errors.currency = 'Ein Währungscode wie EUR.';
    if (!errors.amount && !errors.amountMax && amount.ok)
      version = {
        amountCents: Math.abs(amount.cents),
        amountMaxCents: max?.ok ? max.cents : null,
        currency: d.currency,
        ...(d.validFrom ? { validFrom: d.validFrom } : {}),
      };
  }
  if (Object.keys(errors).length > 0) return { errors };
  const inflow = d.kind === 'inflow';
  const fields: PaymentFields = {
    name,
    kind: d.kind,
    accountId: d.accountId || null,
    payeeId: d.payeeId || null,
    contactId: d.contactId || null,
    categoryId: inflow ? null : d.categoryId || null,
    incomeTypeId: inflow ? d.incomeTypeId || null : null,
    contactShareBp: share ?? 0,
    amountToleranceCents: tolerance ?? 0,
    dateWindowDays: windowDays,
    rhythm: d.rhythm,
    dueDay,
    dueMonth,
    dateShift: d.dateShift,
    startDate: d.startDate || null,
    endDate: d.endDate || null,
    note: d.note.trim() || null,
  };
  return { fields, ...(version ? { version } : {}), errors };
}

/** The fields of `next` that differ from the stored payment (what a PATCH sends). */
export function changedFields(p: ExpectedPayment, next: PaymentFields): Partial<PaymentFields> {
  const patch: Partial<PaymentFields> = {};
  for (const key of Object.keys(next) as Array<keyof PaymentFields>) {
    if (next[key] !== p[key]) (patch as Record<string, unknown>)[key] = next[key];
  }
  return patch;
}
