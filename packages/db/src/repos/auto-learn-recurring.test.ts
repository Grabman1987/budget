import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { appSetting, assignmentRule } from '../schema';
import { undo } from './audit';
import { createBooking, getBooking, markBankBookingTransfer, updateBooking } from './bookings';
import {
  listAssignmentRules,
  readBookingAssignments,
  removeAssignmentRule,
  saveAssignmentRule,
} from './assignment-rules';
import { listExpectedPayments } from './expected';
import {
  acceptRecurringSuggestion,
  dismissRecurringSuggestion,
  recurringSuggestions,
} from './recurring-suggestions';
import { seedBasics } from './test-helpers';

const owner = { actor: 'owner' };
const TODAY = '2026-10-20';
let opened: OpenedDatabase;
let db: OpenedDatabase['db'];

beforeEach(() => {
  opened = createTestDatabase();
  db = opened.db;
  seedBasics(db);
});
afterEach(() => opened.close());

let n = 0;
/** A confirmed synthetic bank line on the checking account. */
function bankLine(text: string, date: string, amountCents: number, extra = {}) {
  return createBooking(
    db,
    {
      accountId: 'giro',
      date,
      amountCents,
      source: 'bank',
      status: 'confirmed',
      bankRawText: text,
      importKey: 'syn-' + ++n,
      splits: [{ amountCents }],
      ...extra,
    },
    { actor: 'test' },
  );
}
const autoRules = () => listAssignmentRules(db).filter((r) => r.id.startsWith('auto-learn:'));

describe('automatic rule learning', () => {
  it('learns an own-account transfer on the second matching confirmation, once, and one Undo removes it', () => {
    const first = bankLine('Dauerauftrag Sparplan 1111', '2026-08-01', -5000);
    markBankBookingTransfer(db, first, 'spar', null, owner);
    expect(autoRules()).toHaveLength(0);
    const second = bankLine('Dauerauftrag Sparplan 2222', '2026-09-01', -5000);
    const done = markBankBookingTransfer(db, second, 'spar', null, owner);
    const [rule] = autoRules();
    expect(rule).toMatchObject({
      name: expect.stringContaining('Dauerauftrag Sparplan'),
      automatic: false,
      enabled: true,
      actions: { transferAccountId: 'spar' },
    });
    expect(rule!.match.conditions.map((c) => c.type)).toEqual([
      'counterparty',
      'direction',
      'account',
    ]);
    // A third confirmation neither duplicates nor changes the rule.
    const third = bankLine('Dauerauftrag Sparplan 3333', '2026-10-01', -5000);
    markBankBookingTransfer(db, third, 'spar', null, owner);
    expect(autoRules()).toHaveLength(1);
    expect(autoRules()[0]!.revision).toBe(rule!.revision);
    // One Undo of the second confirmation removes transfer, rule and its fingerprint together.
    undo(db, { groupId: done.groupId }, owner, { force: true });
    expect(getBooking(db, second)?.transferId ?? null).toBeNull();
    expect(autoRules()).toHaveLength(0);
    expect(
      db
        .select()
        .from(appSetting)
        .all()
        .filter((r) => r.id.startsWith('rf:')),
    ).toHaveLength(0);
  });

  it('needs the same classification: a different target teaches nothing', () => {
    markBankBookingTransfer(
      db,
      bankLine('Sparplan Alpha 1', '2026-08-01', -5000),
      'spar',
      null,
      owner,
    );
    const other = bankLine('Sparplan Alpha 2', '2026-09-01', -5000);
    updateBooking(db, other, { splits: [{ amountCents: -5000, categoryId: 'essen' }] }, owner);
    expect(autoRules()).toHaveLength(0);
  });

  it('keeps an edited, disabled or deleted rule untouched', () => {
    const make = (text: string, date: string) =>
      markBankBookingTransfer(db, bankLine(text, date, -5000), 'spar', null, owner);
    make('Sparplan Beta 1111', '2026-07-01');
    make('Sparplan Beta 2222', '2026-08-01');
    const [rule] = autoRules();
    saveAssignmentRule(
      db,
      rule!.id,
      {
        name: 'Meine Sparregel',
        enabled: false,
        automatic: false,
        match: rule!.match,
        actions: rule!.actions,
      },
      owner,
    );
    make('Sparplan Beta 3333', '2026-09-01');
    const after = autoRules();
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ name: 'Meine Sparregel', enabled: false });
    removeAssignmentRule(db, rule!.id, owner);
    make('Sparplan Beta 4444', '2026-10-01');
    expect(autoRules()).toHaveLength(0);
    expect(
      db.select().from(assignmentRule).where(eq(assignmentRule.id, rule!.id)).get()?.deletedAt,
    ).not.toBeNull();
  });

  it('does not overwrite an edited inbox-learn rule and tolerates processor noise in the key', () => {
    const confirm = (text: string, date: string, categoryId: string) => {
      const id = bankLine(text, date, -900, {
        status: 'pending',
        splits: [{ amountCents: -900 }],
      });
      updateBooking(
        db,
        id,
        { status: 'confirmed', splits: [{ amountCents: -900, categoryId }] },
        owner,
      );
    };
    confirm('PAYPAL *KINO BEISPIEL 1234567', '2026-08-01', 'reise');
    const learned = listAssignmentRules(db).filter((r) => r.id.startsWith('inbox-learn:'));
    expect(learned).toHaveLength(1);
    // The owner edits the rule; a later confirmation with another category leaves it alone.
    saveAssignmentRule(
      db,
      learned[0]!.id,
      {
        name: learned[0]!.name,
        enabled: true,
        automatic: false,
        match: learned[0]!.match,
        actions: { ...learned[0]!.actions, categoryId: 'miete' },
      },
      owner,
    );
    confirm('SUMUP *KINO BEISPIEL 9876543', '2026-09-01', 'essen');
    const now = listAssignmentRules(db).filter((r) => r.id.startsWith('inbox-learn:'));
    expect(now).toHaveLength(1);
    expect(now[0]!.actions.categoryId).toBe('miete');
    expect(autoRules()).toHaveLength(0);
  });
});

