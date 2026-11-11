import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, sqliteOf, type OpenedDatabase } from '../client';
import { account, contact, expectedPayment, payee } from '../schema';
import { undo } from './audit';
import { createBooking, updateBooking } from './bookings';
import {
  addContactAlias,
  archiveContact,
  contactArchiveBlockers,
  removeContactAlias,
  reopenContact,
} from './contact-identity';
import { seedIdentityContacts } from './contact-identity-fixture';
import { listContactAliases } from './contact-label';
import { getContactStatement, listContactStatements, settleContact } from './contacts';
import { createEntity, updateEntity } from './entities';
import { globalSearch } from './global-search';
import {
  AuditError,
  ContactArchivedError,
  ContactBlockedError,
  ContactLabelTakenError,
  StaleError,
} from './errors';
import { seedBasics, testCtx } from './test-helpers';

let opened: OpenedDatabase;
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
  seedIdentityContacts(opened.db);
});
afterEach(() => opened.close());

const ASOF = '2026-09-17';
const sql = (text: string, ...params: unknown[]) => {
  const statement = sqliteOf(opened.db).prepare(text);
  return statement.reader ? statement.all(...params) : [statement.run(...params)];
};
const money = () =>
  listContactStatements(opened.db, ASOF, true)
    .filter((c) => c.id === 'ka' || c.id === 'kb')
    .map((c) => [c.id, c.receivableCents, c.creditCents]);
/** Everything a metadata operation must never touch. */
const facts = () => ({
  bookings: sql('SELECT id, date, amount_cents, status FROM booking ORDER BY id'),
  splits: sql('SELECT id, booking_id, contact_id, amount_cents FROM booking_split ORDER BY id'),
  settlements: sql('SELECT id, contact_id, credit_cents FROM contact_settlement ORDER BY id'),
  allocations: sql(
    'SELECT id, settlement_id, outlay_split_id, amount_cents FROM contact_allocation ORDER BY id',
  ),
  contactIds: sql('SELECT id FROM contact ORDER BY id'),
  money: money(),
});
const groups = () =>
  (sql('SELECT count(DISTINCT group_id) AS n FROM audit_log')[0] as { n: number }).n;
const updatedAt = (id: string) =>
  (sql('SELECT updated_at AS u FROM contact WHERE id = ?', id)[0] as { u: string }).u;
const ctx = () => ({ actor: 'tester', groupId: crypto.randomUUID() });

it('fixture has the contract numbers (independent literals)', () => {
  expect(money()).toEqual([
    ['ka', 4500, 0],
    ['kb', 0, 0],
  ]);
});

