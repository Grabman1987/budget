import type { InboxEntry, InboxEnvelope, InboxKind } from './api';
import type { BankSyncRecapData } from './bank-sync-recap';
import { isBankInboxRow } from './bank-bulk-actions';

export type BankAccountGroup = {
  id: string;
  name: string;
  entries: Exclude<InboxEntry, InboxEnvelope>[];
  recap?: BankSyncRecapData['accounts'][number];
};

/** Stable account identity keeps identically named accounts and pagination separate. */
export function bankAccountGroups(entries: InboxEntry[], accounts: BankSyncRecapData['accounts']) {
  const groups = new Map<string, BankAccountGroup>();
  for (const account of accounts) {
    if (!account.accountId) continue;
    const previous = groups.get(account.accountId);
    if (!previous || (account.syncedAt ?? '') > (previous.recap?.syncedAt ?? ''))
      groups.set(account.accountId, {
        id: account.accountId,
        name: account.name,
        entries: [],
        recap: account,
      });
  }
  for (const entry of entries) {
    if (entry.type === 'envelope') continue;
    const bank = isBankInboxRow(entry);
    const row =
      entry.type === 'booking' ? entry : entry.type === 'stored' ? entry.bankCandidate : undefined;
    // Open items of accounts without bank sync (e.g. a cash wallet) get their own account group.
    const id = row?.accountId
      ? row.accountId
      : bank
        ? `legacy:${row?.accountName ?? entry.id}`
        : 'other';
    let group = groups.get(id);
    if (!group) {
      group = {
        id,
        name: row ? row.accountName || 'Bankumsätze' : 'Weitere Umsätze',
        entries: [],
      };
      groups.set(id, group);
    }
    group.entries.push(entry);
  }
  return [...groups.values()];
}

export const BANK_COLLAPSE_KEY = 'budget.inbox.collapsed-accounts.v1';
export function readCollapsedAccounts(): Set<string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(BANK_COLLAPSE_KEY) ?? '[]');
    return new Set(
      Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [],
    );
  } catch {
    return new Set();
  }
}

/** Use the same page boundary and account disclosure for rendering and bulk scope. */
export type InboxDisplayGroup = {
  kind: Exclude<InboxKind, 'overspent'> | null;
  account: BankAccountGroup | undefined;
  /** Own group of `stale_value` warnings of instruments without a holding. */
  historical?: boolean;
  all: Exclude<InboxEntry, InboxEnvelope>[];
};
export function visibleInboxGroups(
  groups: InboxDisplayGroup[],
  collapsed: Set<string>,
  serverPaginated: boolean,
  shown: number,
) {
  let offset = 0;
  return groups.map((group) => {
    const room = serverPaginated ? group.all.length : Math.max(0, shown - offset);
    offset += group.all.length;
    return {
      ...group,
      items: group.account && collapsed.has(group.account.id) ? [] : group.all.slice(0, room),
    };
  });
}
