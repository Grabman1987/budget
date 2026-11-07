import { SectionHead, maskMoneyText, useAmountPrivacy } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { request } from '../api/http';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { AppLink } from '../shell/app-link';
import { INBOX_KEY } from './api';
import './bank-sync-recap.css';

export type BankSyncRecapData = {
  accounts: {
    sourceId: string;
    name: string;
    syncedAt: string | null;
    result: { fetched: number; linked: number; new: number } | null;
    open: number | null;
    running: boolean;
    status: string;
  }[];
};

export function BankSyncRecap() {
  useAmountPrivacy();
  const query = useQuery({
    queryKey: [...INBOX_KEY, 'bank-sync-recap'],
    queryFn: () => request<BankSyncRecapData>('GET', '/api/bank-sync/recap'),
    refetchInterval: 30_000,
  });
  if (query.isPending) return <LoadingNote what="Abruf-Rückblick" />;
  if (query.isError)
    return (
      <ErrorNote what="Abruf-Rückblick" error={query.error} onRetry={() => void query.refetch()} />
    );
  if (!query.data.accounts.length) return null;
  return (
    <section className="bank-sync-recap" aria-label="Rückblick nach Bankabruf">
      <SectionHead title="Rückblick nach Bankabruf" />
      <p>
        Letzter erfolgreicher Abruf je Konto. Neue Umsätze einzeln prüfen oder mit vorbereiteten
        Vorschlägen gesammelt bestätigen.
      </p>
      <ul>
        {query.data.accounts.map((account) => (
          <li key={account.sourceId}>
            <div>
              <h3>{maskMoneyText(account.name)}</h3>
              {account.running && (
                <p role="status">
                  Abruf läuft – angezeigt bleibt das letzte vollständige Ergebnis.
                </p>
              )}
              {account.status === 'error' && (
                <p>Abruf fehlgeschlagen – angezeigt bleibt das letzte vollständige Ergebnis.</p>
              )}
              {account.syncedAt && (
                <p className="text-muted">
                  {new Date(account.syncedAt).toLocaleString('de-AT', {
                    timeZone: 'Europe/Vienna',
                  })}
                </p>
              )}
              {account.result ? (
                <p>
                  {account.result.fetched} abgerufen · {account.result.linked} verknüpft ·{' '}
                  {account.result.new} neu vorgemerkt
                </p>
              ) : (
                <p>
                  {account.syncedAt
                    ? 'Für diesen Abruf liegt keine Ergebnisübersicht vor.'
                    : 'Noch kein vollständiger Abruf.'}
                </p>
              )}
              {account.syncedAt &&
                (account.open === null ? (
                  <p>Die neuen Umsätze dieses Abrufs lassen sich nicht eindeutig zuordnen.</p>
                ) : (
                  <p>
                    {account.open === 0
                      ? 'Keine neuen Umsätze dieses Abrufs offen.'
                      : `${account.open} neue Umsätze dieses Abrufs noch offen.`}
                  </p>
                ))}
            </div>
            <div className="bank-recap-actions">
              {account.syncedAt && account.open !== null && account.open > 0 && (
                <AppLink
                  className="btn"
                  to="/konten/pruefen"
                  search={{ bankSource: account.sourceId, bankRecap: account.syncedAt }}
                >
                  Neue Umsätze prüfen ({account.open})
                </AppLink>
              )}
              <AppLink
                className="btn btn-ghost"
                to="/konten/pruefen"
                search={{ bankSource: account.sourceId }}
              >
                Alle Aufgaben dieser Quelle
              </AppLink>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
