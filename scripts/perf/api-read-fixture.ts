import { seedDatabase } from '@budget/fixtures/seed';
import { sampleLedger } from '@budget/fixtures';
import { schema, type Db, type OpenedDatabase } from '@budget/db';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

export const FIXTURE_KEY = 'perf.synthetic.api-956';
export const FIXTURE_DAY = '2026-09-17';

/** Validate on a read-only handle BEFORE pragmas/fingerprinting/capture; never change an input DB. */
export function openApiReadFixture(file: string): OpenedDatabase {
  const sqlite = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const marker = sqlite.prepare('select value from app_setting where id = ?').get(FIXTURE_KEY) as
      { value?: string } | undefined;
    const audit = sqlite.prepare('select count(*) n from audit_log').get() as { n: number };
    if (marker?.value !== '10000/2500/16' || audit.n !== 0) throw new Error('Not synthetic');
  } catch {
    sqlite.close();
    throw new Error('Refusing an unrecognized/non-synthetic database');
  }
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  return { sqlite, db: drizzle(sqlite, { schema }), close: () => sqlite.close() };
}

/** Public synthetic sample only; no operator database or private export is an input. */
export function seedApiReadFixture(db: Db) {
  const ledger = structuredClone(sampleLedger());
  const originals = [...ledger.accounts];
  for (let i = 0; ledger.accounts.length < 16; i++) {
    const base = originals.filter((a) => a.onBudget && !a.closedAt)[i % 3]!;
    ledger.accounts.push({
      ...base,
      id: `perf-956-account-${i}`,
      name: `Synthetic account ${i + 1}`,
      openingDate: '2023-10-01',
      closedAt: null,
      referenceAccountId: null,
    });
  }
  const splitTransfers = new Set(ledger.splits.filter((s) => s.transferId).map((s) => s.bookingId));
  const plain = ledger.bookings.filter((b) => !b.transferId && !splitTransfers.has(b.id!));
  const splits = new Map<string, typeof ledger.splits>();
  for (const s of ledger.splits) {
    const group = splits.get(s.bookingId) ?? [];
    group.push(s);
    splits.set(s.bookingId, group);
  }
  const extra = ledger.accounts.filter((a) => a.id?.startsWith('perf-956-account-'));
  for (let i = 0; ledger.bookings.length < 10_000; i++) {
    const base = plain[i % plain.length]!;
    const id = `perf-956-booking-${i}`;
    ledger.bookings.push({
      ...base,
      id,
      accountId: i % 2 ? base.accountId : extra[i % extra.length]!.id!,
      importKey: null,
    });
    for (const [j, split] of (splits.get(base.id!) ?? []).entries())
      ledger.splits.push({ ...split, id: `${id}-split-${j}`, bookingId: id });
  }
  const buys = ledger.trades.filter((t) => t.kind === 'buy');
  for (let i = 0; ledger.trades.length < 2_500; i++) {
    const base = buys[i % buys.length]!;
    ledger.trades.push({ ...base, id: `perf-956-trade-${i}`, importKey: null });
  }
  // Set missing insert defaults, not persisted immutable versions. Preserve explicit
  // historical timestamps supplied by the public sample ledger.
  const tables = {
    institutions: schema.institution,
    contacts: schema.contact,
    accounts: schema.account,
    categoryGroups: schema.categoryGroup,
    categories: schema.category,
    categoryTargets: schema.categoryTarget,
    payees: schema.payee,
    projects: schema.project,
    transfers: schema.transfer,
    bookings: schema.booking,
    splits: schema.bookingSplit,
    envelopeMonths: schema.envelopeMonth,
    expectedPayments: schema.expectedPayment,
    expectedPaymentVersions: schema.expectedPaymentVersion,
    savingsGoals: schema.savingsGoal,
    plannedEvents: schema.plannedEvent,
    assetClasses: schema.assetClass,
    assetClassTargets: schema.assetClassTarget,
    securities: schema.security,
    holdings: schema.holding,
    trades: schema.trade,
    savingsPlans: schema.savingsPlan,
    prices: schema.price,
    fxRates: schema.fxRate,
    rules: schema.rule,
    ruleResults: schema.ruleResult,
    inboxItems: schema.inboxItem,
    payslips: schema.payslip,
    payslipLines: schema.payslipLine,
  };
  for (const [key, table] of Object.entries(tables))
    for (const item of ledger[key as keyof typeof tables]) {
      const row = item as { createdAt?: string; updatedAt?: string };
      if ('createdAt' in table && row.createdAt === undefined)
        row.createdAt = `${FIXTURE_DAY}T00:00:00.000Z`;
      if ('updatedAt' in table && row.updatedAt === undefined)
        row.updatedAt = `${FIXTURE_DAY}T00:00:00.000Z`;
    }
  const result = seedDatabase(db, ledger);
  const marketRows: Array<typeof schema.marketRun.$inferInsert> = [];
  for (let i = 0; i < 1_000; i++) {
    const day = new Date(Date.UTC(2023, 9, 1 + i)).toISOString().slice(0, 10);
    marketRows.push({
      id: `perf-956-market-${i}`,
      trigger: 'nightly',
      startedAt: `${day}T01:00:00Z`,
      finishedAt: `${day}T01:01:00Z`,
      asOf: day,
      status: i % 50 ? 'ok' : 'partial',
      priceRows: 6,
      fxRows: 2,
      failedCount: i % 50 ? 0 : 1,
    });
  }
  for (let i = 0; i < marketRows.length; i += 100)
    db.insert(schema.marketRun)
      .values(marketRows.slice(i, i + 100))
      .run();
  const inboxRows: Array<typeof schema.inboxItem.$inferInsert> = [];
  for (let i = 0; i < 3_150; i++) {
    const day = `2026-09-${String(1 + (i % 17)).padStart(2, '0')}T12:00:00Z`;
    inboxRows.push({
      id: `perf-956-inbox-${i}`,
      kind: 'other',
      title: `Synthetic task ${i}`,
      detail: 'Synthetic fixture',
      createdAt: day,
      resolvedAt: i < 150 ? null : day,
      resolution: i < 150 ? null : 'Done',
    });
  }
  for (let i = 0; i < inboxRows.length; i += 100)
    db.insert(schema.inboxItem)
      .values(inboxRows.slice(i, i + 100))
      .run();
  db.insert(schema.appSetting).values({ id: FIXTURE_KEY, value: '10000/2500/16' }).run();
  return result.rows;
}
