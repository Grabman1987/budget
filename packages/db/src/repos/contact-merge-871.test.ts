import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, sqliteOf, type OpenedDatabase } from '../client';
import { account, contact, expectedPayment, payee } from '../schema';
import { undo } from './audit';
import { createBooking } from './bookings';
import { seedIdentityContacts } from './contact-identity-fixture';
import { commitContactMerge, previewContactMerge } from './contact-merge';
import {
  chooseContactCredit,
  getContactStatement,
  listContactStatements,
  settleContact,
} from './contacts';
import { waiveContactOutlay } from './contact-waiver';
import { createEntity, updateEntity } from './entities';
import { AuditError, ContactMergeConflictError, StalePreviewError } from './errors';
import { seedBasics, testCtx } from './test-helpers';

let opened: OpenedDatabase;
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
  seedIdentityContacts(opened.db);
});
afterEach(() => opened.close());

const ASOF = '2026-09-17';
const options = { secret: 'synthetic-test-secret' };
const sql = (text: string, ...params: unknown[]) => {
  const statement = sqliteOf(opened.db).prepare(text);
  return statement.reader ? statement.all(...params) : [statement.run(...params)];
};
const ctx = () => ({ actor: 'tester', groupId: crypto.randomUUID() });
const money = (id: string) => {
  const s = getContactStatement(opened.db, id, ASOF);
  return [s.outlays.reduce((sum, o) => sum + o.remainingCents, 0), s.creditCents];
};
/** Booked facts that a merge must never touch. */
const facts = () => ({
  bookings: sql('SELECT * FROM booking ORDER BY id'),
  splits: sql('SELECT * FROM booking_split ORDER BY id'),
  settlements: sql('SELECT * FROM contact_settlement ORDER BY id'),
  allocations: sql('SELECT * FROM contact_allocation ORDER BY id'),
  contactIds: sql('SELECT id FROM contact ORDER BY id'),
});
/** Every table a merge group may write. */
const touched = () => ({
  contacts: sql('SELECT * FROM contact ORDER BY id'),
  aliases: sql('SELECT * FROM contact_alias ORDER BY id'),
  payees: sql('SELECT * FROM payee ORDER BY id'),
  expected: sql('SELECT * FROM expected_payment ORDER BY id'),
  accounts: sql('SELECT * FROM account ORDER BY id'),
});
const listed = () =>
  listContactStatements(opened.db, ASOF, true)
    .map((c) => c.id)
    .filter((id) => id === 'ka' || id === 'kb');
const groups = () =>
  (sql('SELECT count(DISTINCT group_id) AS n FROM audit_log')[0] as { n: number }).n;

function merge(sourceId: string, targetId: string) {
  const preview = previewContactMerge(opened.db, sourceId, targetId, options);
  const c = ctx();
  commitContactMerge(opened.db, sourceId, targetId, preview.token!, c, options);
  return { preview, groupId: c.groupId };
}

function seedConfig() {
  createEntity(opened.db, payee, { id: 'pb', name: 'Zahler B', contactId: 'kb' }, testCtx);
  createEntity(
    opened.db,
    expectedPayment,
    {
      id: 'eb',
      name: 'Plan B',
      accountId: 'giro',
      dueDay: 5,
      startDate: '2026-01-01',
      contactId: 'kb',
    },
    testCtx,
  );
  createEntity(
    opened.db,
    account,
    {
      id: 'fb',
      name: 'Forderung B',
      type: 'receivable',
      role: 'receivable',
      onBudget: false,
      openingDate: '2023-10-01',
      contactId: 'kb',
    },
    testCtx,
  );
}

