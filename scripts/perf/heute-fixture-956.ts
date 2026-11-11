import type Database from 'better-sqlite3';
import { sqliteOf, type Db } from '@budget/db';
import { seedApiReadFixture } from './api-read-fixture';

export const HEUTE_FIXTURE_KEY = 'perf.synthetic.heute-956';
export const HEUTE_FIXTURE_VALUE = 'production-shape-v1';

/**
 * Production-shaped synthetic ledger for the Heute and positions reads (#956): the public sample
 * grown by `seedApiReadFixture` (10k bookings since 2023-10, 2.5k trades), then 30 accounts,
 * 36 securities (6 priced in USD) with a decade of daily prices, 20 years of ECB-style rates for
 * four currencies and 15k audit entries carrying full row snapshots. Long price and rate histories
 * are what a Portfolio Performance import (whole history) and the ECB refresh store; the audit log
 * is what everyday editing leaves. No real data is involved.
 */
export function seedHeuteFixture(db: Db) {
  seedApiReadFixture(db);
  const sqlite: Database.Database = sqliteOf(db);
  sqlite.transaction(() => {
    for (let i = 0; i < 30; i++) {
      const id = `perf-956-sec-${i}`;
      const usd = i % 5 === 0;
      sqlite
        .prepare(
          `insert into security (id, name, kind, symbol, currency, ter_bp, asset_class_id,
             institution_id, regions_json, benchmark, created_at, updated_at)
           select ?, 'Synthetic fund ' || ?, kind, 'SYN-F' || ?, ?, ter_bp, asset_class_id,
             institution_id, regions_json, benchmark, created_at, updated_at
           from security where id = 'sec-etfw'`,
        )
        .run(id, i, i, usd ? 'USD' : 'EUR');
      sqlite
        .prepare(
          `insert into price (security_id, date, price_micro, currency, source)
           select ?, date, price_micro, ?, source from price where security_id = 'sec-etfw'`,
        )
        .run(id, usd ? 'USD' : 'EUR');
      // A tenth of the units of every fourth monthly buy, alternating between two depots.
      sqlite
        .prepare(
          `insert into trade (id, security_id, account_id, date, kind, units_e8, amount_cents,
             fee_cents, tax_cents, created_at, updated_at)
           select ? || id, ?, ?, date, kind, units_e8 / 10, amount_cents / 10, fee_cents, tax_cents,
             created_at, updated_at
           from trade
           where security_id = 'sec-etfw' and kind = 'buy' and account_id = 'acc-depot'
             and rowid % 4 = 0`,
        )
        .run(`perf-956-t${i}-`, id, i % 2 ? 'acc-depot2' : 'acc-depot');
    }
    for (
      let i = (sqlite.prepare('select count(*) n from account').get() as { n: number }).n;
      i < 30;
      i++
    )
      sqlite
        .prepare(
          `insert into account (id, name, type, role, on_budget, currency, opening_balance_cents,
             opening_date, institution_id, created_at, updated_at)
           select ?, 'Synthetic extra ' || ?, type, role, on_budget, currency, 10000, '2020-01-01',
             institution_id, created_at, updated_at
           from account where id = 'perf-956-account-0'`,
        )
        .run(`perf-956-extra-${i}`, i);
    // Every price series reaches back ten more years (weekdays, flat at its first stored price).
    const firsts = sqlite
      .prepare('select security_id s, min(date) d from price group by security_id')
      .all() as { s: string; d: string }[];
    const older = sqlite.prepare(
      `insert or ignore into price (security_id, date, price_micro, currency, source)
       select security_id, ?, price_micro, currency, source from price
       where security_id = ? and date = ?`,
    );
    for (const { s, d } of firsts)
      for (const day of weekdaysBefore(d, 10 * 365)) older.run(day, s, d);
    // Twenty years of rates before the first stored one, for four currencies.
    const first = sqlite
      .prepare(`select min(date) d, rate_micro r from fx_rate where currency = 'USD'`)
      .get() as { d: string; r: number };
    const rate = sqlite.prepare(
      `insert or ignore into fx_rate (date, currency, rate_micro, source) values (?, ?, ?, 'ecb')`,
    );
    for (const day of weekdaysBefore(first.d, 20 * 365))
      for (const currency of ['USD', 'GBP', 'CHF', 'JPY']) rate.run(day, currency, first.r);
    // Audit entries as `recordAudit` stores them: full row snapshots, mostly bookings.
    const bookings = sqlite.prepare('select * from booking order by rowid limit 15000').all() as {
      id: string;
    }[];
    const accounts = sqlite.prepare('select * from account order by id').all() as { id: string }[];
    const audit = sqlite.prepare(
      `insert into audit_log (id, ts, actor, action, entity_type, entity_id, before_json,
         after_json, group_id) values (?, ?, 'owner', ?, ?, ?, ?, ?, ?)`,
    );
    for (let i = 0; i < 15_000; i++) {
      const isAccount = i % 10 === 0;
      const row = isAccount ? accounts[i % accounts.length]! : bookings[i % bookings.length]!;
      const create = i % 3 === 0;
      const after = isAccount ? row : { ...row, status: 'cleared' };
      audit.run(
        `perf-956-audit-${i}`,
        `2026-0${1 + (i % 9)}-1${i % 9}T10:00:00.000Z`,
        create ? 'create' : 'update',
        isAccount ? 'account' : 'booking',
        row.id,
        create ? null : JSON.stringify(row),
        JSON.stringify(after),
        `perf-956-group-${i >> 2}`,
      );
    }
    sqlite
      .prepare('insert into app_setting (id, value) values (?, ?)')
      .run(HEUTE_FIXTURE_KEY, HEUTE_FIXTURE_VALUE);
  })();
  return Object.fromEntries(
    ['account', 'booking', 'trade', 'security', 'price', 'fx_rate', 'audit_log'].map((table) => [
      table,
      (sqlite.prepare(`select count(*) n from ${table}`).get() as { n: number }).n,
    ]),
  );
}

function weekdaysBefore(day: string, days: number): string[] {
  const start = Date.parse(`${day}T00:00:00Z`);
  const out: string[] = [];
  for (let k = 1; k <= days; k++) {
    const d = new Date(start - k * 86_400_000);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
