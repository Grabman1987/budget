import { afterEach, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { freedomView } from './freedom';
import { allocationInputsAsOf } from './allocation-inputs';
import { freedomRuleInput, ruleInputs } from './rule-inputs';
import { evaluateRules, listRules, ruleResults } from './rules';
import { setTargets } from './securities';
import { undo } from './audit';
import { replaceExposureVersion } from './asset-exposure';
import { accounts } from './entities';
import {
  freedomUniverseFixture615,
  FREEDOM_DAY_615 as day,
  FREEDOM_HISTORY_615 as historical,
} from './freedom-universe-fixture-615';

let opened: OpenedDatabase;
beforeEach(() => {
  opened = createTestDatabase();
  freedomUniverseFixture615(opened);
});
afterEach(() => opened.close());

const setScope = (expectedScope: 'excluded' | 'included', groupId: string) =>
  setTargets(
    opened.db,
    day,
    [{ assetClassId: 'basis', targetShareBp: 10000 }],
    { actor: 'synthetic-owner', groupId },
    {
      completeSnapshot: true,
      allocationAccounts: [
        {
          id: 'excluded',
          included: true,
          cashClassId: null,
          expectedScope,
          expectedCashClassId: null,
        },
      ],
    },
  );
const snapshotMoney = () => ({
  balances: opened.sqlite.prepare('SELECT id,opening_balance_cents FROM account ORDER BY id').all(),
  bookings: opened.sqlite.prepare('SELECT * FROM booking ORDER BY id').all(),
  splits: opened.sqlite.prepare('SELECT * FROM booking_split ORDER BY id').all(),
  financialAudit: opened.sqlite
    .prepare(
      "SELECT * FROM audit_log WHERE entity_type IN ('booking','booking_split') ORDER BY rowid",
    )
    .all(),
});

function expectBasis(expected: number) {
  for (const asOf of [day, historical]) {
    expect(allocationInputsAsOf(opened.db, asOf).valueCents).toBe(expected);
    expect(freedomView(opened.db, asOf)).toMatchObject({
      investedCents: expected,
      annualSpendCents: 1200,
      targetCents: 30000,
    });
    expect(ruleInputs(opened.db, asOf).freedom).toMatchObject({
      investedCents: expected,
      annualSpendCents: 1200,
    });
  }
}

it('uses the current selected accounts retrospectively, exact signed cents and audited scope undo/redo', () => {
  // 20,000 selected brokerage +7,000 selected savings −2,000 selected cash =25,000.
  // The former investment-role sum was20,000+30,000−2,000=48,000.
  const money = snapshotMoney();
  expectBasis(25000);
  expect(
    freedomView(opened.db, day)
      .accounts.map((row) => row.id)
      .sort(),
  ).toEqual(['negative', 'savings', 'selected']);
  evaluateRules(opened.db, day);
  expect(listRules(opened.db, day).rules.find((r) => r.code === 'R16')?.latest?.valueText).toBe(
    '83,3 %',
  );
  const beforeHistory = ruleResults(opened.db, historical, historical).rules.find(
    (r) => r.code === 'R16',
  );
  expect(beforeHistory?.cells[0]?.valueText).toBe('83,3 %');
  setScope('excluded', 'scope-615');
  expectBasis(55000);
  // A read previews the new basis immediately, without rewriting stored result history.
  const changes = opened.sqlite.prepare('SELECT total_changes() AS n').get();
  expect(listRules(opened.db, day).rules.find((r) => r.code === 'R16')?.latest?.valueText).toBe(
    '183,3 %',
  );
  expect(opened.sqlite.prepare('SELECT total_changes() AS n').get()).toEqual(changes);
  evaluateRules(opened.db, day);
  expect(
    ruleResults(opened.db, historical, historical).rules.find((r) => r.code === 'R16')?.cells[0]
      ?.valueText,
  ).toBe('183,3 %');
  const reversed = undo(opened.db, { groupId: 'scope-615' }, { actor: 'synthetic-owner' });
  expectBasis(25000);
  expect(listRules(opened.db, day).rules.find((r) => r.code === 'R16')?.latest?.valueText).toBe(
    '83,3 %',
  );
  undo(opened.db, { groupId: reversed.groupId }, { actor: 'synthetic-owner' });
  expectBasis(55000);
  expect(snapshotMoney()).toEqual(money);
});

it('a stale scope save leaves all consumers and stored money unchanged', () => {
  setScope('excluded', 'current-615');
  const money = snapshotMoney();
  const before = opened.sqlite.prepare('SELECT * FROM audit_log ORDER BY rowid').all();
  expect(() => setScope('excluded', 'stale-615')).toThrow(/inzwischen/);
  expectBasis(55000);
  expect(snapshotMoney()).toEqual(money);
  expect(opened.sqlite.prepare('SELECT * FROM audit_log ORDER BY rowid').all()).toEqual(before);
});

it('counts selected holdings once across class slices and ignores an opted-out unpriced holding', () => {
  opened.sqlite.exec(`
    INSERT INTO asset_class (id,name) VALUES ('other-class','Other synthetic class');
    INSERT INTO security (id,name,kind,currency,allocation_included) VALUES
      ('held','Synthetic selected fund','etf','EUR',1),
      ('opted-out','Synthetic excluded fund','etf','EUR',0);
    INSERT INTO holding (id,account_id,security_id,as_of,units_e8) VALUES
      ('h','selected','held','2023-10-01',100000000),
      ('excluded-h','selected','opted-out','2023-10-01',100000000);
    INSERT INTO price (security_id,date,price_micro,currency,source)
      VALUES ('held','2023-10-01',123450000,'EUR','manual');
  `);
  replaceExposureVersion(
    opened.db,
    'held',
    {
      validFrom: '2023-10-01',
      complete: true,
      source: 'synthetic',
      weights: [
        { assetClassId: 'basis', weightBp: 6000 },
        { assetClassId: 'other-class', weightBp: 4000 },
      ],
    },
    { actor: 'synthetic-owner' },
  );
  for (const asOf of [day, historical]) {
    // 25,000 cash +12,345 selected fund; the unpriced opted-out fund is not a gap.
    expect(allocationInputsAsOf(opened.db, asOf).valueCents).toBe(37345);
    const view = freedomView(opened.db, asOf);
    expect(view.investedCents).toBe(37345);
    expect(view.accounts.find((row) => row.id === 'selected')).toMatchObject({
      valueCents: 32345,
      missingPrice: false,
      missingFxCurrencies: [],
    });
    expect(listRules(opened.db, asOf).rules.find((r) => r.code === 'R16')?.latest?.valueText).toBe(
      '124,5 %',
    );
  }
});

it('missing selected quote or historical FX is unavailable, while a future rate cannot backfill it', () => {
  opened.sqlite.exec(`
    INSERT INTO security (id,name,kind,currency) VALUES ('held','Synthetic USD fund','etf','USD');
    INSERT INTO holding (id,account_id,security_id,as_of,units_e8)
      VALUES ('h','selected','held','2023-10-01',100000000);
  `);
  expect(freedomView(opened.db, day)).toMatchObject({ investedCents: null, progressBp: null });
  expect(
    freedomView(opened.db, day).accounts.find((row) => row.id === 'selected')?.missingPrice,
  ).toBe(true);
  expect(listRules(opened.db, day).rules.find((r) => r.code === 'R16')?.latest).toBeNull();
  opened.sqlite.exec(`
    INSERT INTO price (security_id,date,price_micro,currency,source)
      VALUES ('held','2023-10-01',100000000,'USD','manual');
    INSERT INTO fx_rate (currency,date,rate_micro) VALUES ('USD','2024-02-02',2000000);
  `);
  for (const asOf of [day, historical]) {
    expect(allocationInputsAsOf(opened.db, asOf).valueCents).toBeNull();
    const view = freedomView(opened.db, asOf);
    expect(view.investedCents).toBeNull();
    expect(view.accounts.find((row) => row.id === 'selected')).toMatchObject({
      valueCents: null,
      missingPrice: false,
      missingFxCurrencies: ['USD'],
    });
    expect(listRules(opened.db, asOf).rules.find((r) => r.code === 'R16')?.latest).toBeNull();
  }
  opened.sqlite.exec(
    "INSERT INTO fx_rate (currency,date,rate_micro) VALUES ('USD','2023-10-01',1500000)",
  );
  // USD100 ×1.5 EUR/USD =15,000 cents, plus the unchanged25,000 selected cash.
  expectBasis(40000);
});

it('uses dated account-only P2P valuation instead of adding cash twice, and preserves three-month comparison dates', () => {
  opened.sqlite.exec(`
    INSERT INTO account (id,name,type,role,on_budget,opening_date,opening_balance_cents)
      VALUES ('p2p','Synthetic P2P','p2p','investment',0,'2023-10-01',10000),
             ('future','Synthetic future depot','brokerage','investment',0,'2025-01-01',88888);
    INSERT INTO valuation (id,account_id,date,value_cents,source) VALUES
      ('p2p-now','p2p','2023-11-01',42000,'manual'),
      ('p2p-future','p2p','2025-01-01',99999,'manual');
  `);
  expect(allocationInputsAsOf(opened.db, day).valueCents).toBe(67000);
  expect(freedomView(opened.db, day).investedCents).toBe(67000);
  expect(freedomView(opened.db, day).accounts.find((row) => row.id === 'p2p')?.valueCents).toBe(
    42000,
  );
  expect(freedomView(opened.db, day).accounts.some((row) => row.id === 'future')).toBe(false);
  expect(allocationInputsAsOf(opened.db, historical).valueCents).toBe(35000);
  expect(freedomView(opened.db, historical).investedCents).toBe(35000);
  expect(ruleInputs(opened.db, day).freedom).toEqual({
    investedCents: 67000,
    annualSpendCents: 1200,
    previousProgressBp: 11667,
  });
});

it('missing selected cash FX is unavailable, and excluding it restores only the shared basis without rewriting money', () => {
  opened.sqlite.exec(`
    INSERT INTO account (id,name,type,role,currency,on_budget,opening_date,opening_balance_cents,allocation_scope)
      VALUES ('fx-cash','Synthetic USD savings','savings','budget','USD',0,'2023-10-01',333,'included');
  `);
  const money = snapshotMoney();
  expect(freedomView(opened.db, day)).toMatchObject({ investedCents: null, progressBp: null });
  expect(freedomView(opened.db, day).accounts.find((row) => row.id === 'fx-cash')).toMatchObject({
    valueCents: null,
    missingPrice: false,
    missingFxCurrencies: ['USD'],
  });
  expect(listRules(opened.db, day).rules.find((row) => row.code === 'R16')?.latest).toBeNull();
  accounts.update(
    opened.db,
    'fx-cash',
    { allocationScope: 'excluded' },
    {
      actor: 'synthetic-owner',
      groupId: 'exclude-fx-615',
    },
  );
  for (const asOf of [day, historical]) {
    expect(freedomView(opened.db, asOf).investedCents).toBe(25000);
    expect(
      listRules(opened.db, asOf).rules.find((row) => row.code === 'R16')?.latest?.valueText,
    ).toBe('83,3 %');
  }
  undo(opened.db, { groupId: 'exclude-fx-615' }, { actor: 'synthetic-owner' });
  expect(freedomView(opened.db, day).investedCents).toBeNull();
  expect(snapshotMoney()).toEqual(money);
});

it('the one shared resolver retains exact cancellation and rejects an unsafe final cent sum', () => {
  const limit = Number.MAX_SAFE_INTEGER;
  opened.sqlite.exec("UPDATE account SET allocation_scope='excluded'");
  for (const [id, amount] of [
    ['a-cancel', limit],
    ['b-cancel', 2],
    ['c-cancel', -limit],
  ] as const)
    opened.sqlite
      .prepare(
        `INSERT INTO account
      (id,name,type,role,on_budget,opening_date,opening_balance_cents)
      VALUES (?,?,'brokerage','investment',0,'2023-10-01',?)`,
      )
      .run(id, 'Synthetic cancellation', amount);
  // Each input is safe. MAX_SAFE+2−MAX_SAFE is literally2 even when an intermediate sum is unsafe.
  for (const asOf of [day, historical]) {
    expect(allocationInputsAsOf(opened.db, asOf).valueCents).toBe(2);
    expect(freedomView(opened.db, asOf).investedCents).toBe(2);
    expect(freedomRuleInput(opened.db, asOf)?.investedCents).toBe(2);
  }
  opened.sqlite.prepare('UPDATE account SET opening_balance_cents=0 WHERE id=?').run('c-cancel');
  // MAX_SAFE+2 cannot be represented in safe integer cents; it is not a rounded amount.
  expect(allocationInputsAsOf(opened.db, day).valueCents).toBeNull();
  expect(freedomView(opened.db, day).investedCents).toBeNull();
  expect(freedomRuleInput(opened.db, day)).toBeNull();
});
