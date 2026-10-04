import { addDays, toEurCents, todayInVienna } from '@budget/domain';
import { queryOptions, useQueries } from '@tanstack/react-query';
import { queryString, request } from '../api/http';
import type { WriteResult } from '../ledger/types';

/** Shapes and calls of the expected-payments API (`/api/expected`, docs/api-ledger.md). */

export const EXPECTED_KEY = ['expected'] as const;

export type ExpectedKind = 'outflow' | 'inflow';
export type Rhythm = 'weekly' | 'monthly' | 'quarterly' | 'semiannual' | 'yearly';
export type DateShift = 'none' | 'before' | 'after';
export type OccurrenceStatus = 'expected' | 'received' | 'deviating' | 'missed';

export interface ExpectedPayment {
  id: string;
  name: string;
  kind: ExpectedKind;
  accountId: string | null;
  payeeId: string | null;
  contactId: string | null;
  categoryId: string | null;
  incomeTypeId: string | null;
  contactShareBp: number;
  amountToleranceCents: number;
  dateWindowDays: number;
  rhythm: Rhythm;
  dueDay: number;
  dueMonth: number | null;
  dateShift: DateShift;
  startDate: string | null;
  endDate: string | null;
  note: string | null;
  deletedAt: string | null;
  /** The version in force today, else the next one. */
  version: {
    id: string;
    validFrom: string;
    amountCents: number;
    amountMaxCents: number | null;
    currency: string;
  } | null;
  /** Signed amount of that version (outflow negative), in its currency. */
  amountCents: number | null;
  nextDueDate: string | null;
  monthlyEquivalentCents: number | null;
  yearlyEquivalentCents: number | null;
}

export interface ExpectedVersion {
  id: string;
  expectedPaymentId: string;
  validFrom: string;
  amountCents: number;
  amountMaxCents: number | null;
  currency: string;
  note: string | null;
}

export interface Occurrence {
  occurrenceId: string;
  paymentId: string;
  name: string;
  kind: ExpectedKind;
  dueDate: string;
  status: OccurrenceStatus;
  /** Signed, in `currency`. */
  amountCents: number;
  currency: string;
  contactShareCents: number;
  accountId: string | null;
  accountName: string | null;
  payeeId: string | null;
  payeeName: string | null;
  contactId: string | null;
  contactName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryClass: string | null;
  incomeTypeId: string | null;
  incomeTypeName: string | null;
  bookingId: string | null;
  bookedAmountCents: number | null;
  suggestion: { paymentId: string; fromMonth: string; amountCents: number } | null;
}

export interface MonthIncomeLine {
  paymentId: string;
  occurrenceId: string;
  name: string;
  incomeTypeId: string | null;
  incomeTypeName: string | null;
  dueDate: string;
  status: OccurrenceStatus;
  expectedCents: number;
  receivedCents: number;
}

export interface MonthIncome {
  month: string;
  expectedCents: number;
  receivedCents: number;
  byIncomeType: Array<{
    incomeTypeId: string | null;
    name: string | null;
    expectedCents: number;
    receivedCents: number;
  }>;
  byPayment: MonthIncomeLine[];
}

/** Fields of a payment that can be written (no amounts; those live in versions). */
export interface PaymentFields {
  name: string;
  kind: ExpectedKind;
  accountId: string | null;
  payeeId: string | null;
  contactId: string | null;
  categoryId: string | null;
  incomeTypeId: string | null;
  contactShareBp: number;
  amountToleranceCents: number;
  dateWindowDays: number;
  rhythm: Rhythm;
  dueDay: number;
  dueMonth: number | null;
  dateShift: DateShift;
  startDate: string | null;
  endDate: string | null;
  note: string | null;
}

export interface VersionFields {
  amountCents: number;
  amountMaxCents?: number | null;
  currency?: string;
  note?: string | null;
}

const url = (path = '') => `/api/expected${path}`;
const enc = encodeURIComponent;

export const expectedQuery = () =>
  queryOptions({
    queryKey: [...EXPECTED_KEY, 'list'],
    queryFn: () => request<{ payments: ExpectedPayment[] }>('GET', url()).then((r) => r.payments),
  });

export const occurrencesQuery = (from: string, to: string) =>
  queryOptions({
    queryKey: [...EXPECTED_KEY, 'occurrences', from, to],
    queryFn: () =>
      request<{ occurrences: Occurrence[] }>(
        'GET',
        url(`/occurrences${queryString({ from, to })}`),
      ).then((r) => r.occurrences),
  });

export const versionsQuery = (paymentId: string) =>
  queryOptions({
    queryKey: [...EXPECTED_KEY, 'versions', paymentId],
    queryFn: () =>
      request<{ versions: ExpectedVersion[] }>('GET', url(`/${enc(paymentId)}/versions`)).then(
        (r) => r.versions,
      ),
  });

export const incomeQuery = (month: string) =>
  queryOptions({
    queryKey: [...EXPECTED_KEY, 'income', month],
    queryFn: () => request<MonthIncome>('GET', url(`/income${queryString({ month })}`)),
  });

/** Plans the occurrences and matches bookings (idempotent; the P4 worker does the same). */
export const refreshExpected = () => request<{ groupId: string }>('POST', url('/refresh'), {});

export const createPayment = (
  fields: Partial<PaymentFields>,
  version: VersionFields & { validFrom?: string },
) => request<{ payment: ExpectedPayment } & WriteResult>('POST', url(), { ...fields, ...version });

export const patchPayment = (id: string, patch: Partial<PaymentFields>) =>
  request<WriteResult>('PATCH', url(`/${enc(id)}`), patch);

export const deletePayment = (id: string) => request<WriteResult>('DELETE', url(`/${enc(id)}`));

export const addVersion = (id: string, version: VersionFields & { validFrom: string }) =>
  request<WriteResult>('POST', url(`/${enc(id)}/versions`), version);

export const linkOccurrence = (id: string, bookingId: string) =>
  request<WriteResult>('POST', url(`/occurrences/${enc(id)}/link`), { bookingId });
export const unlinkOccurrence = (id: string) =>
  request<WriteResult>('POST', url(`/occurrences/${enc(id)}/unlink`), {});
export const markMissed = (id: string) =>
  request<WriteResult>('POST', url(`/occurrences/${enc(id)}/missed`), {});

/** Latest known rate (EUR per unit, micro) of every foreign currency in `currencies`. */
export function useFxRates(currencies: ReadonlyArray<string>): Record<string, number> {
  const today = todayInVienna();
  const foreign = [...new Set(currencies.filter((c) => c !== 'EUR'))].sort();
  const results = useQueries({
    queries: foreign.map((currency) => ({
      queryKey: ['fx', currency, today],
      queryFn: () =>
        request<{ rates: Array<{ rateMicro: number }> }>(
          'GET',
          `/api/fx${queryString({ currency, from: addDays(today, -30), to: today })}`,
        ),
      staleTime: 600_000,
    })),
  });
  const rates: Record<string, number> = {};
  foreign.forEach((currency, i) => {
    const last = results[i]?.data?.rates.at(-1);
    if (last) rates[currency] = last.rateMicro;
  });
  return rates;
}

/** EUR cents of an amount in `currency`, or null without a rate. */
export function eurOf(
  cents: number,
  currency: string,
  rates: Record<string, number>,
): number | null {
  if (currency === 'EUR') return cents;
  const rate = rates[currency];
  return rate === undefined ? null : toEurCents(cents, rate);
}
