import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import {
  account,
  accountReconciliation,
  appSetting,
  auditLog,
  booking,
  bookingSplit,
  valuation,
} from '../schema';
import { ACCOUNT_REMINDER_SETTING } from '@budget/domain';
import { accounts, createEntity, updateEntity } from './entities';
import { createBooking, deleteBooking, restoreBooking, updateBooking } from './bookings';
import { reconcileAccount } from './reconciliation';
import { undo } from './audit';
import { accountReminders, accountReviewSummaries } from './account-reminders';
import { accountSummaries } from './ledger-queries';
import { ReconciledLockedError } from './errors';

let opened: OpenedDatabase;
let ordinal = 0;
const actor = 'synthetic-review';
const context = () => ({ actor, groupId: `synthetic-event-${++ordinal}` });
beforeEach(() => {
  opened = createTestDatabase();
  ordinal = 0;
});
afterEach(() => opened.close());
function make(
  id = 'a',
  type: typeof account.$inferSelect.type = 'checking',
  onBudget = type === 'checking',
  openingDate = '2026-01-01',
) {
  return accounts.create(
    opened.db,
    {
      id,
      name: `Synthetic ${id}`,
      type,
      onBudget,
      openingDate,
      openingBalanceCents: 10000,
      role:
        type === 'receivable'
          ? 'receivable'
          : type === 'loan' || type === 'other_liability'
            ? 'debt'
            : onBudget
              ? 'budget'
              : 'investment',
    },
    context(),
  );
}
function book(
  date = '2026-08-20',
  status: 'pending' | 'confirmed' = 'confirmed',
  amountCents = -100,
  accountId = 'a',
) {
  const ctx = context();
  const id = createBooking(
    opened.db,
    { accountId, date, status, amountCents, splits: [{ amountCents, categoryId: null }] },
    ctx,
  );
  return { id, groupId: ctx.groupId };
}
function check(date = '2026-09-01', statementBalanceCents = 9900, adjust = false) {
  return reconcileAccount(
    opened.db,
    { accountId: 'a', date, statementBalanceCents, adjust, today: '2026-10-19' },
    context(),
  );
}
const status = (id = 'a', today = '2026-10-19') =>
  accountReviewSummaries(opened.db, today).reviews.get(id)!;
const balance = () =>
  accountSummaries(opened.db, '2026-10-19').find((a) => a.id === 'a')!.balanceCents;

/** Fixture metadata only: preserve all snapshots while proving ordinal order with equal clocks. */
function sameClock() {
  const ts = '2026-09-10T12:00:00.000Z';
  for (const table of ['booking', 'account_reconciliation', 'valuation'])
    opened.sqlite.prepare(`UPDATE ${table} SET created_at = ?, updated_at = ?`).run(ts, ts);
  opened.sqlite
    .prepare(
      `UPDATE audit_log SET ts = ?,
    before_json = CASE WHEN before_json IS NULL THEN NULL ELSE json_set(before_json, '$.created_at', ?, '$.updated_at', ?) END,
    after_json = CASE WHEN after_json IS NULL THEN NULL ELSE json_set(after_json, '$.created_at', ?, '$.updated_at', ?) END
    WHERE entity_type IN ('booking', 'account_reconciliation', 'valuation')`,
    )
    .run(ts, ts, ts, ts, ts);
}

