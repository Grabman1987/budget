import '../pages/data-sources.css';
import { Button, useAmountPrivacy } from '@budget/ui';
import { useState } from 'react';
import { request } from '../api/http';
import { useBudgetWrite } from '../budget/use-category-writes';
import { longDay, valuedCurrency } from './format';
import type { AccountRow, ReconcileResult } from './types';

export const lockKnownBankBalance = (accountId: string) =>
  request<ReconcileResult>('POST', `/api/accounts/${encodeURIComponent(accountId)}/bank-lock`, {});

/** Reuse the bank-lock action and grouped Undo; month close supplies its revision-guarded writer. */
export function BankLockButton({
  account,
  disabled = false,
  confirm,
  onBusy,
  onDone,
}: {
  account: AccountRow;
  disabled?: boolean;
  confirm?: () => Promise<{ groupId: string }>;
  onBusy?: (busy: boolean) => void;
  onDone?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const write = useBudgetWrite();
  const lockDate = account.bankBalance?.effectiveDate;
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={disabled || busy || !account.bankBalance?.canLock}
      onClick={() => {
        setBusy(true);
        onBusy?.(true);
        void write(
          confirm ?? (() => lockKnownBankBalance(account.id)),
          () => `Abgleich bis ${lockDate ? longDay(lockDate) : 'heute'} gesperrt.`,
        )
          .then((result) => {
            if (result) onDone?.();
          })
          .finally(() => {
            setBusy(false);
            onBusy?.(false);
          });
      }}
    >
      Abgleich sperren bis heute
    </Button>
  );
}

export function BankBalance({ account }: { account: AccountRow }) {
  useAmountPrivacy();
  const balance = account.bankBalance;
  if (!balance) return null;
  const lockDate = balance.effectiveDate;
  return (
    <div className="bank-balance" role="group" aria-label={`Bankstand · ${account.name}`}>
      <span>
        Bankstand:{' '}
        {balance.amountCents === null
          ? 'Noch nicht abgerufen'
          : valuedCurrency(balance.amountCents, account.currency, balance.valuation)}
        {balance.date && ` · ${longDay(balance.date)}`}
      </span>
      <span className="kmeta">
        Abgerufen: {balance.fetchedAt ? new Date(balance.fetchedAt).toLocaleString('de-AT') : '—'}
        {' · '}Abgeglichen bis:{' '}
        {balance.reconciledThrough ? longDay(balance.reconciledThrough) : '—'}
      </span>
      {balance.canLock && <BankLockButton account={account} />}
      {balance.canLock && lockDate && (
        <span className="kmeta">
          Sperrt Buchungen bis {longDay(lockDate)} (Datum des Bankstands).
        </span>
      )}
      {!balance.canLock && (
        <span className="kmeta">{balance.lockReason ?? 'Ein passender Bankstand fehlt.'}</span>
      )}
    </div>
  );
}
