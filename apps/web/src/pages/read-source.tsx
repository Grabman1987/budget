import { Button, Field, SectionHead, Select } from '@budget/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { SourceBalance, SourceMapping } from '@budget/domain';
import { request } from '../api/http';
import { INBOX_KEY } from '../inbox/api';
import { withStepUp } from '../auth/webauthn';
import './read-source.css';

interface SourceStatus {
  configured: boolean;
  running: boolean;
  lastSuccess: string | null;
  lastAttempt: string | null;
  status: 'idle' | 'ok' | 'partial' | 'failed';
  balances: SourceBalance[];
  mappings: SourceMapping[];
  accounts: { id: string; name: string; currency: string; type: string }[];
  securities: { id: string; name: string }[];
}
const path = '/api/sources/crypto';
/** Upper bound per click (25 operations per page); the background tick continues afterwards. */
const MAX_PAGES = 200;
const key = ['read-source', 'crypto'] as const;
const labels = {
  idle: 'Noch nicht abgerufen',
  ok: 'Abruf abgeschlossen',
  partial: 'Weitere Seiten ausständig',
  failed: 'Abruf fehlgeschlagen',
};
const stamp = (value: string | null) =>
  value ? new Date(value).toLocaleString('de-AT') : 'Noch nicht';

export function CryptoReadSourceSection() {
  const query = useQuery({ queryKey: key, queryFn: () => request<SourceStatus>('GET', path) });
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pages, setPages] = useState(0);
  // The server reads one bounded page per call; keep fetching until the history is complete.
  async function refresh(fullHistory = false) {
    setBusy(true);
    setError('');
    setPages(0);
    try {
      let first = true;
      for (let page = 1; page <= MAX_PAGES; page++) {
        const result = await withStepUp(() =>
          request<{ status: SourceStatus['status'] }>('POST', path + '/refresh', {
            fullHistory: first && fullHistory,
          }),
        );
        first = false;
        setPages(page);
        if (result.status !== 'partial') break;
        if (page % 5 === 0) await client.invalidateQueries({ queryKey: key });
      }
    } catch {
      setError('Abruf nicht abgeschlossen. Anmeldung, Schlüssel und Verbindung prüfen.');
    } finally {
      await client.invalidateQueries({ queryKey: key });
      await client.invalidateQueries({ queryKey: INBOX_KEY });
      setBusy(false);
      setPages(0);
    }
  }
  return (
    <section aria-labelledby="crypto-source-title" className="data-source-section">
      <SectionHead id="crypto-source-title" title="Krypto-Lesequelle" />
      <p>
        Bewegungen erscheinen zur Prüfung im Posteingang. Ein- und Auszahlungen dort mit den
        Bankkonten abgleichen. Buchungen und Trades bestätigst du selbst.
      </p>
      {query.isPending && <p role="status">Lädt …</p>}
      {query.isError && (
        <p role="alert">
          Datenquelle konnte nicht geladen werden.{' '}
          <Button onClick={() => void query.refetch()}>Erneut laden</Button>
        </p>
      )}
      {query.data && !query.isError && (
        <>
          <p>Schlüssel gesetzt: {query.data.configured ? 'ja' : 'nein'}</p>
          <dl className="source-status">
            <div>
              <dt>Status</dt>
              <dd>
                {busy
                  ? `Abruf läuft … ${pages ? `${pages} ${pages === 1 ? 'Seite' : 'Seiten'} geholt` : ''}`
                  : query.data.running
                    ? 'Abruf läuft …'
                    : labels[query.data.status]}
              </dd>
            </div>
            <div>
              <dt>Letztes abgeschlossenes Bewegungsfenster</dt>
              <dd>{stamp(query.data.lastSuccess)}</dd>
            </div>
            <div>
              <dt>Letzter Versuch</dt>
              <dd>{stamp(query.data.lastAttempt)}</dd>
            </div>
          </dl>
          <div className="sources-actions">
            <Button
              disabled={busy || query.data.running || !query.data.configured}
              onClick={() => void refresh()}
            >
              {query.data.status === 'partial' ? 'Abruf fortsetzen' : 'Jetzt abrufen'}
            </Button>
            <Button
              variant="ghost"
              disabled={busy || query.data.running || !query.data.configured}
              onClick={() => void refresh(true)}
            >
              Gesamten Verlauf prüfen
            </Button>
          </div>
          <p>
            Ein Klick holt den ganzen ausstehenden Verlauf. Außerdem ruft die App die Quelle im
            Hintergrund automatisch ab. Ein Schlüssel mit Leserechten wird ausschließlich am Server
            gesetzt.
          </p>
          {query.data.balances.map((balance) => (
            <Mapping key={balance.key} balance={balance} data={query.data} />
          ))}
        </>
      )}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
    </section>
  );
}
function Mapping({ balance, data }: { balance: SourceBalance; data: SourceStatus }) {
  const saved = data.mappings.find((m) => m.key === balance.key);
  const [accountId, setAccountId] = useState(saved?.accountId ?? '');
  const [securityId, setSecurityId] = useState(saved?.securityId ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const client = useQueryClient();
  const asset = Boolean(balance.amount.assetId);
  const accounts = data.accounts.filter((a) =>
    asset ? ['brokerage', 'crypto'].includes(a.type) : a.currency === balance.currency,
  );
  async function save() {
    setBusy(true);
    setMessage('');
    try {
      await withStepUp(() =>
        request('PUT', path + '/mapping', {
          key: balance.key,
          accountId,
          securityId: asset ? securityId : null,
        }),
      );
      await client.invalidateQueries({ queryKey: key });
      await client.invalidateQueries({ queryKey: INBOX_KEY });
      setMessage('Zuordnung gespeichert. Der nächste Abruf vergleicht die Salden.');
    } catch {
      setMessage('Zuordnung nicht gespeichert. Konto, Instrument und Anmeldung prüfen.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      className="source-mapping"
    >
      <h3>
        {balance.label ?? (balance.currency ? 'Guthaben ' + balance.currency : 'Instrument')} ·{' '}
        {balance.key}
      </h3>
      <p>
        {balance.issue ? (
          'Quellbestand nicht verfügbar. Datenformat oder doppelte Saldozeilen prüfen.'
        ) : (
          <>
            Quellbestand: {balance.amount.value.replace('.', ',')}
            {balance.currency ? ' ' + balance.currency : ' Anteile'}
          </>
        )}
      </p>
      <Field label={asset ? 'Anlagekonto' : 'Verrechnungskonto'}>
        {({ id }) => (
          <Select
            id={id}
            value={accountId}
            disabled={busy}
            required
            onChange={(e) => setAccountId(e.target.value)}
          >
            <option value="">Konto auswählen</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.currency})
              </option>
            ))}
          </Select>
        )}
      </Field>
      {asset && (
        <Field label="Instrument">
          {({ id }) => (
            <Select
              id={id}
              value={securityId}
              disabled={busy}
              required
              onChange={(e) => setSecurityId(e.target.value)}
            >
              <option value="">Instrument auswählen</option>
              {data.securities.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      <Button type="submit" disabled={busy || !accountId || (asset && !securityId)}>
        Zuordnung speichern
      </Button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
