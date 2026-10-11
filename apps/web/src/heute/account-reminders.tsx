import { useQuery } from '@tanstack/react-query';
import { request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { AppLink } from '../shell/app-link';
import type { AccountReminder } from './api';
import './account-reminders.css';

export function AccountReminderRows({ items }: { items: AccountReminder[] }) {
  return (
    <div className="account-reminders">
      {items.map((item) => (
        <div className="account-reminder" key={item.accountId}>
          <span>
            <strong>{item.accountName}</strong> · Konto seit {item.days} Tagen nicht geprüft
            {item.action === 'value' ? ' · Wert aktualisieren' : ''}
          </span>
          <AppLink
            className="btn btn-ghost"
            to={'/konten/' + encodeURIComponent(item.accountId)}
            search={{ pruefen: item.action }}
          >
            {item.action === 'value' ? 'Wert aktualisieren' : 'Kontostand prüfen'}
          </AppLink>
        </div>
      ))}
    </div>
  );
}

export function InboxAccountReminders() {
  const query = useQuery({
    queryKey: [...LEDGER_KEY, 'account-reminders'],
    queryFn: () => request<{ reminders: AccountReminder[] }>('GET', '/api/accounts/reminders'),
  });
  if (query.data?.reminders.length === 0) return null;
  return (
    <section aria-labelledby="account-reminder-title">
      <h2 id="account-reminder-title">Konten prüfen</h2>
      {query.isPending && <LoadingNote what="Kontoprüfung" />}
      {query.isError && (
        <ErrorNote what="Kontoprüfung" error={query.error} onRetry={() => void query.refetch()} />
      )}
      {query.data && <AccountReminderRows items={query.data.reminders} />}
    </section>
  );
}
