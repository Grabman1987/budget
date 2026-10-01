import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { booking, INCOME_TYPES, payee } from '../schema';
import { undo } from './audit';
import { createBooking, deleteBooking } from './bookings';
import {
  contactLedger,
  createContact,
  deleteContact,
  getContact,
  listContacts,
  restoreContact,
  settleContact,
  updateContact,
} from './contacts';
import { accounts, createEntity } from './entities';
import { CategoryRuleError, ConflictError, EntityNotFoundError } from './errors';
import { createExpectedPayment } from './expected';
import { queryBookings } from './ledger-queries';
import { netWorthAsOf } from './portfolio';
import { seedBasics, testCtx as ctx } from './test-helpers';

let opened: OpenedDatabase;
let db: OpenedDatabase['db'];
const TODAY = '2026-09-17';

beforeEach(() => {
  opened = createTestDatabase();
  db = opened.db;
  seedBasics(db);
});
afterEach(() => opened.close());

/** Paid for contact k1 (an Auslage) or repaid by it, through the Auslagen envelope. */
const share = (date: string, amountCents: number, accountId = 'giro', contactId = 'k1') =>
  createBooking(
    db,
    {
      accountId,
      date,
      amountCents,
      memo: amountCents < 0 ? 'Auslage' : 'Rückzahlung',
      splits: [{ categoryId: 'auslagen', amountCents, contactId }],
    },
    ctx,
  );

const k1 = () => getContact(db, 'k1', TODAY);

describe('the receivable of a contact', () => {
  it('rises with each Auslage and falls with each repayment (−Σ splits)', () => {
    expect(k1()).toMatchObject({ balanceCents: 0, openCents: 0, openItemCount: 0 });
    share('2026-08-03', -4_000);
    share('2026-09-01', -2_550);
    expect(k1()).toMatchObject({ balanceCents: 6_550, openCents: 6_550, openItemCount: 2 });
    share('2026-09-10', 5_000);
    // 5.000 settle the 4.000 Auslage and 1.000 of the second one, oldest first.
    expect(k1()).toMatchObject({ balanceCents: 1_550, openCents: 1_550, openItemCount: 1 });
  });

  it('counts only live bookings up to the viewed day', () => {
    const id = share('2026-08-03', -4_000);
    share('2026-10-01', -9_900); // after today
    expect(k1().balanceCents).toBe(4_000);
    expect(getContact(db, 'k1', '2026-10-01').balanceCents).toBe(13_900);
    deleteBooking(db, id, ctx);
    expect(k1().balanceCents).toBe(0);
  });

  it('adds the balance of a linked receivable account (migration opening balance)', () => {
    accounts.create(
      db,
      {
        id: 'forderung',
        name: 'Forderung Freund',
        type: 'receivable',
        role: 'receivable',
        onBudget: false,
        contactId: 'k1',
        openingDate: '2023-10-01',
        openingBalanceCents: 20_000,
        sortOrder: 9,
      },
      ctx,
    );
    share('2026-08-03', -4_000);
    expect(k1()).toMatchObject({
      balanceCents: 24_000,
      splitBalanceCents: 4_000,
      accountBalanceCents: 20_000,
      openCents: 4_000,
    });
  });

  it('shows a credit as a negative balance (Verbindlichkeit)', () => {
    share('2026-08-03', -1_000);
    share('2026-08-10', 1_800);
    expect(k1()).toMatchObject({ balanceCents: -800, openCents: 0, creditCents: 800 });
    expect(listContacts(db, TODAY).totals).toMatchObject({ receivableCents: 0, payableCents: 800 });
  });

  it('does NOT change the net worth: an Auslage lowers it until it is repaid', () => {
    const before = netWorthAsOf(db, TODAY).totalCents;
    share('2026-09-02', -4_000);
    expect(netWorthAsOf(db, TODAY).totalCents).toBe(before - 4_000);
    share('2026-09-03', 4_000);
    expect(netWorthAsOf(db, TODAY).totalCents).toBe(before);
  });
});

