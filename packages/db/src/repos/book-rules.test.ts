import { bookRuleLedger } from '@budget/fixtures';
import { BOOK_RULE_CODES, defaultParams, evaluateRule, RULE_CODES } from '@budget/domain';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import {
  account,
  appSetting,
  category,
  categoryGroup,
  employerPension,
  payslip,
  rule,
  ruleResult,
  security,
} from '../schema';
import { createBooking, createTransfer } from './bookings';
import { createTrade } from './trades';
import { undo } from './audit';
import { setAssigned } from './envelopes';
import { upsertPrice } from './prices';
import { getBookSettings, saveBookSettings } from './book-settings';
import { ruleInputs } from './rule-inputs';
import { ensureDefaultRules, evaluateRules, financeCheck, listRules, updateRule } from './rules';

const ctx = { actor: 'synthetic-test' };
const DAY = '2024-02-29';
let opened: OpenedDatabase;
beforeEach(() => {
  opened = createTestDatabase();
  const db = opened.db;
  const fixture = bookRuleLedger();
  db.insert(account).values(fixture.accounts).run();
  db.insert(payslip).values(fixture.payslips).run();
  db.insert(employerPension).values(fixture.pension).run();
  db.insert(appSetting).values({ id: 'profile.birth_month', value: '1994-02' }).run();
  db.insert(categoryGroup).values({ id: 'books-group', name: 'Testgruppe' }).run();
  db.insert(category)
    .values({
      id: 'books-invest',
      groupId: 'books-group',
      name: 'Anlegen',
      kind: 'invest',
      class: 'future',
    })
    .run();
  db.insert(security).values({ id: 'books-fund', name: 'Testfonds', kind: 'etf', terBp: 20 }).run();
  upsertPrice(db, {
    securityId: 'books-fund',
    date: '2022-03-01',
    priceMicro: 100_000_000,
    currency: 'EUR',
    source: 'manual',
  });
  for (const [index, month] of fixture.months.entries()) {
    const date = fixture.dates[index]!;
    createBooking(
      db,
      {
        accountId: 'books-budget',
        date,
        amountCents: index < 12 ? 80_000 : 88_000,
        splits: [{ incomeTypeId: 'income-salary', amountCents: index < 12 ? 80_000 : 88_000 }],
      },
      ctx,
    );
    setAssigned(db, 'books-invest', month, index < 12 ? 20_000 : 24_000, ctx);
    if (index >= 12) {
      createTransfer(
        db,
        {
          fromAccountId: 'books-budget',
          toAccountId: 'books-depot',
          date,
          amountCents: 25_000,
          categoryId: 'books-invest',
        },
        ctx,
      );
      createTrade(
        db,
        {
          securityId: 'books-fund',
          accountId: 'books-depot',
          date,
          kind: 'buy',
          unitsE8: 200_000_000,
          amountCents: 20_000,
          feeCents: 100,
        },
        ctx,
      );
    }
  }
  ensureDefaultRules(db);
});
afterEach(() => opened.close());

