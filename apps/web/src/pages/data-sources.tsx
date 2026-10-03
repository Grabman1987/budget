import { Button, Field, SectionHead, Select, TextInput } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { request } from '../api/http';
import { withStepUp } from '../auth/webauthn';
import { errorText } from '../ledger/labels';
import { PAGES } from '../nav/pages';
import { PageFrame } from './placeholder-page';
import { CryptoReadSourceSection } from './read-source';
import { PayslipSourceSection } from '../reports/payslip-intake';
import './data-sources.css';

type LinkedAccount = {
  locked: boolean;
  id: string;
  label: string;
  currency: string;
  accountId: string | null;
  fromDate: string | null;
};
type Connection = {
  id: string;
  label: string;
  status: string;
  validUntil: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  nextRunAt: string;
  accounts: LinkedAccount[];
};
type Account = { id: string; name: string; currency: string; openingDate: string };
type Status = {
  workerEnabled?: boolean;
  configured: boolean;
  connections: Connection[];
  accounts: Account[];
};
type Institution = { name: string; country: string };
const PATH = '/api/bank-sync';
const stamp = (value: string | null) =>
  value ? new Date(value).toLocaleString('de-AT') : 'Noch nicht';
const statuses: Record<string, string> = {
  active: 'Verbunden',
  expired: 'Einwilligung abgelaufen',
  pending: 'Freigabe offen',
  error: 'Abruf fehlgeschlagen',
  failed: 'Verbindung fehlgeschlagen',
  paused: 'Pausiert',
};

export function DataSourcesPage() {
  return (
    <PageFrame
      meta={PAGES.find((p) => p.path === '/einstellungen/datenquellen')!}
      revealCurrentRegister
    >
      <div className="data-sources">
        <BankSourceSection />
        <CryptoReadSourceSection />
        <PayslipSourceSection />
      </div>
    </PageFrame>
  );
}

