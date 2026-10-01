import { and, eq, isNull } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { assignmentRule, booking, bookingSplit, inboxItem, payee, price } from '../schema';
import { undo } from './audit';
import { createBooking } from './bookings';
import { createEntity } from './entities';
import { setAssigned } from './envelopes';
import { ConflictError } from './errors';
import {
  createExpectedPayment,
  listExpectedVersions,
  matchOccurrences,
  upcoming,
} from './expected';
import {
  InboxActionError,
  acceptAllSuggestions,
  acceptInboxItem,
  dismissInboxItem,
  inboxNextSteps,
  listInbox,
  refreshInbox,
  ruleFromInboxItem,
} from './inbox';
import { holdingValuesAsOf } from './portfolio';
import { seedBasics, testCtx as ctx } from './test-helpers';

let opened: OpenedDatabase;
let db: OpenedDatabase['db'];
const TODAY = '2026-03-20';

beforeEach(() => {
  opened = createTestDatabase();
  db = opened.db;
  seedBasics(db);
});
afterEach(() => opened.close());

const spend = (date: string, amountCents: number, payeeId: string | null, categoryId?: string) =>
  createBooking(
    db,
    {
      accountId: 'giro',
      date,
      amountCents,
      payeeId,
      splits: [{ categoryId: categoryId ?? null, amountCents }],
    },
    ctx,
  );
const openItems = () => db.select().from(inboxItem).where(isNull(inboxItem.resolvedAt)).all();
const byKind = (kind: string) => openItems().filter((i) => i.kind === kind);
const categoryOf = (bookingId: string) =>
  db.select().from(bookingSplit).where(eq(bookingSplit.bookingId, bookingId)).get()?.categoryId;
const defaultCategory = (payeeId: string, categoryId: string) =>
  db.update(payee).set({ defaultCategoryId: categoryId }).where(eq(payee.id, payeeId)).run();

describe('refreshInbox: overspent envelopes', () => {
  it('opens one urgent item for a cash overspend and resolves it when covered', () => {
    spend('2026-03-05', -5_000, null, 'essen');
    expect(refreshInbox(db, TODAY)).toEqual({ opened: 1, resolved: 0 });
    const [item] = byKind('overspent');
    expect(item).toMatchObject({
      title: 'Essen ist überzogen',
      detail: '−50,00 € · im Plan aus einem anderen Envelope decken',
      refType: 'category',
      refId: 'essen@2026-03',
      urgent: true,
    });
    // Idempotent.
    expect(refreshInbox(db, TODAY)).toEqual({ opened: 0, resolved: 0 });
    expect(openItems()).toHaveLength(1);
    // Cause fixed: the open item goes away on its own.
    setAssigned(db, 'essen', '2026-03', 5_000, ctx);
    expect(refreshInbox(db, TODAY)).toEqual({ opened: 0, resolved: 1 });
    expect(openItems()).toHaveLength(0);
    expect(db.select().from(inboxItem).get()?.resolution).toBe('resolved');
  });
});

