import { allocateSettlement, type ContactOccurrence, type OpenItem } from '@budget/domain';
import { eur } from '../ledger/format';
import type { AccountRow } from '../ledger/types';
import type { ContactTotals, ContactView } from './contacts-api';

/** Presentation logic of Konten › Kontakte: wording and small derivations, no figures of its own. */

export type BalanceKind = 'receivable' | 'payable' | 'settled';

export const balanceKind = (c: Pick<ContactView, 'balanceCents'>): BalanceKind =>
  c.balanceCents > 0 ? 'receivable' : c.balanceCents < 0 ? 'payable' : 'settled';

export const BALANCE_LABEL: Record<BalanceKind, string> = {
  receivable: 'Forderung',
  payable: 'Verbindlichkeit',
  settled: 'ausgeglichen',
};

export const openItemsText = (n: number): string =>
  n === 0 ? 'keine offenen Posten' : n === 1 ? '1 offener Posten' : `${n} offene Posten`;

/** The line above the list: what contacts owe, and what is owed to them. */
export function summaryLine(totals: ContactTotals, count: number): string {
  if (count === 0) return 'Noch keine Kontakte';
  const parts = [`${eur(totals.receivableCents)} offen`];
  if (totals.payableCents > 0) parts.push(`${eur(totals.payableCents)} Guthaben bei dir`);
  parts.push(`${count} ${count === 1 ? 'Kontakt' : 'Kontakte'}`);
  return parts.join(' · ');
}

export const OCCURRENCE_STATUS_LABEL: Record<ContactOccurrence['status'], string> = {
  expected: 'erwartet',
  received: 'eingegangen',
  deviating: 'abweichend',
  missed: 'ausgefallen',
};

/** What a repayment of `amountCents` does to the open items, in a sentence. */
export function settleHint(items: readonly OpenItem[], amountCents: number): string {
  if (items.length === 0) return 'Es ist nichts offen.';
  if (amountCents <= 0) return '';
  const { parts, surplusCents } = allocateSettlement(items, amountCents);
  if (surplusCents > 0)
    return `Das übersteigt den offenen Betrag von ${eur(items.reduce((s, i) => s + i.openCents, 0))}.`;
  const full = parts.filter((p) => p.remainingCents === 0).length;
  const partial = parts.length - full;
  const said: string[] = [];
  if (full > 0) said.push(full === 1 ? '1 Posten ganz' : `${full} Posten ganz`);
  if (partial > 0) said.push('1 Posten zum Teil');
  return `Gleicht ${said.join(' und ')} aus, die ältesten zuerst.`;
}

/** The repayment account to preselect: an open euro account of the budget, first by order. */
export function defaultSettleAccount(accounts: readonly AccountRow[]): AccountRow | undefined {
  const usable = accounts.filter((a) => a.closedAt === null && a.currency === 'EUR');
  return usable.find((a) => a.onBudget) ?? usable[0];
}
