import { Button, Field, TextInput, useAmountPrivacy, useToast } from '@budget/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { request } from '../api/http';
import { AppLink } from '../shell/app-link';
import { longDay } from '../ledger/format';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { LEDGER_KEY } from '../ledger/queries';
import { INBOX_KEY } from './api';
import {
  ArivaLinkField,
  ARIVA_LINK_ERROR,
  validArivaLink,
  quoteFailureText,
  latestQuoteFailure,
} from '../wealth/quote-source';
import { quoteText } from '../wealth/portfolio-format';

export type MarketRunSummary = { finishedAt: string; status: string; errorClasses: string | null };
type Quote = { date: string; priceMicro: number; sourceCurrency?: string };
export interface QuoteAttempt {
  source: string;
  attemptedAt: string;
  outcome: string;
  httpStatus: number | null;
  detail: string | null;
}
export interface QuoteDiagnostics {
  securityId: string;
  name: string;
  currency: string;
  symbol: string | null;
  coingeckoId: string | null;
  hasQuoteUrl: boolean;
  /** Ariva exchange of the mapping (#1203); older responses omit the fields below. */
  quoteExchange?: string | null;
  pricesEnabled?: boolean;
  /** `false`: no current holding, a "historischer Bestand". */
  held?: boolean;
  /** Owner choice "mit EZB-Kurs umrechnen": the currency the source quotes in. */
  quoteFxCurrency?: string | null;
  /** Newest attempts first (#1203). */
  attempts?: QuoteAttempt[];
  lastRun?: MarketRunSummary | null;
  lastSuccessRun?: MarketRunSummary | null;
  asOf: string;
  latest: (Quote & { source: string; currency: string }) | null;
  movements: { id: string; date: string; kind: string }[];
}
export interface QuotePreview {
  securityId: string;
  currency: string;
  symbol?: string | null;
  /** Time of this test (#1203). */
  testedAt?: string;
  from: string;
  to: string;
  attempts: {
    source: string;
    error: string | null;
    latest: Quote | null;
    currencyEvidence?: { currency: string; origin: 'response' | 'mapping' } | null;
  }[];
}

const ERRORS: Record<string, string> = {
  timeout: 'Die Quelle hat nicht rechtzeitig geantwortet.',
  parse: 'Die Antwort konnte nicht gelesen werden.',
};

const attemptText = (a: QuoteAttempt, currency: string): string =>
  a.outcome === 'ok'
    ? `erfolgreich${a.detail ? ` (${a.detail})` : ''}`
    : `${ERRORS[a.outcome] ?? quoteFailureText(a.outcome, currency)}${a.httpStatus !== null ? ` (HTTP ${a.httpStatus})` : ''}`;
const attemptTime = (a: QuoteAttempt): string =>
  `${new Date(a.attemptedAt).toLocaleString('de-AT')} · ${a.source}`;

