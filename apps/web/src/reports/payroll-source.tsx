import type { payrollSource } from '@budget/domain';
import { eur } from '../ledger/format';
import './payroll-source.css';

export function PayrollSource({
  source,
  level: Heading = 'h2',
}: {
  source: ReturnType<typeof payrollSource>;
  level?: 'h2' | 'h4';
}) {
  const labels = {
    base: 'Laufende Bezüge',
    special: 'Sonderzahlungen',
    variable: 'Variable Bezüge',
    benefit_in_kind: 'Sachbezüge',
    reimbursement: 'Steuerfreie Erstattungen',
    unmapped: 'Noch nicht zugeordnete Bezüge',
    unreconciled: 'Nicht abgestimmter Rest',
    undecomposed: 'Brutto ohne Einzelpositionen',
  };
  return (
    <div className="pp-source">
      <Heading>Bestandteile laut Quelle</Heading>
      <table className="rtable">
        <tbody>
          {Object.entries(source.paid).map(
            ([key, value]) =>
              value !== 0 && (
                <tr key={key}>
                  <th>{labels[key as keyof typeof labels]}</th>
                  <td className="n">{eur(value)}</td>
                </tr>
              ),
          )}
          <tr>
            <th>Gemeinsame SV</th>
            <td className="n">{eur(source.sharedDeductions.svCents)}</td>
          </tr>
          <tr>
            <th>Gemeinsame Lohnsteuer</th>
            <td className="n">{eur(source.sharedDeductions.taxCents)}</td>
          </tr>
          <tr>
            <th>Sonstige gemeinsame Abzüge</th>
            <td className="n">{eur(source.sharedDeductions.otherCents)}</td>
          </tr>
          {source.statutorySplit && (
            <>
              <tr>
                <th>Davon SV laufend laut Quelle</th>
                <td className="n">{eur(source.statutorySplit.svCurrentCents)}</td>
              </tr>
              <tr>
                <th>Davon SV Sonderzahlung laut Quelle</th>
                <td className="n">{eur(source.statutorySplit.svSpecialCents)}</td>
              </tr>
              <tr>
                <th>Davon Lohnsteuer laufend laut Quelle</th>
                <td className="n">{eur(source.statutorySplit.taxCurrentCents)}</td>
              </tr>
              <tr>
                <th>Davon Lohnsteuer sonstige Bezüge laut Quelle</th>
                <td className="n">{eur(source.statutorySplit.taxOtherCents)}</td>
              </tr>
            </>
          )}
          {source.backPay.map((line, index) => (
            <tr key={`back-${index}`}>
              <th>
                Davon Nachzahlung/Korrektur · {line.code} · {line.referenceMonth}
              </th>
              <td className="n">{eur(line.amountCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {source.netSplitUnknown && (
        <p className="vnote">
          Nettoaufteilung aus der Quelle nicht bestimmbar. Der Zettel wird nicht geteilt: die
          Auszahlung zählt voll im Monat der Zahlung.
        </p>
      )}
      {source.unmapped
        .filter((line) => line.reason !== 'memo_line')
        .map((line, index) => (
          <p className="pp-warning" key={index}>
            Originalposition nicht zugeordnet: {line.code ?? 'ohne Lohnart'} · {line.label} ·{' '}
            {eur(line.amountCents)}
          </p>
        ))}
      {source.originalLines.length > 0 && (
        <details>
          <summary>Originalpositionen</summary>
          <table className="rtable">
            <tbody>
              {source.originalLines.map((line, index) => (
                <tr key={index}>
                  <th>
                    {line.code} · {line.label}
                    {line.referenceMonth ? ` · ${line.referenceMonth}` : ''}
                  </th>
                  <td className="n">{eur(line.amountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}
