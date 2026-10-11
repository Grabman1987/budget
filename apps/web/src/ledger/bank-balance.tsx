import '../pages/data-sources.css';
import { Button, useAmountPrivacy } from '@budget/ui';
import { useState } from 'react';
import { request } from '../api/http';
import { useBudgetWrite } from '../budget/use-category-writes';
import { longDay, valuedCurrency } from './format';
import type { AccountRow } from './types';

export function BankBalance({ account }: { account: AccountRow }) {
  useAmountPrivacy();
  const balance = account.bankBalance;
  const [busy, setBusy] = useState(false);
  const write = useBudgetWrite();
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
      {balance.canLock && (
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void write(
              () =>
                request<{ groupId: string }>(
                  'POST',
                  `/api/accounts/${encodeURIComponent(account.id)}/bank-lock`,
                  {},
                ),
              () => `Abgleich bis ${lockDate ? longDay(lockDate) : 'heute'} gesperrt.`,
            ).finally(() => setBusy(false));
          }}
        >
          Abgleich sperren bis heute
        </Button>
      )}
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