describe('read-only account review chronology (#578)', () => {
  it('keeps old confirmed and pending rows quiet and ignores later memo/flag-only changes', () => {
    make();
    const confirmed = book();
    book('2026-08-25', 'pending', -300);
    check();
    sameClock();
    expect(status()).toMatchObject({
      state: 'checked',
      checkedOn: '2026-09-01',
      dueOn: '2026-09-15',
    });
    updateBooking(
      opened.db,
      confirmed.id,
      { flag: 'orange', memo: 'Synthetic note only' },
      context(),
    );
    sameClock();
    expect(status().state).toBe('checked');
    expect(accountReminders(opened.db, '2026-10-19')).toEqual([]);
    expect(() => updateBooking(opened.db, confirmed.id, { amountCents: -999 }, context())).toThrow(
      ReconciledLockedError,
    );
  });

  it.each(['2026-08-10', '2026-09-01'])(
    'detects a genuinely new %s booking after the same-timestamp check',
    (date) => {
      make();
      book();
      check();
      sameClock();
      expect(status().state).toBe('checked');
      book(date, 'pending', -50);
      sameClock();
      expect(status()).toMatchObject({ state: 'due', dueOn: '2026-09-15', days: 48 });
      expect(balance()).toBe(9850);
    },
  );

  it('does not retain deleted new activity forever; redo is a genuine live restoration', () => {
    make();
    book();
    check();
    const added = book('2026-08-10', 'pending', -50);
    sameClock();
    expect(status().state).toBe('due');
    const removed = undo(opened.db, { groupId: added.groupId }, context());
    expect(status().state).toBe('checked');
    expect(balance()).toBe(9900);
    undo(opened.db, { groupId: removed.groupId }, context());
    expect(status().state).toBe('due');
    expect(balance()).toBe(9850);
  });

  it('counts restoring an old pre-check booking instead of relying on its original created_at', () => {
    make();
    book();
    const old = book('2026-08-10', 'pending', -50);
    deleteBooking(opened.db, old.id, context());
    check();
    sameClock();
    expect(status().state).toBe('checked');
    restoreBooking(opened.db, old.id, context());
    sameClock();
    expect(status().state).toBe('due');
    expect(balance()).toBe(9850);
  });

  it('does not turn its own adjustment/stamps or check undo/redo into new booking activity', () => {
    make();
    const old = book();
    const checked = check('2026-09-01', 9850, true);
    sameClock();
    expect(balance()).toBe(9850);
    expect(status().state).toBe('checked');
    const undone = undo(opened.db, { groupId: checked.groupId }, context());
    sameClock();
    expect(balance()).toBe(9900);
    expect(status().state).toBe('due');
    undo(opened.db, { groupId: undone.groupId }, context());
    sameClock();
    expect(balance()).toBe(9850);
    expect(status().state).toBe('checked');
    expect(() => updateBooking(opened.db, old.id, { amountCents: -999 }, context())).toThrow(
      ReconciledLockedError,
    );
  });

  it('selects an older live check after undo, and the original newer checkpoint on redo at equal timestamps', () => {
    make();
    book();
    check('2026-08-31');
    book('2026-09-02');
    const recent = check('2026-09-03', 9800);
    sameClock();
    expect(status()).toMatchObject({ state: 'checked', checkedOn: '2026-09-03' });
    const undone = undo(opened.db, { groupId: recent.groupId }, context());
    sameClock();
    expect(status()).toMatchObject({ state: 'due', checkedOn: '2026-08-31', dueOn: '2026-09-14' });
    undo(opened.db, { groupId: undone.groupId }, context());
    sameClock();
    expect(status()).toMatchObject({ state: 'checked', checkedOn: '2026-09-03' });
    expect(balance()).toBe(9800);
  });

  it('selects the newer original ceremony for a same-day, same-clock recheck and restores the tie on undo/redo', () => {
    make();
    book();
    check('2026-09-01');
    book('2026-08-10', 'pending', -50);
    sameClock();
    expect(status().state).toBe('due');
    const recent = check('2026-09-01', 9900);
    sameClock();
    expect(status()).toMatchObject({ state: 'checked', checkedOn: '2026-09-01' });
    const undone = undo(opened.db, { groupId: recent.groupId }, context());
    sameClock();
    expect(status().state).toBe('due');
    undo(opened.db, { groupId: undone.groupId }, context());
    sameClock();
    expect(status().state).toBe('checked');
    expect(balance()).toBe(9850);
  });

  it('keeps the newer same-day ceremony selected while an older equal-clock check is undone and restored', () => {
    make();
    book('2026-08-01', 'pending');
    const older = check('2026-09-01', 10000);
    book('2026-08-10', 'pending', -50);
    const newer = check('2026-09-01', 10000);
    sameClock();
    expect(status().state).toBe('checked');
    const olderUndo = undo(opened.db, { groupId: older.groupId }, context());
    sameClock();
    expect(status().state).toBe('checked');
    undo(opened.db, { groupId: olderUndo.groupId }, context());
    sameClock();
    expect(status().state).toBe('checked');
    undo(opened.db, { groupId: newer.groupId }, context());
    sameClock();
    expect(status()).toMatchObject({ state: 'due', checkedOn: '2026-09-01' });
    expect(balance()).toBe(9850);
  });

  it('counts undo of an unrelated pre-check financial edit as later real activity', () => {
    make();
    const pending = book('2026-08-20', 'pending');
    const edit = context();
    updateBooking(opened.db, pending.id, { amountCents: -200 }, edit);
    check('2026-09-01', 10000);
    sameClock();
    expect(status().state).toBe('checked');
    expect(balance()).toBe(9800);
    undo(opened.db, { groupId: edit.groupId }, context());
    sameClock();
    expect(status().state).toBe('due');
    expect(balance()).toBe(9900);
  });

  it('activates a pre-created future booking only when its later booked day enters the statement scope', () => {
    make();
    book();
    book('2026-09-20', 'pending', -70);
    check();
    sameClock();
    expect(status('a', '2026-09-15').state).toBe('checked');
    expect(status('a', '2026-09-20')).toMatchObject({ state: 'due', checkedOn: '2026-09-01' });
  });

  it('leaves later booked dates outside an earlier statement even if entered before performing that check', () => {
    make();
    book();
    book('2026-09-05', 'pending', -10);
    check('2026-09-01');
    sameClock();
    expect(status('a', '2026-09-10').state).toBe('unreviewed');
    expect(status('a', '2026-09-15').state).toBe('due');
  });

  it('uses the latest effective same-row manual valuation save, and restores previous checkpoints on undo/redo', () => {
    make('a', 'p2p', false);
    book();
    createEntity(
      opened.db,
      valuation,
      {
        id: 'manual-value',
        accountId: 'a',
        date: '2026-09-01',
        valueCents: 9900,
        source: 'manual',
      },
      context(),
    );
    book('2026-08-10', 'pending', -50);
    sameClock();
    expect(status().state).toBe('due');
    const saved = context();
    updateEntity(opened.db, valuation, 'manual-value', { valueCents: 9850 }, saved);
    sameClock();
    expect(status()).toMatchObject({
      state: 'checked',
      checkedOn: '2026-09-01',
      dueOn: '2026-10-01',
      action: 'value',
    });
    const undone = undo(opened.db, { groupId: saved.groupId }, context());
    sameClock();
    expect(status().state).toBe('due');
    undo(opened.db, { groupId: undone.groupId }, context());
    sameClock();
    expect(status().state).toBe('checked');
    expect(balance()).toBe(9850);
  });

  it('preserves legacy settings and undo without overriding fixed covered rules or inventing receivable policy', () => {
    make('a', 'checking', true, '2026-09-01');
    make('legacy', 'receivable', false, '2026-09-01');
    book('2026-09-02');
    book('2026-09-02', 'confirmed', -100, 'legacy');
    expect(status().state).toBe('due');
    expect(status('legacy')).toMatchObject({ state: 'due', supported: false, policy: 'legacy' });
    const saved = context();
    createEntity(opened.db, appSetting, { id: ACCOUNT_REMINDER_SETTING, value: '80' }, saved);
    expect(status().state).toBe('due');
    expect(status('legacy').state).toBe('unsupported');
    undo(opened.db, { groupId: saved.groupId }, context());
    expect(status('legacy')).toMatchObject({ state: 'due', supported: false, policy: 'legacy' });
  });

  it('leaves all money, check/value rows and audit bytes unchanged across repeated status/reminder reads', () => {
    make();
    book();
    check();
    book('2026-08-15', 'pending', -50);
    sameClock();
    const snapshot = () =>
      JSON.stringify({
        accounts: opened.db.select().from(account).all(),
        bookings: opened.db.select().from(booking).all(),
        splits: opened.db.select().from(bookingSplit).all(),
        audits: opened.db.select().from(auditLog).all(),
        checks: opened.db.select().from(accountReconciliation).all(),
        values: opened.db.select().from(valuation).all(),
      });
    const before = snapshot();
    for (let i = 0; i < 3; i++) {
      expect(accountReminders(opened.db, '2026-10-19').map((r) => r.accountId)).toEqual(['a']);
      expect(status().state).toBe('due');
    }
    expect(snapshot()).toBe(before);
    expect(balance()).toBe(9850);
  });
});
