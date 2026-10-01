import { describe, expect, it } from 'vitest';
import type { OpenItem } from '@budget/domain';
import { eur } from '../ledger/format';
import type { AccountRow } from '../ledger/types';
import {
  balanceKind,
  defaultSettleAccount,
  openItemsText,
  settleHint,
  summaryLine,
} from './contacts-model';

describe('balanceKind', () => {
  it('is Forderung above 0, Verbindlichkeit below, ausgeglichen at 0', () => {
    expect(balanceKind({ balanceCents: 1 })).toBe('receivable');
    expect(balanceKind({ balanceCents: -1 })).toBe('payable');
    expect(balanceKind({ balanceCents: 0 })).toBe('settled');
  });
});

describe('openItemsText', () => {
  it('counts in German', () => {
    expect(openItemsText(0)).toBe('keine offenen Posten');
    expect(openItemsText(1)).toBe('1 offener Posten');
    expect(openItemsText(4)).toBe('4 offene Posten');
  });
});

describe('summaryLine', () => {
  it('names the open amount, a credit if there is one, and the number of contacts', () => {
    expect(summaryLine({ receivableCents: 11_077, payableCents: 0, openItemCount: 5 }, 3)).toBe(
      `${eur(11_077)} offen · 3 Kontakte`,
    );
    expect(summaryLine({ receivableCents: 0, payableCents: 800, openItemCount: 0 }, 1)).toBe(
      `${eur(0)} offen · ${eur(800)} Guthaben bei dir · 1 Kontakt`,
    );
    expect(summaryLine({ receivableCents: 0, payableCents: 0, openItemCount: 0 }, 0)).toBe(
      'Noch keine Kontakte',
    );
  });
});

describe('settleHint', () => {
  const items: OpenItem[] = [
    { id: 'a', date: '2026-07-01', memo: null, amountCents: 1_000, openCents: 600 },
    { id: 'b', date: '2026-08-01', memo: null, amountCents: 2_000, openCents: 2_000 },
  ];
  it('says how the repayment lands on the oldest items first', () => {
    expect(settleHint(items, 600)).toBe('Gleicht 1 Posten ganz aus, die ältesten zuerst.');
    expect(settleHint(items, 1_000)).toBe(
      'Gleicht 1 Posten ganz und 1 Posten zum Teil aus, die ältesten zuerst.',
    );
    expect(settleHint(items, 2_600)).toBe('Gleicht 2 Posten ganz aus, die ältesten zuerst.');
    expect(settleHint(items, 100)).toBe('Gleicht 1 Posten zum Teil aus, die ältesten zuerst.');
  });
  it('warns about a surplus and handles nothing open or no amount', () => {
    expect(settleHint(items, 3_000)).toContain('übersteigt');
    expect(settleHint([], 100)).toBe('Es ist nichts offen.');
    expect(settleHint(items, 0)).toBe('');
  });
});

describe('defaultSettleAccount', () => {
  const account = (over: Partial<AccountRow>): AccountRow =>
    ({ id: 'x', onBudget: true, currency: 'EUR', closedAt: null, ...over }) as AccountRow;
  it('prefers an open euro account of the budget', () => {
    const list = [
      account({ id: 'closed', closedAt: '2026-01-01' }),
      account({ id: 'usd', currency: 'USD' }),
      account({ id: 'track', onBudget: false }),
      account({ id: 'giro' }),
    ];
    expect(defaultSettleAccount(list)?.id).toBe('giro');
    expect(defaultSettleAccount(list.slice(0, 3))?.id).toBe('track');
    expect(defaultSettleAccount([])).toBeUndefined();
  });
});