describe('book-rule sources and audited owner input', { timeout: 60_000 }, () => {
  it('retains repayment priority in the month an expensive loan is fully repaid', () => {
    const db = opened.db;
    db.insert(account)
      .values({
        id: 'books-loan',
        name: 'Synthetischer Kredit',
        type: 'loan',
        role: 'debt',
        onBudget: false,
        openingDate: '2023-01-01',
        openingBalanceCents: -10_000,
        interestRateBp: 600,
        closedAt: '2024-02-29',
      })
      .run();
    db.insert(category)
      .values({
        id: 'books-extra-debt',
        groupId: 'books-group',
        name: 'Sondertilgung',
        kind: 'debt',
        class: 'future',
        stage: 2,
      })
      .run();
    createTransfer(
      db,
      {
        fromAccountId: 'books-budget',
        toAccountId: 'books-loan',
        date: DAY,
        amountCents: 10_000,
        categoryId: 'books-extra-debt',
      },
      ctx,
    );
    const current = ruleInputs(db, DAY).books?.activity.find((m) => m.month === '2024-02');
    expect(current).toMatchObject({
      extraRepaymentCents: 10_000,
      loans: [{ balanceCents: 10_000, rateBp: 600 }],
    });
  });
  it('reconciles literal investment/payroll totals and ignores internal transfers and reinvestment', () => {
    const db = opened.db;
    createTransfer(
      db,
      { fromAccountId: 'books-depot', toAccountId: 'books-clearing', date: DAY, amountCents: 500 },
      ctx,
    );
    createTrade(
      db,
      {
        securityId: 'books-fund',
        accountId: 'books-depot',
        date: DAY,
        kind: 'dividend',
        unitsE8: 0,
        amountCents: 10_000,
      },
      ctx,
    );
    const inputs = ruleInputs(db, DAY);
    expect(evaluateRule('R17', {}, inputs)).toMatchObject({
      status: 'ok',
      detail: { grossCents: 1_200_000, ownCents: 300_000, employerCents: 12_000, quoteBp: 2600 },
    });
    expect(evaluateRule('R20', {}, inputs)).toMatchObject({
      status: 'ok',
      valueText: '12 von 12 Monaten',
    });
    expect(evaluateRule('R21', {}, inputs)?.status).toBe('bad');
    expect(evaluateRule('R22', {}, inputs)).toMatchObject({ status: 'ok', detail: { costBp: 20 } });
    // Capital income affects only R18 when the toggle is on.
    const on = evaluateRule('R18', {}, inputs)!;
    const off = evaluateRule('R18', { includeCapitalIncome: false }, inputs)!;
    expect(Number(on.detail['expectedCents']) - Number(off.detail['expectedCents'])).toBe(30_000);
  });
  it('historical evaluation cannot see a future transfer, trade or payslip', () => {
    const db = opened.db;
    const before = evaluateRule('R17', {}, ruleInputs(db, DAY));
    createTransfer(
      db,
      {
        fromAccountId: 'books-budget',
        toAccountId: 'books-depot',
        date: '2024-03-01',
        amountCents: 99_900,
        categoryId: 'books-invest',
      },
      ctx,
    );
    db.insert(payslip)
      .values({ id: 'future-pay', month: '2024-03', grossCents: 999_000, netCents: 1 })
      .run();
    expect(evaluateRule('R17', {}, ruleInputs(db, DAY))).toEqual(before);
    expect(evaluateRule('R17', {}, ruleInputs(db, '2023-02-28'))?.detail['ownCents']).toBe(0);
  });
  it('idempotent seeding preserves every stored field, threshold, result and manual confirmation', () => {
    const db = opened.db;
    updateRule(db, 'R17', { enabled: true, params: { targetBp: 2700 } }, ctx);
    db.update(rule)
      .set({
        name: 'Eigener Titel',
        sortOrder: 75,
        goal: null,
        confirmedAt: '2024-01-01T00:00:00Z',
      })
      .where(eq(rule.code, 'S2-1'))
      .run();
    evaluateRules(db, DAY);
    const before = db.select().from(rule).all();
    const results = db.select().from(ruleResult).all();
    expect(ensureDefaultRules(db)).toEqual({ created: 0, updated: 0 });
    expect(db.select().from(rule).all()).toEqual(before);
    expect(db.select().from(ruleResult).all()).toEqual(results);
    expect(listRules(db).rules).toHaveLength(RULE_CODES.length);
    for (const r of listRules(db).rules.filter(
      (r) => BOOK_RULE_CODES.includes(r.code as never) && r.code !== 'R17',
    ))
      expect(r.enabled).toBe(false);
    expect(listRules(db).checklist.find((c) => c.code === 'S2-1')).toMatchObject({
      ruleCode: 'R17',
      confirmedAt: '2024-01-01T00:00:00Z',
    });
    expect(listRules(db).checklist.find((c) => c.code === 'S3-2')).toMatchObject({
      ruleCode: 'R22',
      additionalRuleCodes: ['R13'],
    });
  });
  it('settings writes undo, redo, restore after undo, and roll back atomically', () => {
    const db = opened.db;
    const patch = { birthMonth: '', pension: [{ month: '2024-03', amountCents: 2300 }] };
    saveBookSettings(db, patch, { ...ctx, groupId: 'settings-save' }, DAY);
    expect(getBookSettings(db).birthMonth).toBe('');
    const undone = undo(db, { groupId: 'settings-save' }, ctx);
    expect(getBookSettings(db).birthMonth).toBe('1994-02');
    undo(db, { groupId: undone.groupId }, ctx);
    expect(getBookSettings(db).pension.at(-1)).toEqual({ month: '2024-03', amountCents: 2300 });
    undo(db, { groupId: 'settings-save' }, ctx);
    saveBookSettings(db, patch, { ...ctx, groupId: 'settings-resave' }, DAY);
    expect(getBookSettings(db).pension.at(-1)?.amountCents).toBe(2300);
    const before = getBookSettings(db);
    expect(() =>
      saveBookSettings(
        db,
        { birthMonth: '', pension: [{ month: '2024-03', amountCents: -1 }] },
        ctx,
        DAY,
      ),
    ).toThrow();
    expect(getBookSettings(db)).toEqual(before);
  });
  it('derived rows are idempotent and removed when data disappears; active counts follow toggles', () => {
    const db = opened.db;
    for (const code of BOOK_RULE_CODES) updateRule(db, code, { enabled: true }, ctx);
    const run = evaluateRules(db, DAY);
    expect(run.days).toHaveLength(12);
    expect(evaluateRules(db, DAY)).toEqual(run);
    expect(financeCheck(db, DAY).counts.total).toBe(RULE_CODES.length);
    db.update(payslip)
      .set({ deletedAt: '2024-03-01T00:00:00Z' })
      .where(eq(payslip.id, 'books-pay-2023-03'))
      .run();
    expect(evaluateRules(db, DAY).removed).toBeGreaterThan(0);
    expect(listRules(db, DAY).rules.find((r) => r.code === 'R17')).toMatchObject({
      latest: null,
      unavailableReason: expect.stringContaining('Gehaltszettel fehlen'),
    });
    expect(defaultParams('R21')).toMatchObject({ leverageMaxBp: 1000 });
  });
  it('an unrelated account without exchange rate withholds the book preview but keeps the rule book readable', () => {
    const db = opened.db;
    db.insert(account)
      .values({
        id: 'books-usd',
        name: 'Dollarkonto',
        type: 'checking',
        role: 'budget',
        onBudget: false,
        currency: 'USD',
        openingDate: '2022-03-01',
        openingBalanceCents: 10_000,
      })
      .run();
    const listed = listRules(db, DAY);
    expect(listed.rules).toHaveLength(RULE_CODES.length);
    for (const code of BOOK_RULE_CODES)
      expect(listed.rules.find((r) => r.code === code)).toMatchObject({
        latest: null,
        unavailableReason: expect.stringContaining('USD'),
      });
    expect(listed.rules.find((r) => r.code === 'R01')).not.toHaveProperty('unavailableReason');
  });
});
