import type * as db from '@budget/db/schema';

type Row<T extends { $inferInsert: unknown }> = T['$inferInsert'];

/**
 * The synthetic sample ledger as plain rows, shaped exactly like the database tables
 * (compile-time checked against the Drizzle schema). `npm run db:seed` inserts them 1:1.
 */
export interface SampleLedger {
  institutions: Row<typeof db.institution>[];
  contacts: Row<typeof db.contact>[];
  accounts: Row<typeof db.account>[];
  categoryGroups: Row<typeof db.categoryGroup>[];
  categories: Row<typeof db.category>[];
  payees: Row<typeof db.payee>[];
  projects: Row<typeof db.project>[];
  transfers: Row<typeof db.transfer>[];
  bookings: Row<typeof db.booking>[];
  splits: Row<typeof db.bookingSplit>[];
  envelopeMonths: Row<typeof db.envelopeMonth>[];
  expectedPayments: Row<typeof db.expectedPayment>[];
  expectedPaymentVersions: Row<typeof db.expectedPaymentVersion>[];
  savingsGoals: Row<typeof db.savingsGoal>[];
  plannedEvents: Row<typeof db.plannedEvent>[];
  assetClasses: Row<typeof db.assetClass>[];
  securities: Row<typeof db.security>[];
  holdings: Row<typeof db.holding>[];
  trades: Row<typeof db.trade>[];
  prices: Row<typeof db.price>[];
  fxRates: Row<typeof db.fxRate>[];
  rules: Row<typeof db.rule>[];
  ruleResults: Row<typeof db.ruleResult>[];
  inboxItems: Row<typeof db.inboxItem>[];
  payslips: Row<typeof db.payslip>[];
  payslipLines: Row<typeof db.payslipLine>[];
}

/** Insert order that satisfies foreign keys. */
export const LEDGER_TABLE_ORDER = [
  'institutions',
  'contacts',
  'accounts',
  'categoryGroups',
  'categories',
  'payees',
  'projects',
  'transfers',
  'bookings',
  'splits',
  'envelopeMonths',
  'expectedPayments',
  'expectedPaymentVersions',
  'savingsGoals',
  'plannedEvents',
  'assetClasses',
  'securities',
  'holdings',
  'trades',
  'prices',
  'fxRates',
  'rules',
  'ruleResults',
  'inboxItems',
  'payslips',
  'payslipLines',
] as const satisfies ReadonlyArray<keyof SampleLedger>;
