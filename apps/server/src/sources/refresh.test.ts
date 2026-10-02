import {
  resolveInboxItem,
  createTestDatabase,
  createEntity,
  schema,
  readSourceState,
  readSourceMappings,
  mapReadSource,
  readInbox,
  stageSourcePage,
  undo,
  holdWrites,
  releaseWrites,
  sqliteOf,
  type OpenedDatabase,
} from '@budget/db';
import type { ReadSource, SourceBalance, SourceOperation } from '@budget/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  });
  it('resumes failed pages and final balance retrieval without advancing the successful watermark', async () => {
    const adapter = source();
    adapter.operations
      .mockResolvedValueOnce({ operations: [operation], nextCursor: 'next' })
      .mockRejectedValueOnce(new Error('synthetic-private-body'));
    expect(await refreshReadSource(opened.db, adapter, at)).toEqual({ status: 'partial' });
    await expect(refreshReadSource(opened.db, adapter, at)).rejects.toMatchObject({
      code: 'source_failed',
    });
    expect(readSourceState(opened.db)).toMatchObject({
      lastSuccess: null,
      window: { cursor: 'next' },
    });
    adapter.operations.mockResolvedValue({ operations: [operation], nextCursor: null });
    adapter.balances.mockRejectedValueOnce(new Error('balance-failure'));
    await expect(refreshReadSource(opened.db, adapter, at)).rejects.toThrow();
    const calls = adapter.operations.mock.calls.length;
    await refreshReadSource(opened.db, adapter, at);
    expect(adapter.operations).toHaveBeenCalledTimes(calls);
    expect(readSourceState(opened.db).status).toBe('ok');
    expect(JSON.stringify(inbox())).not.toContain('synthetic-private-body');
    expect(inbox().filter((i) => i.kind === 'import')).toHaveLength(1);
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
