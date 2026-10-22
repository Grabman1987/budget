import { Button, SectionHead } from '@budget/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { request } from '../api/http';
import { errorText } from '../ledger/labels';
import { AppLink } from '../shell/app-link';

type Run = { status: 'ok' | 'partial' | 'failed'; finishedAt: string; failedCount: number };
type Status = {
  lastRun: Run | null;
  lastSuccess: Run | null;
  manualRunning: boolean;
  automaticConfigured: boolean;
  quoteSources: string[];
  prices: { asOf: string; instruments: number;
    missingOrStale: { id: string; name: string; lastPriceDate: string | null }[] };
  cpi: { configured: boolean; series: string | null; lastStoredMonth: string | null;
    fetchedAt: string | null; warning: string | null };
};
const key = ['connection-market-status'] as const;
const stamp = (value: string | null) => value ? new Date(value).toLocaleString('de-AT') : 'Nicht aufgezeichnet';

/** Two source cards share the existing price/rate job; CPI keeps its own stored-data status. */
export function MarketSourceSections() {
  const query = useQuery({ queryKey: key, queryFn: () => request<Status>('GET', '/api/market/status') });
  const client = useQueryClient();
  const [busy, setBusy] = useState<'prices' | 'cpi' | null>(null);
  const [message, setMessage] = useState('');
  async function refresh(kind: 'prices' | 'cpi') {
    setBusy(kind);
    setMessage('');
    try {
      const result = await request<{ failed?: string | null; skipped?: boolean }>('POST',
        kind === 'cpi' ? '/api/market/cpi/refresh' : '/api/market/refresh', {});
      setMessage(result.failed ? 'VPI-Abruf fehlgeschlagen. Gespeicherte Werte bleiben erhalten.'
        : result.skipped ? 'Kein neuer VPI-Abruf: Die gespeicherte Reihe ist nach der bestehenden 30-Tage-Regel noch ausreichend frisch.'
        : 'Abruf beendet. Den aufgezeichneten Stand siehst du in der jeweiligen Karte.');
      await client.invalidateQueries();
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(null);
    }
  }
  const data = query.data;
  const schedule = data?.automaticConfigured
    ? 'Täglich ab 02:30 Europe/Vienna eingerichtet, mit Nachholen und Fehlerpause. Kein verbindlicher nächster Termin aufgezeichnet.'
    : 'Kein automatischer Abruf auf diesem Server eingerichtet.';
  return <>
    <section className="data-source-section" aria-labelledby="prices-source-title">
      <SectionHead id="prices-source-title" title="Kurse" />
      {query.isPending && <p role="status">Quellenstatus wird geladen …</p>}
      {query.isError && <p role="alert">Quellenstatus konnte nicht geladen werden. <Button variant="ghost" onClick={() => void query.refetch()}>Erneut laden</Button></p>}
      {data && <>
        <dl className="source-status">
          <div><dt>Letzter Kurs- und Währungslauf</dt><dd>{data.lastRun ? `${stamp(data.lastRun.finishedAt)} · ${data.lastRun.status === 'ok' ? 'abgeschlossen' : data.lastRun.status === 'partial' ? 'teilweise abgeschlossen' : 'fehlgeschlagen'}` : 'Noch nicht aufgezeichnet'}</dd></div>
          <div><dt>Nächster Abruf</dt><dd>{schedule}</dd></div>
        </dl>
        <p>{data.prices.missingOrStale.length} von {data.prices.instruments} aktivierten Instrumenten ohne gespeicherten Kurs oder mit einer Lücke von mindestens fünf Wochentagen zum {data.prices.asOf}.</p>
        <Button disabled={Boolean(busy) || data.manualRunning} onClick={() => void refresh('prices')}>{busy === 'prices' ? 'Abruf läuft …' : 'Jetzt abrufen'}</Button>
        <details className="source-configuration"><summary>Instrumente und Quellen einrichten</summary>
          <p>Die Zählung umfasst alle aktiven Instrumente mit eingeschalteten Kursen, auch ohne Bestand. Einzelne fehlende Kurse und Kennungen im Instrument ergänzen. Manuelle Kurse bleiben beim Abruf geschützt.</p>
          <ul>{data.prices.missingOrStale.map((instrument) => <li key={instrument.id}><AppLink to={`/vermoegen/portfolio/instrument/${encodeURIComponent(instrument.id)}`} search={{}}>{instrument.name} · {instrument.lastPriceDate ? `letzter Kurs ${instrument.lastPriceDate}` : 'Kurs fehlt'}</AppLink></li>)}</ul>
          <AppLink to="/vermoegen/portfolio" search={{}}>Alle Instrumente öffnen</AppLink>
          <p className="text-muted">Eingebundene Adapter: {data.quoteSources.join(', ')}. Der Lauf umfasst auch Wechselkurse und einen bei Bedarf fälligen VPI-Abruf. Ein erfolgreicher Gesamtlauf bestätigt nicht jeden Einzelkurs oder den VPI.</p>
        </details>
      </>}
    </section>
    <section className="data-source-section" aria-labelledby="cpi-source-title">
      <SectionHead id="cpi-source-title" title="Verbraucherpreisindex (VPI)" />
      {query.isPending && <p role="status">Quellenstatus wird geladen …</p>}
      {query.isError && <p>VPI-Status derzeit nicht verfügbar.</p>}
      {data && <>
        <dl className="source-status">
          <div><dt>Status</dt><dd>{!data.cpi.configured ? 'Keine VPI-Quelle eingerichtet' : data.cpi.warning ? data.cpi.lastStoredMonth ? 'Abruffehler · gespeicherte Reihe bleibt verfügbar' : 'Abruffehler · noch keine Reihe gespeichert' : data.cpi.lastStoredMonth ? `Gespeichert bis ${data.cpi.lastStoredMonth}` : 'Noch keine Reihe gespeichert'}</dd></div>
          <div><dt>Letzter gespeicherter Abruf</dt><dd>{stamp(data.cpi.fetchedAt)}</dd></div>
          <div><dt>Nächster Abruf</dt><dd>{data.cpi.configured ? `${schedule} Die Reihe wird bei fehlenden Daten bzw. nach 30 Tagen erneut angefragt.` : 'Quelle zuerst am Server einrichten.'}</dd></div>
        </dl>
        {data.cpi.warning && <p role="status">{data.cpi.warning} <AppLink to="/konten/pruefen" search={{ teil: 'aufgaben' }}>Aufgabe in Prüfen öffnen</AppLink></p>}
        <Button disabled={Boolean(busy) || data.manualRunning || !data.cpi.configured} onClick={() => void refresh('cpi')}>{busy === 'cpi' ? 'Abruf läuft …' : 'Jetzt abrufen'}</Button>
        <details className="source-configuration"><summary>VPI-Quelle einrichten</summary><p>Die VPI-Quelle wird am Server bereitgestellt. Ein manueller Abruf verwendet dieselbe 30-Tage-Regel wie der automatische Abruf.</p><p>Gespeicherte Reihe: {data.cpi.series ?? 'keine'}. Das Abrufdatum belegt keinen neu veröffentlichten Monatswert.</p></details>
      </>}
      {message && <p role="status">{message}</p>}
    </section>
  </>;
}
