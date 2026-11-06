import type { SourceOperation } from '@budget/domain';
import { maskMoneyText, privateAmount, useAmountPrivacy } from '@budget/ui';

export const SOURCE_REASONS: Record<string, string> = {
  mapping_required: 'Konto und Instrument in der Datenquelle zuordnen.',
  source_missing: 'Für diesen zugeordneten Bestand fehlt der aktuelle Quellsaldo.',
  precision_unsupported: 'Die Genauigkeit des Quellsaldos lässt sich nicht verlustfrei übernehmen.',
  schema: 'Die Bewegung konnte nicht gelesen werden. Datenformat der Quelle prüfen.',
  invalid_balance: 'Der Quellsaldo konnte nicht gelesen werden. Datenformat der Quelle prüfen.',
  duplicate_rows:
    'Die Quelle liefert mehrere Saldozeilen für denselben Bestand. Quellsaldo prüfen.',
  difference: 'Der gespeicherte Abgleich zeigt unterschiedliche Quell- und App-Salden.',
};
export const SOURCE_FAILURES: Record<string, string> = {
  schema: 'Datenformat der Quelle prüfen.',
  http: 'Schlüssel, Leserechte und Verbindung prüfen.',
  timeout: 'Die Quelle hat nicht rechtzeitig geantwortet. Später erneut abrufen.',
  parse: 'Die Antwort der Quelle konnte nicht gelesen werden. Später erneut abrufen.',
};

type SnapshotScale = 2 | 8;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSnapshotScale(value: unknown): value is SnapshotScale {
  return value === 2 || value === 8;
}

/** Parse the stored decimal string without using binary floating point. */
function parseScaledDecimal(value: unknown, scale: SnapshotScale): bigint | null {
  if (typeof value !== 'string') return null;
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) return null;
  const fractional = match[3] ?? '';
  if (/[1-9]/.test(fractional.slice(scale))) return null;
  const whole = BigInt(match[2]!);
  const fraction = BigInt(fractional.slice(0, scale).padEnd(scale, '0') || '0');
  const units = whole * 10n ** BigInt(scale) + fraction;
  return match[1] === '-' ? -units : units;
}

function parseSnapshotInteger(value: unknown): bigint | null {
  return typeof value === 'number' && Number.isSafeInteger(value) ? BigInt(value) : null;
}

function formatScaledInteger(value: bigint, scale: SnapshotScale): string {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(scale + 1, '0');
  const whole = digits.slice(0, -scale).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const fraction = digits.slice(-scale).replace(/0+$/, '');
  return `${negative ? '−' : ''}${whole}${fraction ? `,${fraction}` : ''}`;
}

function SourceBalanceComparison({ value }: { value: Record<string, unknown> }) {
  const scale = value['scale'];
  const validScale = isSnapshotScale(scale);
  const sourceUnits = validScale ? parseScaledDecimal(value['source'], scale) : null;
  const localUnits = validScale ? parseSnapshotInteger(value['local']) : null;
  const difference = sourceUnits !== null && localUnits !== null ? sourceUnits - localUnits : null;
  const quantityLabel = scale === 8 ? 'Einheiten' : 'Betrag (2 Nachkommastellen)';
  const snapshotValue = (raw: unknown, parsed: bigint | null, kind: 'Quelle' | 'App') => {
    if (!validScale) return 'Genauigkeit beim Abgleich ungültig';
    if (raw === null || raw === undefined) return 'Beim Abgleich nicht verfügbar';
    if (parsed === null)
      return kind === 'Quelle'
        ? 'Quellsaldo beim Abgleich ungültig'
        : 'App-Wert beim Abgleich ungültig';
    return privateAmount(formatScaledInteger(parsed, scale));
  };
  const signedDifference =
    difference === null || !validScale
      ? 'Nicht berechenbar'
      : privateAmount(`${difference > 0n ? '+' : ''}${formatScaledInteger(difference, scale)}`);

  return (
    <div className="source-balance-comparison">
      <p>{SOURCE_REASONS.difference}</p>
      <p>
        Quelle beim Abgleich: {snapshotValue(value['source'], sourceUnits, 'Quelle')}
        {validScale && ` ${quantityLabel}`}
      </p>
      <p>
        App beim Abgleich: {snapshotValue(value['local'], localUnits, 'App')}
        {validScale && ` ${quantityLabel}`}
      </p>
      <p>
        Differenz (Quelle − App): {signedDifference}
        {validScale && ` ${quantityLabel}`}
      </p>
      {!validScale && <p>Die gespeicherte Genauigkeit erlaubt keinen verlässlichen Vergleich.</p>}
      {scale === 2 && <p>Keine Währung beim Abgleich angegeben.</p>}
      <p>Gleiche neue Bewegungen mit dem Hauptbuch ab und führe danach den Abgleich erneut aus.</p>
    </div>
  );
}

/** Readable source facts, with the retained normalized record available for reconciliation. */
export function ReadSourceDetail({ detail }: { detail: string | null }) {
  const amountsHidden = useAmountPrivacy();
  if (!detail) return null;
  let value: unknown;
  try {
    value = JSON.parse(detail) as unknown;
  } catch {
    return <span>{maskMoneyText(detail)}</span>;
  }
  if (!isRecord(value)) return <span>{maskMoneyText(detail)}</span>;
  const op = Array.isArray(value['transactions']) ? (value as unknown as SourceOperation) : null;
  const isBalanceDifference = value['reason'] === 'difference';
  return (
    <div className="source-inbox-detail">
      {isBalanceDifference ? (
        <SourceBalanceComparison value={value} />
      ) : op ? (
        <ul>
          {op.transactions.map((tx) => (
            <li key={tx.id}>
              {new Date(tx.creditedAt).toLocaleDateString('de-AT')} · {tx.type} ·{' '}
              {tx.flow === 'INCOMING' ? 'Zugang' : tx.flow === 'OUTGOING' ? 'Abgang' : tx.flow}:{' '}
              {privateAmount(tx.amount.value.replace('.', ','))}
              {tx.fee && <> · Gebühr: {privateAmount(tx.fee.value.replace('.', ','))}</>}
            </li>
          ))}
        </ul>
      ) : (
        <p>
          {value['category']
            ? (SOURCE_FAILURES[String(value['category'])] ?? 'Abruf fehlgeschlagen.')
            : (SOURCE_REASONS[String(value['reason'])] ?? 'Quelldaten prüfen.')}
        </p>
      )}
      <details>
        <summary>Rohdaten und Zuordnung anzeigen</summary>
        {amountsHidden ? (
          <p>Rohdaten und Beträge sind ausgeblendet, solange die Betragsanzeige verborgen ist.</p>
        ) : (
          <pre>{JSON.stringify(value, null, 2)}</pre>
        )}
      </details>
    </div>
  );
}

export function sourceWarningReason(detail: string | null): string {
  try {
    const value: unknown = JSON.parse(detail ?? 'null');
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const reason = record['reason'];
      const category = record['category'];
      if (typeof reason === 'string') return SOURCE_REASONS[reason] ?? 'Quelldaten prüfen.';
      if (typeof category === 'string') return SOURCE_FAILURES[category] ?? 'Abruf fehlgeschlagen.';
      return 'Datenquelle oder Zuordnung prüfen.';
    }
  } catch {
    /* Legacy warning text remains readable. */
  }
  return detail ?? 'Datenquelle oder Zuordnung prüfen.';
}
