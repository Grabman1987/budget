import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addReceipt,
  bookedBalance,
  createEntity,
  createTestDatabase,
  listReceipts,
  readAssignmentCandidate,
  readInbox,
  saveAssignmentRule,
  schema,
  undo,
  type OpenedDatabase,
} from '@budget/db';
import { seedBasics } from '../../../../packages/db/src/repos/test-helpers';
import type { BankBatch, BankProvider } from './provider';
import { BankSync } from './service';
import { bankSecretBox } from './secrets';
import { bankConfirmSchema } from '../api/assignment-rules';

// #1048: optional "Alle Felder" values on the bank confirmation. Synthetic data only.
let opened: OpenedDatabase;
let service: BankSync;
const consentId = randomUUID();
const linkId = randomUUID();
const box = bankSecretBox('ab'.repeat(32));
const batch = (rows: BankBatch['rows']): BankBatch => ({
  rows,
  skippedInvalid: 0,
  skippedOutOfWindow: 0,
});

beforeEach(async () => {
  opened = createTestDatabase();
  seedBasics(opened.db);
  const provider: BankProvider = {
    institutions: vi.fn(async () => []),
    authorize: vi.fn(async () => 'https://auth.example/start'),
    session: vi.fn(async () => ({ id: 's', validUntil: '2026-10-15T03:00:00.000Z', accounts: [] })),
    transactions: vi.fn(async () =>
      batch([
        {
          reference: 'entry-a',
          date: '2026-09-30',
          amountCents: -1201,
          currency: 'EUR',
          memo: 'Shop A',
        },
      ]),
    ),
    balance: vi.fn(async () => ({ amountCents: 98799, currency: 'EUR', date: '2026-09-30' })),
  };
  service = new BankSync(
    opened.db,
    provider,
    box,
    'https://budget.example',
    () => new Date('2026-10-01T03:00:00Z'),
  );
  opened.db
    .insert(schema.bankSyncConsent)
    .values({
      id: consentId,
      initiator: 'owner-session',
      stateHash: 'synthetic-hash',
      expiresAt: '2026-10-01T03:30:00.000Z',
      label: 'Bank A',
      secret: box.seal('synthetic-session', consentId),
      validUntil: '2026-10-15T03:00:00.000Z',
      status: 'active',
      nextRunAt: '2026-09-20T02:30:00.000Z',
    })
    .run();
  opened.db
    .insert(schema.bankSyncAccount)
    .values({
      id: linkId,
      consentId,
      secret: box.seal('synthetic-uid', linkId),
      label: 'Konto A',
      currency: 'EUR',
      accountId: 'giro',
      fromDate: '2026-09-01',
    })
    .run();
  // Confirmation-first staging keeps the row a candidate until the owner confirms it.
  service.setPolicy(consentId, false);
  createEntity(opened.db, schema.project, { id: 'proj', name: 'Projekt A' }, { actor: 'owner' });
  await service.tick();
});
afterEach(() => opened.close());

const candidateId = () => opened.db.select().from(schema.bankSyncCandidate).all()[0]!.id;
const live = () =>
  opened.db
    .select()
    .from(schema.booking)
    .all()
    .filter((b) => !b.deletedAt);
const splitsOf = (bookingId: string) =>
  opened.db
    .select()
    .from(schema.bookingSplit)
    .where(eq(schema.bookingSplit.bookingId, bookingId))
    .all()
    .map((s) => [s.categoryId, s.amountCents])
    .sort();
const open = () =>
  readInbox(opened.db, '2026-10-01').entries.some(
    (i) => i.type === 'stored' && i.id === candidateId(),
  );

