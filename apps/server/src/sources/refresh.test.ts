import {
  resolveInboxItem,
  createTestDatabase,
  createEntity,
  schema,
  readSourceState,
  readSourceMappings,
  mapReadSource,
  readSourceSince,
  setReadSourceSince,
  readInbox,
  stageSourcePage,
  saveReadSourceState,
  updateEntity,
  undo,
  holdWrites,
  releaseWrites,
  sqliteOf,
  type OpenedDatabase,
} from '@budget/db';
import type { ReadSource, SourceBalance, SourceOperation } from '@budget/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SourceReadError } from './errors';
import { refreshReadSource, refreshReadSourceIfDue } from './refresh';
let opened: OpenedDatabase;
const at = new Date('2026-10-02T12:00:00.000Z');
const ctx = { actor: 'test' };
const balance: SourceBalance = {
  key: 'currency:eur',
  currency: 'EUR',
  amount: { value: '12.34', assetId: null, currencyId: 'eur', cents: 1234 },
};
const asset: SourceBalance = {
  key: 'asset:coin',
  currency: null,
  amount: { value: '0.00000003', assetId: 'coin', currencyId: null, cents: null },
};
const operation: SourceOperation = {
  id: 'op-a',
  type: 'deposit',
  transactions: [
    {
      id: 'tx-a',
      walletId: 'wallet-a',
      flow: 'INCOMING',
      creditedAt: at.toISOString(),
      type: 'deposit',
      amount: balance.amount,
      fee: null,
      balanceAfter: null,
      tradeId: null,
      tradeFee: null,
      compensates: null,
    },
  ],
};
function source(balances = [balance, asset]) {
  return {
    configured: () => true,
    balances: vi.fn<ReadSource['balances']>().mockResolvedValue(balances),
    operations: vi
      .fn<ReadSource['operations']>()
      .mockResolvedValue({ operations: [operation], nextCursor: null }),
  };
}
const inbox = () => opened.db.select().from(schema.inboxItem).all();
beforeEach(() => {
  opened = createTestDatabase();
  createEntity(
    opened.db,
    schema.account,
    {
      id: 'cash',
      name: 'Source cash',
      type: 'checking',
      role: 'investment',
      onBudget: false,
      openingDate: '2026-01-01',
      openingBalanceCents: 1234,
    },
    ctx,
  );
  createEntity(
    opened.db,
    schema.account,
    {
      id: 'depot',
      name: 'Source depot',
      type: 'crypto',
      role: 'investment',
      onBudget: false,
      openingDate: '2026-01-01',
    },
    ctx,
  );
  createEntity(
    opened.db,
    schema.security,
    { id: 'coin', name: 'Synthetic coin', kind: 'crypto' },
    ctx,
  );
  createEntity(
    opened.db,
    schema.holding,
    { id: 'snapshot', accountId: 'depot', securityId: 'coin', asOf: '2026-01-01', unitsE8: 3 },
    ctx,
  );
});
afterEach(() => opened.close());
describe('source sync persistence and financial isolation', () => {
  it('keeps mixed trade legs with an unlinked cash fee in investment review', async () => {
    const adapter = source();
    adapter.operations.mockResolvedValue({
      nextCursor: null,
      operations: [
        {
          ...operation,
          type: 'trade',
          transactions: [
            operation.transactions[0]!,
            {
              ...operation.transactions[0]!,
              id: 'tx-trade',
              amount: asset.amount,
              tradeId: 'trade-synthetic',
            },
          ],
        },
      ],
    });
    await refreshReadSource(opened.db, adapter, at);
    expect(inbox().find((i) => i.kind === 'import')?.title).toBe('Quellbewegung: Anlage prüfen');
  });

  it('stages once by provider id, preserves acknowledgement and never writes ledger rows', async () => {
    const adapter = source();
    await refreshReadSource(opened.db, adapter, at);
    resolveInboxItem(opened.db, inbox().find((i) => i.kind === 'import')!.id, ctx);
    await refreshReadSource(opened.db, adapter, at);
    expect(inbox().find((i) => i.kind === 'import')?.resolvedAt).toBeTruthy();
    expect(inbox().filter((i) => i.kind === 'import')).toHaveLength(1);
    expect(opened.db.select().from(schema.booking).all()).toHaveLength(0);
    expect(opened.db.select().from(schema.trade).all()).toHaveLength(0);
    expect(opened.db.select().from(schema.holding).all()).toHaveLength(1);
    expect(readSourceState(opened.db).lastSuccess).toBe(at.toISOString());
    expect(adapter.operations.mock.calls[1]?.[0].from).toBe('2026-09-25T12:00:00.000Z');
  });
  it('compares native cash and held units without quotes; warnings resolve and recur', async () => {
    const adapter = source();
    await refreshReadSource(opened.db, adapter, at);
    expect(inbox().filter((i) => i.kind === 'reconciliation' && !i.resolvedAt)).toHaveLength(2);
    const mapping = mapReadSource(
      opened.db,
      { key: balance.key, accountId: 'cash', securityId: null },
      ctx,
    );
    mapReadSource(opened.db, { key: asset.key, accountId: 'depot', securityId: 'coin' }, ctx);
    await refreshReadSource(opened.db, adapter, at);
    expect(inbox().filter((i) => i.kind === 'reconciliation' && !i.resolvedAt)).toHaveLength(0);
    adapter.balances.mockResolvedValue([
      { ...balance, amount: { ...balance.amount, value: '12.35', cents: 1235 } },
      asset,
    ]);
    await refreshReadSource(opened.db, adapter, at);
    const warning = inbox().find((i) => i.kind === 'reconciliation' && !i.resolvedAt)!;
    expect(JSON.parse(warning.detail!)).toMatchObject({
      source: '12.35',
      local: 1234,
      reason: 'difference',
    });
    expect(mapping.groupId).toBeTruthy();
  });
  it('reopens a corrected acknowledged operation without duplicating or booking it', async () => {
    const adapter = source();
    await refreshReadSource(opened.db, adapter, at);
    const original = inbox().find((i) => i.kind === 'import')!;
    resolveInboxItem(opened.db, original.id, ctx);
    adapter.operations.mockResolvedValue({
      nextCursor: null,
      operations: [
        {
          ...operation,
          transactions: [
            {
              ...operation.transactions[0]!,
              amount: { ...balance.amount, value: '12.35', cents: 1235 },
            },
          ],
        },
      ],
    });
    await refreshReadSource(opened.db, adapter, at);
    const corrected = inbox().filter((i) => i.kind === 'import');
    expect(corrected).toHaveLength(1);
    expect(corrected[0]).toMatchObject({ id: original.id, resolvedAt: null, resolution: null });
    expect(JSON.parse(corrected[0]!.detail!).transactions[0].amount.cents).toBe(1235);
    expect(opened.db.select().from(schema.booking).all()).toHaveLength(0);
    expect(opened.db.select().from(schema.trade).all()).toHaveLength(0);
  });
  it('rejects foreign currency and on-budget mappings, and supports audited undo/redo', async () => {
    await refreshReadSource(opened.db, source(), at);
    const result = mapReadSource(
      opened.db,
      { key: balance.key, accountId: 'cash', securityId: null },
      ctx,
    );
    const undone = undo(opened.db, { groupId: result.groupId }, ctx);
    expect(readSourceMappings(opened.db)).toEqual([]);
    undo(opened.db, { groupId: undone.groupId }, ctx);
    expect(readSourceMappings(opened.db)[0]?.accountId).toBe('cash');
    createEntity(
      opened.db,
      schema.account,
      {
        id: 'budget',
        name: 'Budget',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        openingDate: '2026-01-01',
      },
      ctx,
    );
    expect(() =>
      mapReadSource(opened.db, { key: balance.key, accountId: 'budget', securityId: null }, ctx),
    ).toThrow();
    expect(() =>
      mapReadSource(opened.db, { key: asset.key, accountId: 'cash', securityId: 'coin' }, ctx),
    ).toThrow();
    createEntity(
      opened.db,
      schema.account,
      {
        id: 'foreign-cash',
        name: 'Synthetic foreign cash',
        type: 'checking',
        role: 'investment',
        onBudget: false,
        currency: 'USD',
        openingDate: '2026-01-01',
      },
      ctx,
    );
    expect(() =>
      mapReadSource(
        opened.db,
        {
          key: balance.key,
          accountId: 'foreign-cash',
          securityId: null,
        },
        ctx,
      ),
    ).toThrow('Die Kontowährung muss zur Quelle passen.');
    expect(readSourceMappings(opened.db)[0]?.accountId).toBe('cash');
  });
  it('retains failed operation pages but advances the operations watermark on balance failure', async () => {
    const adapter = source();
    adapter.operations
      .mockResolvedValueOnce({ operations: [operation], nextCursor: 'next' })
      .mockRejectedValueOnce(new Error('synthetic-private-body'));
    await refreshReadSource(opened.db, adapter, at);
    await expect(refreshReadSource(opened.db, adapter, at)).rejects.toThrow();
    expect(readSourceState(opened.db)).toMatchObject({
      lastSuccess: null,
      window: { cursor: 'next' },
    });
    adapter.operations.mockResolvedValue({ operations: [operation], nextCursor: null });
    adapter.balances.mockRejectedValue(new SourceReadError('schema'));
    await expect(refreshReadSource(opened.db, adapter, at)).rejects.toThrow();
    expect(readSourceState(opened.db)).toMatchObject({
      lastSuccess: at.toISOString(),
      window: null,
      status: 'failed',
    });
    expect(JSON.parse(inbox().find((i) => i.kind === 'other')!.detail!)).toEqual({
      category: 'schema',
    });
    const later = new Date(at.getTime() + 31 * 60_000);
    adapter.operations.mockResolvedValue({
      operations: [{ ...operation, id: 'op-next-window' }],
      nextCursor: null,
    });
    await refreshReadSourceIfDue(opened.db, adapter, later);
    expect(adapter.operations).toHaveBeenCalledTimes(4);
    expect(inbox().filter((i) => i.kind === 'import')).toHaveLength(2);
    expect(readSourceState(opened.db).lastSuccess).toBe(later.toISOString());
    expect(JSON.stringify(inbox())).not.toContain('synthetic-private-body');
    adapter.balances.mockResolvedValue([balance]);
    await refreshReadSource(opened.db, adapter, later);
    expect(inbox().find((i) => i.kind === 'other')?.resolvedAt).toBeTruthy();
  });
  it('acknowledge then map then replay retains the decision and refreshes display, including legacy details', async () => {
    const adapter = source();
    await refreshReadSource(opened.db, adapter, at);
    const original = inbox().find((i) => i.kind === 'import')!;
    // Previously persisted records embedded a mapping snapshot.
    updateEntity(
      opened.db,
      schema.inboxItem,
      original.id,
      { detail: JSON.stringify({ ...operation, mappings: [] }) },
      ctx,
    );
    resolveInboxItem(opened.db, original.id, ctx);
    const acknowledged = inbox().find((i) => i.id === original.id)!;
    const mapping = { key: balance.key, accountId: 'cash', securityId: null };
    mapReadSource(opened.db, mapping, ctx);
    await refreshReadSource(opened.db, adapter, at, true);
    expect(inbox().find((i) => i.id === original.id)).toMatchObject({
      resolvedAt: acknowledged.resolvedAt,
      resolution: acknowledged.resolution,
    });
    // A live second operation shows today's mapping without another replay.
    adapter.operations.mockResolvedValue({
      operations: [{ ...operation, id: 'op-b' }],
      nextCursor: null,
    });
    await refreshReadSource(opened.db, adapter, at);
    const mapped = readInbox(opened.db, '2026-10-02').entries.find((i) => i.kind === 'import')!;
    expect(mapped.type === 'stored' && JSON.parse(mapped.detail!).mappings).toEqual([mapping]);
    const changed = mapReadSource(opened.db, { ...mapping, accountId: 'depot' }, ctx);
    const display = () => {
      const entry = readInbox(opened.db, '2026-10-02').entries.find((i) => i.kind === 'import')!;
      return entry.type === 'stored' && JSON.parse(entry.detail!).mappings;
    };
    expect(display()).toEqual([{ ...mapping, accountId: 'depot' }]);
    undo(opened.db, { groupId: changed.groupId }, ctx);
    expect(display()).toEqual([mapping]);
  });
  it('keeps acknowledged balance differences closed until source or local values change', async () => {
    const adapter = source();
    await refreshReadSource(opened.db, adapter, at);
    mapReadSource(opened.db, { key: balance.key, accountId: 'cash', securityId: null }, ctx);
    adapter.balances.mockResolvedValue([
      { ...balance, amount: { ...balance.amount, value: '12.35', cents: 1235 } },
    ]);
    await refreshReadSource(opened.db, adapter, at);
    const warning = inbox().find((i) => i.detail?.includes('difference'))!;
    resolveInboxItem(opened.db, warning.id, ctx);
    await refreshReadSource(opened.db, adapter, at);
    expect(inbox().find((i) => i.id === warning.id)?.resolvedAt).toBeTruthy();
    updateEntity(opened.db, schema.account, 'cash', { openingBalanceCents: 1233 }, ctx);
    await refreshReadSource(opened.db, adapter, at);
    expect(inbox().find((i) => i.id === warning.id)?.resolvedAt).toBeNull();
    resolveInboxItem(opened.db, warning.id, ctx);
    adapter.balances.mockResolvedValue([
      { ...balance, amount: { ...balance.amount, value: '12.36', cents: 1236 } },
    ]);
    await refreshReadSource(opened.db, adapter, at);
    expect(inbox().find((i) => i.id === warning.id)?.resolvedAt).toBeNull();
  });
  it('treats a missing source with local zero as reconciled and retains nonzero missing acknowledgement', async () => {
    const adapter = source();
    await refreshReadSource(opened.db, adapter, at);
    mapReadSource(opened.db, { key: balance.key, accountId: 'cash', securityId: null }, ctx);
    adapter.balances.mockResolvedValue([]);
    await refreshReadSource(opened.db, adapter, at);
    const warning = inbox().find((i) => i.detail?.includes('source_missing'))!;
    expect(JSON.parse(warning.detail!).local).toBe(1234);
    resolveInboxItem(opened.db, warning.id, ctx);
    await refreshReadSource(opened.db, adapter, at);
    expect(inbox().find((i) => i.id === warning.id)?.resolvedAt).toBeTruthy();
    updateEntity(opened.db, schema.account, 'cash', { openingBalanceCents: 0 }, ctx);
    await refreshReadSource(opened.db, adapter, at);
    expect(
      inbox().filter(
        (i) => i.kind === 'reconciliation' && !i.resolvedAt && i.detail?.includes(balance.key),
      ),
    ).toHaveLength(0);
    expect(readSourceState(opened.db).status).toBe('ok');
    updateEntity(opened.db, schema.account, 'cash', { openingBalanceCents: 1234 }, ctx);
    await refreshReadSource(opened.db, adapter, at);
    expect(inbox().find((i) => i.id === warning.id)?.resolvedAt).toBeNull();
  });
  it('reopens the same difference after an intervening matching balance, and flags duplicate mapped rows', async () => {
    const adapter = source();
    await refreshReadSource(opened.db, adapter, at);
    mapReadSource(opened.db, { key: balance.key, accountId: 'cash', securityId: null }, ctx);
    const differing = { ...balance, amount: { ...balance.amount, value: '12.35', cents: 1235 } };
    adapter.balances.mockResolvedValue([differing]);
    await refreshReadSource(opened.db, adapter, at);
    const warning = inbox().find((i) => i.detail?.includes('difference'))!;
    resolveInboxItem(opened.db, warning.id, ctx);
    adapter.balances.mockResolvedValue([balance]);
    await refreshReadSource(opened.db, adapter, at);
    expect(inbox().find((i) => i.id === warning.id)?.resolvedAt).toBeTruthy();
    adapter.balances.mockResolvedValue([differing]);
    await refreshReadSource(opened.db, adapter, at);
    expect(inbox().find((i) => i.id === warning.id)?.resolvedAt).toBeNull();
    adapter.balances.mockResolvedValue([{ ...balance, issue: 'duplicate' }]);
    await refreshReadSource(opened.db, adapter, at);
    expect(JSON.parse(inbox().find((i) => i.id === warning.id)!.detail!).reason).toBe(
      'duplicate_rows',
    );
  });
  it('quarantines invalid operations without blocking valid ones and replaces quarantine after correction', async () => {
    const adapter = source([]);
    adapter.operations.mockResolvedValue({
      operations: [operation],
      invalidOperations: [{ id: 'bad-op', reason: 'schema' }],
      nextCursor: null,
    });
    await refreshReadSource(opened.db, adapter, at);
    expect(inbox().filter((i) => i.kind === 'import')).toHaveLength(1);
    const quarantined = inbox().find((i) => i.kind === 'other')!;
    expect(JSON.parse(quarantined.detail!)).toEqual({ id: 'bad-op', reason: 'schema' });
    resolveInboxItem(opened.db, quarantined.id, ctx);
    await refreshReadSource(opened.db, adapter, at);
    expect(inbox().find((i) => i.id === quarantined.id)?.resolvedAt).toBeTruthy();
    adapter.operations.mockResolvedValue({
      operations: [{ ...operation, id: 'bad-op' }],
      nextCursor: null,
    });
    await refreshReadSource(opened.db, adapter, at);
    expect(inbox().find((i) => i.id === quarantined.id)).toMatchObject({
      kind: 'import',
      resolvedAt: null,
      urgent: false,
    });
  });
  it('bounds persisted cursor history and retains a total page counter for older loops', async () => {
    const adapter = source([]);
    for (let n = 0; n < 70; n++) {
      adapter.operations.mockResolvedValue({ operations: [], nextCursor: 'cursor-' + n });
      await refreshReadSource(opened.db, adapter, at);
    }
    expect(readSourceState(opened.db).window?.seen).toHaveLength(64);
    expect(readSourceState(opened.db).window?.pages).toBe(70);
    saveReadSourceState(
      opened.db,
      {
        ...readSourceState(opened.db),
        window: {
          from: '1970-01-01T00:00:00.000Z',
          to: at.toISOString(),
          cursor: 'cursor-69',
          seen: Array.from({ length: 70 }, (_, index) => 'legacy-' + index),
        },
      },
      ctx,
    );
    adapter.operations.mockResolvedValue({ operations: [], nextCursor: 'legacy-next' });
    await refreshReadSource(opened.db, adapter, at);
    expect(readSourceState(opened.db).window?.seen).toHaveLength(64);
    expect(readSourceState(opened.db).window?.pages).toBe(71);
    saveReadSourceState(
      opened.db,
      {
        ...readSourceState(opened.db),
        window: { ...readSourceState(opened.db).window!, pages: 10000 },
      },
      ctx,
    );
    adapter.operations.mockResolvedValue({ operations: [], nextCursor: 'outside-recent-history' });
    await expect(refreshReadSource(opened.db, adapter, at)).rejects.toThrow();
    expect(readSourceState(opened.db).window?.pages).toBe(10000);
  });
  it('rolls back both staged movements and cursor when a write fails', () => {
    sqliteOf(opened.db).exec(
      "CREATE TRIGGER reject_source BEFORE INSERT ON app_setting BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END",
    );
    expect(() =>
      stageSourcePage(
        opened.db,
        [operation],
        {
          lastSuccess: null,
          lastAttempt: at.toISOString(),
          status: 'partial',
          window: null,
          balances: [],
        },
        ctx,
      ),
    ).toThrow();
    expect(inbox()).toHaveLength(0);
    expect(readSourceState(opened.db).status).toBe('idle');
  });
  it('keeps precision and absent mapped balances explicitly unavailable', async () => {
    const adapter = source();
    await refreshReadSource(opened.db, adapter, at);
    mapReadSource(opened.db, { key: asset.key, accountId: 'depot', securityId: 'coin' }, ctx);
    adapter.balances.mockResolvedValue([
      { ...asset, amount: { ...asset.amount, value: '0.000000031' } },
    ]);
    await refreshReadSource(opened.db, adapter, at);
    expect(inbox().some((i) => i.detail?.includes('precision_unsupported'))).toBe(true);
    adapter.balances.mockResolvedValue([]);
    await refreshReadSource(opened.db, adapter, at);
    expect(inbox().some((i) => i.detail?.includes('source_missing'))).toBe(true);
  });
  it('full replay restarts history while retaining provider-id deduplication', async () => {
    const adapter = source();
    await refreshReadSource(opened.db, adapter, at);
    await refreshReadSource(opened.db, adapter, at, true);
    expect(adapter.operations.mock.calls[1]?.[0].from).toBe('1970-01-01T00:00:00.000Z');
    expect(inbox().filter((i) => i.kind === 'import')).toHaveLength(1);
    expect(opened.db.select().from(schema.booking).all()).toHaveLength(0);
  });
  it('detects a multi-page cursor loop without losing the committed page', async () => {
    const adapter = source();
    adapter.operations.mockResolvedValue({ operations: [operation], nextCursor: 'same' });
    await refreshReadSource(opened.db, adapter, at);
    await expect(refreshReadSource(opened.db, adapter, at)).rejects.toMatchObject({
      code: 'source_failed',
    });
    expect(readSourceState(opened.db).window?.cursor).toBe('same');
    expect(inbox().filter((i) => i.kind === 'import')).toHaveLength(1);
  });
  it('serializes refreshes and honors write locks', async () => {
    const adapter = source();
    let finish!: (value: { operations: SourceOperation[]; nextCursor: null }) => void;
    adapter.operations.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const active = refreshReadSource(opened.db, adapter, at);
    await expect(refreshReadSource(opened.db, adapter, at)).rejects.toMatchObject({
      code: 'source_busy',
    });
    finish({ operations: [], nextCursor: null });
    await active;
    holdWrites(opened.db);
    await expect(refreshReadSource(opened.db, adapter, at)).rejects.toMatchObject({
      code: 'source_busy',
    });
    releaseWrites(opened.db);
  });
  it('catches up, continues pages and backs off failures without duplicate nightly fetches', async () => {
    const adapter = source();
    await refreshReadSourceIfDue(opened.db, adapter, at);
    await refreshReadSourceIfDue(opened.db, adapter, new Date(at.getTime() + 60_000));
    expect(adapter.operations).toHaveBeenCalledTimes(1);
    adapter.operations.mockRejectedValue(new Error('offline'));
    await refreshReadSourceIfDue(opened.db, adapter, new Date(at.getTime() + 86400000));
    await refreshReadSourceIfDue(opened.db, adapter, new Date(at.getTime() + 86460000));
    expect(adapter.operations).toHaveBeenCalledTimes(2);
    expect(readInbox(opened.db, '2026-10-03').entries.some((i) => i.kind === 'other')).toBe(true);
  });
});
const SINCE_TEXT = 'Vor dem Startdatum – bereits in der App erfasst.';
const dated = (id: string, creditedAt: string): SourceOperation => ({
  ...operation,
  id,
  transactions: [{ ...operation.transactions[0]!, id: 'tx-' + id, creditedAt }],
});
describe('source start date (Bewegungen ab)', () => {
  const stage = (ops: SourceOperation[], invalid: Array<{ id: string; reason: 'schema' }> = []) =>
    stageSourcePage(opened.db, ops, readSourceState(opened.db), ctx, invalid);
  const row = (id: string) => inbox().find((i) => JSON.parse(i.detail!).id === id)!;
  it('records operations before the start day as resolved, compared by Vienna calendar day', () => {
    setReadSourceSince(opened.db, '2026-09-30', ctx);
    expect(readSourceSince(opened.db)).toBe('2026-09-30');
    stage([
      dated('old', '2026-09-29T21:59:59.000Z'),
      // 22:00Z is already Sep 30 in Vienna (CEST).
      dated('edge', '2026-09-29T22:00:00.000Z'),
      dated('new', '2026-10-01T12:00:00.000Z'),
    ]);
    expect(row('old')).toMatchObject({ resolution: SINCE_TEXT, kind: 'import' });
    expect(row('old').resolvedAt).toBeTruthy();
    expect(row('edge')).toMatchObject({ resolvedAt: null, resolution: null });
    expect(row('new').resolvedAt).toBeNull();
    expect(inbox().filter((i) => i.refType === 'read_source')).toHaveLength(3);
  });
  it('uses the latest transaction of an operation and keeps unknown dates as before', () => {
    setReadSourceSince(opened.db, '2026-09-30', ctx);
    const base = operation.transactions[0]!;
    stage(
      [
        {
          ...operation,
          id: 'mixed',
          transactions: [
            { ...base, id: 't1', creditedAt: '2026-01-01T00:00:00.000Z' },
            { ...base, id: 't2', creditedAt: '2026-10-01T00:00:00.000Z' },
          ],
        },
        {
          ...operation,
          id: 'no-date',
          transactions: [{ ...base, id: 't3', creditedAt: 'garbage' }],
        },
      ],
      [{ id: 'bad', reason: 'schema' }],
    );
    expect(row('mixed').resolvedAt).toBeNull();
    expect(row('no-date').resolvedAt).toBeNull();
    expect(row('bad')).toMatchObject({ kind: 'other', resolvedAt: null });
  });
  it('does not reopen a pre-start item on replay, even if its detail changes', () => {
    setReadSourceSince(opened.db, '2026-09-30', ctx);
    const old = dated('old', '2026-09-01T12:00:00.000Z');
    stage([old]);
    const first = row('old');
    stage([old]);
    stage([{ ...old, type: 'withdrawal' }]);
    expect(row('old')).toMatchObject({ resolvedAt: first.resolvedAt, resolution: SINCE_TEXT });
  });
  it('reopens a pre-start item on replay when the start day is lowered, and a changed on-or-after item', () => {
    const old = dated('old', '2026-09-01T12:00:00.000Z');
    stage([old]);
    expect(row('old').resolvedAt).toBeNull();
    setReadSourceSince(opened.db, '2026-10-01', ctx);
    expect(row('old')).toMatchObject({ resolution: SINCE_TEXT });
    setReadSourceSince(opened.db, '2026-08-01', ctx);
    stage([old]);
    expect(row('old')).toMatchObject({ resolvedAt: null, resolution: null });
    const recent = dated('recent', '2026-10-01T12:00:00.000Z');
    stage([recent]);
    resolveInboxItem(opened.db, row('recent').id, ctx);
    stage([recent]);
    expect(row('recent').resolvedAt).toBeTruthy();
    stage([{ ...recent, type: 'withdrawal' }]);
    expect(row('recent').resolvedAt).toBeNull();
  });
  it('resolves existing open operations when saved, leaves other items alone, and undoes as one group', () => {
    const old = dated('old', '2026-09-01T12:00:00.000Z');
    const recent = dated('recent', '2026-10-01T12:00:00.000Z');
    stage([old, recent], [{ id: 'bad', reason: 'schema' }]);
    resolveInboxItem(opened.db, row('recent').id, ctx);
    const result = setReadSourceSince(opened.db, '2026-09-30', ctx);
    expect(row('old')).toMatchObject({ resolution: SINCE_TEXT });
    expect(row('old').resolvedAt).toBeTruthy();
    expect(row('recent').resolution).toBe('Vom Nutzer als erledigt markiert');
    expect(row('bad').resolvedAt).toBeNull();
    const undone = undo(opened.db, { groupId: result.groupId }, ctx);
    expect(readSourceSince(opened.db)).toBeNull();
    expect(row('old')).toMatchObject({ resolvedAt: null, resolution: null });
    undo(opened.db, { groupId: undone.groupId }, ctx);
    expect(readSourceSince(opened.db)).toBe('2026-09-30');
    expect(row('old').resolution).toBe(SINCE_TEXT);
  });
  it('can clear the start day and rejects invalid days', () => {
    setReadSourceSince(opened.db, '2026-09-30', ctx);
    setReadSourceSince(opened.db, null, ctx);
    expect(readSourceSince(opened.db)).toBeNull();
    expect(() => setReadSourceSince(opened.db, '2026-02-30', ctx)).toThrow();
    expect(() => setReadSourceSince(opened.db, '30.09.2026', ctx)).toThrow();
  });
  it('defaults the start day to the connection day on the first refresh only, as a system change', async () => {
    const adapter = source([balance]);
    const old = dated('old', '2026-09-01T12:00:00.000Z');
    adapter.operations.mockResolvedValue({
      operations: [old, dated('today', at.toISOString())],
      nextCursor: null,
    });
    expect(readSourceSince(opened.db)).toBeNull();
    await refreshReadSource(opened.db, adapter, at);
    expect(readSourceSince(opened.db)).toBe('2026-10-02');
    expect(inbox().find((i) => JSON.parse(i.detail!).id === 'old')?.resolution).toBe(SINCE_TEXT);
    expect(inbox().find((i) => JSON.parse(i.detail!).id === 'today')?.resolvedAt).toBeNull();
    const audit = opened.db.select().from(schema.auditLog).all();
    expect(
      audit.some(
        (a) =>
          a.entityType === 'app_setting' &&
          a.entityId === 'source.crypto.since' &&
          a.actor === 'system',
      ),
    ).toBe(true);
    // A manual choice is kept, also an explicit "no limit".
    setReadSourceSince(opened.db, null, ctx);
    await refreshReadSource(opened.db, adapter, new Date(at.getTime() + 86400000));
    expect(readSourceSince(opened.db)).toBeNull();
    setReadSourceSince(opened.db, '2026-09-15', ctx);
    await refreshReadSource(opened.db, adapter, new Date(at.getTime() + 2 * 86400000));
    expect(readSourceSince(opened.db)).toBe('2026-09-15');
  });
  it('moving the start day earlier reopens older items only with a full-history refresh', async () => {
    const adapter = source([balance]);
    const old = dated('old', '2026-09-01T12:00:00.000Z');
    const middle = dated('middle', '2026-09-20T12:00:00.000Z');
    adapter.operations.mockResolvedValue({ operations: [old, middle], nextCursor: null });
    await refreshReadSource(opened.db, adapter, at);
    expect(readSourceSince(opened.db)).toBe('2026-10-02');
    const status = (id: string) => inbox().find((i) => JSON.parse(i.detail!).id === id)!;
    expect(status('old').resolution).toBe(SINCE_TEXT);
    expect(status('middle').resolution).toBe(SINCE_TEXT);
    setReadSourceSince(opened.db, '2026-09-15', ctx);
    expect(status('middle').resolution).toBe(SINCE_TEXT);
    // A normal refresh does not replay history.
    adapter.operations.mockResolvedValueOnce({ operations: [], nextCursor: null });
    await refreshReadSource(opened.db, adapter, new Date(at.getTime() + 3600000));
    expect(status('middle').resolvedAt).toBeTruthy();
    await refreshReadSource(opened.db, adapter, new Date(at.getTime() + 7200000), true);
    expect(status('middle')).toMatchObject({ resolvedAt: null, resolution: null });
    expect(status('old').resolution).toBe(SINCE_TEXT);
    // Items that did not exist yet are created open when on/after the new start day.
    adapter.operations.mockResolvedValue({
      operations: [dated('late', '2026-09-16T12:00:00.000Z')],
      nextCursor: null,
    });
    await refreshReadSource(opened.db, adapter, new Date(at.getTime() + 10800000), true);
    expect(status('late').resolvedAt).toBeNull();
  });
});
