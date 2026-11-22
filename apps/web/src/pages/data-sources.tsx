import { SpritmonitorSourceSection } from './spritmonitor-source';
import { Button, Field, SectionHead, Select, TextInput } from '@budget/ui';
import { AppLink } from '../shell/app-link';
import { todayInVienna } from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { request } from '../api/http';
import { AccountOptions } from '../ledger/account-options';
import { errorText } from '../ledger/labels';
import type { AccountRow } from '../ledger/types';
import { PAGES } from '../nav/pages';
import { PageFrame } from './placeholder-page';
import { CryptoReadSourceSection } from './read-source';
import { PayslipSourceSection } from '../reports/payslip-intake';
import './data-sources.css';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import { sourceDate } from './settings-source-card';
import { SettingsConnections } from './settings-connections';
import { BankSyncRecap } from '../inbox/bank-sync-recap';

type LinkedAccount = {
  locked: boolean;
  requestsToday: number;
  requestLimit: number;
  lastSyncAt: string | null;
  lastResult: { fetched: number; linked: number; new: number } | null;
  open: number;
  warnings: { id: string; title: string; detail: string | null }[];
  id: string;
  label: string;
  currency: string;
  accountId: string | null;
  fromDate: string | null;
};
type Connection = {
  bookedToLedger: boolean;
  manualBlockedReason: string | null;
  manualAvailableAt: string | null;
  running: boolean;
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
export type BankSourceStatus = {
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
  REDESIGN_ENABLED
    ? sourceDate(value)
    : value
      ? new Date(value).toLocaleString('de-AT')
      : 'Noch nicht';
const statuses: Record<string, string> = {
  active: 'Aktiv',
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
      {REDESIGN_ENABLED ? (
        <SettingsConnections
          bankConfiguration={(setupOpen, parentState) => (
            <BankSourceSection setupOpen={setupOpen} parentState={parentState} />
          )}
        />
      ) : (
        <div className="data-sources">
          <BankSourceSection />
          <CryptoReadSourceSection />
          <SpritmonitorSourceSection />
          <PayslipSourceSection />
        </div>
      )}
    </PageFrame>
  );
}

function BankSourceSection({
  setupOpen = true,
  parentState,
}: { setupOpen?: boolean; parentState?: string } = {}) {
  const query = useQuery({
    queryKey: ['bank-sync'],
    queryFn: () => request<BankSourceStatus>('GET', PATH),
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
      <div hidden={!setupOpen}>
        <SectionHead id="bank-source-title" title="Bank-Sync (PSD2)" />
        <p>
          Neue Verbindungen merken Umsätze unter Prüfen vor. Sie zählen erst nach deiner Bestätigung
          zum Kontostand. Vorhandene Buchungen werden abgeglichen.
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
        <div className="bank-connect" aria-label="Neue Bankverbindung">
          <h3>Bank verbinden</h3>
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
              data-source-bank-callback=""
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
                    data-source-bank-connect=""
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
                        data-source-bank-connect=""
                        type="search"
                        autoComplete="off"
                        placeholder="Bankname eintippen"
                        value={search}
                        onChange={(e) => {
                          setSearch(e.target.value);
                          const next = institutions.filter((a) =>
                            fold(a.name).includes(fold(e.target.value.trim())),
                          );
                          if (next.length === 1) setSelection(institutionKey(next[0]!));
                          else if (!next.some((a) => institutionKey(a) === selection))
                            setSelection('');
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
            </>
          )}
        </div>
      </div>
      {query.data?.configured && (
        <>
          {setupOpen && REDESIGN_ENABLED && <BankSyncRecap />}
          {query.data.connections.length === 0 && <p>Noch keine Bank verbunden.</p>}
          <p className="text-muted" hidden={!setupOpen}>
            Nächtlicher Abruf mit Nachholen nach Ausfällen. Das Tageslimit gilt pro Bankkonto und
            zählt auch Transaktionsseiten und Saldoanfragen.
          </p>
          {query.data.connections.map((connection) => (
            <ConnectionCard
              key={connection.id}
              connection={connection}
              setupOpen={setupOpen}
              parentState={parentState}
              parentSuccess={query.data.connections
                .flatMap(({ lastSuccessAt }) => (lastSuccessAt ? [lastSuccessAt] : []))
                .sort()
                .at(-1)}
              reconnect={() => {
                const toggle = document.getElementById('quelle-bank-details');
                if (toggle?.getAttribute('aria-expanded') === 'false') toggle.click();
                document.querySelector<HTMLButtonElement>('[data-source-bank-connect]')?.click();
              }}
              updatedAt={query.dataUpdatedAt}
              accounts={query.data.accounts}
              workerEnabled={query.data.workerEnabled !== false}
              refresh={async () => {
                await query.refetch();
              }}
            />
          ))}
        </>
      )}
    </section>
  );
}

function ConnectionCard({
  connection,
  parentState,
  parentSuccess,
  setupOpen,
  reconnect,
  updatedAt,
  accounts,
  workerEnabled,
  refresh,
}: {
  connection: Connection;
  parentState: string | undefined;
  parentSuccess: string | undefined;
  setupOpen: boolean;
  reconnect: () => void;
  updatedAt: number;
  accounts: Account[];
  workerEnabled: boolean;
  refresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function act(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      await action();
      setMessage(success);
      await refresh();
    } catch (caught) {
      setError(errorText(caught));
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  const blocked = !workerEnabled
    ? 'Bankabruf auf dem Server pausiert.'
    : connection.manualBlockedReason;
  const sync = () =>
    void act(
      () => request('POST', PATH + '/' + connection.id + '/sync', {}),
      'Abruf vorgemerkt. Das Ergebnis erscheint nach Abschluss hier; neue Umsätze unter Prüfen.',
    );
  const status = connection.running
    ? 'Abruf läuft'
    : connection.manualAvailableAt
      ? 'Pause bis ' + stamp(connection.manualAvailableAt)
      : connection.status === 'active' &&
          connection.validUntil &&
          Date.parse(connection.validUntil) - updatedAt <= 14 * 86_400_000
        ? 'Einwilligung läuft ab am ' + stamp(connection.validUntil)
        : (statuses[connection.status] ?? 'Bitte prüfen');
  return (
    <section className="source-connection" aria-label={connection.label}>
      <div className={REDESIGN_ENABLED ? 'settings-source-subrow' : undefined}>
        <strong>{connection.label}</strong>
        <span>
          {!REDESIGN_ENABLED ||
          (status !== parentState && !(status === 'Aktiv' && parentState === 'Verbunden'))
            ? status
            : null}
        </span>
        <span>
          {(!REDESIGN_ENABLED || connection.lastSuccessAt !== (parentSuccess ?? null)) && (
            <>Letzter Erfolg: {stamp(connection.lastSuccessAt)}</>
          )}
        </span>
        <div className="sources-actions">
          <Button
            data-source-bank-sync={encodeURIComponent(connection.id)}
            variant="ghost"
            size="sm"
            disabled={busy || Boolean(blocked)}
            onClick={sync}
          >
            Jetzt abrufen
          </Button>
          <Button
            data-source-bank-reconnect=""
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={reconnect}
          >
            Neu verbinden
          </Button>
        </div>
      </div>
      <dl className="source-status" hidden={!setupOpen}>
        <div>
          <dt>Abrufe heute</dt>
          <dd>
            {connection.accounts.map((a) => (
              <div key={a.id}>
                {a.label}: {a.requestsToday}/{a.requestLimit}
              </div>
            ))}
          </dd>
        </div>
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
          <dt>Nächster automatischer Abruf</dt>
          <dd>
            {!workerEnabled || connection.status === 'paused'
              ? 'Pausiert'
              : connection.status === 'expired'
                ? 'Neue Freigabe erforderlich'
                : stamp(
                    connection.manualAvailableAt &&
                      connection.manualAvailableAt > connection.nextRunAt
                      ? connection.manualAvailableAt
                      : connection.nextRunAt,
                  )}
          </dd>
        </div>
      </dl>
      <div className="sources-actions bank-sync-action">
        <Button
          variant="ghost"
          hidden={!setupOpen}
          disabled={
            busy || connection.running || connection.status === 'paused' || !connection.validUntil
          }
          onClick={() =>
            void act(
              () => request('POST', PATH + '/' + connection.id + '/pause', {}),
              'Verbindung pausiert. Eine neue Freigabe ist über „Bank verbinden“ möglich.',
            )
          }
        >
          Pausieren
        </Button>
      </div>
      {blocked && (
        <p
          className="kmeta"
          data-source-bank-blocked={encodeURIComponent(connection.id)}
          tabIndex={REDESIGN_ENABLED ? -1 : undefined}
        >
          {blocked}
          {connection.manualAvailableAt && <> Möglich ab {stamp(connection.manualAvailableAt)}.</>}
        </p>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <div hidden={!setupOpen}>
        <Field
          label="Gebuchte Umsätze"
          hint="Gilt beim nächsten Abruf. Bereits übernommene Buchungen bleiben erhalten."
        >
          {({ id }) => (
            <Select
              id={id}
              value={String(connection.bookedToLedger)}
              disabled={busy || connection.running}
              onChange={(e) =>
                void act(
                  () =>
                    request('PUT', PATH + '/' + connection.id + '/policy', {
                      bookedToLedger: e.target.value === 'true',
                    }),
                  'Übernahme gespeichert.',
                )
              }
            >
              <option value="false">Erst nach Bestätigung zählen</option>
              <option value="true">
                Sofort zum Kontostand zählen (Standard für neue Verbindungen)
              </option>
            </Select>
          )}
        </Field>
      </div>
      {connection.accounts.map((a) => (
        <div key={a.id} className="source-account-row">
          <AccountLink
            row={a}
            parentSuccess={parentSuccess}
            setupOpen={setupOpen}
            sync={sync}
            syncDisabled={busy || Boolean(blocked)}
            reconnect={reconnect}
            accounts={accounts}
            disabled={busy || connection.running || a.locked || connection.status === 'paused'}
            save={(accountId, fromDate) =>
              act(
                () => request('PUT', PATH + '/accounts/' + a.id, { accountId, fromDate }),
                'Kontozuordnung gespeichert.',
              )
            }
          />
          <div hidden={!setupOpen}>
            {a.lastResult ? (
              <>
                <h3>Letztes Ergebnis · {stamp(a.lastSyncAt)}</h3>
                <dl className="source-result">
                  <div>
                    <dt>Abgerufen</dt>
                    <dd>{a.lastResult.fetched}</dd>
                  </div>
                  <div>
                    <dt>Verknüpft</dt>
                    <dd>{a.lastResult.linked}</dd>
                  </div>
                  <div>
                    <dt>Neu vorgemerkt</dt>
                    <dd>{a.lastResult.new}</dd>
                  </div>
                  <div>
                    <dt>Offen zur Prüfung</dt>
                    <dd>{a.open}</dd>
                  </div>
                </dl>
                <p className="kmeta">
                  „Offen“ zeigt den aktuellen Prüfstand. Bei sofortiger Übernahme sind neue Umsätze
                  ungeprüfte Buchungen.
                </p>
              </>
            ) : (
              <p>
                {a.lastSyncAt
                  ? 'Für den früheren Abruf liegt keine Ergebnisübersicht vor.'
                  : 'Noch kein vollständiger Abruf.'}
              </p>
            )}
            {a.warnings?.map((w) => (
              <p className="field-error" key={w.id}>
                <TriangleAlert size={16} strokeWidth={1.75} aria-hidden="true" /> {w.title}:{' '}
                {w.detail}
              </p>
            ))}
          </div>
          {!REDESIGN_ENABLED && (
            <AppLink
              to="/konten/pruefen"
              search={{ bankSource: a.id }}
              className="btn btn-ghost"
              data-source-bank-review={encodeURIComponent(a.id)}
            >
              Aufgaben prüfen
            </AppLink>
          )}
        </div>
      ))}
    </section>
  );
}

function AccountLink({
  row,
  parentSuccess,
  setupOpen,
  sync,
  syncDisabled,
  reconnect,
  accounts,
  disabled,
  save,
}: {
  row: LinkedAccount;
  parentSuccess: string | undefined;
  setupOpen: boolean;
  sync: () => void;
  syncDisabled: boolean;
  reconnect: () => void;
  accounts: Account[];
  disabled: boolean;
  save: (account: string, from: string) => Promise<void>;
}) {
  const [accountId, setAccount] = useState(row.accountId ?? '');
  const [fromDate, setFrom] = useState(row.fromDate ?? todayInVienna());
  const changed =
    accountId !== (row.accountId ?? '') || fromDate !== (row.fromDate ?? todayInVienna());
  return (
    <form
      className={REDESIGN_ENABLED ? 'source-account settings-source-subrow' : 'source-account'}
      onSubmit={(event) => {
        event.preventDefault();
        void save(accountId, fromDate);
      }}
    >
      <p className="bank-account-name">
        <strong>{row.label}</strong> · {row.currency} →{' '}
        {accounts.find((a) => a.id === row.accountId)?.name ?? 'nicht zugeordnet'}
      </p>
      {REDESIGN_ENABLED && (
        <>
          <AppLink
            className="bank-account-review"
            hidden={row.open === 0 && row.warnings.length === 0}
            to="/konten/pruefen"
            search={{ bankSource: row.id }}
            data-source-bank-review={encodeURIComponent(row.id)}
          >
            {row.open > 0 ? `${row.open} zu prüfen` : 'Konto prüfen'}
          </AppLink>
          <span className="bank-account-time">
            {row.lastSyncAt !== (parentSuccess ?? null) && (
              <>Letzter Erfolg: {stamp(row.lastSyncAt)}</>
            )}
          </span>
        </>
      )}
      {row.currency !== 'EUR' && row.currency !== 'XXX' ? (
        <p>Diese Währung wird noch nicht unterstützt. Es werden keine Umsätze übernommen.</p>
      ) : (
        <>
          {row.currency === 'XXX' && (
            <p className="kmeta">
              Mehrwährungskonto: Es zählen die Umsätze in der Währung des gewählten Kontos. Umsätze
              in anderen Währungen werden nicht gebucht, sondern unter Prüfen zur Prüfung angezeigt.
            </p>
          )}
          <Field label="Konto in Budget">
            {({ id }) => (
              <Select
                id={id}
                data-source-bank-mapping={encodeURIComponent(row.id)}
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
          <div
            hidden={!setupOpen && accountId === (row.accountId ?? '') && Boolean(row.accountId)}
            className="bank-account-setup"
          >
            <Field label="Umsätze ab">
              {({ id }) => (
                <TextInput
                  id={id}
                  type="date"
                  required
                  value={fromDate}
                  disabled={disabled}
                  min={accounts.find((a) => a.id === accountId)?.openingDate}
                  max={todayInVienna()}
                  onChange={(e) => setFrom(e.target.value)}
                />
              )}
            </Field>
            <p className="kmeta">
              Ältere Umsätze werden mit vorhandenen Buchungen abgeglichen. Ein früheres Datum nur
              wählen, wenn dafür noch Buchungen fehlen.
            </p>
            <p className="kmeta">
              {row.locked
                ? 'Zuordnung nach dem ersten Abruf gesperrt. Für Änderungen bitte neu verbinden.'
                : disabled
                  ? 'Zuordnung während eines Abrufs oder bei pausierter Verbindung gesperrt.'
                  : !accountId
                    ? 'Bitte ein Konto wählen.'
                    : changed
                      ? 'Änderungen noch nicht gespeichert.'
                      : 'Zuordnung gespeichert. Keine Änderungen.'}
            </p>
          </div>
          <div className="bank-account-commands">
            <Button
              variant="ghost"
              size="sm"
              type="submit"
              disabled={disabled || !accountId || !changed}
            >
              {row.accountId ? 'Zuordnung speichern' : 'Konto zuordnen'}
            </Button>
            {REDESIGN_ENABLED &&
              (row.locked ? (
                <Button variant="ghost" size="sm" onClick={reconnect}>
                  Neu verbinden
                </Button>
              ) : (
                row.accountId && (
                  <Button variant="ghost" size="sm" disabled={syncDisabled} onClick={sync}>
                    Jetzt abrufen
                  </Button>
                )
              ))}
          </div>
        </>
      )}
    </form>
  );
}
