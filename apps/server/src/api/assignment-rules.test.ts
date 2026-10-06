/* eslint-disable @typescript-eslint/no-explicit-any -- Inspect JSON API boundary. */
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import {
  createBooking,
  createTestDatabase,
  getBooking,
  listAssignmentRules,
  schema,
  undo,
  mergePayees,
  mergeCategories,
  type OpenedDatabase,
} from '@budget/db';
import { type AssignmentRuleInput } from '@budget/domain';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedBasics } from '../../../../packages/db/src/repos/test-helpers';
import { createApp, type AuthGate } from '../app';
import { BankSync } from '../bank-sync/service';
import { bankSecretBox } from '../bank-sync/secrets';
import type { BankProvider } from '../bank-sync/provider';

let opened: OpenedDatabase, app: ReturnType<typeof createApp>, sync: BankSync;
let authenticated: boolean;
const today = '2026-10-02';
const input: AssignmentRuleInput = {
  name: 'Shop zuordnen',
  enabled: true,
  automatic: false,
  match: { mode: 'all', conditions: [{ type: 'contains', text: 'Shop A' }] },
  actions: { payeeId: 'p1', categoryId: 'essen', memo: 'Prüfnotiz', flag: 'blue' },
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(today + 'T12:00:00Z'));
  opened = createTestDatabase();
  seedBasics(opened.db);
  authenticated = true;
  const auth: AuthGate = {
    routes: new Hono(),
    originGuard: async (c, next) =>
      c.req.method === 'GET' || c.req.header('origin') === 'https://budget.example'
        ? next()
        : c.json({ error: 'origin_rejected' }, 403),
    requireSession: async (c, next) =>
      authenticated ? next() : c.json({ error: 'unauthorized' }, 401),
    requireStepUp: async (_c, next) => next(),
  };
  const provider = {} as BankProvider; // Confirmation uses only the staged synthetic rows.
  sync = new BankSync(
    opened.db,
    provider,
    bankSecretBox('ef'.repeat(32)),
    'https://budget.example',
    () => new Date(today + 'T12:00:00Z'),
  );
  app = createApp({
    webDir: 'test-results/no-web',
    auth,
    ledger: { db: opened.db, bankSync: sync, today: () => today },
  });
});
afterEach(() => {
  opened.close();
  vi.useRealTimers();
});
async function call(
  method: string,
  path: string,
  body?: unknown,
  origin = 'https://budget.example',
) {
  const response = await app.request('/api' + path, {
    method,
    headers: { origin, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: (await response.json()) as any };
}
function candidate(
  memo = 'SEPA-Lastschrift Shop A Ref: SYN-42',
  accountId = 'giro',
  amountCents = -1201,
) {
  const id = randomUUID();
  opened.db
    .insert(schema.bankSyncCandidate)
    .values({ id, accountId, dedupeKey: id, date: today, amountCents, currency: 'EUR', memo })
    .run();
  opened.db
    .insert(schema.inboxItem)
    .values({
      id,
      kind: 'import',
      title: 'Bankumsatz prüfen',
      refType: 'bank-sync-candidate',
      refId: id,
    })
    .run();
  return id;
}
describe('assignment API and owner confirmation', () => {
  it('does not replace a learned category when only confirming an unassigned booking', async () => {
    const make = () =>
      createBooking(
        opened.db,
        {
          accountId: 'giro',
          date: today,
          amountCents: -2307,
          payeeId: 'p1',
          status: 'pending',
          splits: [{ amountCents: -2307 }],
        },
        { actor: 'test' },
      );
    const first = make();
    expect(
      (
        await call('PATCH', '/bookings/' + first, {
          status: 'confirmed',
          splits: [{ amountCents: -2307, categoryId: 'essen' }],
        })
      ).status,
    ).toBe(200);
    const second = make();
    expect((await call('PATCH', '/bookings/' + second, { status: 'confirmed' })).status).toBe(200);
    const third = make();
    const review = (await call('GET', '/assignment-rules/bookings/' + third)).body;
    expect(review.suggestions).toHaveLength(1);
    expect(review.suggestions[0].actions.categoryId).toBe('essen');
  });
  it('retains category and income type together when learning and applying an inflow', async () => {
    opened.db.insert(schema.incomeType).values({ id: 'income-a', name: 'Einkommen A' }).run();
    const make = () =>
      createBooking(
        opened.db,
        {
          accountId: 'giro',
          date: today,
          amountCents: 4207,
          payeeId: 'p1',
          status: 'pending',
          splits: [{ amountCents: 4207 }],
        },
        { actor: 'test' },
      );
    const first = make();
    expect(
      (
        await call('PATCH', '/bookings/' + first, {
          status: 'confirmed',
          splits: [{ amountCents: 4207, categoryId: 'reise', incomeTypeId: 'income-a' }],
        })
      ).status,
    ).toBe(200);
    const second = make();
    const review = await call('GET', '/assignment-rules/bookings/' + second);
    expect(review.status).toBe(200);
    expect(review.body.suggestions[0].actions).toMatchObject({
      categoryId: 'reise',
      incomeTypeId: 'income-a',
    });
    expect(
      (
        await call('POST', '/assignment-rules/bookings/' + second + '/apply', {
          ruleId: review.body.suggestions[0].id,
          revision: review.body.suggestions[0].revision,
        })
      ).status,
    ).toBe(200);
    expect(getBooking(opened.db, second)?.splits[0]).toMatchObject({
      amountCents: 4207,
      categoryId: 'reise',
      incomeTypeId: 'income-a',
    });
  });
  it('keeps bank source accounts and rejects unavailable learned targets without writing', async () => {
    const first = candidate();
    await call('POST', '/bank-sync/candidates/' + first + '/confirm', { categoryId: 'essen' });
    const otherAccount = candidate('Shop A', 'spar');
    const review = (await call('GET', '/assignment-rules/candidates/' + otherAccount)).body;
    expect(review.suggestions).toHaveLength(1);
    expect(review.suggestions[0].unavailable).toBeTruthy();
    expect(
      (
        await call('POST', '/bank-sync/candidates/' + otherAccount + '/confirm', {
          categoryId: null,
          ruleId: review.suggestions[0].id,
          revision: review.suggestions[0].revision,
        })
      ).status,
    ).toBe(409);
    expect(opened.db.select().from(schema.booking).all()).toHaveLength(1);
    expect(
      (
        await call('POST', '/bank-sync/candidates/' + otherAccount + '/confirm', {
          categoryId: null,
          actions: { categoryId: 'essen', accountId: 'giro' },
        })
      ).status,
    ).toBe(409);
    expect(opened.db.select().from(schema.booking).all()).toHaveLength(1);
    opened.db
      .update(schema.category)
      .set({ deletedAt: today + 'T12:00:00Z' })
      .where(eq(schema.category.id, 'essen'))
      .run();
    const next = candidate('Shop A');
    const unavailable = (await call('GET', '/assignment-rules/candidates/' + next)).body;
    expect(unavailable.suggestions[0].unavailable).toBeTruthy();
    expect(
      (
        await call('POST', '/bank-sync/candidates/' + next + '/confirm', {
          categoryId: null,
          ruleId: unavailable.suggestions[0].id,
          revision: unavailable.suggestions[0].revision,
        })
      ).status,
    ).toBe(409);
    expect(opened.db.select().from(schema.booking).all()).toHaveLength(1);
  });

  it('does not learn unfinished or failed owner edits or contact assignments', async () => {
    const make = () =>
      createBooking(
        opened.db,
        {
          accountId: 'giro',
          date: today,
          amountCents: -1201,
          payeeId: 'p1',
          status: 'pending',
          splits: [{ amountCents: -1201 }],
        },
        { actor: 'test' },
      );
    const id = make();
    expect(
      (
        await call('PATCH', '/bookings/' + id, {
          splits: [{ amountCents: -1201, categoryId: 'essen' }],
        })
      ).status,
    ).toBe(200);
    expect(listAssignmentRules(opened.db)).toEqual([]);
    expect(
      (
        await call('PATCH', '/bookings/' + id, {
          status: 'confirmed',
          splits: [{ amountCents: -1200, categoryId: 'essen' }],
        })
      ).status,
    ).toBe(422);
    expect(listAssignmentRules(opened.db)).toEqual([]);
    expect(getBooking(opened.db, id)?.status).toBe('pending');
    expect(
      (
        await call('PATCH', '/bookings/' + id, {
          status: 'confirmed',
          splits: [{ amountCents: -1201, categoryId: 'auslagen', contactId: 'k1' }],
        })
      ).status,
    ).toBe(200);
    expect(listAssignmentRules(opened.db)).toEqual([]);
  });

  it('remembers an explicitly empty payee instead of using a future cleanup fallback', async () => {
    const id = candidate('SYN-42');
    opened.db
      .update(schema.bankSyncCandidate)
      .set({ rawPayee: 'Vermieter' })
      .where(eq(schema.bankSyncCandidate.id, id))
      .run();
    expect(
      (
        await call('POST', '/bank-sync/candidates/' + id + '/confirm', {
          categoryId: 'essen',
          payeeId: null,
        })
      ).status,
    ).toBe(200);
    const next = candidate('SYN-43');
    opened.db
      .update(schema.bankSyncCandidate)
      .set({ rawPayee: 'Vermieter' })
      .where(eq(schema.bankSyncCandidate.id, next))
      .run();
    const review = (await call('GET', '/assignment-rules/candidates/' + next)).body;
    expect(review.cleanup.payeeId).toBe('p1');
    expect(review.suggestions[0].actions.payeeId).toBeNull();
    const applied = await call('POST', '/bank-sync/candidates/' + next + '/confirm', {
      categoryId: null,
      ruleId: review.suggestions[0].id,
      revision: review.suggestions[0].revision,
    });
    expect(applied.status).toBe(200);
    expect(getBooking(opened.db, applied.body.bookingId)?.payeeId).toBeNull();
  });

  it('learns confirmation, matches normalized counterparties only in the same direction, and deletes with undo', async () => {
    const first = candidate();
    const confirmed = await call('POST', '/bank-sync/candidates/' + first + '/confirm', {
      categoryId: 'essen',
      payeeId: 'p1',
    });
    expect(confirmed.status).toBe(200);
    const next = candidate('  shop   a  ', 'giro', -2307);
    const review = (await call('GET', '/assignment-rules/candidates/' + next)).body;
    expect(review.suggestions).toHaveLength(1);
    const learned = review.suggestions[0];
    expect(learned.automatic).toBe(false);
    expect(learned.actions).toEqual({ categoryId: 'essen', payeeId: 'p1', accountId: 'giro' });
    expect(getBooking(opened.db, confirmed.body.bookingId)?.splits[0]?.categoryId).toBe('essen');
    expect(opened.db.select().from(schema.booking).all()).toHaveLength(1);
    const opposite = candidate('Shop A', 'giro', 2307);
    expect(
      (await call('GET', '/assignment-rules/candidates/' + opposite)).body.suggestions,
    ).toEqual([]);
    const different = candidate('Shop AB');
    expect(
      (await call('GET', '/assignment-rules/candidates/' + different)).body.suggestions,
    ).toEqual([]);
    const removed = await call('DELETE', '/assignment-rules/' + learned.id);
    expect(removed.status).toBe(200);
    expect((await call('GET', '/assignment-rules/candidates/' + next)).body.suggestions).toEqual(
      [],
    );
    undo(opened.db, { groupId: removed.body.groupId }, { actor: 'owner' });
    expect(
      (await call('GET', '/assignment-rules/candidates/' + next)).body.suggestions,
    ).toHaveLength(1);
    undo(opened.db, { groupId: confirmed.body.groupId }, { actor: 'owner' });
    expect((await call('GET', '/assignment-rules/candidates/' + next)).body.suggestions).toEqual(
      [],
    );
  });

  it('learns income type and account on owner classification, replaces the last choice and applies explicitly', async () => {
    opened.db.insert(schema.incomeType).values({ id: 'income-a', name: 'Einkommen A' }).run();
    const make = () =>
      createBooking(
        opened.db,
        {
          accountId: 'giro',
          date: today,
          amountCents: 4207,
          payeeId: 'p1',
          status: 'pending',
          splits: [{ amountCents: 4207, categoryId: null }],
        },
        { actor: 'owner' },
      );
    const first = make();
    expect(
      (
        await call('PATCH', '/bookings/' + first, {
          accountId: 'spar',
          status: 'confirmed',
          splits: [{ amountCents: 4207, categoryId: null, incomeTypeId: 'income-a' }],
        })
      ).status,
    ).toBe(200);
    const second = make();
    const review = (await call('GET', '/assignment-rules/bookings/' + second)).body;
    expect(review.suggestions).toHaveLength(1);
    expect(review.suggestions[0].actions).toEqual({
      categoryId: null,
      incomeTypeId: 'income-a',
      payeeId: 'p1',
      accountId: 'spar',
    });
    expect(getBooking(opened.db, second)?.status).toBe('pending');
    const applied = await call('POST', '/assignment-rules/bookings/' + second + '/apply', {
      ruleId: review.suggestions[0].id,
      revision: review.suggestions[0].revision,
    });
    expect(applied.status).toBe(200);
    expect(getBooking(opened.db, second)).toMatchObject({ accountId: 'spar', status: 'confirmed' });
    expect(getBooking(opened.db, second)?.splits[0]?.incomeTypeId).toBe('income-a');
    const third = make();
    const changed = await call('PATCH', '/bookings/' + third, {
      status: 'confirmed',
      splits: [{ amountCents: 4207, categoryId: 'reise' }],
    });
    expect(changed.status).toBe(200);
    const fourth = make();
    const updated = (await call('GET', '/assignment-rules/bookings/' + fourth)).body;
    expect(updated.suggestions).toHaveLength(1);
    expect(updated.suggestions[0].actions).toEqual({
      categoryId: 'reise',
      payeeId: 'p1',
      accountId: 'giro',
    });
    expect(
      (
        await call('POST', '/assignment-rules/bookings/' + fourth + '/apply', {
          ruleId: review.suggestions[0].id,
          revision: review.suggestions[0].revision,
        })
      ).status,
    ).toBe(409);
    undo(opened.db, { groupId: changed.body.groupId }, { actor: 'owner' });
    expect(
      (await call('GET', '/assignment-rules/bookings/' + fourth)).body.suggestions[0].actions
        .incomeTypeId,
    ).toBe('income-a');
  });

  it('previews the same payee fallback as unchecked bookings and honors an explicit cleared payee', async () => {
    const rawPayee = 'Vermieter';
    const id = candidate('SYN-88');
    opened.db
      .update(schema.bankSyncCandidate)
      .set({ rawPayee })
      .where(eq(schema.bankSyncCandidate.id, id))
      .run();
    const result = await call('POST', '/bank-sync/candidates/' + id + '/confirm', {
      categoryId: null,
      payeeId: null,
    });
    expect(result.status).toBe(200);
    expect(getBooking(opened.db, result.body.bookingId)?.payeeId).toBeNull();
    const rule = {
      ...input,
      match: { mode: 'all', conditions: [{ type: 'payee', payeeId: 'p1' }] },
    };
    const created = await call('POST', '/assignment-rules', rule);
    expect(
      (
        await call('GET', '/assignment-rules/bookings/' + result.body.bookingId)
      ).body.suggestions.map((r: { id: string }) => r.id),
    ).toEqual([created.body.id]);
    expect((await call('POST', '/assignment-rules/preview', rule)).body.count).toBe(1);
  });
  it('matches a separate raw payee in suggestions and staged and confirmed history', async () => {
    const id = candidate('Referenz SYN-77');
    opened.db
      .update(schema.bankSyncCandidate)
      .set({ rawPayee: 'Shop A' })
      .where(eq(schema.bankSyncCandidate.id, id))
      .run();
    const rule = await call('POST', '/assignment-rules', input);
    const review = (await call('GET', '/assignment-rules/candidates/' + id)).body;
    expect(review.suggestions.map((r: { id: string }) => r.id)).toEqual([rule.body.id]);
    expect((await call('POST', '/assignment-rules/preview', input)).body.count).toBe(1);
    const confirmed = await call('POST', '/bank-sync/candidates/' + id + '/confirm', {
      categoryId: null,
      ruleId: rule.body.id,
      revision: rule.body.revision,
      candidateRevision: review.candidateRevision,
    });
    expect(confirmed.status).toBe(200);
    expect((await call('POST', '/assignment-rules/preview', input)).body.count).toBe(1);
    expect(getBooking(opened.db, confirmed.body.bookingId)?.bankRawPayee).toBe('Shop A');
  });
  it('rejects stale rule and bank revisions before writing, and automatic rules still need confirmation', async () => {
    const id = candidate();
    const created = await call('POST', '/assignment-rules', { ...input, automatic: true });
    const review = (await call('GET', '/assignment-rules/candidates/' + id)).body;
    expect(opened.db.select().from(schema.booking).all()).toHaveLength(0);
    const edited = await call('PUT', '/assignment-rules/' + created.body.id, {
      ...input,
      automatic: true,
      actions: { categoryId: 'reise' },
    });
    expect(
      (
        await call('POST', '/bank-sync/candidates/' + id + '/confirm', {
          categoryId: null,
          ruleId: created.body.id,
          revision: created.body.revision,
        })
      ).status,
    ).toBe(409);
    opened.db
      .update(schema.bankSyncCandidate)
      .set({ memo: 'Shop A geändert' })
      .where(eq(schema.bankSyncCandidate.id, id))
      .run();
    expect(
      (
        await call('POST', '/bank-sync/candidates/' + id + '/confirm', {
          categoryId: null,
          candidateRevision: review.candidateRevision,
          ruleId: created.body.id,
          revision: edited.body.revision,
        })
      ).status,
    ).toBe(409);
    const result = await call('POST', '/bank-sync/candidates/' + id + '/confirm', {
      categoryId: null,
    });
    expect(result.status).toBe(200);
    expect(getBooking(opened.db, result.body.bookingId)?.splits[0]?.categoryId).toBe('reise');
  });
  it('confirms both staged transfer legs once, restores them after undo and attaches later bank evidence', async () => {
    const transfer = await call('POST', '/assignment-rules', {
      ...input,
      actions: { transferAccountId: 'spar' },
    });
    const id = candidate(),
      other = candidate('Gegenumsatz A', 'spar', 1201);
    const confirm = () =>
      call('POST', '/bank-sync/candidates/' + id + '/confirm', {
        categoryId: null,
        ruleId: transfer.body.id,
        revision: transfer.body.revision,
      });
    const first = await confirm();
    expect(first.status).toBe(200);
    expect(opened.db.select().from(schema.booking).all()).toHaveLength(2);
    expect((await call('GET', '/assignment-rules/candidates/' + other)).status).toBe(409);
    undo(opened.db, { groupId: first.body.groupId }, { actor: 'owner' });
    expect((await call('GET', '/assignment-rules/candidates/' + other)).status).toBe(200);
    const second = await confirm();
    expect(second.status).toBe(200);
    expect(opened.db.select().from(schema.booking).all()).toHaveLength(2);
    const extra = candidate('Shop A zweite Umbuchung', 'giro', -2203);
    const lateConfirm = await call('POST', '/bank-sync/candidates/' + extra + '/confirm', {
      categoryId: null,
      ruleId: transfer.body.id,
      revision: transfer.body.revision,
    });
    expect(lateConfirm.status).toBe(200);
    const late = candidate('Gegenumsatz B', 'spar', 2203);
    expect(
      (await call('GET', '/assignment-rules/candidates/' + late)).body.existingTransfer,
    ).not.toBeNull();
    const attached = await call('POST', '/bank-sync/candidates/' + late + '/confirm', {
      categoryId: null,
    });
    expect(attached.status).toBe(200);
    expect(opened.db.select().from(schema.booking).all()).toHaveLength(4);
    expect(getBooking(opened.db, attached.body.bookingId)?.bankRawText).toBe('Gegenumsatz B');
  });
  it('refuses ambiguous transfer counterparts atomically', async () => {
    const transfer = await call('POST', '/assignment-rules', {
      ...input,
      actions: { transferAccountId: 'spar' },
    });
    const id = candidate();
    candidate('Gegenumsatz A', 'spar', 1201);
    candidate('Gegenumsatz B', 'spar', 1201);
    const result = await call('POST', '/bank-sync/candidates/' + id + '/confirm', {
      categoryId: null,
      ruleId: transfer.body.id,
      revision: transfer.body.revision,
    });
    expect(result.status).toBe(422);
    expect(opened.db.select().from(schema.booking).all()).toHaveLength(0);
    expect(
      opened.db
        .select()
        .from(schema.inboxItem)
        .all()
        .every((r) => r.resolvedAt === null),
    ).toBe(true);
  });
  it('remaps split categories, payee conditions and aliases in merge/undo groups', async () => {
    opened.db.insert(schema.payee).values({ id: 'p2', name: 'Shop B' }).run();
    const id = createBooking(
      opened.db,
      {
        accountId: 'giro',
        date: today,
        amountCents: -1201,
        memo: 'Shop A',
        source: 'bank',
        status: 'pending',
        splits: [{ amountCents: -1201 }],
      },
      { actor: 'test' },
    );
    await call('PATCH', '/bookings/' + id, { payeeId: 'p1' });
    const rule = await call('POST', '/assignment-rules', {
      ...input,
      match: { mode: 'all', conditions: [{ type: 'payee', payeeId: 'p1' }] },
      actions: {
        payeeId: 'p1',
        splits: [
          { categoryId: 'essen', weightBp: 5000 },
          { categoryId: 'reise', weightBp: 5000 },
        ],
      },
    });
    const mergedPayee = mergePayees(opened.db, ['p1'], 'p2', { actor: 'owner' });
    expect(listAssignmentRules(opened.db)[0]?.match.conditions).toEqual([
      { type: 'payee', payeeId: 'p2' },
    ]);
    expect(opened.db.select().from(schema.bankPayeeAlias).all()[0]?.payeeId).toBe('p2');
    undo(opened.db, { groupId: mergedPayee.groupId }, { actor: 'owner' });
    expect(listAssignmentRules(opened.db)[0]?.actions.payeeId).toBe('p1');
    const mergedCategory = mergeCategories(opened.db, ['essen'], 'reise', { actor: 'owner' });
    expect(listAssignmentRules(opened.db)[0]?.actions.splits?.map((s) => s.categoryId)).toEqual([
      'reise',
      'reise',
    ]);
    undo(opened.db, { groupId: mergedCategory.groupId }, { actor: 'owner' });
    expect(listAssignmentRules(opened.db)[0]?.id).toBe(rule.body.id);
    expect(listAssignmentRules(opened.db)[0]?.actions.splits?.map((s) => s.categoryId)).toEqual([
      'essen',
      'reise',
    ]);
  });
  it('keeps source cleanup and aliases isolated, with undoable configuration', async () => {
    opened.db
      .insert(schema.bankSyncConsent)
      .values({
        id: 'source-consent',
        initiator: 'synthetic',
        stateHash: 'source-state',
        expiresAt: '2026-11-01T00:00:00Z',
        label: 'Bank A',
        nextRunAt: '2026-10-02T00:00:00Z',
      })
      .run();
    for (const id of ['source-a', 'source-b'])
      opened.db
        .insert(schema.bankSyncAccount)
        .values({
          id,
          consentId: 'source-consent',
          secret: 'synthetic-encrypted-placeholder',
          label: 'Konto ' + id,
          currency: 'EUR',
        })
        .run();
    const id = candidate('Terminal Shop A Ref: SYN');
    opened.db
      .update(schema.bankSyncCandidate)
      .set({ sourceId: 'source-a', rawPayee: 'Shop B' })
      .where(eq(schema.bankSyncCandidate.id, id))
      .run();
    const config = {
      useMemo: true,
      stripSepa: true,
      stripCards: true,
      stripDates: true,
      stripReferences: true,
      prefixes: ['Terminal'],
    };
    const changed = await call('PUT', '/assignment-rules/cleanup', {
      sourceId: 'source-a',
      config,
    });
    expect(changed.status).toBe(200);
    expect((await call('GET', '/assignment-rules/candidates/' + id)).body.cleanup.cleaned).toBe(
      'Shop A',
    );
    const confirmed = await call('POST', '/bank-sync/candidates/' + id + '/confirm', {
      categoryId: 'essen',
      payeeId: 'p1',
    });
    expect(confirmed.status).toBe(200);
    const second = candidate('Terminal Shop A Ref: SYN');
    opened.db
      .update(schema.bankSyncCandidate)
      .set({ sourceId: 'source-b', rawPayee: 'Shop B' })
      .where(eq(schema.bankSyncCandidate.id, second))
      .run();
    expect(
      (await call('GET', '/assignment-rules/candidates/' + second)).body.cleanup.payeeId,
    ).toBeNull();
    undo(opened.db, { groupId: changed.body.groupId }, { actor: 'owner' });
    const third = candidate('Terminal Shop A Ref: SYN');
    opened.db
      .update(schema.bankSyncCandidate)
      .set({ sourceId: 'source-a', rawPayee: 'Shop B' })
      .where(eq(schema.bankSyncCandidate.id, third))
      .run();
    const review = (await call('GET', '/assignment-rules/candidates/' + third)).body;
    expect([review.cleanup.cleaned, review.cleanup.payeeId, review.cleanup.learned]).toEqual([
      'Shop B',
      'p1',
      true,
    ]);
  });
  it('guards sessions/origins, validates targets and refuses unsafe regex and invalid splits', async () => {
    authenticated = false;
    expect((await call('GET', '/assignment-rules')).status).toBe(401);
    authenticated = true;
    expect((await call('POST', '/assignment-rules', input, 'https://other.example')).status).toBe(
      403,
    );
    expect((await call('POST', '/assignment-rules', { ...input, extra: true })).status).toBe(400);
    expect(
      (await call('POST', '/assignment-rules', { ...input, actions: { categoryId: 'missing' } }))
        .status,
    ).toBe(409);
    expect(
      (
        await call('POST', '/assignment-rules', {
          ...input,
          match: { mode: 'all', conditions: [{ type: 'regex', pattern: '(a+)+$' }] },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call('POST', '/assignment-rules', {
          ...input,
          actions: {
            splits: [
              { categoryId: 'essen', weightBp: 5000 },
              { categoryId: 'reise', weightBp: 4999 },
            ],
          },
        })
      ).status,
    ).toBe(400);
    expect(listAssignmentRules(opened.db)).toHaveLength(0);
  });
  it('previews once, requires confirmation, applies all actions atomically and undoes alias plus ledger', async () => {
    const id = candidate();
    const rule = await call('POST', '/assignment-rules', input);
    expect(rule.status).toBe(201);
    expect((await call('POST', '/assignment-rules/preview', input)).body.count).toBe(1);
    const review = await call('GET', '/assignment-rules/candidates/' + id);
    expect(review.body.cleanup.cleaned).toBe('Shop A');
    expect(review.body.suggestions[0].id).toBe(rule.body.id);
    expect(opened.db.select().from(schema.booking).all()).toHaveLength(0);
    const confirmed = await call('POST', '/bank-sync/candidates/' + id + '/confirm', {
      categoryId: null,
      ruleId: rule.body.id,
      revision: rule.body.revision,
    });
    expect(confirmed.status).toBe(200);
    const booked = getBooking(opened.db, confirmed.body.bookingId)!;
    expect([
      booked.amountCents,
      booked.payeeId,
      booked.memo,
      booked.flag,
      booked.bankRawText,
      booked.splits[0]?.categoryId,
    ]).toEqual([-1201, 'p1', 'Prüfnotiz', 'blue', 'SEPA-Lastschrift Shop A Ref: SYN-42', 'essen']);
    expect((await call('POST', '/assignment-rules/preview', input)).body.count).toBe(1);
    expect(
      (await call('POST', '/bank-sync/candidates/' + id + '/confirm', { categoryId: null })).status,
    ).toBe(409);
    expect(
      (await call('GET', '/assignment-rules/bookings/' + booked.id + '/learn')).body.draft
        .automatic,
    ).toBe(false);
    expect(opened.db.select().from(schema.bankPayeeAlias).all()).toHaveLength(1);
    const undone = undo(opened.db, { groupId: confirmed.body.groupId }, { actor: 'owner' });
    expect(getBooking(opened.db, booked.id)).toBeUndefined();
    expect((await call('GET', '/assignment-rules/candidates/' + id)).body.cleanup.learned).toBe(
      false,
    );
    undo(opened.db, { groupId: undone.groupId }, { actor: 'owner' });
    expect(getBooking(opened.db, booked.id)?.splits[0]?.categoryId).toBe('essen');
  });
  it('orders/enables/removes with undo and applies splits with literal cent expectations', async () => {
    const one = await call('POST', '/assignment-rules', input);
    const twoInput = {
      ...input,
      name: 'Split',
      actions: {
        splits: [
          { categoryId: 'essen', weightBp: 5000 },
          { categoryId: 'reise', weightBp: 5000 },
        ],
      },
    };
    const two = await call('POST', '/assignment-rules', twoInput);
    const moved = await call('PUT', '/assignment-rules/order', { ids: [two.body.id, one.body.id] });
    expect(listAssignmentRules(opened.db).map((r) => r.name)).toEqual(['Split', 'Shop zuordnen']);
    expect(
      (await call('PUT', '/assignment-rules/order', { ids: [two.body.id, two.body.id] })).status,
    ).toBe(409);
    const id = candidate();
    const confirmed = await call('POST', '/bank-sync/candidates/' + id + '/confirm', {
      categoryId: null,
      ruleId: two.body.id,
      revision: two.body.revision,
    });
    expect(confirmed.status).toBe(200);
    expect(
      getBooking(opened.db, confirmed.body.bookingId)?.splits.map((s) => s.amountCents),
    ).toEqual([-601, -600]);
    undo(opened.db, { groupId: moved.body.groupId }, { actor: 'owner' });
    const disabled = await call('PUT', '/assignment-rules/' + one.body.id, {
      ...input,
      enabled: false,
    });
    expect(disabled.status).toBe(200);
    const removed = await call('DELETE', '/assignment-rules/' + two.body.id);
    expect(listAssignmentRules(opened.db)).toHaveLength(2);
    expect(
      listAssignmentRules(opened.db).find((r) => r.id.startsWith('inbox-learn:'))?.actions.splits,
    ).toEqual([
      { categoryId: 'essen', weightBp: 5004 },
      { categoryId: 'reise', weightBp: 4996 },
    ]);
    undo(opened.db, { groupId: removed.body.groupId }, { actor: 'owner' });
    expect(listAssignmentRules(opened.db)).toHaveLength(3);
  });
  it('learns corrections from bank rows without changing raw text; failed correction rolls back', async () => {
    const id = createBooking(
      opened.db,
      {
        accountId: 'giro',
        date: today,
        amountCents: -1201,
        memo: 'Original Shop A',
        source: 'bank',
        status: 'pending',
        splits: [{ amountCents: -1201 }],
      },
      { actor: 'test' },
    );
    const corrected = await call('PATCH', '/bookings/' + id, {
      payeeId: 'p1',
      memo: 'Neue Notiz',
      splits: [{ amountCents: -1201, categoryId: 'essen' }],
    });
    expect(corrected.status).toBe(200);
    expect(opened.db.select().from(schema.bankPayeeAlias).all()[0]?.rawKey).toBe('original shop a');
    const next = candidate('Original Shop A');
    expect((await call('GET', '/assignment-rules/candidates/' + next)).body.cleanup.payeeId).toBe(
      'p1',
    );
    expect((await call('PATCH', '/bookings/' + id, { payeeId: 'missing' })).status).toBe(422);
    undo(opened.db, { groupId: corrected.body.groupId }, { actor: 'owner' });
    expect(
      (await call('GET', '/assignment-rules/candidates/' + next)).body.cleanup.payeeId,
    ).toBeNull();
    expect(getBooking(opened.db, id)?.memo).toBe('Original Shop A');
  });
  it('applies suggestions only to eligible bank rows, preserves rollback and supports transfer undo', async () => {
    const id = createBooking(
      opened.db,
      {
        accountId: 'giro',
        date: today,
        amountCents: -1201,
        source: 'bank',
        status: 'pending',
        memo: 'Shop A',
        splits: [{ amountCents: -1201 }],
      },
      { actor: 'test' },
    );
    const rule = await call('POST', '/assignment-rules', {
      ...input,
      actions: { transferAccountId: 'spar' },
    });
    const applied = await call('POST', '/assignment-rules/bookings/' + id + '/apply', {
      ruleId: rule.body.id,
      revision: rule.body.revision,
    });
    expect(applied.status).toBe(200);
    const rows = opened.db.select().from(schema.booking).all();
    expect(rows.map((r) => r.amountCents).sort((a, b) => a - b)).toEqual([-1201, 1201]);
    expect(rows.every((r) => r.transferId === getBooking(opened.db, id)?.transferId)).toBe(true);
    undo(opened.db, { groupId: applied.body.groupId }, { actor: 'owner' });
    expect(getBooking(opened.db, id)?.transferId).toBeNull();
    const changed = await call('PUT', '/assignment-rules/' + rule.body.id, {
      ...input,
      actions: { transferAccountId: 'usd' },
    });
    expect(changed.status).toBe(200);
    expect(
      (
        await call('POST', '/assignment-rules/bookings/' + id + '/apply', {
          ruleId: rule.body.id,
          revision: rule.body.revision,
        })
      ).status,
    ).toBe(409);
    expect(getBooking(opened.db, id)?.splits[0]?.categoryId).toBeNull();
    opened.db
      .update(schema.booking)
      .set({ status: 'reconciled' })
      .where(eq(schema.booking.id, id))
      .run();
    expect((await call('GET', '/assignment-rules/bookings/' + id)).status).toBe(409);
  });
});
