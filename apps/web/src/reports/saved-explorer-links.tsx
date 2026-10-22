import { maskMoneyText, useAmountPrivacy } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { Bookmark } from 'lucide-react';
import { AppLink } from '../shell/app-link';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { savedExplorerViewsQuery } from './explorer-view-api';
import './saved-explorer-links.css';

/** Read the shared document only; visiting the hub never promotes or modifies local views. */
export function SavedExplorerLinks() {
  useAmountPrivacy();
  const saved = useQuery({ ...savedExplorerViewsQuery(), refetchOnMount: 'always' });
  const current = saved.isSuccess && !saved.isFetching && !saved.data.unavailable && saved.data.schemaVersion === 1
    ? saved.data.views
    : undefined;
  return (
    <section className="saved-explorer-links" aria-labelledby="saved-explorer-title">
      <h2 id="saved-explorer-title">Meine Auswertungen</h2>
      {saved.isFetching && <LoadingNote what="Gespeicherte Auswertungen" />}
      {saved.isError && <ErrorNote what="Gespeicherte Auswertungen" error={saved.error} onRetry={() => void saved.refetch()} />}
      {saved.isSuccess && !saved.isFetching && !current && (
        <p role="status">Gespeicherte Auswertungen sind nicht verfügbar. Die Daten bleiben erhalten.</p>
      )}
      {current?.length === 0 && (
        <p>Noch keine eigene Auswertung gespeichert. <AppLink to="/reports/explorer">Auswertung erstellen</AppLink></p>
      )}
      {current && current.length > 0 && (
        <nav className="saved-explorer-chips" aria-label="Meine Auswertungen">
          {current.map((view) => (
            <AppLink key={view.id} to="/reports/explorer" search={{ ansicht: view.id }}>
              <Bookmark size={16} aria-hidden="true" />
              {maskMoneyText(view.name)}
            </AppLink>
          ))}
        </nav>
      )}
    </section>
  );
}
