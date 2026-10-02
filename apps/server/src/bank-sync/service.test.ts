import { createHash, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bookedBalance,
  createTestDatabase,
  readInbox,
  resolveInboxItem,
  schema,
  undo,
  type OpenedDatabase,
} from '@budget/db';
import { seedBasics } from '../../../../packages/db/src/repos/test-helpers';
import { BankError, type BankProvider } from './provider';
import { BankSync } from './service';
import { bankSecretBox } from './secrets';

let opened: OpenedDatabase;
let service: BankSync;
let provider: BankProvider;
let now: Date;
const consentId = randomUUID();
const linkId = randomUUID();
const box = bankSecretBox('cd'.repeat(32));
const row = {
  reference: 'entry-a',
  date: '2026-09-30',
  amountCents: -1201,
  currency: 'EUR',
  memo: 'Shop A',
};
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
  now = new Date('2026-10-01T03:00:00Z');
  provider = {
    institutions: vi.fn(async () => [
      { name: 'Bank A', country: 'AT', maximumConsentSeconds: 15552000 },
    ]),
    authorize: vi.fn(async () => 'https://auth.enablebanking.com/ais/start'),
    session: vi.fn(async () => ({
      id: 'synthetic-session',
      validUntil: '2026-10-15T03:00:00.000Z',
      accounts: [{ uid: 'synthetic-uid', label: 'Konto A', currency: 'EUR' }],
    })),
    transactions: vi.fn(async () => [row]),
    balance: vi.fn(async () => ({ amountCents: 98799, currency: 'EUR', date: '2026-09-30' })),
  };
  service = new BankSync(opened.db, provider, box, 'https://budget.example', () => now);
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
});
afterEach(() => opened.close());
const candidates = () => opened.db.select().from(schema.bankSyncCandidate).all();
const connection = () =>
  opened.db
    .select()
    .from(schema.bankSyncConsent)
    .where(eq(schema.bankSyncConsent.id, consentId))
    .get()!;
const nextDay = () => {
  now = new Date(now.getTime() + 86400000);
};