describe('own-account transfer proposal', () => {
  it('proposes a transfer when the line names another own account, nothing applied', () => {
    const id = bankLine('Überweisung Sparen Monatsrate', '2026-10-05', -2500, {
      status: 'pending',
    });
    const { suggestions } = readBookingAssignments(db, id);
    const own = suggestions.find((s) => s.id === 'own-account:spar');
    expect(own).toMatchObject({ automatic: false, actions: { transferAccountId: 'spar' } });
    expect(getBooking(db, id)?.transferId ?? null).toBeNull();
  });
  it('proposes nothing for an unrelated text', () => {
    const id = bankLine('Supermarkt Einkauf', '2026-10-05', -2500, { status: 'pending' });
    expect(
      readBookingAssignments(db, id).suggestions.some((s) => s.id.startsWith('own-account:')),
    ).toBe(false);
  });
});

describe('recurring suggestions', () => {
  const monthly = (day: string, months: string[], cents: number, extra = {}) =>
    months.forEach((m) =>
      createBooking(
        db,
        {
          accountId: 'giro',
          date: `${m}-${day}`,
          amountCents: cents,
          payeeId: 'p1',
          source: 'manual',
          status: 'confirmed',
          splits: [{ amountCents: cents, categoryId: 'miete' }],
          ...extra,
        },
        { actor: 'test' },
      ),
    );

  it('detects, accepts into an expected payment, and stays quiet afterwards', () => {
    monthly('03', ['2026-07', '2026-08', '2026-09', '2026-10'], -85_000);
    const [s] = recurringSuggestions(db, TODAY);
    expect(s).toMatchObject({
      name: 'Vermieter',
      kind: 'outflow',
      rhythm: 'monthly',
      dueDay: 3,
      amountCents: 85_000,
      categoryId: 'miete',
      accountId: 'giro',
      count: 4,
    });
    const accepted = acceptRecurringSuggestion(db, s!.id, owner, TODAY);
    const payment = listExpectedPayments(db, TODAY).find((p) => p.id === accepted.paymentId);
    expect(payment).toMatchObject({
      rhythm: 'monthly',
      dueDay: 3,
      categoryId: 'miete',
      payeeId: 'p1',
    });
    expect(recurringSuggestions(db, TODAY)).toHaveLength(0);
    undo(db, { groupId: accepted.groupId }, owner);
    expect(recurringSuggestions(db, TODAY)).toHaveLength(1);
  });

  it('needs three occurrences and ignores irregular or unsteady series', () => {
    monthly('03', ['2026-09', '2026-10'], -85_000);
    expect(recurringSuggestions(db, TODAY)).toHaveLength(0);
  });

  it('remembers a dismissal and brings it back on Undo', () => {
    monthly('10', ['2026-07', '2026-08', '2026-09'], -2_000);
    const [s] = recurringSuggestions(db, TODAY);
    const dismissed = dismissRecurringSuggestion(db, s!.id, owner, TODAY);
    expect(recurringSuggestions(db, TODAY)).toHaveLength(0);
    expect(listExpectedPayments(db, TODAY)).toHaveLength(0);
    undo(db, { groupId: dismissed.groupId }, owner);
    expect(recurringSuggestions(db, TODAY)).toHaveLength(1);
  });

  it('groups bank counterparties by key across processor noise and skips covered payees', () => {
    ['2026-07-14', '2026-08-14', '2026-09-14'].forEach((d, i) =>
      bankLine(`PAYPAL *STREAMING DIENST ${1000 + i}7`, d, -1299),
    );
    expect(recurringSuggestions(db, TODAY).map((x) => x.name)).toHaveLength(1);
    monthly('03', ['2026-07', '2026-08', '2026-09'], -85_000);
    const all = recurringSuggestions(db, TODAY);
    expect(all).toHaveLength(2);
    acceptRecurringSuggestion(db, all.find((x) => x.name === 'Vermieter')!.id, owner, TODAY);
    expect(recurringSuggestions(db, TODAY)).toHaveLength(1);
  });
});