describe('refreshInbox: uncategorised bookings', () => {
  beforeEach(() => {
    // Funded envelopes: a new category must not turn into an overspend item.
    for (const id of ['miete', 'essen', 'reise']) setAssigned(db, id, '2026-03', 100_000, ctx);
  });

  it('suggests the payee default, else the most used recent category', () => {
    defaultCategory('p1', 'miete');
    const b1 = spend('2026-03-02', -1_200, 'p1');
    createEntity(db, payee, { id: 'p2', name: 'Markt' }, ctx);
    spend('2026-02-10', -800, 'p2', 'essen');
    spend('2026-02-11', -900, 'p2', 'essen');
    spend('2026-02-12', -700, 'p2', 'reise');
    const b2 = spend('2026-03-03', -450, 'p2');
    const b3 = spend('2026-03-04', -300, null);
    // Not uncategorised: an inflow, a future booking.
    createBooking(
      db,
      {
        accountId: 'giro',
        date: '2026-03-01',
        amountCents: 5_000,
        splits: [{ amountCents: 5_000 }],
      },
      ctx,
    );
    spend('2026-04-02', -100, 'p2');
    refreshInbox(db, TODAY);
    const view = listInbox(db, TODAY);
    const uncat = view.groups.find((g) => g.id === 'uncat')!;
    expect(uncat.no).toBe(2);
    expect(uncat.items.map((i) => [i.refId, i.suggestion?.categoryId, i.canRule])).toEqual([
      [b3, undefined, false],
      [b2, 'essen', true],
      [b1, 'miete', true],
    ]);
    expect(uncat.items[1]?.title).toBe('Markt · −4,50 €');
    expect(uncat.items[1]?.detail).toBe('03.03. · Giro');
  });

  it('accepts the suggestion, one undo group restores booking and item', () => {
    defaultCategory('p1', 'miete');
    const b = spend('2026-03-02', -1_200, 'p1');
    refreshInbox(db, TODAY);
    const item = byKind('uncategorized')[0]!;
    const done = acceptInboxItem(db, item.id, {}, ctx, TODAY);
    expect(done.resolvedIds).toEqual([item.id]);
    expect(categoryOf(b)).toBe('miete');
    expect(openItems()).toHaveLength(0);
    // A decision is final for the key, even if a refresh would find it again.
    refreshInbox(db, TODAY);
    expect(openItems()).toHaveLength(0);

    undo(db, { groupId: done.groupId }, ctx);
    expect(categoryOf(b)).toBeNull();
    expect(openItems().map((i) => i.id)).toEqual([item.id]);
    refreshInbox(db, TODAY);
    expect(openItems().map((i) => i.id)).toEqual([item.id]);
  });

  it('takes another category, and refuses without suggestion or with an unknown category', () => {
    const b = spend('2026-03-04', -300, null);
    refreshInbox(db, TODAY);
    const item = byKind('uncategorized')[0]!;
    expect(() => acceptInboxItem(db, item.id, {}, ctx, TODAY)).toThrow(InboxActionError);
    expect(() => acceptInboxItem(db, item.id, { categoryId: 'nope' }, ctx, TODAY)).toThrow();
    acceptInboxItem(db, item.id, { categoryId: 'reise' }, ctx, TODAY);
    expect(categoryOf(b)).toBe('reise');
    expect(() => acceptInboxItem(db, item.id, {}, ctx, TODAY)).toThrow(ConflictError);
  });

  it('resolves the item when the booking gets a category by hand', () => {
    const b = spend('2026-03-04', -300, 'p1');
    refreshInbox(db, TODAY);
    expect(openItems()).toHaveLength(1);
    db.update(bookingSplit).set({ categoryId: 'essen' }).where(eq(bookingSplit.bookingId, b)).run();
    expect(refreshInbox(db, TODAY).resolved).toBe(1);
    expect(openItems()).toHaveLength(0);
  });

  it('"Immer so zuordnen" creates the rule and categorises the open bookings of the payee', () => {
    defaultCategory('p1', 'miete');
    const a = spend('2026-03-02', -1_200, 'p1');
    const b = spend('2026-03-03', -300, 'p1');
    const other = spend('2026-03-04', -300, null);
    refreshInbox(db, TODAY);
    const first = byKind('uncategorized').find((i) => i.refId === a)!;
    const done = ruleFromInboxItem(db, first.id, {}, ctx);
    expect(done).toMatchObject({ applied: 2, categoryId: 'miete' });
    expect([categoryOf(a), categoryOf(b), categoryOf(other)]).toEqual(['miete', 'miete', null]);
    const rules = db.select().from(assignmentRule).all();
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({
      name: 'Vermieter → Miete',
      payeeId: 'p1',
      categoryId: 'miete',
      matchJson: '{"payeeId":"p1"}',
    });
    expect(byKind('uncategorized').map((i) => i.refId)).toEqual([other]);

    undo(db, { groupId: done.groupId }, ctx);
    expect(
      db.select().from(assignmentRule).where(isNull(assignmentRule.deletedAt)).all(),
    ).toHaveLength(0);
    expect([categoryOf(a), categoryOf(b)]).toEqual([null, null]);
    expect(byKind('uncategorized')).toHaveLength(3);
  });

  it('accepts all suggestions at once', () => {
    defaultCategory('p1', 'miete');
    spend('2026-03-02', -1_200, 'p1');
    spend('2026-03-03', -300, 'p1');
    spend('2026-03-04', -300, null);
    refreshInbox(db, TODAY);
    const done = acceptAllSuggestions(db, ctx, TODAY);
    expect(done.resolvedIds).toHaveLength(2);
    expect(byKind('uncategorized')).toHaveLength(1);
    undo(db, { groupId: done.groupId }, ctx);
    expect(byKind('uncategorized')).toHaveLength(3);
  });

  it('keeps a dismissed booking away', () => {
    spend('2026-03-04', -300, null);
    refreshInbox(db, TODAY);
    dismissInboxItem(db, byKind('uncategorized')[0]!.id, ctx);
    refreshInbox(db, TODAY);
    expect(openItems()).toHaveLength(0);
    expect(db.select().from(booking).all()).toHaveLength(1);
  });
});

