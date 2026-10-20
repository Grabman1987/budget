import type { PortfolioSummary } from '@budget/db';
import { longDay } from '../ledger/format';
import type { ValuationNote } from '../ledger/valuation-hint';

/** Qualify selected closing observations, never the unrelated current allocation. */
export function historicalBasisReasons(summary: PortfolioSummary): string[] {
  const metadata = summary.valuationProvenance;
  if (!metadata) return ['Quellenhinweise unvollständig'];
  const reasons: string[] = [];
  if (
    metadata.runs.some(
      (run) =>
        run.quality === 'stale' ||
        ((run.kind === 'quote' || run.kind === 'execution') &&
          run.date !== null &&
          run.date < run.to) ||
        (run.fx.kind === 'rate' && run.fx.date < run.to),
    )
  )
    reasons.push('≈ Bewertungsdaten fortgeschrieben');
  if (
    metadata.runs.some(
      (run) => run.quality === 'estimated' || (run.kind === 'cost' && run.quality !== 'missing'),
    )
  )
    reasons.push('≈ Bewertung teilweise geschätzt');
  if (metadata.runs.some((run) => run.lookAhead))
    reasons.push('≈ Spätere Ausführung als Bewertungsfallback');
  if (
    metadata.runs.some(
      (run) => run.quality === 'missing' || run.kind === 'missing' || run.fx.kind === 'missing',
    )
  )
    reasons.push('Bewertung teilweise nicht verfügbar');
  if (
    metadata.status === 'no-history' ||
    !metadata.coverage.complete ||
    metadata.coverage.truncated ||
    metadata.coverage.unknownSourceLabelPositionDays !== '0'
  )
    reasons.push('Quellenhinweise unvollständig');
  return reasons;
}

export function HistoricalBasisCue({
  reasons,
  id,
  sourceId,
}: {
  reasons: readonly string[];
  id: string;
  sourceId: string;
}) {
  if (reasons.length === 0) return null;
  return (
    <div
      className="vnote"
      style={{ maxWidth: 'none', minWidth: 0, margin: 0, flex: '1 1 32rem' }}
      id={id}
      role="status"
      aria-label="Historische Bewertungsgrundlage"
    >
      <span>
        {reasons.join(' · ')}. Nur Schlussbewertungen der Wertpapiere; kein Qualitätsnachweis
        sämtlicher Renditeeingaben.
      </span>{' '}
      <a
        className="btn btn-ghost"
        style={{ minHeight: 44, whiteSpace: 'normal' }}
        href={`#${sourceId}`}
        onClick={(event) => {
          const target = document.getElementById(sourceId);
          if (!target) return;
          event.preventDefault();
          for (let parent = target.parentElement; parent; parent = parent.parentElement)
            if (parent instanceof HTMLDetailsElement) parent.open = true;
          target.focus();
        }}
      >
        Bewertungsquellen ansehen
      </a>
    </div>
  );
}

