import { summarizeOperation, type SourceOperation, type OperationVerdict } from '@budget/domain';
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

const HOLDING_CAUSES: Record<string, string> = {
  mapping_problem: 'Zuordnung von Konto oder Instrument fehlt oder ist ungültig.',
  source_unreadable: 'Der Quellbestand ist nicht verlässlich lesbar.',
  missing_movement: 'Offene Bewegungen erklären die gesamte Bestandsdifferenz.',
  partly_missing_movement: 'Offene Bewegungen erklären einen Teil der Bestandsdifferenz.',
  real_difference: 'Die Bestandsdifferenz ist durch offene Bewegungen nicht erklärt.',
};
const OPERATION_CLASSES: Record<string, string> = {
  purchase: 'Kauf',
  sale: 'Verkauf',
  swap: 'Tausch',
  reward: 'Prämie / Staking-Ertrag',
  staking_transfer: 'Interne Staking-Umbuchung',
  fiat_transfer: 'Geldbewegung',
  token_transfer: 'Token-Übertrag',
  fee_only: 'Gebühr',
  other: 'Sonstiger Vorgang',
};
const unitsText = (value: unknown, scale: SnapshotScale = 8) => {
  const parsed = parseSnapshotInteger(value);
  return parsed === null ? 'Nicht verfügbar' : privateAmount(formatScaledInteger(parsed, scale));
};

function OperationTrace({
  op,
}: {
  op: SourceOperation & { reconciliation?: OperationVerdict; mappings?: unknown };
}) {
  const summary = summarizeOperation(op);
  const verdict = op.reconciliation;
  return (
    <section aria-label="Vorgang und Bestandswirkung">
      <p>
        Vorgang: {maskMoneyText(op.id)} · {OPERATION_CLASSES[summary.class]}
      </p>
      {Array.isArray(op.mappings) &&
        op.mappings.filter(isRecord).map(({ key, accountId, securityId }) =>
          typeof key === 'string' && typeof accountId === 'string' ? (
            <p key={key}>
              Aktuelle Zuordnung: {maskMoneyText(key)} · App-Konto: {privateAmount(accountId)}
              {typeof securityId === 'string' && (
                <> · App-Instrument: {maskMoneyText(securityId)}</>
              )}
            </p>
          ) : null,
        )}
      {summary.assets.map((a) => (
        <p key={a.assetId}>
          Quellinstrument: {maskMoneyText(a.assetId)} · Brutto: {unitsText(a.grossE8)} · Gebühr:{' '}
          {unitsText(a.feeE8)} · Netto-Bestandswirkung: {unitsText(a.netE8)} Einheiten
        </p>
      ))}
      {!summary.assets.length && <p>Keine Token-Bestandswirkung aus diesem Vorgang.</p>}
      <p>
        Summe der Fiatbewegungen laut Quelle (absolut): {unitsText(summary.fiatCents, 2)}
        {summary.fiatCents !== null && ' (2 Nachkommastellen)'}
      </p>
      <p>
        Abgleich:{' '}
        {verdict
          ? {
              matched: 'Erfasst',
              missing: 'Gegenbuchung fehlt oder ist nicht eindeutig',
              unmapped: 'Zuordnung fehlt',
              unreadable: 'Quelldaten nicht lesbar',
              informational: 'Informativ',
            }[verdict.status]
          : 'Beim gespeicherten Abgleich nicht verfügbar'}
      </p>
      {verdict?.status === 'missing' && (
        <>
          {verdict.ambiguous && (
            <p>Gleich passende Gegenbuchungen: {verdict.ambiguous}. Keine eindeutige Zuordnung.</p>
          )}
          {verdict.missingLegs?.map((leg, i) => (
            <p key={i}>
              {leg.key.startsWith('currency:') && leg.incoming
                ? 'Einzahlung / Finanzierung fehlt im Abgleich'
                : 'Gegenbewegung fehlt im Abgleich'}
              : {maskMoneyText(leg.key)} · {leg.day ?? 'Datum nicht verfügbar'} ·{' '}
              {unitsText(leg.cents, 2)} (2 Nachkommastellen)
            </p>
          ))}
          {!verdict.missingLegs?.length && (
            <p>
              Welche Gegenbewegung fehlt, wurde nicht gespeichert. Finanzierung nicht nachgewiesen.
            </p>
          )}
          <p>Es wird keine Einzahlung oder Korrekturbuchung erzeugt.</p>
        </>
      )}
      {verdict &&
        'refs' in verdict &&
        verdict.refs?.map((ref) => (
          <p key={ref.type + ref.id}>
            Erfasste Gegenbewegung: {ref.type === 'trade' ? 'Handel' : 'Buchung'} · {ref.date} ·{' '}
            {maskMoneyText(ref.id)}
          </p>
        ))}
      <ul>
        {op.transactions.map((tx) => (
          <li key={tx.id}>
            {new Date(tx.creditedAt).toLocaleDateString('de-AT', { timeZone: 'Europe/Vienna' })} ·{' '}
            {tx.type === 'fee' ? 'Gebühr' : tx.type === 'tax' ? 'Steuer' : 'Bewegung'} ·{' '}
            {tx.flow === 'INCOMING'
              ? 'Zugang'
              : tx.flow === 'OUTGOING'
                ? 'Abgang'
                : 'Richtung unbekannt'}
            : {privateAmount(tx.amount.value.replace('.', ','))} ·{' '}
            {maskMoneyText(
              tx.amount.assetId ?? tx.amount.currencyId ?? 'Instrument nicht angegeben',
            )}{' '}
            · Bewegungsreferenz: {maskMoneyText(tx.id)}
            {tx.tradeId && <> · Handelsreferenz: {maskMoneyText(tx.tradeId)}</>}
            {tx.fee && <> · Gebühr: {privateAmount(tx.fee.value.replace('.', ','))}</>}
          </li>
        ))}
      </ul>
    </section>
  );
}

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
  const { key, accountId, cause } = value;
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
      <p>
        {HOLDING_CAUSES[String(value['cause'])] ??
          SOURCE_REASONS[String(value['reason'])] ??
          SOURCE_REASONS.difference}
      </p>
      {cause === undefined && typeof key === 'string' && (
        <p>
          Quellreferenz: {privateAmount(key)}
          {typeof accountId === 'string' && <> · App-Konto: {privateAmount(accountId)}</>}
        </p>
      )}
      {cause !== undefined && (
        <p>Ursache beim gespeicherten Abgleich; keine bestätigte Bestandskorrektur.</p>
      )}
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
      <p>
        „Als erledigt markieren“ bestätigt nur deine Entscheidung und repariert die Datenquelle
        nicht.
      </p>
      {cause !== undefined && (
        <>
          <p>
            Offene Bestandswirkung: {unitsText(value['openMovementsE8'])} Einheiten · Vorgänge:{' '}
            {Number.isSafeInteger(value['openMovementCount'])
              ? String(value['openMovementCount'])
              : 'Nicht verfügbar'}
          </p>
          <p>
            Quelle: Krypto-Lesequelle · Quellinstrument:{' '}
            {maskMoneyText(String(value['key'] ?? 'Nicht verfügbar'))} · App-Instrument:{' '}
            {maskMoneyText(String(value['securityId'] ?? 'Nicht verfügbar'))}
          </p>
          <p>
            Quellsaldo abgerufen: {String(value['fetchedAt'] ?? 'Nicht gespeichert')} ·
            App-Stichtag: {String(value['comparedOn'] ?? 'Nicht gespeichert')}
          </p>
          {Array.isArray(value['operations']) ? (
            value['operations']
              .filter(isRecord)
              .map(
                (op) =>
                  Array.isArray(op['transactions']) && (
                    <OperationTrace key={String(op['id'])} op={op as unknown as SourceOperation} />
                  ),
              )
          ) : (
            <p>Vorgangsreferenzen beim Abgleich nicht gespeichert. Abgleich neu ausführen.</p>
          )}
        </>
      )}
    </div>
  );
}

