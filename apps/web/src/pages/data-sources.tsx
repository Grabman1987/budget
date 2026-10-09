import { Button, Field, SectionHead, Select, TextInput } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { request } from '../api/http';
import { AccountOptions } from '../ledger/account-options';
import { errorText } from '../ledger/labels';
import type { AccountRow } from '../ledger/types';
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
  bookedToLedger: boolean;
  id: string;
  label: string;
  status: string;
  validUntil: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  nextRunAt: string;
  accounts: LinkedAccount[];
};
type Account = Pick<AccountRow, 'id' | 'name' | 'type' | 'onBudget' | 'sortOrder' | 'closedAt'> & {
  currency: string;
  openingDate: string;
};
type Status = {
  workerEnabled?: boolean;
  configured: boolean;
  connections: Connection[];
  accounts: Account[];
};
type Institution = { name: string; country: string };
const institutionKey = (a: Institution) => a.country + ':' + a.name;
/** Case- and accent-insensitive search text ("spängler" finds "Spängler" and "Spangler"). */
const fold = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('de');
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
  const [search, setSearch] = useState('');
  const matches = institutions.filter((a) => fold(a.name).includes(fold(search.trim())));
  const chosen = institutions.find((a) => institutionKey(a) === selection);
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
        Gebuchte Bankumsätze zählen sofort zum Kontostand und bleiben ohne Kategorie zur Prüfung im
        Posteingang. Vorgemerkte Bankumsätze zählen erst nach deiner Bestätigung.
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
              await request('POST', PATH + '/callback', {
                code: callback.code,
                state: callback.state,
              });
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
          {callback.code ? null : institutions.length === 0 ? (
            <div className="sources-actions">
              <Button
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    const data = await request<{ institutions: Institution[] }>(
                      'GET',
                      PATH + '/institutions',
                    );
                    setInstitutions(
                      [...data.institutions].sort((a, b) =>
                        a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }),
                      ),
                    );
                  }, '')
                }
              >
                Bank verbinden
              </Button>
            </div>
          ) : (
            <div className="bank-picker">
              <Field label="Bank suchen">
                {({ id }) => (
                  <TextInput
                    id={id}
                    type="search"
                    autoComplete="off"
                    placeholder="Name eintippen, z. B. Dadat oder PayPal"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      const next = institutions.filter((a) =>
                        fold(a.name).includes(fold(e.target.value.trim())),
                      );
                      if (next.length === 1) setSelection(institutionKey(next[0]!));
                      else if (!next.some((a) => institutionKey(a) === selection)) setSelection('');
                    }}
                  />
                )}
              </Field>
              <Field label={`Institut (${matches.length} von ${institutions.length})`}>
                {({ id }) => (
                  <Select
                    id={id}
                    size={Math.min(8, Math.max(matches.length, 2))}
                    value={selection}
                    onChange={(e) => setSelection(e.target.value)}
                  >
                    {matches.map((a) => (
                      <option key={institutionKey(a)} value={institutionKey(a)}>
                        {a.name}
                        {a.country === 'AT' ? '' : ' · ' + a.country}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              {matches.length === 0 && <p role="status">Keine Bank gefunden.</p>}
              <div className="sources-actions">
                <Button
                  disabled={busy || !chosen}
                  onClick={() =>
                    void act(async () => {
                      const result = await request<{ url: string }>('POST', PATH + '/auth', {
                        name: chosen!.name,
                        country: chosen!.country,
                      });
                      window.location.assign(result.url);
                    }, '')
                  }
                >
                  {chosen ? `Weiter zur Freigabe bei ${chosen.name}` : 'Zur Bankfreigabe'}
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setInstitutions([]);
                    setSearch('');
                    setSelection('');
                  }}
                >
                  Abbrechen
                </Button>
              </div>
            </div>
          )}
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
              <Field
                label="Gebuchte Umsätze"
                hint="Gilt beim nächsten Abruf. Bereits übernommene Buchungen bleiben erhalten. Kategorien vergibst du selbst."
              >
                {({ id }) => (
                  <Select
                    id={id}
                    value={String(connection.bookedToLedger ?? true)}
                    disabled={busy}
                    onChange={(e) => {
                      const bookedToLedger = e.target.value === 'true';
                      void act(
                        () =>
                          request('PUT', PATH + '/' + connection.id + '/policy', {
                            bookedToLedger,
                          }),
                        'Übernahme gespeichert.',
                      );
                    }}
                  >
                    <option value="true">Sofort zum Kontostand zählen (Standard)</option>
                    <option value="false">Erst nach Bestätigung zählen</option>
                  </Select>
                )}
              </Field>
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
                      () => request('PUT', PATH + '/accounts/' + a.id, { accountId, fromDate }),
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
                        () => request('POST', PATH + '/' + connection.id + '/pause', {}),
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
                <AccountOptions accounts={accounts} keepId={accountId} />
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
