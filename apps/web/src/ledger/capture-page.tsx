import { todayInVienna } from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { budgetQuery } from '../budget/budget-api';
import { BookingPanel } from './booking-panel';
import { capturePrefill, type CaptureSearch } from './capture-link';
import { accountsQuery } from './queries';
import { ErrorNote, LoadingNote } from './states';

/** A new draft only; all existing owner-save validation, audit and undo paths are reused. */
export function CapturePage() {
  const search = useSearch({ strict: false }) as CaptureSearch;
  const accounts = useQuery(accountsQuery());
  const budget = useQuery(budgetQuery(todayInVienna().slice(0, 7)));
  const navigate = useNavigate();
  if (accounts.isPending || budget.isPending) return <LoadingNote what="Erfassung" />;
  if (accounts.isError || budget.isError)
    return (
      <ErrorNote
        what="Erfassung"
        error={accounts.error ?? budget.error}
        onRetry={() => {
          void accounts.refetch();
          void budget.refetch();
        }}
      />
    );
  const prefill = capturePrefill(
    search,
    accounts.data.accounts.filter((a) => !a.closedAt).map((a) => a.id),
    budget.data.categories
      .filter((c) => !c.hiddenAt && c.kind !== 'income' && c.kind !== 'advance')
      .map((c) => c.id),
  );
  return (
    <>
      <h1>Buchung erfassen</h1>
      <p>
        Der Link belegt nur Felder vor. Prüfe die Angaben und speichere selbst. Unbekannte Konten
        und Kategorien werden ignoriert.
      </p>
      <BookingPanel
        state={{ mode: 'create', prefill }}
        onClose={() => void navigate({ to: '/' })}
      />
    </>
  );
}
