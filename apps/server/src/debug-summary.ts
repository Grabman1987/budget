import { accountBalances, holdingValuesAsOf, schema, type Db } from '@budget/db';
import { count, max } from 'drizzle-orm';

export interface DebugSummary {
  asOf: string | null;
  counts: Record<string, number>;
  balances: Array<{ accountId: string; balanceCents: number }>;
  investmentsCents: number;
  netWorthCents: number;
}

const COUNTED = {
  accounts: schema.account,
  categories: schema.category,
  payees: schema.payee,
  bookings: schema.booking,
  splits: schema.bookingSplit,
  transfers: schema.transfer,
  securities: schema.security,
  trades: schema.trade,
  prices: schema.price,
  envelopeMonths: schema.envelopeMonth,
  expectedPayments: schema.expectedPayment,
  auditEntries: schema.auditLog,
} as const;

/**
 * Read-only figures for the seed check: row counts, account balances and net worth (balances plus
 * investments at market value) as of the last booking date or the given date.
 */
export function debugSummary(db: Db, asOf?: string): DebugSummary {
  const counts: Record<string, number> = {};
  for (const [name, table] of Object.entries(COUNTED)) {
    counts[name] = db.select({ n: count() }).from(table).get()?.n ?? 0;
  }
  const date =
    asOf ??
    db
      .select({ d: max(schema.booking.date) })
      .from(schema.booking)
      .get()?.d ??
    null;
  if (date === null)
    return { asOf: null, counts, balances: [], investmentsCents: 0, netWorthCents: 0 };
  const balances = accountBalances(db, date);
  const investmentsCents = holdingValuesAsOf(db, date).reduce((sum, h) => sum + h.valueCents, 0);
  const cash = balances.reduce((sum, b) => sum + b.balanceCents, 0);
  return { asOf: date, counts, balances, investmentsCents, netWorthCents: cash + investmentsCents };
}