describe('bank sync workflow', () => {
  it('catches up, stages only, warns on expiry and literal balance difference, dedupes repeated runs', async () => {
    await service.tick();
    expect(provider.transactions).toHaveBeenCalledWith('synthetic-uid', '2026-09-01', '2026-10-01');
    expect(candidates()).toHaveLength(1);
    expect(bookedBalance(opened.db, 'giro', '2026-10-01')).toBe(100000);
    const inbox = readInbox(opened.db, '2026-10-01').entries;
    expect(inbox.filter((i) => i.kind === 'consent')).toHaveLength(1);
    expect(inbox.filter((i) => i.kind === 'reconciliation')).toMatchObject([
      { detail: expect.stringContaining('12,01') },
    ]);
    expect(connection()).toMatchObject({
      lastSuccessAt: now.toISOString(),
      nextRunAt: '2026-10-02T02:30:00.000Z',
      failures: 0,
      leaseUntil: null,
    });
    await service.tick();
    expect(provider.transactions).toHaveBeenCalledTimes(1);
    nextDay();
    await service.tick();
    expect(candidates()).toHaveLength(1);
    expect(opened.db.select().from(schema.booking).all()).toHaveLength(0);
    expect(JSON.stringify(service.status())).not.toMatch(
      /synthetic-uid|synthetic-session|synthetic-hash|initiator|secret/,
    );
  });
  it('confirms through ledger validation and undoes the booking and inbox decision together', async () => {
    await service.tick();
    const id = candidates()[0]!.id;
    const result = service.confirm(id, 'essen');
    expect(bookedBalance(opened.db, 'giro', '2026-10-01')).toBe(98799);
    expect(() => service.confirm(id, 'essen')).toThrow();
    const undone = undo(opened.db, { groupId: result.groupId }, { actor: 'owner' });
    expect(bookedBalance(opened.db, 'giro', '2026-10-01')).toBe(100000);
    expect(readInbox(opened.db, '2026-10-01').entries.some((i) => i.id === id)).toBe(true);
    undo(opened.db, { groupId: undone.groupId }, { actor: 'owner' });
    expect(bookedBalance(opened.db, 'giro', '2026-10-01')).toBe(98799);
    undo(opened.db, { groupId: result.groupId }, { actor: 'owner' });
    service.confirm(id, 'essen');
    expect(opened.db.select().from(schema.booking).all()).toHaveLength(1);
  });
  it('rolls back invalid confirmation and preserves a rejected item across repeated sync', async () => {
    await service.tick();
    const id = candidates()[0]!.id;
    expect(() => service.confirm(id, 'missing-category')).toThrow();
    expect(opened.db.select().from(schema.booking).all()).toHaveLength(0);
    expect(
      opened.db.select().from(schema.inboxItem).where(eq(schema.inboxItem.id, id)).get()!
        .resolvedAt,
    ).toBeNull();
    resolveInboxItem(opened.db, id, { actor: 'owner' });
    nextDay();
    await service.tick();
    expect(candidates()).toHaveLength(1);
    expect(readInbox(opened.db, '2026-10-02').entries.some((i) => i.id === id)).toBe(false);
  });
  it('keeps identical purchases without ids, deduping the next complete window', async () => {
    vi.mocked(provider.transactions).mockResolvedValue([
      { ...row, reference: null },
      { ...row, reference: null },
    ]);
    await service.tick();
    expect(candidates()).toHaveLength(2);
    nextDay();
    await service.tick();
    expect(candidates()).toHaveLength(2);
  });
  it('does not publish partial pages or advance success on failure; obeys retry-after and manual throttle', async () => {
    vi.mocked(provider.transactions).mockRejectedValue(new BankError('rate_limited', 3600));
    await service.tick();
    expect(candidates()).toHaveLength(0);
    expect(connection()).toMatchObject({
      failures: 1,
      lastSuccessAt: null,
      nextRunAt: '2026-10-01T04:00:00.000Z',
      leaseUntil: null,
    });
    expect(() => service.requestRun(consentId)).toThrow();
    now = new Date('2026-10-01T03:59:59Z');
    await service.tick();
    expect(provider.transactions).toHaveBeenCalledTimes(1);
    now = new Date('2026-10-01T04:00:00Z');
    vi.mocked(provider.transactions).mockResolvedValue([row]);
    await service.tick();
    expect(candidates()).toHaveLength(1);
    expect(connection().failures).toBe(0);
  });
  it('single claim excludes concurrent workers and expired/paused consents', async () => {
    let release!: (rows: (typeof row)[]) => void;
    vi.mocked(provider.transactions).mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const first = service.tick();
    expect(connection().nextRunAt).toBe('2026-10-01T03:15:00.000Z');
    await service.tick();
    expect(provider.transactions).toHaveBeenCalledTimes(1);
    release([row]);
    await first;
    now = new Date('2026-10-16T03:00:00Z');
    await service.tick();
    expect(provider.transactions).toHaveBeenCalledTimes(1);
    service.pause(consentId);
    expect(() => service.requestRun(consentId)).toThrow();
  });
  it('requires owner-picked EUR mapping and locks mapping once data was fetched', async () => {
    expect(() => service.map(linkId, 'usd', '2026-09-01')).toThrow();
    expect(() => service.map(linkId, 'giro', '2020-01-01')).toThrow();
    expect(() => service.map(linkId, 'giro', '2026-10-02')).toThrow();
    service.map(linkId, 'giro', '2026-09-01');
    await service.tick();
    expect(() => service.map(linkId, 'spar', '2026-09-01')).toThrow();
  });
  it('binds a one-use state to the initiating session and encrypts account/session ids', async () => {
    await service.start('Bank A', 'AT', 'initiator-a');
    const state = vi.mocked(provider.authorize).mock.calls[0]![1];
    await expect(service.callback('synthetic-code', state, 'initiator-b')).rejects.toThrow();
    const result = await service.callback('synthetic-code', state, 'initiator-a');
    await expect(service.callback('synthetic-code', state, 'initiator-a')).rejects.toThrow();
    expect(provider.session).toHaveBeenCalledTimes(1);
    const saved = opened.db
      .select()
      .from(schema.bankSyncConsent)
      .where(eq(schema.bankSyncConsent.id, result.id))
      .get()!;
    expect(saved.stateHash).toBe(createHash('sha256').update(state).digest('hex'));
    expect(box.open(saved.secret!, result.id)).toBe('synthetic-session');
    expect(
      opened.db
        .select()
        .from(schema.bankSyncAccount)
        .where(eq(schema.bankSyncAccount.consentId, result.id))
        .get()!.accountId,
    ).toBeNull();
    const audits = JSON.stringify(opened.db.select().from(schema.auditLog).all());
    expect(audits).not.toContain('synthetic-session');
    expect(audits).not.toContain('synthetic-code');
    expect(audits).not.toContain(state);
  });
  it('cannot restore consumed consent protocol state even with forced undo', async () => {
    await service.start('Bank A', 'AT', 'initiator-a');
    const log = opened.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.entityType, 'bank_sync_consent'))
      .get()!;
    expect(() =>
      undo(opened.db, { groupId: log.groupId! }, { actor: 'owner' }, { force: true }),
    ).toThrow(/protocol/);
  });
  it('turns foreign-currency and unavailable booked balances into errors without staged rows', async () => {
    vi.mocked(provider.balance).mockResolvedValue({
      amountCents: 20,
      currency: 'USD',
      date: '2026-09-30',
    });
    await service.tick();
    expect(candidates()).toHaveLength(0);
    expect(connection().lastSuccessAt).toBeNull();
  });
  it('undoes a mapping before fetching but blocks forced remapping afterwards', async () => {
    const result = service.map(linkId, 'spar', '2026-09-01');
    undo(opened.db, { groupId: result.groupId }, { actor: 'owner' });
    expect(
      opened.db
        .select()
        .from(schema.bankSyncAccount)
        .where(eq(schema.bankSyncAccount.id, linkId))
        .get()!.accountId,
    ).toBe('giro');
    const second = service.map(linkId, 'spar', '2026-09-01');
    await service.tick();
    expect(() =>
      undo(opened.db, { groupId: second.groupId }, { actor: 'owner' }, { force: true }),
    ).toThrow();
  });
  it('rolls back the entire account stage when its audit fails', async () => {
    opened.sqlite.exec(
      "CREATE TRIGGER reject_bank_audit BEFORE INSERT ON audit_log WHEN NEW.entity_type = 'bank_sync_candidate' BEGIN SELECT RAISE(ABORT, 'synthetic audit failure'); END",
    );
    await service.tick();
    expect(candidates()).toHaveLength(0);
    expect(
      opened.db
        .select()
        .from(schema.inboxItem)
        .all()
        .filter((i) => i.refType === 'bank-sync-candidate'),
    ).toHaveLength(0);
    expect(connection().lastSuccessAt).toBeNull();
    expect(connection().failures).toBe(1);
  });
  it('reports changed known references without overwriting accepted history or keeping partial additions', async () => {
    await service.tick();
    nextDay();
    vi.mocked(provider.transactions).mockResolvedValue([
      { ...row, reference: 'new-entry' },
      { ...row, amountCents: -1202 },
    ]);
    await service.tick();
    expect(candidates()).toHaveLength(1);
    expect(candidates()[0]!.amountCents).toBe(-1201);
    expect(connection().failures).toBe(1);
  });
  it('refuses undo that would give one app account two active sources', () => {
    const result = service.map(linkId, 'spar', '2026-09-01');
    const secondId = randomUUID();
    opened.db
      .insert(schema.bankSyncAccount)
      .values({
        id: secondId,
        consentId,
        secret: box.seal('synthetic-uid-b', secondId),
        label: 'Konto B',
        currency: 'EUR',
        accountId: 'giro',
        fromDate: '2026-09-01',
      })
      .run();
    expect(() =>
      undo(opened.db, { groupId: result.groupId }, { actor: 'owner' }, { force: true }),
    ).toThrow(/active/);
    expect(
      opened.db
        .select()
        .from(schema.bankSyncAccount)
        .where(eq(schema.bankSyncAccount.id, linkId))
        .get()!.accountId,
    ).toBe('spar');
  });
});