function BankSourceSection() {
  const query = useQuery({
    queryKey: ['bank-sync'],
    queryFn: () => request<Status>('GET', PATH),
    refetchInterval: 30_000,
  });
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [selection, setSelection] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [callback, setCallback] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return { code: params.get('code'), state: params.get('state'), error: params.has('error') };
  });
  useEffect(() => {
    if (callback.code || callback.error)
      window.history.replaceState(null, '', window.location.pathname);
  }, [callback]);
  async function act(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
      setMessage(message);
      await query.refetch();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="data-source-section" aria-labelledby="bank-source-title">
      <SectionHead id="bank-source-title" title="Bank-Sync (PSD2)" />
      <p>
        Gebuchte Bankumsätze landen zur Prüfung im Posteingang. Erst deine Bestätigung erstellt eine
        Buchung.
      </p>
      {query.isPending && <p role="status">Datenquellen werden geladen …</p>}
      {query.isError && (
        <p role="alert">
          Datenquellen konnten nicht geladen werden.{' '}
          <Button variant="ghost" onClick={() => void query.refetch()}>
            Erneut laden
          </Button>
        </p>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {callback.error && (
        <p role="alert">Die Bankfreigabe wurde abgebrochen. Bitte erneut verbinden.</p>
      )}
      {callback.code && callback.state && (
        <Button
          disabled={busy}
          onClick={() =>
            void act(async () => {
              await withStepUp(() =>
                request('POST', PATH + '/callback', {
                  code: callback.code,
                  state: callback.state,
                }),
              );
              setCallback({ code: null, state: null, error: false });
            }, 'Bankfreigabe gespeichert. Bitte die Konten zuordnen.')
          }
        >
          Bankfreigabe abschließen
        </Button>
      )}
      {query.data && !query.data.configured && (
        <p>
          Bank-Sync ist noch nicht eingerichtet. Die Zugangsdaten müssen zuerst auf dem Server
          hinterlegt werden.
        </p>
      )}
      {query.data?.workerEnabled === false && (
        <p role="status">
          Der Bankabruf ist auf dem Server pausiert. Auch manuelle Abrufe warten bis zur
          Aktivierung.
        </p>
      )}
      {query.data?.configured && (
        <>
          <div className="sources-actions">
            <Button
              disabled={busy}
              variant="ghost"
              onClick={() =>
                void act(async () => {
                  const data = await withStepUp(() =>
                    request<{ institutions: Institution[] }>('GET', PATH + '/institutions'),
                  );
                  setInstitutions(data.institutions);
                }, 'Verfügbare Institute geladen.')
              }
            >
              Bank verbinden
            </Button>
            {institutions.length > 0 && (
              <>
                <Field label="Institut">
                  {({ id }) => (
                    <Select
                      id={id}
                      value={selection}
                      onChange={(e) => setSelection(e.target.value)}
                    >
                      <option value="">Institut wählen</option>
                      {institutions.map((a, i) => (
                        <option key={a.name + a.country} value={i}>
                          {a.name} · {a.country}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Button
                  disabled={busy || !selection}
                  onClick={() =>
                    void act(async () => {
                      const institution = institutions[Number(selection)]!;
                      const result = await withStepUp(() =>
                        request<{ url: string }>('POST', PATH + '/auth', {
                          name: institution.name,
                          country: institution.country,
                        }),
                      );
                      window.location.assign(result.url);
                    }, '')
                  }
                >
                  Zur Bankfreigabe
                </Button>
              </>
            )}
          </div>
          {query.data.connections.length === 0 && <p>Noch keine Bank verbunden.</p>}
          <p className="text-muted">
            Nächtlicher Abruf mit Nachholen nach Ausfällen. Bei Fehlern gilt eine Abrufpause.
            Einwilligungen werden 14 Tage vor Ablauf im Posteingang angezeigt.
          </p>
          {query.data.connections.map((connection) => (
            <section
              className="source-connection"
              key={connection.id}
              aria-label={connection.label}
            >
              <SectionHead
                title={connection.label}
                aside={statuses[connection.status] ?? 'Bitte prüfen'}
              />
              <dl className="source-status">
                <div>
                  <dt>Letzter Versuch</dt>
                  <dd>{stamp(connection.lastAttemptAt)}</dd>
                </div>
                <div>
                  <dt>Letzter erfolgreicher Abruf</dt>
                  <dd>{stamp(connection.lastSuccessAt)}</dd>
                </div>
                <div>
                  <dt>Einwilligung bis</dt>
                  <dd>{stamp(connection.validUntil)}</dd>
                </div>
                <div>
                  <dt>Nächster Abruf</dt>
                  <dd>
                    {connection.status === 'paused' ? 'Pausiert' : stamp(connection.nextRunAt)}
                  </dd>
                </div>
              </dl>
              {connection.accounts.map((a) => (
                <AccountLink
                  key={a.id}
                  row={a}
                  accounts={query.data.accounts}
                  disabled={busy || a.locked || connection.status === 'paused'}
                  save={(accountId, fromDate) =>
                    act(
                      () =>
                        withStepUp(() =>
                          request('PUT', PATH + '/accounts/' + a.id, { accountId, fromDate }),
                        ),
                      'Kontozuordnung gespeichert.',
                    )
                  }
                />
              ))}
              {connection.validUntil && connection.status !== 'paused' && (
                <div className="sources-actions">
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void act(
                        () => request('POST', PATH + '/' + connection.id + '/sync', {}),
                        'Abruf vorgemerkt. Neue Umsätze erscheinen im Posteingang.',
                      )
                    }
                  >
                    Jetzt abrufen
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      void act(
                        () =>
                          withStepUp(() =>
                            request('POST', PATH + '/' + connection.id + '/pause', {}),
                          ),
                        'Verbindung pausiert. Eine neue Freigabe ist über „Bank verbinden“ möglich.',
                      )
                    }
                  >
                    Verbindung pausieren
                  </Button>
                </div>
              )}
            </section>
          ))}
        </>
      )}
    </section>
  );
}

function AccountLink({
  row,
  accounts,
  disabled,
  save,
}: {
  row: LinkedAccount;
  accounts: Account[];
  disabled: boolean;
  save: (account: string, from: string) => Promise<void>;
}) {
  const [accountId, setAccount] = useState(row.accountId ?? '');
  const [fromDate, setFrom] = useState(row.fromDate ?? new Date().toISOString().slice(0, 10));
  return (
    <form
      className="source-account"
      onSubmit={(event) => {
        event.preventDefault();
        void save(accountId, fromDate);
      }}
    >
      <p>
        {row.label} · {row.currency}
      </p>
      {row.currency !== 'EUR' ? (
        <p>Diese Währung wird noch nicht unterstützt. Es werden keine Umsätze übernommen.</p>
      ) : (
        <>
          <Field label="Konto in Budget">
            {({ id }) => (
              <Select
                id={id}
                value={accountId}
                required
                disabled={disabled}
                onChange={(e) => setAccount(e.target.value)}
              >
                <option value="">Konto wählen</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Umsätze ab">
            {({ id }) => (
              <TextInput
                id={id}
                type="date"
                required
                value={fromDate}
                disabled={disabled}
                min={accounts.find((a) => a.id === accountId)?.openingDate}
                onChange={(e) => setFrom(e.target.value)}
              />
            )}
          </Field>
          <Button variant="ghost" type="submit" disabled={disabled || !accountId}>
            {row.accountId ? 'Zuordnung speichern' : 'Konto zuordnen'}
          </Button>
        </>
      )}
    </form>
  );
}