/** Show known facts from the stored source record. */
export function ReadSourceDetail({ detail }: { detail: string | null }) {
  const amountsHidden = useAmountPrivacy();
  if (!detail) return null;
  let value: unknown = null;
  try {
    value = JSON.parse(detail) as unknown;
  } catch {
    // Legacy free text has no allowlisted fields.
  }
  if (!isRecord(value)) return <span>Keine lesbaren Angaben zum Abgleich gespeichert.</span>;
  const { source, id, reason, field } = value;
  const reference = id ?? (isRecord(source) ? source['id'] : undefined);
  const op = Array.isArray(value['transactions']) ? (value as unknown as SourceOperation) : null;
  const isBalanceDifference =
    value['reason'] === 'difference' ||
    value['cause'] !== undefined ||
    isSnapshotScale(value['scale']);
  return (
    <div className="source-inbox-detail">
      {isBalanceDifference ? (
        <SourceBalanceComparison value={value} />
      ) : op ? (
        <OperationTrace op={op} />
      ) : (
        <>
          <p>
            {value['category']
              ? (SOURCE_FAILURES[String(value['category'])] ?? 'Abruf fehlgeschlagen.')
              : (SOURCE_REASONS[String(value['reason'])] ?? 'Quelldaten prüfen.')}
          </p>
          {typeof reference === 'string' && <p>Quellreferenz: {maskMoneyText(reference)}</p>}
          {reason === 'schema' && typeof field === 'string' && (
            <p>Betroffenes Quellfeld: {maskMoneyText(field)}</p>
          )}
        </>
      )}
      {amountsHidden && <p>Beträge sind ausgeblendet.</p>}
    </div>
  );
}

export function sourceWarningReason(detail: string | null, readSource = false): string {
  try {
    const value: unknown = JSON.parse(detail ?? 'null');
    if (isRecord(value)) {
      const reason = value['reason'];
      const category = value['category'];
      if (typeof reason === 'string') return SOURCE_REASONS[reason] ?? 'Quelldaten prüfen.';
      if (typeof category === 'string') return SOURCE_FAILURES[category] ?? 'Abruf fehlgeschlagen.';
    }
  } catch {
    if (!readSource && detail) return detail;
  }
  return 'Datenquelle oder Zuordnung prüfen.';
}