describe('listContacts', () => {
  it('lists the contacts by name with the totals', () => {
    createContact(db, { name: 'Anna', note: 'Reise' }, ctx);
    share('2026-09-01', -3_000);
    const { contacts, totals } = listContacts(db, TODAY);
    expect(contacts.map((c) => c.name)).toEqual(['Anna', 'Freund']);
    expect(contacts.map((c) => c.balanceCents)).toEqual([0, 3_000]);
    expect(totals).toEqual({ receivableCents: 3_000, payableCents: 0, openItemCount: 1 });
  });

  it('adds the expected contributions and pass-through shares of the next 30 days', () => {
    createExpectedPayment(
      db,
      {
        name: 'Beitrag',
        kind: 'inflow',
        accountId: 'giro',
        payeeId: 'p1',
        contactId: 'k1',
        dueDay: 1,
        startDate: '2026-01-01',
      },
      { validFrom: '2026-01-01', amountCents: 80_000 },
      ctx,
      TODAY,
    );
    createExpectedPayment(
      db,
      {
        name: 'Streaming',
        accountId: 'giro',
        payeeId: 'p1',
        contactId: 'k1',
        contactShareBp: 10_000,
        dueDay: 5,
        startDate: '2026-01-01',
      },
      { validFrom: '2026-01-01', amountCents: 1_299 },
      ctx,
      TODAY,
    );
    // 1 Oct (Beitrag) is inside the 30 days, 5 Oct (Streaming) as well; 1 Nov is not.
    expect(k1()).toMatchObject({
      expectedContributionCents: 80_000,
      expectedPassThroughCents: 1_299,
    });
  });
});

describe('contributions', () => {
  it('count only inflows typed as a contribution (or untyped), not a salary of a contact', () => {
    createEntity(db, payee, { id: 'p-k1', name: 'Freund (Empfänger)', contactId: 'k1' }, ctx);
    const inflow = (name: string, incomeTypeId: string | null, amountCents: number) =>
      createExpectedPayment(
        db,
        {
          name,
          kind: 'inflow',
          accountId: 'giro',
          payeeId: 'p-k1',
          ...(incomeTypeId ? { incomeTypeId } : {}),
          dueDay: 20,
          startDate: '2026-01-01',
        },
        { validFrom: '2026-01-01', amountCents },
        ctx,
        TODAY,
      );
    inflow('Gehalt', INCOME_TYPES.salary.id, 300_000);
    expect(k1().expectedContributionCents).toBe(0);
    inflow('Beitrag', INCOME_TYPES.contribution.id, 50_000);
    inflow('Sonstiges', null, 1_000);
    // the payee's contact is the payment's contact when the payment has none
    expect(k1().expectedContributionCents).toBe(51_000);
  });
});

describe('contactLedger', () => {
  it('lists the Kontoblatt rows of the range with a balance that runs over the whole history', () => {
    share('2026-07-10', -4_000);
    share('2026-08-02', -2_550);
    share('2026-08-20', 5_000);
    share('2026-09-05', -1_200);
    const ledger = contactLedger(db, 'k1', TODAY, { from: '2026-08-01', to: '2026-08-31' });
    expect(ledger.openingCents).toBe(4_000);
    expect(
      ledger.rows.map((r) => [r.date, r.auslageCents, r.ausgleichCents, r.balanceCents]),
    ).toEqual([
      ['2026-08-02', 2_550, 0, 6_550],
      ['2026-08-20', 0, 5_000, 1_550],
    ]);
    expect(ledger.statements).toEqual([
      {
        month: '2026-08',
        openingCents: 4_000,
        newCents: 2_550,
        paidCents: 5_000,
        differenceCents: -2_450,
        closingCents: 1_550,
      },
    ]);
    expect(ledger.rows[0]).toMatchObject({ accountId: 'giro' });
  });

  it('lists the open items as of the end of the range', () => {
    share('2026-07-10', -4_000);
    share('2026-08-20', 1_500);
    share('2026-09-05', -1_200);
    const ledger = contactLedger(db, 'k1', TODAY, { from: '2026-09-01', to: '2026-09-30' });
    expect(ledger.openItems.map((i) => [i.date, i.openCents])).toEqual([
      ['2026-07-10', 2_500],
      ['2026-09-05', 1_200],
    ]);
  });

  it('defaults to the whole history up to today', () => {
    share('2026-07-10', -4_000);
    const ledger = contactLedger(db, 'k1', TODAY);
    expect(ledger.rows).toHaveLength(1);
    expect(ledger.statements.map((s) => s.month)).toEqual(['2026-07', '2026-08', '2026-09']);
  });
});

