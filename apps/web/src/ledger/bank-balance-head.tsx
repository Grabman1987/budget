import { useAmountPrivacy } from '@budget/ui';
import { AppLink } from '../shell/app-link';
import { nativeCurrency } from './format';
import type { AccountRow } from './types';

/** Stored bank observation beside the app balance; this never reconciles or adjusts money. */
export function BankBalanceHead({
  account,
}: {
  account: Pick<AccountRow, 'id' | 'closedAt' | 'currency' | 'balanceCents' | 'bankBalance'>;
}) {
  useAmountPrivacy();
  const balance = account.bankBalance;
  if (account.closedAt || balance?.amountCents == null) return null;
  const currency = balance.currency ?? account.currency;
  const differenceCents =
    currency === account.currency ? balance.amountCents - account.balanceCents : null;
  return (
    <div className="account-bank-observation kmeta" role="group" aria-label="Bankstand">
      <p>
        Bankstand {nativeCurrency(balance.amountCents, currency)} · abgerufen{' '}
        {balance.fetchedAt ? (
          <time dateTime={balance.fetchedAt}>
            {new Date(balance.fetchedAt).toLocaleString('de-AT', { timeZone: 'Europe/Vienna' })}
          </time>
        ) : (
          'unbekannt'
        )}
      </p>
      {differenceCents !== null && differenceCents !== 0 && (
        <p>
          Differenz zum App-Saldo {nativeCurrency(differenceCents, account.currency, true)} ·{' '}
          <AppLink to="/konten/pruefen" search={{ von: `/konten/${account.id}` }}>
            Prüfen
          </AppLink>
        </p>
      )}
    </div>
  );
}
