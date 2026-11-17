import { useQuery } from '@tanstack/react-query';
import { request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';
import { eur } from '../ledger/format';
import { EmptyNote } from '../ledger/states';
import type { BaseStep, SalaryYear } from '@budget/domain';
import { ReportTable } from './report-table';
import { shortMonth } from './month-frame';

interface Development {
  base: { steps: BaseStep[] };
  years: SalaryYear[];
}
/** Basis points (10 000 = 100 %) as a signed German percentage. */
const bp = (value: number | null) =>
  value === null
    ? '–'
    : `${new Intl.NumberFormat('de-AT', { maximumFractionDigits: 1, signDisplay: 'exceptZero' })
        .format(value / 100)
        .replace('-', '−')} %`;

/**
 * Salary development (#1066): base salary steps and year comparison. Special payments and bonus
 * belong to the month they are paid in and are part of the year figures (owner decision 2026-11-17).
 */
export function PayrollDevelopment({ month }: { month: string }) {
  const query = useQuery({
    queryKey: [...LEDGER_KEY, 'payroll-development', month],
    retry: false,
    queryFn: () => request<Development>('GET', `/api/payslips/development?throughMonth=${month}`),
  });
  const data = query.data;
  if (!data) return null;
  const steps = data.base.steps;
  const years = data.years.filter((y) => y.development.cents.total > 0);
  if (steps.length === 0 && years.length === 0)
    return <EmptyNote>Für die Entwicklung fehlen Gehaltszettel mit Lohnzeilen.</EmptyNote>;
  return (
    <>
      {steps.length > 0 && (
        <section className="mr-card mr-wide" data-testid="payroll-base-steps">
          <h2>Grundgehalt · Erhöhungen</h2>
          <ReportTable
            caption="Grundgehalt brutto pro Monat"
            regionLabel="Grundgehalt"
            className="rtable"
          >
            <thead>
              <tr>
                <th>Ab Monat</th>
                <th className="n">Vorher</th>
                <th className="n">Nachher</th>
                <th className="n">Änderung</th>
              </tr>
            </thead>
            <tbody>
              {steps.map((s) => (
                <tr key={s.effectiveMonth}>
                  <th scope="row">{shortMonth(s.effectiveMonth)}</th>
                  <td className="n">{eur(s.oldCents)}</td>
                  <td className="n">{eur(s.newCents)}</td>
                  <td className="n">
                    {eur(s.deltaCents, { sign: true })} · {bp(s.deltaBp)}
                    {s.uncertain ? ' (unsicher)' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </ReportTable>
          <p className="vnote">
            Grundgehalt brutto je Monat ohne Sonderzahlungen, Bonus, Sachbezüge und Spesen.
          </p>
        </section>
      )}
      {years.length > 0 && (
        <section className="mr-card mr-wide" data-testid="payroll-dev-years">
          <h2>Gehaltsentwicklung je Jahr</h2>
          <ReportTable
            caption="Gehaltsentwicklung je Jahr"
            regionLabel="Gehaltsentwicklung je Jahr"
            className="rtable"
          >
            <thead>
              <tr>
                <th>Jahr</th>
                <th className="n">Grundgehalt</th>
                <th className="n">Sonderzahlungen</th>
                <th className="n">Variabel · Bonus</th>
                <th className="n">Summe</th>
                <th className="n">Zum Vorjahr</th>
              </tr>
            </thead>
            <tbody>
              {years.map((y) => (
                <tr key={y.year}>
                  <th scope="row">
                    {y.year}
                    {y.development.complete ? '' : ' · unvollständig'}
                  </th>
                  <td className="n">{eur(y.development.cents.base)}</td>
                  <td className="n">{eur(y.development.cents.special)}</td>
                  <td className="n">{eur(y.development.cents.variable)}</td>
                  <td className="n">{eur(y.development.cents.total)}</td>
                  <td className="n">
                    {y.development.change
                      ? `${eur(y.development.change.total.deltaCents, { sign: true })} · ${bp(y.development.change.total.deltaBp)}`
                      : 'nicht vergleichbar'}
                  </td>
                </tr>
              ))}
            </tbody>
          </ReportTable>
          <p className="vnote">
            Summe inklusive Sonderzahlungen und Bonus im Monat der Auszahlung; ohne Sachbezüge und
            Spesen. Keine Hochrechnung, Lücken bleiben Lücken.
          </p>
        </section>
      )}
    </>
  );
}
