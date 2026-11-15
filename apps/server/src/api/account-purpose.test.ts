import { afterEach, beforeEach, expect, it } from 'vitest';
import { Hono } from 'hono';
import { accounts, createTestDatabase, undo, type OpenedDatabase } from '@budget/db';
import { accountRoutes } from './accounts';
import type { AccountView } from './accounts';

let opened: OpenedDatabase;
let app: Hono;
beforeEach(() => {
  opened = createTestDatabase();
  app = new Hono().route(
    '/accounts',
    accountRoutes(opened.db, () => '2026-09-17'),
  );
});
afterEach(() => opened.close());

async function write(path: string, data: unknown, method = 'POST') {
  const response = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
  });
  expect(response.ok, await response.clone().text()).toBe(true);
  return response.json() as Promise<{ account: AccountView; groupId: string }>;
}

it('persists purpose and clears hidden limits atomically without changing account classification or cents', async () => {
  const { account: created } = await write('/accounts', {
    name: 'Synthetic account',
    type: 'checking',
    purpose: 'settlement',
    openingDate: '2026-09-01',
    openingBalanceCents: -12345,
    overdraftLimitCents: 50000,
  });
  const { account: changed, groupId } = await write(
    `/accounts/${created.id}`,
    { purpose: 'cash' },
    'PATCH',
  );
  expect(changed).toMatchObject({
    purpose: 'cash',
    overdraftLimitCents: null,
    type: 'checking',
    role: 'budget',
    onBudget: true,
    balanceCents: -12345,
  });
  expect(accounts.get(opened.db, created.id)?.overdraftLimitCents).toBeNull();
  const { account: renamed, groupId: renameGroup } = await write(
    `/accounts/${created.id}`,
    { name: 'Synthetic renamed' },
    'PATCH',
  );
  expect(renamed.purpose).toBe('cash');
  undo(opened.db, { groupId: renameGroup }, { actor: 'test' });
  undo(opened.db, { groupId }, { actor: 'test' });
  expect(accounts.get(opened.db, created.id)).toMatchObject({
    purpose: 'settlement',
    overdraftLimitCents: 50000,
  });
});

it('clears unavailable limits on create and retype, but keeps legacy limits on unrelated edits', async () => {
  const { account: cash } = await write('/accounts', {
    name: 'Synthetic cash',
    type: 'cash',
    openingDate: '2026-09-01',
    overdraftLimitCents: 50000,
  });
  expect(cash.overdraftLimitCents).toBeNull();
  const { account: checking } = await write('/accounts', {
    name: 'Synthetic bank',
    type: 'checking',
    openingDate: '2026-09-01',
    overdraftLimitCents: 50000,
  });
  const { account: loan } = await write(
    `/accounts/${checking.id}`,
    { type: 'loan', onBudget: false },
    'PATCH',
  );
  expect(loan.overdraftLimitCents).toBeNull();
  const legacy = accounts.create(
    opened.db,
    {
      name: 'Synthetic legacy',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-09-01',
      overdraftLimitCents: 50000,
    },
    { actor: 'test' },
  );
  const { account: retyped } = await write(`/accounts/${legacy.id}`, { type: 'cash' }, 'PATCH');
  expect(retyped).toMatchObject({ purpose: 'cash', overdraftLimitCents: null });
  accounts.update(opened.db, legacy.id, { overdraftLimitCents: 50000 }, { actor: 'test' });
  const { account: renamed } = await write(
    `/accounts/${legacy.id}`,
    { name: 'Synthetic rename' },
    'PATCH',
  );
  expect(renamed).toMatchObject({ purpose: 'cash', overdraftLimitCents: 50000 });
});