describe('alias', () => {
  it('adds and removes an alias without touching any money fact, one audit group each', () => {
    const before = facts();
    const g0 = groups();
    const alias = addContactAlias(opened.db, 'ka', '  Kontakt   A (alt) ', ctx());
    expect(alias).toMatchObject({
      contactId: 'ka',
      alias: 'Kontakt A (alt)',
      aliasNorm: 'kontakt a (alt)',
    });
    expect(groups()).toBe(g0 + 1);
    expect(facts()).toEqual(before);
    expect(getContactStatement(opened.db, 'ka', ASOF).contact.aliases).toEqual([
      expect.objectContaining({ alias: 'Kontakt A (alt)' }),
    ]);
    removeContactAlias(opened.db, 'ka', alias.id, ctx());
    expect(groups()).toBe(g0 + 2);
    expect(listContactAliases(opened.db, 'ka')).toEqual([]);
    expect(facts()).toEqual(before);
  });

  it('refuses collisions case/spacing-insensitively against names and aliases, writing nothing', () => {
    addContactAlias(opened.db, 'ka', 'Herr A', ctx());
    const g0 = groups();
    expect(() => addContactAlias(opened.db, 'kb', ' herr   a ', ctx())).toThrow(
      ContactLabelTakenError,
    );
    expect(() => addContactAlias(opened.db, 'ka', 'KONTAKT b', ctx())).toThrow(
      ContactLabelTakenError,
    );
    expect(() => addContactAlias(opened.db, 'ka', 'kontakt  A', ctx())).toThrow(/gleich dem Namen/);
    expect(() => addContactAlias(opened.db, 'ka', '   ', ctx())).toThrow();
    expect(() => addContactAlias(opened.db, 'ka', 'x'.repeat(201), ctx())).toThrow();
    expect(groups()).toBe(g0);
    // A new contact name or a rename cannot take an alias either.
    expect(() => createEntity(opened.db, contact, { name: 'HERR A' }, ctx())).toThrow(
      ContactLabelTakenError,
    );
    expect(() => updateEntity(opened.db, contact, 'kb', { name: 'herr a' }, ctx())).toThrow(
      ContactLabelTakenError,
    );
    expect(() => createEntity(opened.db, contact, { name: 'kontakt   b' }, ctx())).toThrow(
      ContactLabelTakenError,
    );
  });

  it('tolerates legacy near-duplicates until one is renamed', () => {
    sql("INSERT INTO contact (id, name) VALUES ('legacy', 'kontakt  a')");
    expect(() => addContactAlias(opened.db, 'legacy', 'Anderer Name', ctx())).not.toThrow();
    expect(() => updateEntity(opened.db, contact, 'legacy', { note: 'n' }, ctx())).not.toThrow();
    expect(() => updateEntity(opened.db, contact, 'legacy', { name: 'KONTAKT A' }, ctx())).toThrow(
      ContactLabelTakenError,
    );
  });

  it('detects a stale contact or alias row', () => {
    expect(() =>
      addContactAlias(opened.db, 'ka', 'Neu', ctx(), {
        expectedUpdatedAt: '2020-01-01T00:00:00.000Z',
      }),
    ).toThrow(StaleError);
    const alias = addContactAlias(opened.db, 'ka', 'Neu', ctx(), {
      expectedUpdatedAt: updatedAt('ka'),
    });
    expect(() =>
      removeContactAlias(opened.db, 'ka', alias.id, ctx(), { expectedUpdatedAt: 'x' }),
    ).toThrow(StaleError);
    expect(listContactAliases(opened.db, 'ka')).toHaveLength(1);
  });

  it('Undo of an add removes it; Undo of a removal brings it back, unless the label is taken', () => {
    const add = ctx();
    const alias = addContactAlias(opened.db, 'ka', 'Alias Eins', add);
    undo(opened.db, { groupId: add.groupId }, ctx());
    expect(listContactAliases(opened.db, 'ka')).toEqual([]);
    const a2 = addContactAlias(opened.db, 'ka', 'Alias Zwei', ctx());
    const remove = ctx();
    removeContactAlias(opened.db, 'ka', a2.id, remove);
    undo(opened.db, { groupId: remove.groupId }, ctx());
    expect(listContactAliases(opened.db, 'ka').map((a) => a.alias)).toEqual(['Alias Zwei']);
    void alias;
    // Removal, then the label is taken by another contact: Undo refused, nothing changes.
    const remove2 = ctx();
    removeContactAlias(opened.db, 'ka', a2.id, remove2);
    addContactAlias(opened.db, 'kb', 'alias zwei', ctx());
    const before = facts();
    expect(() => undo(opened.db, { groupId: remove2.groupId }, ctx())).toThrow(AuditError);
    expect(listContactAliases(opened.db, 'ka')).toEqual([]);
    expect(facts()).toEqual(before);
  });

  it('Undo of an add is refused when the alias was removed since', () => {
    const add = ctx();
    const alias = addContactAlias(opened.db, 'ka', 'Alias Drei', add);
    removeContactAlias(opened.db, 'ka', alias.id, ctx());
    expect(() => undo(opened.db, { groupId: add.groupId }, ctx())).toThrow(AuditError);
  });
});

it('global search finds a contact by its alias, display name unchanged', () => {
  addContactAlias(opened.db, 'ka', 'Zimmerkollege', ctx());
  expect(globalSearch(opened.db, 'zimmerkoll').filter((r) => r.kind === 'contact')).toEqual([
    { kind: 'contact', id: 'ka', label: 'Kontakt A', detail: null },
  ]);
});