/** Explain only facts returned with this performance response, without resolving valuations. */
export function PortfolioCalculationDisclosure({
  summary,
  incomplete,
  sourceId,
}: {
  summary: PortfolioSummary;
  incomplete?: ReadonlyArray<ValuationNote> | undefined;
  sourceId?: string;
}) {
  const performance = summary.performance;
  const quality = summary.quality;
  const costMethod =
    summary.costMethod === 'fifo'
      ? 'FIFO'
      : summary.costMethod === 'average'
        ? 'gleitender Durchschnitt'
        : 'nicht ausgewiesen';
  const reasons = quality
    ? ([
        ['Geschätzte Bewertung', quality.estimatedSecurityIds.length, 'Wertpapiere'],
        ['Fortgeschriebene Bewertung', quality.staleSecurityIds.length, 'Wertpapiere'],
        ['Kurs fehlt', quality.missingPriceSecurityIds.length, 'Wertpapiere'],
        ['Wechselkurs fehlt', quality.missingFxSecurityIds.length, 'Wertpapiere'],
        ['Wechselkurs fehlt', quality.missingFxAccountIds.length, 'Konten'],
        ['Anlageklasse nicht zugeordnet', quality.unclassifiedSecurityIds.length, 'Positionen'],
      ] as const)
    : [];

  return (
    <div className="vnote">
      <p>Kostenmethode: {costMethod}</p>
      <p>Stichtag: {summary.asOf ? longDay(summary.asOf) : 'nicht ausgewiesen'}</p>
      {performance && (
        <p>
          Ausgewerteter Zeitraum: {longDay(performance.from)} bis {longDay(performance.to)} ·{' '}
          {performance.days} Tage.
        </p>
      )}
      {summary.view === 'securities' ? (
        <p>Berechnungsumfang: Wertpapiere ohne Depotkassa, nach Gebühren und vor Steuern.</p>
      ) : summary.view === 'depot' ? (
        <p>
          Berechnungsumfang: Wertpapiere mit Depotkassa. Externe Zu- und Abflüsse zählen an der
          Depotgrenze; Gebühren und Steuern wirken über den tatsächlichen Schlusswert.
        </p>
      ) : (
        <p>Berechnungsumfang: nicht ausgewiesen.</p>
      )}
      {summary.valuationProvenance ? (
        <details className="wealth-details">
          <summary id={sourceId}>Historische Bewertungsquellen</summary>
          <p>
            Nur Schlussbewertungen der Wertpapierpositionen im ausgewerteten Zeitraum.
            Zahlungsflüsse und deren Wechselkurse, Gebühren/Steuern, Vergleichsindizes, Depotkassa
            und Anlageklassen-Teilreihen sind hier nicht nachgewiesen.
          </p>
          {summary.valuationProvenance.status === 'no-history' ? (
            <p>Keine Bewertungshistorie vorhanden; keine Quellenprüfung einer Rendite möglich.</p>
          ) : (
            <>
              <p>
                {summary.valuationProvenance.coverage.retainedPositionDays} von{' '}
                {summary.valuationProvenance.coverage.observedPositionDays} Positionstagen
                dokumentiert · {summary.valuationProvenance.coverage.calendarDays} Schlussstichtage.
              </p>
              <p>
                {summary.valuationProvenance.coverage.complete
                  ? 'Die Quellenangaben dieses Bewertungsumfangs sind vollständig dokumentiert. Das bestätigt weder exakte Werte noch sämtliche Eingaben der Rendite.'
                  : 'Die Quellenangaben dieses Bewertungsumfangs sind nicht vollständig dokumentiert.'}
              </p>
              {summary.valuationProvenance.coverage.truncated && (
                <p>
                  Anzeige begrenzt: {summary.valuationProvenance.coverage.omittedPositionDays}{' '}
                  Positionstage in {summary.valuationProvenance.coverage.omittedRuns} Intervallen
                  fehlen. Höchstens 256 Intervalle und 64 KiB Quellenmetadaten; die Berechnung
                  umfasst weiterhin den gesamten gewählten Zeitraum.
                </p>
              )}
              {summary.valuationProvenance.coverage.unknownSourceLabelPositionDays !== '0' && (
                <p>
                  Quellenbezeichnung nicht dokumentiert für{' '}
                  {summary.valuationProvenance.coverage.unknownSourceLabelPositionDays}{' '}
                  Positionstage.
                </p>
              )}
              <ul>
                {summary.valuationProvenance.runs.map((run, index) => (
                  <li key={`${run.accountId}:${run.securityId}:${run.from}:${index}`}>
                    {summary.names.securities[run.securityId] ?? 'Wertpapier'} · Intervall{' '}
                    {index + 1} · {longDay(run.from)} bis {longDay(run.to)} ({run.days}{' '}
                    Positionstage).{' '}
                    {run.kind === 'quote'
                      ? 'Gespeicherter Kurs'
                      : run.kind === 'execution'
                        ? 'Brutto-Ausführung ohne Gebühren und Steuern'
                        : run.kind === 'cost'
                          ? 'Kostenbasis: gleitender Durchschnitt'
                          : 'Kurs oder Kostenbasis fehlt'}
                    {run.date && ` vom ${longDay(run.date)}`}
                    {run.currency && ` (${run.currency})`}.{' '}
                    {run.kind === 'quote' && `Quelle: ${run.source ?? 'nicht dokumentiert'}. `}
                    {run.lookAhead && 'Spätere Ausführung als Fallback (Look-ahead). '}
                    {run.quality === 'stale' && 'Kurs mehr als sieben Tage fortgeschrieben. '}
                    {run.quality === 'estimated' && 'Bewertung geschätzt. '}
                    {run.quality === 'missing' && 'Bewertung nicht verfügbar. '}
                    {run.fx.kind === 'identity'
                      ? 'EUR ohne Währungsumrechnung.'
                      : run.fx.kind === 'rate'
                        ? `Wechselkurs vom ${longDay(run.fx.date)}; Quelle: ${run.fx.source ?? 'nicht dokumentiert'}.`
                        : run.fx.kind === 'missing'
                          ? 'Wechselkurs fehlt.'
                          : 'Wechselkurs nicht ausgewertet, da die Bewertungsbasis fehlt.'}
                  </li>
                ))}
              </ul>
            </>
          )}
        </details>
      ) : (
        <p id={sourceId} tabIndex={sourceId ? -1 : undefined}>
          Die Quellen der einzelnen historischen Tageswerte sind hier nicht vollständig ausgewiesen.
          Auch ohne gemeldete Bewertungshinweise ist damit keine lückenlose historische
          Quellenprüfung belegt.
        </p>
      )}
      {incomplete && incomplete.length > 0 && (
        <>
          <p>
            Gemeldete Bewertungshinweise: Die Datumsgrenzen umfassen die gemeldeten Fälle; nicht
            jeder Tag dazwischen muss betroffen sein.
          </p>
          <ul>
            {incomplete.map((note) => (
              <li key={`${note.securityId}:${note.quality}:${note.from}:${note.to}`}>
                {note.name ?? 'Wertpapier'} ·{' '}
                {note.quality === 'estimated' ? 'Bewertung geschätzt' : 'Bewertung fehlt'} ·{' '}
                {longDay(note.from)} bis {longDay(note.to)}
              </li>
            ))}
          </ul>
        </>
      )}
      <p>
        Allokationsstand
        {summary.asOf ? ` zum ${longDay(summary.asOf)}` : ': Stichtag nicht ausgewiesen'}. Dieser
        Stand umfasst die einbezogenen Konten, Kassa und Wertpapiere der Allokation. Er ist kein
        Qualitätsnachweis für die Wertpapierrendite des gewählten Zeitraums.
      </p>
      {quality ? (
        <>
          <ul>
            {reasons
              .filter(([, count]) => count > 0)
              .map(([label, count, scope]) => (
                <li key={`${label}:${scope}`}>
                  {label}: {count} {scope}
                </li>
              ))}
          </ul>
          <p>
            {quality.valuationQuality === 'exact'
              ? 'Für diesen Allokationsstand ist eine exakte Bewertung gemeldet.'
              : quality.valuationQuality === 'estimated'
                ? 'Für diesen Allokationsstand ist eine geschätzte Bewertung gemeldet.'
                : 'Für diesen Allokationsstand ist die Bewertung unvollständig.'}{' '}
            {quality.classification === 'partial' && 'Die Klassifikation ist unvollständig.'}
          </p>
        </>
      ) : (
        <p>Die Bewertungsqualität dieses Allokationsstands ist nicht ausgewiesen.</p>
      )}
    </div>
  );
}
