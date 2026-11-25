import { Button, useAmountPrivacy } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { todayInVienna } from '@budget/domain';
import { useBudgetWrite } from '../budget/use-category-writes';
import type { AccountReminder } from '../heute/api';
import { reconcileAccount } from '../ledger/api';
import { longDay, nativeCurrency } from '../ledger/format';
import { accountsQuery } from '../ledger/queries';
import { AppLink } from '../shell/app-link';
import '../heute/account-reminders.css';
import './account-review-rows.css';

/**
 * Konten prüfen in the redesigned Prüfen page (#1345): every row shows the account's current
 * balance and a quick "Passt" confirmation through the existing reconciliation write. A balance
 * that does not match is checked in the account itself (link), nothing navigates away on its own.
 */
export function AccountReviewRows({ items }: { items: AccountReminder[] }) {
  useAmountPrivacy();
  const write = useBudgetWrite();
  const accounts = useQuery(accountsQuery());
  return (
    <div className="account-reminders account-review-rows">
      {items.map((item) => {
        const account = accounts.data?.accounts.find((entry) => entry.id === item.accountId);
        const target = '/konten/' + encodeURIComponent(item.accountId);
        const confirmable = item.action === 'reconcile' && account != null;
        return (
          <div className="account-reminder" key={item.accountId}>
            <span>
              <strong>{item.accountName}</strong> · Prüfung fällig
              {item.dueOn
                ? ` seit ${longDay(item.dueOn)}`
                : ` · seit ${item.days} Tagen nicht geprüft`}
              {item.action === 'value' ? ' · Wert aktualisieren' : ''}
              {account && (
                <small className="account-review-balance" data-testid="account-review-balance">
                  Kontostand {nativeCurrency(account.clearedCents, account.currency)}
                  {account.unclearedCents !== 0 &&
                    ` · vorgemerkt ${nativeCurrency(account.unclearedCents, account.currency, true)}`}
                </small>
              )}
            </span>
            <span className="account-review-actions">
              {confirmable && (
                <Button
                  variant="ghost"
                  aria-label={`Kontostand passt: ${item.accountName}`}
                  onClick={() =>
                    void write(
                      () =>
                        reconcileAccount(account.id, {
                          date: todayInVienna(),
                          statementBalanceCents: account.clearedCents,
                        }).then(({ result }) => ({ groupId: result.groupId })),
                      () => `Kontostand ${item.accountName} bestätigt.`,
                    )
                  }
                >
                  Passt
                </Button>
              )}
              <AppLink className="btn btn-ghost" to={target} search={{ pruefen: item.action }}>
                {item.action === 'value' ? 'Wert aktualisieren' : 'Konto öffnen'}
              </AppLink>
            </span>
          </div>
        );
      })}
    </div>
  );
}