export function QuoteCause({
  securityId,
  createdAt,
  detail,
}: {
  securityId: string;
  createdAt: string;
  detail: string | null;
}) {
  useAmountPrivacy();
  const path = `/api/securities/${encodeURIComponent(securityId)}`;
  const query = useQuery({
    queryKey: [...LEDGER_KEY, 'quote-diagnostics', securityId],
    queryFn: () => request<QuoteDiagnostics>('GET', `${path}/quote-diagnostics`),
  });
  const preview = useMutation({
    mutationFn: () => request<QuotePreview>('POST', `${path}/quote-preview`, {}),
  });
  const qc = useQueryClient(),
    toast = useToast(),
    [reason, setReason] = useState('');
  const [quoteUrl, setQuoteUrl] = useState('');
  const [linkError, setLinkError] = useState<string>();
  const saveLink = useMutation({
    mutationFn: () => request('PATCH', path, { quoteUrl: quoteUrl.trim() }),
    onSuccess: async () => {
      setQuoteUrl('');
      toast.show({
        message: 'Kurs-Link gespeichert. Die Quelle kann jetzt erneut getestet werden.',
      });
      await qc.invalidateQueries({ queryKey: LEDGER_KEY });
    },
  });
  const decide = useMutation({
    mutationFn: (mode: 'manual_only' | 'fetch_off') =>
      request<{ resolved: number; groupId: string }>('POST', `${path}/quote-source-decision`, {
        mode,
        reason: reason.trim(),
      }),
    onSuccess: async (_result, mode) => {
      setReason('');
      toast.show({
        message:
          mode === 'manual_only'
            ? 'Nur manuelle Kurse: Der automatische Abruf ist aus, die Warnung ist erledigt.'
            : 'Automatischer Abruf abgeschaltet, die Warnung ist erledigt.',
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: INBOX_KEY }),
        qc.invalidateQueries({ queryKey: LEDGER_KEY }),
      ]);
    },
  });
  const convert = useMutation({
    mutationFn: (currency: string | null) =>
      request<{ quoteFxCurrency: string | null }>('POST', `${path}/quote-fx-currency`, {
        currency,
      }),
    onSuccess: async (result) => {
      toast.show({
        message: result.quoteFxCurrency
          ? `Umrechnung mit EZB-Kurs gespeichert (${result.quoteFxCurrency}). Sie gilt ab dem nächsten Kursabruf; die Warnung schließt danach von selbst.`
          : 'Umrechnung aufgehoben.',
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: [...LEDGER_KEY, 'quote-diagnostics', securityId] }),
        qc.invalidateQueries({ queryKey: INBOX_KEY }),
      ]);
    },
  });
  if (query.isPending) return <LoadingNote what="Kursursache" />;
  if (query.isError)
    return (
      <ErrorNote what="Kursursache" error={query.error} onRetry={() => void query.refetch()} />
    );
  const data = query.data;
  const latestFailure = latestQuoteFailure(data.attempts);
  return (
    <section className="quote-cause" aria-label="Kursursache">
      <p>
        Warnung vom {longDay(createdAt.slice(0, 10))}:{' '}
        {detail?.startsWith('Fehlerklasse: ')
          ? quoteFailureText(detail.slice('Fehlerklasse: '.length), data.currency)
          : (detail ?? 'Fehlerklasse nicht gespeichert.')}
      </p>
      {!data.hasQuoteUrl && !data.coingeckoId && (
        <div>
          <p>Kein Kurs-Link hinterlegt</p>
          <ArivaLinkField
            value={quoteUrl}
            onChange={(value) => {
              setQuoteUrl(value);
              setLinkError(undefined);
            }}
            error={linkError}
            disabled={saveLink.isPending}
          />
          <Button
            disabled={saveLink.isPending}
            onClick={() => {
              if (!validArivaLink(quoteUrl)) {
                setLinkError(ARIVA_LINK_ERROR);
                return;
              }
              saveLink.mutate();
            }}
          >
            Kurs-Link speichern
          </Button>
          {saveLink.isError && (
            <ErrorNote what="Kurs-Link" error={saveLink.error} onRetry={() => saveLink.reset()} />
          )}
        </div>
      )}
      {latestFailure && <p>{quoteFailureText(latestFailure, data.currency)}</p>}
      <p>Der damalige Quellwert und die antwortende Quelle wurden nicht gespeichert.</p>
      <h3>Aktuelle Zuordnung · Stand {longDay(data.asOf)}</h3>
      <dl>
        <dt>Instrument-ID</dt>
        <dd>
          {data.securityId} · {data.name}
        </dd>
        <dt>Erwartet</dt>
        <dd>Automatischer Kurs in {data.currency}</dd>
        <dt>Symbol</dt>
        <dd>{data.symbol ?? 'Nicht zugeordnet'}</dd>
        <dt>CoinGecko-ID</dt>
        <dd>{data.coingeckoId ?? 'Nicht zugeordnet'}</dd>
        <dt>Börse (Ariva)</dt>
        <dd>{data.quoteExchange ?? 'Nicht festgelegt'}</dd>
        <dt>Kursseite</dt>
        <dd>{data.hasQuoteUrl ? 'Hinterlegt' : 'Nicht hinterlegt'}</dd>
        <dt>Letzter gespeicherter Kurs</dt>
        <dd>
          {data.latest
            ? `${quoteText(data.latest)} · ${longDay(data.latest.date)} · ${data.latest.source}`
            : 'Kein Kurs gespeichert'}
        </dd>
        {data.lastRun !== undefined && (
          <>
            <dt>Letzter automatischer Lauf</dt>
            <dd>
              {data.lastRun
                ? `${new Date(data.lastRun.finishedAt).toLocaleString('de-AT')} · ${data.lastRun.status}`
                : 'Noch keiner'}
            </dd>
          </>
        )}
        {data.lastSuccessRun !== undefined && (
          <>
            <dt>Letzter erfolgreicher Lauf</dt>
            <dd>
              {data.lastSuccessRun
                ? new Date(data.lastSuccessRun.finishedAt).toLocaleString('de-AT')
                : 'Noch keiner'}
            </dd>
          </>
        )}
        {data.attempts !== undefined && (
          <>
            <dt>Letzter Abrufversuch</dt>
            <dd>
              {data.attempts[0]
                ? `${attemptTime(data.attempts[0])} · ${attemptText(data.attempts[0], data.currency)}`
                : 'Noch keiner aufgezeichnet'}
            </dd>
            <dt>Letzter Erfolg</dt>
            <dd>
              {data.attempts.find((a) => a.outcome === 'ok')
                ? attemptTime(data.attempts.find((a) => a.outcome === 'ok') as QuoteAttempt)
                : 'Keiner in den aufgezeichneten Versuchen'}
            </dd>
          </>
        )}
        {data.quoteFxCurrency && (
          <>
            <dt>Umrechnung</dt>
            <dd>
              Kurse in {data.quoteFxCurrency} werden mit dem EZB-Kurs des Tages in {data.currency}{' '}
              umgerechnet
            </dd>
          </>
        )}
        {data.held === false && (
          <>
            <dt>Bestand</dt>
            <dd>Historischer Bestand: aktuell keine Stücke</dd>
          </>
        )}
      </dl>
      {data.attempts && data.attempts.length > 1 && (
        <details>
          <summary>Abrufversuche ({data.attempts.length})</summary>
          <ul>
            {data.attempts.map((a, index) => (
              <li key={`${a.attemptedAt}-${index}`}>
                {attemptTime(a)} · {attemptText(a, data.currency)}
              </li>
            ))}
          </ul>
        </details>
      )}
      <p>
        Ein manueller Kurs repariert die automatische Quelle nicht. Die Warnung schließt erst nach
        einem erfolgreichen automatischen Kursabruf.
      </p>
      <AppLink
        className="btn btn-ghost btn-sm"
        to={`/vermoegen/portfolio/instrument/${encodeURIComponent(securityId)}`}
      >
        Instrument öffnen
      </AppLink>
      <Button variant="ghost" disabled={preview.isPending} onClick={() => preview.mutate()}>
        {preview.isPending ? 'Quelle wird geprüft …' : 'Quelle erneut testen (Vorschau)'}
      </Button>
      {preview.isError && (
        <ErrorNote what="Quellvorschau" error={preview.error} onRetry={() => preview.mutate()} />
      )}
      {preview.data && (
        <div role="status">
          <p>
            Vorschau mit aktueller Zuordnung
            {preview.data.symbol ? ` (Symbol ${preview.data.symbol})` : ''}:{' '}
            {longDay(preview.data.from)} bis {longDay(preview.data.to)}
            {preview.data.testedAt
              ? `, getestet ${new Date(preview.data.testedAt).toLocaleString('de-AT')}`
              : ''}
            . Keine Kurse gespeichert, Warnung bleibt offen.
          </p>
          <ul>
            {preview.data.attempts.map((attempt, index) => (
              <li key={`${attempt.source}-${index}`}>
                {attempt.source}:{' '}
                {attempt.latest
                  ? `${quoteText({ ...attempt.latest, currency: attempt.latest.sourceCurrency ?? preview.data.currency, source: attempt.source })} · ${longDay(attempt.latest.date)}`
                  : attempt.error === 'currency_mismatch' &&
                      attempt.currencyEvidence?.origin === 'mapping'
                    ? 'Die Quellzuordnung verwendet eine andere Kurswährung.'
                    : quoteFailureText(
                        attempt.error ?? 'unbekannt',
                        preview.data.currency,
                        attempt.currencyEvidence?.origin === 'response'
                          ? attempt.currencyEvidence.currency
                          : undefined,
                      )}
                {attempt.error === 'currency_mismatch' && (
                  <span>
                    {' '}
                    Erwartet: {preview.data.currency} ·{' '}
                    {attempt.currencyEvidence
                      ? `${attempt.currencyEvidence.origin === 'mapping' ? 'In der Quellzuordnung' : 'Von der Quelle gemeldet'}: ${attempt.currencyEvidence.currency}`
                      : 'Tatsächliche Kurswährung nicht verfügbar.'}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {(() => {
        const foreign = preview.data?.attempts.find(
          (a) => a.error === 'currency_mismatch' && a.currencyEvidence?.origin === 'response',
        )?.currencyEvidence?.currency;
        return foreign && !data.quoteFxCurrency ? (
          <div>
            <p>
              Die Quelle liefert in {foreign}. Mit EZB-Kurs umrechnen: jeder Kurs wird mit dem
              EZB-Kurs seines Tages in {data.currency} umgerechnet (fehlt der Tag, gilt der letzte
              frühere, höchstens 5 Tage zurück; sonst wird der Tag ausgelassen und gemeldet). Der
              Originalkurs bleibt gespeichert.
            </p>
            <Button
              variant="ghost"
              disabled={convert.isPending}
              onClick={() => convert.mutate(foreign.toUpperCase())}
            >
              Mit EZB-Kurs umrechnen ({foreign.toUpperCase()} → {data.currency})
            </Button>
          </div>
        ) : null;
      })()}
      {data.quoteFxCurrency && (
        <Button variant="ghost" disabled={convert.isPending} onClick={() => convert.mutate(null)}>
          Umrechnung aufheben
        </Button>
      )}
      {data.quoteFxCurrency && (
        <p>Bereits gespeicherte umgerechnete Kurse bleiben unverändert (keine Neubewertung).</p>
      )}
      {convert.isError && (
        <ErrorNote what="Umrechnung" error={convert.error} onRetry={() => convert.reset()} />
      )}
      {data.pricesEnabled === false ? (
        <p>Der automatische Abruf ist für dieses Instrument ausgeschaltet.</p>
      ) : (
        <div className="quote-cause-decision">
          <p>
            Quelle nicht reparierbar? Dann den automatischen Abruf bewusst abschalten. Das schließt
            die Warnung, speichert keinen Kurs und lässt sich rückgängig machen.
          </p>
          <Field label="Grund">
            {({ id }) => (
              <TextInput
                id={id}
                maxLength={200}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            )}
          </Field>
          <Button
            variant="ghost"
            disabled={decide.isPending || reason.trim().length < 3}
            onClick={() => decide.mutate('manual_only')}
          >
            Nur manuelle Kurse
          </Button>
          {data.held === false && (
            <Button
              variant="ghost"
              disabled={decide.isPending || reason.trim().length < 3}
              onClick={() => decide.mutate('fetch_off')}
            >
              Abruf abschalten (historischer Bestand)
            </Button>
          )}
          {decide.isError && (
            <ErrorNote what="Entscheidung" error={decide.error} onRetry={() => decide.reset()} />
          )}
        </div>
      )}
      <details>
        <summary>Betroffene erfasste Bewegungen ({data.movements.length})</summary>
        <p>
          Aktuell erfasste Bewegungen dieses Instruments bis {longDay(data.asOf)}; kein Beleg einer
          fehlerhaften Buchung.
        </p>
        <ul>
          {data.movements.map((movement) => (
            <li key={movement.id}>
              {longDay(movement.date)} · {movement.id}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