describe('bank confirmation with all fields (#1048)', () => {
  it('writes note, project, cent-exact splits and receipt in one undoable group', () => {
    const receipt = addReceipt(
      opened.db,
      { sha256: 'f'.repeat(64), mime: 'image/png', sizeBytes: 10, originalFilename: 'beleg.png' },
      undefined,
      { actor: 'owner' },
    ).receipt;
    const id = candidateId();
    const result = service.confirm(id, null, {
      actions: { payeeId: null },
      memo: 'Synthetische Notiz',
      projectId: 'proj',
      splits: [
        { categoryId: 'essen', amountCents: -1000 },
        { categoryId: 'reise', amountCents: -201, memo: 'Rest' },
      ],
      receiptIds: [receipt.id],
    });
    const [row] = live();
    expect(row).toMatchObject({
      id: result.bookingId,
      memo: 'Synthetische Notiz',
      projectId: 'proj',
      amountCents: -1201,
      date: '2026-09-30',
      status: 'confirmed',
    });
    expect(splitsOf(result.bookingId)).toEqual([
      ['essen', -1000],
      ['reise', -201],
    ]);
    expect(listReceipts(opened.db, result.bookingId).map((r) => r.id)).toEqual([receipt.id]);
    expect(open()).toBe(false);
    expect(bookedBalance(opened.db, 'giro', '2026-10-01')).toBe(98799);

    undo(opened.db, { groupId: result.groupId }, { actor: 'owner' });
    expect(live()).toHaveLength(0);
    expect(open()).toBe(true);
    expect(listReceipts(opened.db).map((r) => r.id)).toContain(receipt.id);
    expect(bookedBalance(opened.db, 'giro', '2026-10-01')).toBe(100000);
  });

  it('refuses split lines that do not add up to the bank amount and writes nothing', () => {
    expect(() =>
      service.confirm(candidateId(), null, {
        actions: { payeeId: null },
        splits: [
          { categoryId: 'essen', amountCents: -1000 },
          { categoryId: 'reise', amountCents: -200 },
        ],
      }),
    ).toThrow('Die Aufteilung ergibt nicht den Bankbetrag.');
    expect(live()).toHaveLength(0);
    expect(open()).toBe(true);
  });

  it('keeps the previous behavior when no optional field is sent', () => {
    const result = service.confirm(candidateId(), 'essen');
    expect(live()[0]).toMatchObject({ memo: 'Shop A', projectId: null });
    expect(splitsOf(result.bookingId)).toEqual([['essen', -1201]]);
  });

  it('lets an explicit note replace the bank text on the manual path', () => {
    const result = service.confirm(candidateId(), 'essen', { memo: 'Eigene Notiz' });
    expect(live()[0]).toMatchObject({ memo: 'Eigene Notiz' });
    expect(splitsOf(result.bookingId)).toEqual([['essen', -1201]]);
  });

  it('keeps rule splits on the rule path, with the explicit note and project on top', () => {
    saveAssignmentRule(
      opened.db,
      null,
      {
        name: 'Shop-Regel',
        match: { mode: 'all', conditions: [{ type: 'contains', text: 'Shop' }] },
        actions: {
          memo: 'Regelnotiz',
          splits: [
            { categoryId: 'essen', weightBp: 5000 },
            { categoryId: 'reise', weightBp: 5000 },
          ],
        },
        enabled: true,
        automatic: false,
      },
      { actor: 'owner' },
    );
    const id = candidateId();
    const rule = readAssignmentCandidate(opened.db, id).suggestions.find(
      (r) => r.name === 'Shop-Regel',
    )!;
    const result = service.confirm(id, null, {
      ruleId: rule.id,
      revision: rule.revision,
      memo: 'Eigene Notiz',
      projectId: 'proj',
    });
    expect(live()[0]).toMatchObject({ memo: 'Eigene Notiz', projectId: 'proj' });
    // The rule's largest-remainder template stays the source of the lines (precedence #1048).
    expect(splitsOf(result.bookingId)).toEqual([
      ['essen', -601],
      ['reise', -600],
    ]);
  });
});

describe('bank confirm request schema (#1048)', () => {
  const lines = [
    { categoryId: 'essen', amountCents: -1000 },
    { categoryId: null, amountCents: -201 },
  ];
  it('accepts manual split lines only without a rule or single category', () => {
    expect(bankConfirmSchema.safeParse({ categoryId: null, splits: lines }).success).toBe(true);
    expect(
      bankConfirmSchema.safeParse({
        categoryId: null,
        ruleId: 'r',
        revision: 'a'.repeat(64),
        splits: lines,
      }).success,
    ).toBe(false);
    expect(bankConfirmSchema.safeParse({ categoryId: 'essen', splits: lines }).success).toBe(false);
    expect(
      bankConfirmSchema.safeParse({
        categoryId: null,
        actions: {
          splits: [
            { categoryId: 'essen', weightBp: 5000 },
            { categoryId: 'reise', weightBp: 5000 },
          ],
        },
        splits: lines,
      }).success,
    ).toBe(false);
  });
  it('allows note and project together with a rule', () => {
    expect(
      bankConfirmSchema.safeParse({
        categoryId: null,
        ruleId: 'r',
        revision: 'a'.repeat(64),
        memo: 'Notiz',
        projectId: 'proj',
      }).success,
    ).toBe(true);
  });
});