describe('archive', () => {
  it('is refused for Kontakt A listing the receivable, writing nothing', () => {
    const g0 = groups();
    const before = facts();
    let error: unknown;
    try {
      archiveContact(opened.db, 'ka', ctx());
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ContactBlockedError);
    expect((error as ContactBlockedError).blockers).toEqual([{ kind: 'receivable', count: 4500 }]);
    expect(groups()).toBe(g0);
    expect(facts()).toEqual(before);
  });

  it('archives and reopens Kontakt B (closed history) without moving any fact', () => {
    const before = facts();
    const g0 = groups();
    const row = archiveContact(opened.db, 'kb', ctx());
    expect(row.archivedAt).toEqual(expect.any(String));
    expect(groups()).toBe(g0 + 1);
    expect(facts()).toEqual(before);
    // Still in the history list and statement, with its flag.
    expect(
      listContactStatements(opened.db, ASOF, true).find((c) => c.id === 'kb')?.archivedAt,
    ).toEqual(expect.any(String));
    expect(getContactStatement(opened.db, 'kb', ASOF).contact.archivedAt).toEqual(
      expect.any(String),
    );
    reopenContact(opened.db, 'kb', ctx());
    expect(groups()).toBe(g0 + 2);
    expect(facts()).toEqual(before);
    expect(getContactStatement(opened.db, 'kb', ASOF).contact.archivedAt).toBeNull();
  });

  it('each live reference blocks archiving: credit only, expected, payee, account, payslip', () => {
    const kinds = (id: string) => contactArchiveBlockers(opened.db, id).map((b) => b.kind);
    createEntity(opened.db, contact, { id: 'kc', name: 'Kontakt C' }, testCtx);
    expect(kinds('kc')).toEqual([]);
    settleContact(
      opened.db,
      'kc',
      { accountId: 'giro', date: '2026-03-12', amountCents: 500 },
      testCtx,
    );
    expect(contactArchiveBlockers(opened.db, 'kc')).toEqual([{ kind: 'credit', count: 500 }]);
    createEntity(opened.db, contact, { id: 'kd', name: 'Kontakt D' }, testCtx);
    createEntity(
      opened.db,
      expectedPayment,
      { name: 'Plan', accountId: 'giro', dueDay: 5, startDate: '2026-01-01', contactId: 'kd' },
      testCtx,
    );
    expect(kinds('kd')).toEqual(['expected']);
    createEntity(opened.db, payee, { name: 'Zahler', contactId: 'kd' }, testCtx);
    expect(kinds('kd')).toEqual(['expected', 'payee']);
    createEntity(
      opened.db,
      account,
      {
        name: 'Forderung D',
        type: 'receivable',
        role: 'receivable',
        onBudget: false,
        openingDate: '2023-10-01',
        contactId: 'kd',
      },
      testCtx,
    );
    expect(kinds('kd')).toEqual(['expected', 'payee', 'account']);
    sql(
      "INSERT INTO payslip (id, month, gross_cents, net_cents, employer_contact_id) VALUES ('ps', '2026-03', 300000, 200000, 'kd')",
    );
    expect(kinds('kd')).toEqual(['expected', 'payee', 'account', 'payslip']);
    expect(() => archiveContact(opened.db, 'kd', ctx())).toThrow(ContactBlockedError);
  });

  it('writers given an archived contact are refused, history of it stays editable', () => {
    const bookingId = (
      sql('SELECT booking_id AS b FROM booking_split WHERE contact_id = ? LIMIT 1', 'kb')[0] as {
        b: string;
      }
    ).b;
    archiveContact(opened.db, 'kb', ctx());
    const before = facts();
    expect(() =>
      createBooking(
        opened.db,
        {
          accountId: 'giro',
          date: '2026-09-01',
          amountCents: -100,
          splits: [{ categoryId: 'auslagen', contactId: 'kb', amountCents: -100 }],
        },
        testCtx,
      ),
    ).toThrow(ContactArchivedError);
    expect(() => createEntity(opened.db, payee, { name: 'P2', contactId: 'kb' }, testCtx)).toThrow(
      ContactArchivedError,
    );
    expect(() =>
      createEntity(
        opened.db,
        expectedPayment,
        { name: 'E2', accountId: 'giro', dueDay: 5, startDate: '2026-01-01', contactId: 'kb' },
        testCtx,
      ),
    ).toThrow(ContactArchivedError);
    expect(() =>
      updateBooking(opened.db, bookingId, { memo: 'Notiz zur alten Auslage' }, testCtx),
    ).not.toThrow();
    expect(facts().contactIds).toEqual(before.contactIds);
  });

  it('Undo of archive reopens exactly; Undo of reopen is refused while a blocker exists', () => {
    const archive = ctx();
    archiveContact(opened.db, 'kb', archive);
    undo(opened.db, { groupId: archive.groupId }, ctx());
    expect(getContactStatement(opened.db, 'kb', ASOF).contact.archivedAt).toBeNull();

    archiveContact(opened.db, 'kb', ctx());
    const reopen = ctx();
    reopenContact(opened.db, 'kb', reopen);
    createEntity(opened.db, payee, { name: 'Zahler B', contactId: 'kb' }, testCtx);
    const before = facts();
    expect(() => undo(opened.db, { groupId: reopen.groupId }, ctx())).toThrow(AuditError);
    expect(getContactStatement(opened.db, 'kb', ASOF).contact.archivedAt).toBeNull();
    expect(facts()).toEqual(before);
  });

  it('Undo of archive is refused when the contact was edited since', () => {
    const archive = ctx();
    archiveContact(opened.db, 'kb', archive);
    updateEntity(opened.db, contact, 'kb', { note: 'später' }, ctx());
    expect(() => undo(opened.db, { groupId: archive.groupId }, ctx())).toThrow(AuditError);
  });

  it('detects stale input and keeps the name reserved while archived', () => {
    expect(() =>
      archiveContact(opened.db, 'kb', ctx(), { expectedUpdatedAt: '2020-01-01T00:00:00.000Z' }),
    ).toThrow(StaleError);
    archiveContact(opened.db, 'kb', ctx(), { expectedUpdatedAt: updatedAt('kb') });
    expect(() => createEntity(opened.db, contact, { name: 'Kontakt B' }, ctx())).toThrow();
  });
});
