import { Button, useAmountPrivacy } from '@budget/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { request } from '../api/http';
import { AppLink } from '../shell/app-link';
import { longDay } from '../ledger/format';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { LEDGER_KEY } from '../ledger/queries';
import { quoteText } from '../wealth/portfolio-format';

type Quote = { date: string; priceMicro: number };
export interface QuoteDiagnostics {
  securityId: string;
  name: string;
  currency: string;
  symbol: string | null;
  coingeckoId: string | null;
  hasQuoteUrl: boolean;
  asOf: string;
  latest: (Quote & { source: string; currency: string }) | null;
  movements: { id: string; date: string; kind: string }[];
}
export interface QuotePreview {
  securityId: string;
  currency: string;
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
  currency_mismatch: 'Die Quelle liefert eine andere Kurswährung.',
  empty: 'Keine Kurse im Prüfzeitraum erhalten.',
  not_configured: 'Für diese Quelle fehlt eine passende Zuordnung.',
  http: 'Abruf fehlgeschlagen.',
  timeout: 'Die Quelle hat nicht rechtzeitig geantwortet.',
  parse: 'Die Antwort konnte nicht gelesen werden.',
};

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
  if (query.isPending) return <LoadingNote what="Kursursache" />;
  if (query.isError)
    return (
      <ErrorNote what="Kursursache" error={query.error} onRetry={() => void query.refetch()} />
    );
  const data = query.data;
  return (
    <section className="quote-cause" aria-label="Kursursache">
      <p>
        Warnung vom {longDay(createdAt.slice(0, 10))}: {detail ?? 'Fehlerklasse nicht gespeichert.'}
      </p>
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
        <dt>Kursseite</dt>
        <dd>{data.hasQuoteUrl ? 'Hinterlegt' : 'Nicht hinterlegt'}</dd>
        <dt>Letzter gespeicherter Kurs</dt>
        <dd>
          {data.latest
            ? `${quoteText(data.latest)} · ${longDay(data.latest.date)} · ${data.latest.source}`
            : 'Kein Kurs gespeichert'}
        </dd>
      </dl>
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
            Vorschau mit aktueller Zuordnung: {longDay(preview.data.from)} bis{' '}
            {longDay(preview.data.to)}. Keine Kurse gespeichert, Warnung bleibt offen.
          </p>
          <ul>
            {preview.data.attempts.map((attempt, index) => (
              <li key={`${attempt.source}-${index}`}>
                {attempt.source}:{' '}
                {attempt.latest
                  ? `${quoteText({ ...attempt.latest, currency: preview.data.currency, source: attempt.source })} · ${longDay(attempt.latest.date)}`
                  : attempt.error === 'currency_mismatch' &&
                      attempt.currencyEvidence?.origin === 'mapping'
                    ? 'Die Quellzuordnung verwendet eine andere Kurswährung.'
                    : (ERRORS[attempt.error ?? ''] ??
                      'Abruf fehlgeschlagen. Fehlerklasse: ' + attempt.error)}
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
