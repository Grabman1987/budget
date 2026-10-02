import type { SourceOperation } from '@budget/domain';

/** Readable source facts, with the retained normalized record available for reconciliation. */
export function ReadSourceDetail({ detail }: { detail: string | null }) {
  if (!detail) return null;
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(detail) as Record<string, unknown>;
  } catch {
    return <span>{detail}</span>;
  }
  if (!value || typeof value !== 'object') return <span>{detail}</span>;
  const reasons: Record<string, string> = {
    mapping_required: 'Konto und Instrument in der Datenquelle zuordnen.',
    source_missing: 'Für diesen zugeordneten Bestand fehlt der aktuelle Quellsaldo.',
    precision_unsupported:
      'Die Genauigkeit des Quellsaldos lässt sich nicht verlustfrei übernehmen.',
    difference: 'Quellsaldo und App-Bestand stimmen nicht überein. Bewegungen abgleichen.',
  };
  const op = Array.isArray(value['transactions']) ? (value as unknown as SourceOperation) : null;
  return (
    <div className="source-inbox-detail">
      {op ? (
        <ul>
          {op.transactions.map((tx) => (
            <li key={tx.id}>
              {new Date(tx.creditedAt).toLocaleDateString('de-AT')} · {tx.type} ·{' '}
              {tx.flow === 'INCOMING' ? 'Zugang' : tx.flow === 'OUTGOING' ? 'Abgang' : tx.flow}:{' '}
              {tx.amount.value.replace('.', ',')}
              {tx.fee && <> · Gebühr: {tx.fee.value.replace('.', ',')}</>}
            </li>
          ))}
        </ul>
      ) : (
        <p>{reasons[String(value['reason'])] ?? 'Quelldaten prüfen.'}</p>
      )}
      <details>
        <summary>Quelldaten und Zuordnung anzeigen</summary>
        <pre>{JSON.stringify(value, null, 2)}</pre>
      </details>
    </div>
  );
}