describe('#871 contact merge (pointer, no netting)', () => {
  it('previews literal counts and cents, read-only', () => {
    seedConfig();
    const before = { facts: facts(), touched: touched(), g: groups() };
    const p = previewContactMerge(opened.db, 'kb', 'ka', options);
    expect(p.conflicts).toEqual([]);
    expect(p.token).toEqual(expect.any(String));
    expect(p.source).toMatchObject({ id: 'kb', receivableCents: 0, creditCents: 0 });
    expect(p.target).toMatchObject({ id: 'ka', receivableCents: 4500, creditCents: 0 });
    expect(p.after).toEqual({ receivableCents: 4500, creditCents: 0 });
    expect(p.stays).toEqual({
      bookingSplits: 2,
      settlements: 1,
      allocations: 1,
      payslips: 0,
      reconciledBookings: 0,
    });
    expect(p.moves).toEqual({ payees: 1, expectedPayments: 1, accounts: 1 });
    expect(p.newAlias).toBe('Kontakt B');
    expect({ facts: facts(), touched: touched(), g: groups() }).toEqual(before);
  });

  it('commits one group; history is untouched and resolved; preview equals result', () => {
    seedConfig();
    const factsBefore = facts();
    const g0 = groups();
    const { preview } = merge('kb', 'ka');
    expect(groups()).toBe(g0 + 1);
    expect(facts()).toEqual(factsBefore); // ids, cents, statuses, splits: byte-identical
    expect(
      sql("SELECT merged_into_id AS m, archived_at AS a FROM contact WHERE id = 'kb'")[0],
    ).toEqual({
      m: 'ka',
      a: expect.any(String),
    });
    expect(sql('SELECT alias, contact_id FROM contact_alias')).toEqual([
      { alias: 'Kontakt B', contact_id: 'ka' },
    ]);
    expect(sql("SELECT contact_id FROM payee WHERE id = 'pb'")).toEqual([{ contact_id: 'ka' }]);
    expect(sql("SELECT contact_id FROM expected_payment WHERE id = 'eb'")).toEqual([
      { contact_id: 'ka' },
    ]);
    expect(sql("SELECT contact_id FROM account WHERE id = 'fb'")).toEqual([{ contact_id: 'ka' }]);
    expect(money('ka')).toEqual([preview.after.receivableCents, preview.after.creditCents]);
    expect(money('ka')).toEqual([4500, 0]);
    const resolved = getContactStatement(opened.db, 'kb', ASOF);
    expect(resolved.contact.id).toBe('ka');
    expect(resolved.resolvedFromId).toBe('kb');
    expect(resolved.contact.mergedFrom).toEqual([{ id: 'kb', name: 'Kontakt B' }]);
    // Union of the original rows: A's 3 000 + 12 000 outlays and B's 2 000, 5 receipts in total.
    expect(resolved.movements.map((m) => m.amountCents).sort((x, y) => x - y)).toEqual([
      -12_000, -3_000, -2_000, 2_000, 3_000, 7_500,
    ]);
    expect(listed()).toEqual(['ka']);
  });

  it('never nets a credit against an open receivable: refused, nothing written', () => {
    createEntity(opened.db, contact, { id: 'kc', name: 'Kontakt C' }, testCtx);
    // Credit 500 dated before A's open 12 000 outlay: the union statement would net it.
    settleContact(
      opened.db,
      'kc',
      { accountId: 'giro', date: '2026-03-12', amountCents: 500 },
      testCtx,
    );
    const p = previewContactMerge(opened.db, 'kc', 'ka', options);
    expect(p.conflicts).toEqual(['would_net']);
    expect(p.token).toBeNull();
    const before = { f: facts(), t: touched(), g: groups() };
    expect(() => commitContactMerge(opened.db, 'kc', 'ka', 'x.y', ctx(), options)).toThrow(
      ContactMergeConflictError,
    );
    expect({ f: facts(), t: touched(), g: groups() }).toEqual(before);
  });

  it('sums credit and receivable when no netting happens (credit after all outlays)', () => {
    createEntity(opened.db, contact, { id: 'kc', name: 'Kontakt C' }, testCtx);
    settleContact(
      opened.db,
      'kc',
      { accountId: 'giro', date: '2026-09-01', amountCents: 500 },
      testCtx,
    );
    const { preview } = merge('kc', 'ka');
    expect(preview.after).toEqual({ receivableCents: 4500, creditCents: 500 });
    expect(money('ka')).toEqual([4500, 500]);
  });

  it('refuses each conflict and leaves nothing behind', () => {
    const reasons = (s: string, t: string) =>
      previewContactMerge(opened.db, s, t, options).conflicts;
    expect(reasons('ka', 'ka')).toContain('same_contact');
    createEntity(opened.db, contact, { id: 'kc', name: 'Kontakt C' }, testCtx);
    merge('kc', 'ka');
    expect(reasons('kc', 'kb')).toContain('source_merged');
    expect(reasons('kb', 'kc')).toContain('target_merged');
    expect(reasons('ka', 'kb')).toContain('source_has_sources'); // no chains
    sql("UPDATE contact SET archived_at = '2026-01-01T00:00:00.000Z' WHERE id = 'kb'");
    expect(reasons('kb', 'ka')).toContain('source_archived');
    expect(reasons('ka', 'kb')).toContain('target_archived');
  });

  it('refuses two receivable accounts', () => {
    seedConfig();
    createEntity(
      opened.db,
      account,
      {
        id: 'fa',
        name: 'Forderung A',
        type: 'receivable',
        role: 'receivable',
        onBudget: false,
        openingDate: '2023-10-01',
        contactId: 'ka',
      },
      testCtx,
    );
    expect(previewContactMerge(opened.db, 'kb', 'ka', options).conflicts).toEqual([
      'both_receivable_account',
    ]);
  });

  it('refuses a stale, expired or forged token without writing', () => {
    const p = previewContactMerge(opened.db, 'kb', 'ka', options);
    const before = { f: facts(), t: touched(), g: groups() };
    updateEntity(
      opened.db,
      payee,
      createEntity(opened.db, payee, { name: 'Neu', contactId: 'ka' }, testCtx).id,
      { name: 'Neu 2' },
      testCtx,
    );
    const afterChange = { t: touched(), g: groups() };
    expect(() => commitContactMerge(opened.db, 'kb', 'ka', p.token!, ctx(), options)).toThrow(
      StalePreviewError,
    );
    const fresh = previewContactMerge(opened.db, 'kb', 'ka', options);
    expect(() =>
      commitContactMerge(opened.db, 'kb', 'ka', fresh.token!, ctx(), {
        ...options,
        now: new Date(Date.now() + 11 * 60 * 1000),
      }),
    ).toThrow(StalePreviewError);
    expect(() =>
      commitContactMerge(opened.db, 'kb', 'ka', fresh.token!, ctx(), { secret: 'other' }),
    ).toThrow(StalePreviewError);
    expect(() => commitContactMerge(opened.db, 'kb', 'ka', 'garbage', ctx(), options)).toThrow(
      StalePreviewError,
    );
    expect({ t: touched(), g: groups() }).toEqual(afterChange);
    expect(facts()).toEqual(before.f);
  });

  it('preserves reconciled (locked) history and reports it', () => {
    sql(
      "UPDATE booking SET status = 'reconciled' WHERE id IN (SELECT booking_id FROM booking_split WHERE contact_id = 'kb')",
    );
    const before = facts();
    const { preview } = merge('kb', 'ka');
    expect(preview.stays.reconciledBookings).toBe(2);
    expect(facts()).toEqual(before);
  });

  it('write-time resolution: a writer naming the merged id lands on the target', () => {
    merge('kb', 'ka');
    const id = createBooking(
      opened.db,
      {
        accountId: 'giro',
        date: '2026-04-01',
        amountCents: -700,
        splits: [{ categoryId: 'auslagen', contactId: 'kb', amountCents: -700 }],
      },
      testCtx,
    );
    expect(sql('SELECT contact_id FROM booking_split WHERE booking_id = ?', id)).toEqual([
      { contact_id: 'ka' },
    ]);
    const pe = createEntity(opened.db, payee, { name: 'Spät', contactId: 'kb' }, testCtx);
    expect(pe.contactId).toBe('ka');
  });

  it('Undo restores the exact previous state with the same ids; one undo group', () => {
    seedConfig();
    const before = { f: facts(), t: touched() };
    const { groupId } = merge('kb', 'ka');
    const g1 = groups();
    undo(opened.db, { groupId }, ctx());
    expect(groups()).toBe(g1 + 1);
    expect(facts()).toEqual(before.f);
    // Alias row stays as a soft-deleted record; everything else is byte-identical.
    const t = touched();
    expect(t.contacts).toEqual(before.t.contacts.map((c) => c)); // updated_at restored by snapshot
    expect(t.payees).toEqual(before.t.payees);
    expect(t.expected).toEqual(before.t.expected);
    expect(t.accounts).toEqual(before.t.accounts);
    expect(sql('SELECT count(*) AS n FROM contact_alias WHERE deleted_at IS NULL')).toEqual([
      { n: 0 },
    ]);
    expect(money('ka')).toEqual([4500, 0]);
    expect(money('kb')).toEqual([0, 0]);
    expect(listed()).toEqual(['ka', 'kb']);
  });

  it('Undo is refused as a single entry, and when a repointed row or source data changed since', () => {
    seedConfig();
    const { groupId } = merge('kb', 'ka');
    const mergeEntry = sql(
      "SELECT id FROM audit_log WHERE group_id = ? AND entity_type = 'contact'",
      groupId,
    )[0] as { id: string };
    expect(() => undo(opened.db, { auditId: mergeEntry.id }, ctx())).toThrow(AuditError);

    // A repointed row changed since (generic staleness).
    updateEntity(opened.db, payee, 'pb', { name: 'Zahler B2' }, testCtx);
    expect(() => undo(opened.db, { groupId }, ctx())).toThrow(AuditError);
  });

  it('Undo is refused when something was written under the source id since the merge', () => {
    const { groupId } = merge('kb', 'ka');
    // A legacy writer that bypassed resolution (simulated audit entry under the source id).
    sql(
      `INSERT INTO audit_log (id, actor, action, entity_type, entity_id, after_json, group_id)
       VALUES ('late', 'legacy', 'create', 'payee', 'px', '{"contact_id":"kb"}', 'late-group')`,
    );
    const g = groups();
    expect(() => undo(opened.db, { groupId }, ctx())).toThrow(AuditError);
    expect(groups()).toBe(g);
    expect(sql("SELECT merged_into_id AS m FROM contact WHERE id = 'kb'")).toEqual([{ m: 'ka' }]);
  });

  const outlayOf = (contactId: string, cents: number, date = '2026-04-01') =>
    createBooking(
      opened.db,
      {
        accountId: 'giro',
        date,
        amountCents: -cents,
        splits: [{ categoryId: 'auslagen', contactId, amountCents: -cents }],
      },
      testCtx,
    );
  const splitOf = (bookingId: string) =>
    (sql('SELECT id FROM booking_split WHERE booking_id = ?', bookingId)[0] as { id: string }).id;
  /** kc owns a credit of 10 000 (receipt dated before everything else), kd is empty. */
  function creditSource() {
    createEntity(opened.db, contact, { id: 'kc', name: 'Kontakt C' }, testCtx);
    createEntity(opened.db, contact, { id: 'kd', name: 'Kontakt D' }, testCtx);
    settleContact(
      opened.db,
      'kc',
      { accountId: 'giro', date: '2026-03-12', amountCents: 10_000 },
      testCtx,
    );
    return getContactStatement(opened.db, 'kc', ASOF).receipts[0]!.receiptSplitId;
  }
  const refused = (groupId: string) => {
    expect(() => undo(opened.db, { groupId }, ctx())).toThrow(AuditError);
    expect(sql('SELECT id FROM contact WHERE merged_into_id IS NOT NULL')).toHaveLength(1);
  };

  it('Undo is refused after the target chose to free the source-owned credit (10 000)', () => {
    const receiptSplitId = creditSource();
    const { groupId } = merge('kc', 'kd');
    expect(money('kd')).toEqual([0, 10_000]);
    chooseContactCredit(
      opened.db,
      'kd',
      { receiptSplitId, amountCents: 10_000, date: ASOF, choice: 'free' },
      testCtx,
      ASOF,
    );
    refused(groupId);
  });

  it('Undo is refused after a new target outlay consumed the source credit (2 000 of 10 000)', () => {
    creditSource();
    const { groupId } = merge('kc', 'kd');
    outlayOf('kd', 2_000);
    expect(money('kd')).toEqual([0, 8_000]);
    refused(groupId);
  });

  it('after a merge a payment of the target settles the source outlay (by design); Undo is then refused', () => {
    createEntity(opened.db, contact, { id: 'kc', name: 'Kontakt C' }, testCtx);
    createEntity(opened.db, contact, { id: 'kd', name: 'Kontakt D' }, testCtx);
    outlayOf('kc', 1_000, '2026-04-01');
    const { groupId, preview } = merge('kc', 'kd');
    expect(preview.after).toEqual({ receivableCents: 1_000, creditCents: 0 });
    settleContact(
      opened.db,
      'kd',
      { accountId: 'giro', date: '2026-04-05', amountCents: 1_000 },
      testCtx,
    );
    expect(money('kd')).toEqual([0, 0]);
    refused(groupId);
  });

  it('a later settlement named with the source id (writer resolves) also blocks Undo', () => {
    createEntity(opened.db, contact, { id: 'kc', name: 'Kontakt C' }, testCtx);
    outlayOf('kc', 1_000);
    const { groupId } = merge('kc', 'kb');
    settleContact(
      opened.db,
      'kc',
      { accountId: 'giro', date: '2026-04-05', amountCents: 400 },
      testCtx,
    );
    expect(money('kb')).toEqual([600, 0]);
    refused(groupId);
  });

  it('waives a source-owned outlay after the merge (1 000) and Undo of the waiver restores it', () => {
    createEntity(opened.db, contact, { id: 'kc', name: 'Kontakt C' }, testCtx);
    const outlay = splitOf(outlayOf('kc', 1_000));
    merge('kc', 'ka');
    expect(money('ka')).toEqual([5_500, 0]);
    const waived = waiveContactOutlay(
      opened.db,
      'ka',
      outlay,
      { amountCents: 1_000, categoryId: 'miete' },
      testCtx,
      ASOF,
    );
    expect(money('ka')).toEqual([4_500, 0]);
    undo(opened.db, { groupId: waived.groupId }, ctx());
    expect(money('ka')).toEqual([5_500, 0]);
  });

  it('refuses a single-entry Undo of any entry of a merge group (alias, repointed rows)', () => {
    seedConfig();
    const { groupId } = merge('kb', 'ka');
    for (const type of ['contact_alias', 'payee', 'expected_payment', 'account']) {
      const entry = sql(
        'SELECT id FROM audit_log WHERE group_id = ? AND entity_type = ?',
        groupId,
        type,
      )[0] as { id: string };
      expect(() => undo(opened.db, { auditId: entry.id }, ctx())).toThrow(AuditError);
    }
    expect(sql("SELECT merged_into_id AS m FROM contact WHERE id = 'kb'")).toEqual([{ m: 'ka' }]);
  });

  it('an Undo entry that restores a row under the source id blocks Undo of the merge', () => {
    const { groupId } = merge('kb', 'ka');
    sql(
      `INSERT INTO audit_log (id, actor, action, entity_type, entity_id, after_json, group_id)
       VALUES ('late-undo', 'x', 'undo', 'payee', 'px', '{"contact_id":"kb"}', 'late-undo-group')`,
    );
    expect(() => undo(opened.db, { groupId }, ctx())).toThrow(AuditError);
  });

  it('an allocation or credit record change with equal cents invalidates the token', () => {
    const allocation = previewContactMerge(opened.db, 'kb', 'ka', options);
    sql(
      "UPDATE contact_allocation SET updated_at = '2031-01-01T00:00:00.000Z' WHERE settlement_id IN (SELECT id FROM contact_settlement WHERE contact_id = 'kb')",
    );
    expect(() =>
      commitContactMerge(opened.db, 'kb', 'ka', allocation.token!, ctx(), options),
    ).toThrow(StalePreviewError);
    const record = previewContactMerge(opened.db, 'kb', 'ka', options);
    sql("INSERT INTO app_setting (id, value) VALUES ('contacts.credit.synthetic', '{}')");
    expect(() => commitContactMerge(opened.db, 'kb', 'ka', record.token!, ctx(), options)).toThrow(
      StalePreviewError,
    );
  });

  it('refuses a target credit that would net against the source outlay (symmetric would_net)', () => {
    createEntity(opened.db, contact, { id: 'kc', name: 'Kontakt C' }, testCtx);
    settleContact(
      opened.db,
      'kc',
      { accountId: 'giro', date: '2026-03-12', amountCents: 500 },
      testCtx,
    );
    expect(previewContactMerge(opened.db, 'ka', 'kc', options).conflicts).toEqual(['would_net']);
  });

  it('mixed reconciled and open bookings: merge then Undo leaves every fact identical', () => {
    sql(
      "UPDATE booking SET status = 'reconciled' WHERE id = (SELECT booking_id FROM booking_split WHERE contact_id = 'kb' LIMIT 1)",
    );
    const before = facts();
    const { groupId } = merge('kb', 'ka');
    expect(facts()).toEqual(before);
    undo(opened.db, { groupId }, ctx());
    expect(facts()).toEqual(before);
  });
});
