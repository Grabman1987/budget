import { and, eq, inArray, isNull, ne } from 'drizzle-orm';
import { account, booking } from '../schema';
import { AccountInvariantError } from './errors';
import { assertLedgerInvariants } from './invariants';
import type { Executor } from './types';

const CHUNK_SIZE = 400;

export function assertBudgetAccountCurrency(onBudget: boolean, currency: string): void {
  if (onBudget && currency !== 'EUR') throw new AccountInvariantError();
}

/** Check active budget accounts, including raw/legacy rows not written through repositories. */
export function assertEurBudgetAccounts(db: Executor, ids?: Iterable<string>): void {
  const requested = ids === undefined ? undefined : [...new Set(ids)];
  if (requested?.length === 0) return;
  const parts = requested
    ? Array.from({ length: Math.ceil(requested.length / CHUNK_SIZE) }, (_, i) =>
        requested.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
      )
    : [undefined];
  for (const part of parts) {
    const invalid = db
      .select({ id: account.id })
      .from(account)
      .where(
        and(
          isNull(account.deletedAt),
          eq(account.onBudget, true),
          ne(account.currency, 'EUR'),
          part ? inArray(account.id, part) : undefined,
        ),
      )
      .get();
    if (invalid) throw new AccountInvariantError();
  }
}

/** Check every live booking attached to accounts whose currency or active state changed. */
export function assertAccountBookingCurrencies(db: Executor, ids: Iterable<string>): void {
  const requested = [...new Set(ids)];
  for (let offset = 0; offset < requested.length; offset += CHUNK_SIZE) {
    const part = requested.slice(offset, offset + CHUNK_SIZE);
    const bookingIds = db
      .select({ id: booking.id })
      .from(booking)
      .where(and(inArray(booking.accountId, part), isNull(booking.deletedAt)))
      .all()
      .map((row) => row.id);
    assertLedgerInvariants(db, bookingIds);
  }
}
