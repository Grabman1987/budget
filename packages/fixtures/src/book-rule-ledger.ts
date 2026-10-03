import { monthsBetween, lastDayOfMonth } from '@budget/domain';
import type * as schema from '@budget/db/schema';

/** Invented ledger for book-rule integration tests; amounts do not come from owner sources. */
export function bookRuleLedger() {
  const months = monthsBetween('2022-03', '2024-02');
  const accounts: (typeof schema.account.$inferInsert)[] = [
    {
      id: 'books-budget',
      name: 'Testbudget',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2022-03-01',
      openingBalanceCents: 2_000_000,
    },
    {
      id: 'books-depot',
      name: 'Testdepot',
      type: 'brokerage',
      role: 'investment',
      onBudget: false,
      openingDate: '2022-03-01',
    },
    {
      id: 'books-clearing',
      name: 'Testverrechnung',
      type: 'checking',
      role: 'investment',
      onBudget: false,
      openingDate: '2022-03-01',
      openingBalanceCents: -20_000,
    },
  ];
  const payslips: (typeof schema.payslip.$inferInsert)[] = months.map((month) => ({
    id: `books-pay-${month}`,
    month,
    grossCents: 100_000,
    netCents: 80_000,
  }));
  const pension: (typeof schema.employerPension.$inferInsert)[] = months.map((month) => ({
    id: `pension-${month}`,
    month,
    amountCents: 1000,
  }));
  return { months, accounts, payslips, pension, dates: months.map(lastDayOfMonth) };
}