describe('refreshInbox: expected payments', () => {
  const rent = () =>
    createExpectedPayment(
      db,
      {
        name: 'Miete',
        accountId: 'giro',
        payeeId: 'p1',
        categoryId: 'miete',
        dueDay: 1,
        startDate: '2026-01-01',
        amountToleranceCents: 100,
      },
      { validFrom: '2026-01-01', amountCents: 40_000 },
      ctx,
      TODAY,
    ).payment;

  it('offers the price change of a deviating occurrence; accepting adds the version', () => {
    const p = rent();
    spend('2026-03-02', -42_000, 'p1', 'miete');
    matchOccurrences(db, TODAY);
    refreshInbox(db, TODAY);
    const item = byKind('expected_payment').find((i) => i.title.includes('neuer Betrag'))!;
    expect(item).toMatchObject({
      title: 'Miete: neuer Betrag ab März',
      detail: '420,00 € statt 400,00 € laut letzter Buchung',
    });
    const view = listInbox(db, TODAY);
    expect(
      view.groups.find((g) => g.id === 'version')?.items.find((i) => i.id === item.id)?.version,
    ).toEqual({
      paymentId: p.id,
      fromMonth: '2026-03',
      amountCents: 42_000,
      label: 'Ab März übernehmen',
    });
    const done = acceptInboxItem(db, item.id, {}, ctx, TODAY);
    expect(listExpectedVersions(db, p.id).map((v) => [v.validFrom, v.amountCents])).toEqual([
      ['2026-01-01', 40_000],
      ['2026-03-01', 42_000],
    ]);
    refreshInbox(db, TODAY);
    expect(byKind('expected_payment').some((i) => i.title.includes('neuer Betrag'))).toBe(false);

    undo(db, { groupId: done.groupId }, ctx);
    expect(listExpectedVersions(db, p.id)).toHaveLength(1);
    expect(byKind('expected_payment').some((i) => i.title.includes('neuer Betrag'))).toBe(true);
  });

  it('lists a missed payment; dismissing it keeps it away', () => {
    rent();
    matchOccurrences(db, TODAY);
    refreshInbox(db, TODAY);
    const missed = upcoming(db, '2026-02-01', TODAY).filter((r) => r.status === 'missed');
    expect(missed.length).toBeGreaterThan(0);
    expect(byKind('expected_payment').map((i) => i.refId)).toEqual(
      expect.arrayContaining(missed.map((r) => r.occurrenceId)),
    );
    expect(byKind('expected_payment')[0]?.title).toMatch(/^Miete: Zahlung fehlt$/);
    for (const item of byKind('expected_payment')) dismissInboxItem(db, item.id, ctx);
    refreshInbox(db, TODAY);
    expect(byKind('expected_payment')).toHaveLength(0);
  });
});

describe('refreshInbox: manual values', () => {
  beforeEach(() => {
    opened.sqlite.exec(`
      INSERT INTO account (id, name, type, role, on_budget, opening_date, sort_order)
        VALUES ('p2p', 'P2P-Konto', 'p2p', 'investment', 0, '2023-10-01', 9);
      INSERT INTO security (id, name, kind, currency) VALUES ('s-p2p', 'P2P', 'p2p', 'EUR');
      INSERT INTO holding (id, security_id, account_id, as_of, units_e8)
        VALUES ('h-p2p', 's-p2p', 'p2p', '2026-01-01', 10000000000);
      INSERT INTO price (security_id, date, price_micro, currency, source)
        VALUES ('s-p2p', '2026-02-14', 42000000, 'EUR', 'manual');`);
  });

  it('opens a stale item, sets the value as a manual price and closes it; undo restores it', () => {
    refreshInbox(db, TODAY); // 34 days old
    const [item] = byKind('stale_value');
    expect(item).toMatchObject({
      title: 'P2P-Konto: Wert seit 34 Tagen nicht aktualisiert',
      detail: 'zuletzt 4.200,00 € · manuell',
      refType: 'manual_price',
    });
    expect(listInbox(db, TODAY).groups.find((g) => g.id === 'stale')?.items[0]?.value).toEqual({
      valueCents: 420_000,
      daysOld: 34,
    });
    expect(() => acceptInboxItem(db, item!.id, {}, ctx, TODAY)).toThrow(InboxActionError);
    const done = acceptInboxItem(db, item!.id, { valueCents: 435_000 }, ctx, TODAY);
    expect(holdingValuesAsOf(db, TODAY)[0]?.valueCents).toBe(435_000);
    expect(
      db
        .select()
        .from(price)
        .where(and(eq(price.securityId, 's-p2p'), eq(price.date, TODAY)))
        .get(),
    ).toMatchObject({ priceMicro: 43_500_000, source: 'manual' });
    refreshInbox(db, TODAY);
    expect(byKind('stale_value')).toHaveLength(0);

    undo(db, { groupId: done.groupId }, ctx);
    expect(holdingValuesAsOf(db, TODAY)[0]?.valueCents).toBe(420_000);
    expect(byKind('stale_value')).toHaveLength(1);
  });

  it('is fresh within the threshold and respects a custom one', () => {
    expect(refreshInbox(db, '2026-03-10').opened).toBe(0); // 24 days
    expect(refreshInbox(db, '2026-03-10', { staleDays: 14 }).opened).toBe(1);
  });

  it('stales an account valuation and writes a valuation on accept', () => {
    opened.sqlite.exec(`
      INSERT INTO account (id, name, type, role, on_budget, opening_date, sort_order)
        VALUES ('imm', 'Wohnung', 'other_asset', 'investment', 0, '2023-10-01', 10);
      INSERT INTO valuation (id, account_id, date, value_cents, source)
        VALUES ('v1', 'imm', '2026-01-10', 25000000, 'manual');`);
    refreshInbox(db, TODAY);
    const item = byKind('stale_value').find((i) => i.refType === 'account_valuation')!;
    expect(item.title).toBe('Wohnung: Wert seit 69 Tagen nicht aktualisiert');
    acceptInboxItem(db, item.id, { valueCents: 26_000_000 }, ctx, TODAY);
    expect(
      opened.sqlite
        .prepare("SELECT value_cents FROM valuation WHERE account_id = 'imm' AND date = ?")
        .get(TODAY),
    ).toEqual({ value_cents: 26_000_000 });
  });
});

