import type { Db } from '@budget/db';
import * as t from '@budget/db/schema';
import { sampleLedger } from './ledger/build';
import { fixtureCpiMonths } from '@budget/market';
import { dailyMarketRows } from './market';
import { LEDGER_TABLE_ORDER, type SampleLedger } from './ledger/types';

const TABLES = {
  institutions: t.institution,
  contacts: t.contact,
  accounts: t.account,
  categoryGroups: t.categoryGroup,
  categories: t.category,
  categoryTargets: t.categoryTarget,
  payees: t.payee,
  projects: t.project,
  transfers: t.transfer,
  bookings: t.booking,
  splits: t.bookingSplit,
  envelopeMonths: t.envelopeMonth,
  expectedPayments: t.expectedPayment,
  expectedPaymentVersions: t.expectedPaymentVersion,
  savingsGoals: t.savingsGoal,
  plannedEvents: t.plannedEvent,
  assetClasses: t.assetClass,
  assetClassTargets: t.assetClassTarget,
  securities: t.security,
  holdings: t.holding,
  trades: t.trade,
  savingsPlans: t.savingsPlan,
  prices: t.price,
  fxRates: t.fxRate,
  rules: t.rule,
  ruleResults: t.ruleResult,
  inboxItems: t.inboxItem,
  payslips: t.payslip,
  payslipLines: t.payslipLine,
} as const satisfies Record<keyof SampleLedger, unknown>;

/** Rows per INSERT: keeps every statement far below SQLite's bound-variable limit. */
const CHUNK = 150;

function insertChunks(
  tx: Pick<Db, 'insert'>,
  table: typeof t.price | typeof t.fxRate | typeof t.consumerPriceIndex,
  list: unknown[],
) {
  for (let i = 0; i < list.length; i += CHUNK)
    tx.insert(table)
      .values(list.slice(i, i + CHUNK) as never)
      .run();
}

export interface SeedSummary {
  rows: Record<string, number>;
}

/**
 * Load the synthetic sample ledger into an empty, migrated database in one transaction.
 * Rows are written directly (source `migration`), not through the repositories, so the audit log
 * stays empty: the seed is the starting state, not a user action.
 */
export function seedDatabase(db: Db, ledger: SampleLedger = sampleLedger()): SeedSummary {
  const rows: Record<string, number> = {};
  db.transaction((tx) => {
    for (const key of LEDGER_TABLE_ORDER) {
      const list = ledger[key] as unknown[];
      const table = TABLES[key];
      for (let i = 0; i < list.length; i += CHUNK) {
        // The row types are checked where the ledger is built; here they are inserted as they are.
        tx.insert(table)
          .values(list.slice(i, i + CHUNK) as never)
          .run();
      }
      rows[key] = list.length;
    }
    for (const sec of ledger.securities) {
      if (!sec.assetClassId) continue;
      const dates = [
        ...ledger.trades.filter((r) => r.securityId === sec.id).map((r) => r.date),
        ...ledger.holdings.filter((r) => r.securityId === sec.id).map((r) => r.asOf),
      ].sort();
      const validFrom = dates[0] ?? '2023-10-01';
      const versionId = `fixture:${sec.id}`;
      tx.insert(t.securityExposureVersion)
        .values({
          id: versionId,
          securityId: sec.id,
          validFrom,
          complete: true,
          source: 'synthetic_fixture',
        })
        .run();
      tx.insert(t.securityAssetExposure)
        .values({
          id: versionId,
          versionId,
          securityId: sec.id,
          assetClassId: sec.assetClassId,
          validFrom,
          weightBp: 10000,
          source: 'synthetic_fixture',
        })
        .run();
    }
    // Daily prices and USD rates between the month-end prices (fixture market sources).
    const daily = dailyMarketRows(ledger);
    insertChunks(tx, t.price, daily.prices);
    insertChunks(tx, t.fxRate, daily.fxRates);
    // A synthetic consumer price series to the last full month of the sample (report 2.4).
    const cpi = fixtureCpiMonths('2026-08').map((r) => ({
      series: 'fixture',
      month: r.month,
      indexMicro: r.indexMicro,
      source: 'fixture',
      fetchedAt: '2026-09-01T00:00:00.000Z',
    }));
    insertChunks(tx, t.consumerPriceIndex, cpi);
    rows['consumerPriceIndex'] = cpi.length;
    rows['dailyPrices'] = daily.prices.length;
    rows['dailyFxRates'] = daily.fxRates.length;
  });
  return { rows };
}
