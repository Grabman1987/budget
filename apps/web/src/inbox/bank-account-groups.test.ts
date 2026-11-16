// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { bankAccountGroups, BANK_COLLAPSE_KEY, readCollapsedAccounts } from './bank-account-groups';
import type { InboxEntry } from './api';
import type { BankSyncRecapData } from './bank-sync-recap';
const candidate = (id: string, accountId: string): InboxEntry => ({
  type: 'stored',
  id,
  kind: 'import',
  title: 'Bankumsatz prüfen',
  detail: null,
  refType: 'bank-sync-candidate',
  refId: id,
  urgent: false,
  createdAt: '2026-09-17T12:00:00Z',
  bankCandidate: {
    accountId,
    accountName: 'Synthetic account',
    date: '2026-09-17',
    amountCents: -1234,
    currency: 'EUR',
    memo: id,
    payeeName: null,
  },
});
const meta = (
  sourceId: string,
  accountId: string,
  syncedAt: string,
): BankSyncRecapData['accounts'][number] => ({
  sourceId,
  accountId,
  name: 'Synthetic account',
  syncedAt,
  result: { fetched: 1, linked: 0, new: 1 },
  open: 1,
  openTotal: 1,
  running: false,
  status: 'active',
});
afterEach(() => localStorage.clear());
it('keeps same-name accounts separate, combines sources for one account, and renders each row once', () => {
  const a = candidate('row-a', 'account-a'),
    b = candidate('row-b', 'account-b');
  const groups = bankAccountGroups(
    [a, b],
    [
      meta('old-source', 'account-a', '2026-09-16T12:00:00Z'),
      meta('new-source', 'account-a', '2026-09-17T12:00:00Z'),
      meta('source-b', 'account-b', '2026-09-17T12:00:00Z'),
    ],
  );
  expect(groups.map((group) => group.id)).toEqual(['account-a', 'account-b']);
  expect(groups[0]?.recap?.sourceId).toBe('new-source');
  expect(groups.map((group) => group.entries.map((entry) => entry.id))).toEqual([
    ['row-a'],
    ['row-b'],
  ]);
});
it('retains empty account metadata without inventing rows and keeps entries without recap', () => {
  const groups = bankAccountGroups(
    [candidate('row-b', 'account-b')],
    [meta('source-a', 'account-a', '2026-09-17T12:00:00Z')],
  );
  expect(groups.map((group) => group.entries.length)).toEqual([0, 1]);
});
it('defaults to expanded and accepts only valid device collapse identifiers', () => {
  expect([...readCollapsedAccounts()]).toEqual([]);
  localStorage.setItem(BANK_COLLAPSE_KEY, JSON.stringify(['account-a', 3, null]));
  expect([...readCollapsedAccounts()]).toEqual(['account-a']);
  localStorage.setItem(BANK_COLLAPSE_KEY, 'broken');
  expect([...readCollapsedAccounts()]).toEqual([]);
});