describe('refreshInbox: rule results and generic items', () => {
  it('opens a revision item for a rule that needs action and resolves it when it does not', () => {
    opened.sqlite.exec(`
      INSERT INTO rule (id, code, name, enabled, kind, sort_order, action)
        VALUES ('r1', 'R01', 'Puffer', 1, 'rule', 1, 'Puffer aufbauen');
      INSERT INTO rule_result (id, rule_id, as_of, status, value_text, detail_json, action_needed)
        VALUES ('rr1', 'r1', '2026-03-20', 'bad', '0,4 Monate', '{"actionText":"Puffer auf 3 Monate aufbauen"}', 1);`);
    refreshInbox(db, TODAY);
    expect(byKind('revision')[0]).toMatchObject({
      title: 'R01 Puffer: 0,4 Monate',
      detail: 'Puffer auf 3 Monate aufbauen',
      refId: 'R01@2026-03',
    });
    opened.sqlite.exec("UPDATE rule_result SET status = 'ok', action_needed = 0");
    expect(refreshInbox(db, TODAY).resolved).toBe(1);
  });

  it('leaves items of other parts alone and shows them generically', () => {
    const insert = opened.sqlite.prepare(
      'INSERT INTO inbox_item (id, kind, title, ref_type, ref_id) VALUES (?, ?, ?, ?, ?)',
    );
    insert.run('i1', 'consent', 'Bank A: Einwilligung läuft ab', null, null);
    insert.run('i2', 'stale_value', 'Kurse nicht abrufbar: X', 'security', 'sec-x');
    insert.run('i3', 'other', 'Sparplan bei der Bank ändern', 'savings_plan', 'g1');
    insert.run('i4', 'import', 'Girokonto zu Kreditkarte', 'transfer', 't1');
    expect(refreshInbox(db, TODAY)).toEqual({ opened: 0, resolved: 0 });
    const view = listInbox(db, TODAY);
    expect(view.groups.map((g) => [g.id, g.no, g.count])).toEqual([
      ['transfer', 3, 1],
      ['stale', 5, 1],
      ['consent', 6, 1],
      ['other', 8, 1],
    ]);
    // "Erledigt" closes them; a decision is audited and undoable.
    const done = dismissInboxItem(db, 'i1', ctx);
    expect(listInbox(db, TODAY).count).toBe(3);
    undo(db, { groupId: done.groupId }, ctx);
    expect(listInbox(db, TODAY).count).toBe(4);
  });
});

describe('listInbox and nextSteps', () => {
  it('numbers the letters across the groups and counts minutes', () => {
    spend('2026-03-05', -5_000, null, 'essen'); // overspent, but categorised
    spend('2026-03-06', -300, null);
    opened.sqlite
      .prepare("INSERT INTO inbox_item (id, kind, title) VALUES ('c1', 'consent', 'Einwilligung')")
      .run();
    refreshInbox(db, TODAY);
    const view = listInbox(db, TODAY);
    expect(view.count).toBe(3);
    expect(view.minutes).toBe(2);
    expect(view.groups.flatMap((g) => g.items.map((i) => i.letter))).toEqual(['A', 'B', 'C']);
    expect(view.groups[0]?.items[0]?.urgent).toBe(true);
    const next = inboxNextSteps(db, TODAY, 2);
    expect(next.count).toBe(3);
    expect(next.items.map((i) => i.letter)).toEqual(['A', 'B']);
  });

  it('is empty on an empty ledger', () => {
    refreshInbox(db, TODAY);
    expect(listInbox(db, TODAY)).toEqual({ count: 0, minutes: 0, groups: [] });
  });
});
