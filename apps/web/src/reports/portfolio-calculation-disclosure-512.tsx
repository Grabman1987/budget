import type { PortfolioSummary } from '@budget/db';
import { longDay } from '../ledger/format';
import type { ValuationNote } from '../ledger/valuation-hint';

/** Explain only facts returned with this performance response, without resolving valuations. */
export function PortfolioCalculationDisclosure({
  summary,
  incomplete,
}: {
  summary: PortfolioSummary;
  incomplete?: ReadonlyArray<ValuationNote> | undefined;
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
      <p>
        Die Quellen der einzelnen historischen Tageswerte sind hier nicht vollständig ausgewiesen.
        Auch ohne gemeldete Bewertungshinweise ist damit keine lückenlose historische Quellenprüfung
        belegt.
      </p>
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
