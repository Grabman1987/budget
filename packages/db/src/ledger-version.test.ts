import { describe, expect, it } from 'vitest';
import { createTestDatabase, sqliteOf } from './client';
import {
  UPDATE_ONLY_WHEN_CHANGED,
  ensureLedgerVersionTriggers,
  ledgerVersion,
} from './repos/ledger-version';

const open = () => {
  const { db } = createTestDatabase();
  return { db, sqlite: sqliteOf(db) };
};

const triggers = (sqlite: ReturnType<typeof sqliteOf>) =>
  (
    sqlite
      .prepare(
        "select count(*) as n from sqlite_master where type = 'trigger' and name like 'ledger_version_%'",
      )
      .get() as { n: number }
  ).n;

describe('ledger version', () => {
  it('moves on ledger writes and ignores challenges and market logs', () => {
    const { db, sqlite } = open();
    const start = Number(ledgerVersion(db));
    sqlite
      .prepare(
        "insert into auth_challenge (id, challenge, purpose, expires_at) values ('c', 'x', 'login', 'later')",
      )
      .run();
    sqlite
      .prepare(
        "insert into market_run (id, trigger, started_at, finished_at, as_of, status) values ('r', 'nightly', 'a', 'b', '2026-03-17', 'ok')",
      )
      .run();
    expect(Number(ledgerVersion(db))).toBe(start);

    sqlite.prepare("insert into app_setting (id, value) values ('k', 'v')").run();
    expect(Number(ledgerVersion(db))).toBe(start + 1);
    sqlite.prepare("update app_setting set value = 'w' where id = 'k'").run();
    expect(Number(ledgerVersion(db))).toBe(start + 2);
    sqlite.prepare("delete from app_setting where id = 'k'").run();
    expect(Number(ledgerVersion(db))).toBe(start + 3);
  });

  it('is undone together with a rolled-back transaction', () => {
    const { db, sqlite } = open();
    const start = ledgerVersion(db);
    expect(() =>
      sqlite.transaction(() => {
        sqlite.prepare("insert into app_setting (id, value) values ('k', 'v')").run();
        throw new Error('rollback');
      })(),
    ).toThrow('rollback');
    expect(ledgerVersion(db)).toBe(start);
  });

  it('ignores a rule result rewritten with the same content', () => {
    const { db, sqlite } = open();
    sqlite.prepare("insert into rule (id, code, name) values ('rule-x', 'RX', 'T')").run();
    const upsert = () =>
      sqlite
        .prepare(
          "insert into rule_result (id, rule_id, as_of, status, value_text, detail_json, action_needed) values ('rr', 'rule-x', '2026-03-31', 'ok', '1', '{}', 0) on conflict (rule_id, as_of) do update set status = excluded.status, value_text = excluded.value_text, detail_json = excluded.detail_json, action_needed = excluded.action_needed",
        )
        .run();
    upsert();
    const after = Number(ledgerVersion(db));
    upsert();
    expect(Number(ledgerVersion(db))).toBe(after);
    sqlite.prepare("update rule_result set status = 'bad' where id = 'rr'").run();
    expect(Number(ledgerVersion(db))).toBe(after + 1);
  });

  it('restores dropped triggers idempotently without touching data', () => {
    const { db, sqlite } = open();
    const full = triggers(sqlite);
    expect(full).toBeGreaterThan(200);
    ensureLedgerVersionTriggers(sqlite);
    expect(triggers(sqlite)).toBe(full);
    sqlite.exec('drop trigger ledger_version_booking_ai');
    sqlite.exec('drop trigger ledger_version_trade_au');
    expect(triggers(sqlite)).toBe(full - 2);
    sqlite.prepare("insert into app_setting (id, value) values ('keep', 'v')").run();
    const before = ledgerVersion(db);
    ensureLedgerVersionTriggers(sqlite);
    expect(triggers(sqlite)).toBe(full);
    expect(ledgerVersion(db)).toBe(before);
    expect(sqlite.prepare("select value from app_setting where id = 'keep'").get()).toEqual({
      value: 'v',
    });
    const excluded = sqlite
      .prepare(
        "select count(*) as n from sqlite_master where type = 'trigger' and (name like 'ledger_version_auth_%' or name like 'ledger_version_market_run%')",
      )
      .get() as { n: number };
    expect(excluded.n).toBe(0);
  });

  it('counts audit rows too (the account list replays the audit log)', () => {
    const { db, sqlite } = open();
    const start = Number(ledgerVersion(db));
    sqlite
      .prepare(
        "insert into audit_log (id, action, entity_type, entity_id) values ('a', 'create', 'x', 'i')",
      )
      .run();
    expect(Number(ledgerVersion(db))).toBe(start + 1);
  });

  it('lists every content column of rule_result in its change trigger', () => {
    const { sqlite } = open();
    const columns = (
      sqlite.prepare("select name from pragma_table_info('rule_result')").all() as {
        name: string;
      }[]
    )
      .map((c) => c.name)
      .filter((name) => name !== 'id');
    expect([...(UPDATE_ONLY_WHEN_CHANGED['rule_result'] ?? [])].sort()).toEqual(columns.sort());
  });

  it('re-creates a trigger whose stored definition differs', () => {
    const { db, sqlite } = open();
    sqlite.exec('drop trigger ledger_version_booking_ai');
    sqlite.exec(
      'create trigger ledger_version_booking_ai after insert on booking begin select 1; end',
    );
    const start = ledgerVersion(db);
    ensureLedgerVersionTriggers(sqlite);
    const stored = (
      sqlite
        .prepare("select sql from sqlite_master where name = 'ledger_version_booking_ai'")
        .get() as { sql: string }
    ).sql;
    expect(stored).toContain('UPDATE `ledger_version`');
    expect(ledgerVersion(db)).toBe(start);
  });
});
