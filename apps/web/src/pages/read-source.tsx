import { Button, Field, SectionHead, Select, TextInput, WideDialog } from '@budget/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { SourceBalance, SourceMapping } from '@budget/domain';
import { request } from '../api/http';
import { INBOX_KEY } from '../inbox/api';
import { InboxWorkflow } from '../inbox/inbox-page';
import { AccountOptions } from '../ledger/account-options';
import { undoGroup } from '../ledger/api';
import type { AccountRow } from '../ledger/types';
import './read-source.css';
import {
  SettingsSourceCard,
  sourceDate,
  sourceReadState,
  type SourceRow,
  type SourceState,
} from './settings-source-card';
import { Bitcoin } from 'lucide-react';

interface SourceStatus {
  configured: boolean;
  running: boolean;
  lastSuccess: string | null;
  lastAttempt: string | null;
  status: 'idle' | 'ok' | 'partial' | 'failed';
  balances: SourceBalance[];
  mappings: SourceMapping[];
  since: string | null;
  match: MatchCounts;
  accounts: (Pick<AccountRow, 'id' | 'name' | 'onBudget' | 'sortOrder' | 'closedAt'> & {
    currency: string;
    type: AccountRow['type'];
  })[];
  securities: { id: string; name: string }[];
}
interface MatchCounts {
  matched: number;
  missing: number;
  unmapped: number;
  informational: number;
}
interface ReconcileResult extends MatchCounts {
  groupId: string | null;
  changed: number;
  ownerResolved: number;
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
const stamp = (value: string | null) => sourceDate(value);

export function CryptoReadSourceSection({ compact = false }: { compact?: boolean } = {}) {
  const source = useCryptoSource(compact);
  return source.row ? (
    <ul>
      <SettingsSourceCard {...source.row} />
    </ul>
  ) : (
    source.legacy
  );
}

export function useCryptoSource(compact: true): { row: SourceRow };
export function useCryptoSource(compact: boolean): { row?: SourceRow; legacy?: React.ReactNode };
export function useCryptoSource(compact: boolean) {
  const query = useQuery({ queryKey: key, queryFn: () => request<SourceStatus>('GET', path) });
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pages, setPages] = useState(0);
  const [reviewOpen, setReviewOpen] = useState(false);
  // The server reads one bounded page per call; keep fetching until the history is complete.
  async function refresh(fullHistory = false) {
    setBusy(true);
    setError('');
    setPages(0);
    try {
      let first = true;
      for (let page = 1; page <= MAX_PAGES; page++) {
        const result = await request<{ status: SourceStatus['status'] }>(
          'POST',
          path + '/refresh',
          {
            fullHistory: first && fullHistory,
          },
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
  if (compact) {
    const data = query.data;
    const state: SourceState = !data?.configured
      ? 'unconfigured'
      : data.status === 'failed'
        ? 'failed'
        : data.match.unmapped
          ? 'unmapped'
          : data.status === 'partial'
            ? 'partial'
            : busy || data.running
              ? 'running'
              : data.status === 'ok' && data.lastSuccess
                ? 'connected'
                : 'waiting';
    const impacts: Partial<Record<SourceState, string>> = {
      unconfigured: 'Für den Abruf fehlt der Lesezugang.',
      failed: 'Bewegungen konnten nicht vollständig abgerufen werden.',
      unmapped: `${data?.match.unmapped} Bewegungen haben kein zugeordnetes Konto.`,
      partial: 'Ein Teil der Bewegungen fehlt noch.',
      waiting: 'Bewegungen wurden noch nicht abgerufen.',
    };
    const action = (
      <Button
        variant={state === 'unmapped' || state === 'unconfigured' ? 'ghost' : 'primary'}
        disabled={busy || data?.running || !data?.configured}
        aria-busy={busy || data?.running}
        onClick={() => void refresh()}
      >
        {busy || data?.running
          ? 'Ruft ab …'
          : state === 'failed'
            ? 'Erneut versuchen'
            : state === 'partial'
              ? 'Abruf fortsetzen'
              : 'Jetzt abrufen'}
      </Button>
    );
    return {
      row: sourceReadState(query, {
        id: 'quelle-krypto',
        title: 'Krypto',
        icon: Bitcoin,
        scope: 'Bewegungen und Bestände',
        state,
        impact: impacts[state],
        date: data?.lastSuccess,
        initiallyOpen: window.location.hash === '#crypto-source-title',
        detailAction:
          state === 'unmapped'
            ? { label: 'Konto zuordnen', target: '[data-source-mapping]:enabled' }
            : state === 'unconfigured'
              ? { label: 'Einrichten' }
              : undefined,
        action,
        content: () =>
          data && (
            <>
              <div className="settings-source-subrow">
                <span>Bewegungen</span>
                <a
                  href="#crypto-movements"
                  onClick={(event) => {
                    event.preventDefault();
                    setReviewOpen(true);
                  }}
                >
                  {data.match.missing + data.match.unmapped > 0
                    ? `${data.match.missing + data.match.unmapped} zu prüfen`
                    : 'Bewegungen prüfen'}
                </a>
                <span>
                  {[
                    data.match.matched > 0 ? `${data.match.matched} erfasst` : null,
                    data.match.informational > 0 ? `${data.match.informational} informativ` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'keine neuen Bewegungen'}
                </span>
                <div className="sources-actions">
                  {(state === 'unmapped' || state === 'unconfigured') && action}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy || data.running || !data.configured}
                    onClick={() => void refresh(true)}
                  >
                    Gesamten Verlauf prüfen
                  </Button>
                </div>
              </div>
              {reviewOpen && (
                <WideDialog
                  open
                  title="Krypto-Bewegungen prüfen"
                  onClose={() => setReviewOpen(false)}
                >
                  <InboxWorkflow readSource="crypto" />
                </WideDialog>
              )}
            </>
          ),
        children: (
          <>
            {query.data && (
              <>
                <h3 id="crypto-source-title">Krypto-Lesequelle</h3>
                <p>Schlüssel gesetzt: {query.data.configured ? 'ja' : 'nein'}</p>
                <p>
                  Letzter Versuch: {stamp(query.data.lastAttempt)} ·{' '}
                  <span>{labels[query.data.status]}</span>. Ein- und Auszahlungen mit den Bankkonten
                  abgleichen. Buchungen und Trades bestätigst du selbst.
                </p>
                <SinceForm saved={query.data.since} />
                <MatchSection match={query.data.match} disabled={busy || query.data.running} />
                <Button variant="ghost" onClick={() => setReviewOpen(true)}>
                  Bewegungen prüfen
                </Button>
                {query.data.balances.map((balance) => (
                  <Mapping key={balance.key} balance={balance} data={query.data!} />
                ))}
              </>
            )}
            {error && <p role="alert">{error}</p>}
          </>
        ),
      }),
    };
  }
  const legacy = (
    <section aria-labelledby="crypto-source-title" className="data-source-section">
      <SectionHead id="crypto-source-title" title="Krypto-Lesequelle" />
      <p>
        Bewegungen werden hier geprüft. Ein- und Auszahlungen mit den Bankkonten abgleichen.
        Buchungen und Trades bestätigst du selbst.
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
              {query.data?.status === 'partial' ? 'Abruf fortsetzen' : 'Jetzt abrufen'}
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
          <SinceForm saved={query.data.since} />
          <MatchSection match={query.data.match} disabled={busy || query.data.running} />
          <InboxWorkflow readSource="crypto" />
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
  return { legacy };
}
function MatchSection({ match, disabled }: { match: MatchCounts; disabled: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [undoable, setUndoable] = useState<string | null>(null);
  const client = useQueryClient();
  async function refreshViews() {
    await client.invalidateQueries({ queryKey: key });
    await client.invalidateQueries({ queryKey: INBOX_KEY });
  }
  async function run() {
    setBusy(true);
    setMessage('');
    setUndoable(null);
    try {
      const result = await request<ReconcileResult>('POST', path + '/reconcile');
      setMessage(
        result.changed === 0
          ? 'Abgleich ausgeführt. Keine Änderung an den Quellbewegungen.'
          : `Abgleich ausgeführt. ${result.changed} ${result.changed === 1 ? 'Eintrag' : 'Einträge'} in der Datenquelle aktualisiert.`,
      );
      setUndoable(result.groupId);
      await refreshViews();
    } catch {
      setMessage('Abgleich nicht ausgeführt. Anmeldung prüfen und erneut versuchen.');
    } finally {
      setBusy(false);
    }
  }
  async function undo() {
    if (!undoable) return;
    setBusy(true);
    try {
      await undoGroup(undoable);
      setUndoable(null);
      setMessage('Abgleich rückgängig gemacht.');
      await refreshViews();
    } catch {
      setMessage('Rückgängig nicht möglich. Die Quellbewegungen haben sich inzwischen geändert.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="source-mapping">
      <h3>Abgleich mit dem Hauptbuch</h3>
      <p>
        Jede Bewegung ab dem Startdatum wird mit den vorhandenen Trades und Buchungen der
        zugeordneten Konten verglichen. Treffer gelten als erfasst, alles andere bleibt hier zur
        Prüfung. Es werden nie automatisch Buchungen oder Trades angelegt.
      </p>
      <dl className="source-status">
        <div>
          <dt>Erfasst</dt>
          <dd>{match.matched}</dd>
        </div>
        <div>
          <dt>Fehlt in der App</dt>
          <dd>{match.missing}</dd>
        </div>
        <div>
          <dt>Ohne Zuordnung</dt>
          <dd>{match.unmapped}</dd>
        </div>
        <div>
          <dt>Informativ</dt>
          <dd>{match.informational}</dd>
        </div>
      </dl>
      <p>
        Vorschau auf Basis des aktuellen Hauptbuchs. „Abgleich neu ausführen“ prüft auch Bewegungen,
        die früher pauschal erledigt wurden, und öffnet fehlende wieder. Von dir erledigte Einträge
        bleiben unverändert. Nach neuen Zuordnungen oder Buchungen erneut ausführen.
      </p>
      <div className="sources-actions">
        <Button disabled={busy || disabled} onClick={() => void run()}>
          Abgleich neu ausführen
        </Button>
        {undoable && (
          <Button variant="ghost" disabled={busy} onClick={() => void undo()}>
            Rückgängig
          </Button>
        )}
      </div>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
function SinceForm({ saved }: { saved: string | null }) {
  const [since, setSince] = useState(saved ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const client = useQueryClient();
  async function save() {
    setBusy(true);
    setMessage('');
    try {
      await request('PUT', path + '/since', { since: since || null });
      await client.invalidateQueries({ queryKey: key });
      await client.invalidateQueries({ queryKey: INBOX_KEY });
      setMessage(
        since
          ? 'Startdatum gespeichert. Ältere offene Bewegungen wurden abgeschlossen.'
          : 'Startdatum entfernt. Der nächste Abruf prüft alle Bewegungen.',
      );
    } catch {
      setMessage('Startdatum nicht gespeichert. Datum und Anmeldung prüfen.');
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
      <Field
        label="Bewegungen ab"
        hint="Ältere Bewegungen sind bereits erfasst und erscheinen nicht in der Prüfliste. Ein früheres Datum holt ältere Bewegungen beim nächsten „Gesamten Verlauf prüfen“ in die Prüfliste."
      >
        {({ id, describedBy }) => (
          <TextInput
            id={id}
            aria-describedby={describedBy}
            type="date"
            value={since}
            disabled={busy}
            onChange={(e) => setSince(e.target.value)}
          />
        )}
      </Field>
      <Button type="submit" disabled={busy || since === (saved ?? '')}>
        Startdatum speichern
      </Button>
      {message && <p role="status">{message}</p>}
    </form>
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
      await request('PUT', path + '/mapping', {
        key: balance.key,
        accountId,
        securityId: asset ? securityId : null,
      });
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
            data-source-mapping={!saved ? '' : undefined}
            id={id}
            value={accountId}
            disabled={busy}
            required
            onChange={(e) => setAccountId(e.target.value)}
          >
            <option value="">Konto auswählen</option>
            <AccountOptions accounts={accounts} keepId={accountId} />
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