describe('settleContact', () => {
  const settle = (amountCents: number, over: Partial<Parameters<typeof settleContact>[2]> = {}) =>
    settleContact(
      db,
      'k1',
      { accountId: 'giro', date: '2026-09-16', amountCents, ...over },
      ctx,
      TODAY,
    );

  it('books an inflow with a contact split in Auslagen and settles FIFO', () => {
    share('2026-08-03', -4_000);
    share('2026-09-01', -2_550);
    const r = settle(5_000);
    expect(r.settlement).toEqual({
      parts: [
        { id: expect.any(String), settledCents: 4_000, remainingCents: 0 },
        { id: expect.any(String), settledCents: 1_000, remainingCents: 1_550 },
      ],
      surplusCents: 0,
    });
    expect(r.contact).toMatchObject({ balanceCents: 1_550, openItemCount: 1 });
    const [b] = queryBookings(db, { ids: [r.bookingId] }).items;
    expect(b).toMatchObject({ accountId: 'giro', date: '2026-09-16', amountCents: 5_000 });
    expect(b?.splits).toHaveLength(1);
    expect(b?.splits[0]).toMatchObject({
      categoryId: 'auslagen',
      contactId: 'k1',
      amountCents: 5_000,
    });
  });

  it('settles everything exactly', () => {
    share('2026-08-03', -4_000);
    expect(settle(4_000).contact).toMatchObject({ balanceCents: 0, openItemCount: 0 });
  });

  it('is one audit group: undo removes the repayment', () => {
    share('2026-08-03', -4_000);
    const r = settle(1_000);
    expect(k1().balanceCents).toBe(3_000);
    undo(db, { groupId: r.groupId }, ctx);
    expect(k1()).toMatchObject({ balanceCents: 4_000, openCents: 4_000 });
  });

  it('refuses more than is open, nothing open, a future date, a closed or foreign account', () => {
    expect(() => settle(100)).toThrow('nichts offen');
    share('2026-08-03', -4_000);
    expect(() => settle(4_001)).toThrow('höher');
    expect(() => settle(0)).toThrow(CategoryRuleError);
    expect(() => settle(-5)).toThrow(CategoryRuleError);
    expect(() => settle(100, { date: '2026-09-18' })).toThrow('Zukunft');
    expect(() => settle(100, { accountId: 'usd' })).toThrow('Euro');
    expect(() => settle(100, { accountId: 'missing' })).toThrow(EntityNotFoundError);
    expect(() =>
      settleContact(db, 'nobody', { accountId: 'giro', date: TODAY, amountCents: 1 }, ctx, TODAY),
    ).toThrow(EntityNotFoundError);
    expect(db.select().from(booking).all()).toHaveLength(1);
  });

  it('uses a memo of its own or "Ausgleich <name>"', () => {
    share('2026-08-03', -4_000);
    const a = settle(100);
    const b = settle(100, { memo: 'bar bezahlt' });
    const items = queryBookings(db, { ids: [a.bookingId, b.bookingId] }).items;
    expect(items.map((i) => i.memo).sort()).toEqual(['Ausgleich Freund', 'bar bezahlt']);
  });
});

describe('contact CRUD', () => {
  it('creates, renames, deletes and restores a contact, all undoable', () => {
    const made = createContact(db, { name: '  Anna   Beispiel ', note: ' Reise ' }, ctx);
    expect(made).toMatchObject({ name: 'Anna Beispiel', note: 'Reise' });
    expect(updateContact(db, made.id, { name: 'Anna B.', note: null }, ctx)).toMatchObject({
      name: 'Anna B.',
      note: null,
    });
    expect(() => createContact(db, { name: '  ' }, ctx)).toThrow(CategoryRuleError);
    expect(deleteContact(db, made.id, ctx).groupId).toEqual(expect.any(String));
    expect(listContacts(db, TODAY).contacts.map((c) => c.name)).toEqual(['Freund']);
    expect(restoreContact(db, made.id, ctx).name).toBe('Anna B.');
  });

  it('refuses to delete a contact that bookings, accounts, payees or payments refer to', () => {
    share('2026-08-03', -4_000);
    expect(() => deleteContact(db, 'k1', ctx)).toThrow(ConflictError);
  });

  it('answers 404 for an unknown contact', () => {
    expect(() => getContact(db, 'nobody', TODAY)).toThrow(EntityNotFoundError);
    expect(() => updateContact(db, 'nobody', { name: 'x' }, ctx)).toThrow(EntityNotFoundError);
  });
});

describe('Alle Buchungen filtered by contact', () => {
  it('finds the bookings with a split of the contact', () => {
    createContact(db, { name: 'Anna' }, ctx);
    const a = share('2026-08-03', -4_000);
    share('2026-08-04', -100, 'giro', 'k1');
    createBooking(
      db,
      {
        accountId: 'giro',
        date: '2026-08-05',
        amountCents: -500,
        splits: [{ categoryId: 'essen', amountCents: -500 }],
      },
      ctx,
    );
    const items = queryBookings(db, { contactId: 'k1' }).items;
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.id)).toContain(a);
  });
});
