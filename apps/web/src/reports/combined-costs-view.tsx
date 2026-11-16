import { DimensionChain, useAmountPrivacy } from '@budget/ui';
import { cents, combinedCosts } from '@budget/domain';
import type { BankCostsReport, CostsTaxesReport } from '@budget/db';
import { eur, longDay } from '../ledger/format';
import { bpText, monthShort } from './spending-shared';
import { ReportTable } from './report-table';

/**
 * "Kosten gesamt": one annual figure over the two existing readers. Trading fees are counted once
 * (inside the bank costs); TER and the broker's withheld taxes come from the portfolio reader.
 */
export function CombinedCostsView({
  bank,
  portfolio,
}: {
  bank: BankCostsReport;
  portfolio: CostsTaxesReport;
}) {
  useAmountPrivacy();
  const total = combinedCosts({
    bankCents: bank.totalCents,
    terCents: portfolio.costs.terCents,
    taxCents: portfolio.taxes.totalCents,
    valueCents: portfolio.valueCents,
  });
  const bankWindow = bank.months.length
    ? `${monthShort(bank.months[0]!)} bis ${monthShort(bank.months.at(-1)!)}`
    : 'keine geschlossenen Monate';
  const estimated = bank.rows.some((row) => row.key === 'modeledInterest' && row.cents !== 0);
  return (
    <section className="sr-card sr-wide" aria-labelledby="cc-title">
      <div className="sr-head">
        <h2 id="cc-title">Kosten gesamt · 12 Monate</h2>
      </div>
      <div className="sr-fig">
        <span>Bank- und Zinskosten, Steuern und TER</span>
        <strong data-testid="cc-total">{eur(total.totalCents)}</strong>
      </div>
      <p className="sr-range">
        Kostenquote: {total.ratioBp === null ? '–' : bpText(total.ratioBp, { digits: 1 })} des
        Portfoliowerts
      </p>
      <DimensionChain
        precision="cent"
        label="Maßkette Kosten gesamt"
        terms={[
          { label: 'Bank- und Zinskosten', value: cents(total.bankCents) },
          { label: 'TER-Anteil', value: cents(total.terCents), op: '+' },
          { label: 'Steuern des Brokers', value: cents(total.taxCents), op: '+' },
          { label: 'Kosten gesamt', value: cents(total.totalCents), op: '=', result: true },
        ]}
      />
      <ReportTable
        caption="Kosten gesamt nach Quelle"
        regionLabel="Kosten gesamt nach Quelle"
        className="sr-table"
        data-testid="cc-table"
      >
        <thead>
          <tr>
            <th scope="col">Posten</th>
            <th scope="col" className="n">
              12 Monate
            </th>
            <th scope="col">Zeitraum</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Bank- und Zinskosten{estimated ? ' (teils geschätzt)' : ''}</th>
            <td className="n">{eur(total.bankCents)}</td>
            <td>{bankWindow}</td>
          </tr>
          <tr>
            <th scope="row">TER-Anteil (geschätzt)</th>
            <td className="n">{eur(total.terCents)}</td>
            <td>
              {longDay(portfolio.from)} bis {longDay(portfolio.to)}
            </td>
          </tr>
          <tr>
            <th scope="row">Steuern des Brokers</th>
            <td className="n">{eur(total.taxCents)}</td>
            <td>
              {longDay(portfolio.from)} bis {longDay(portfolio.to)}
            </td>
          </tr>
        </tbody>
      </ReportTable>
      <p className="sr-note">
        Handelsgebühren stehen nur einmal in den Bankkosten. Die Zeiträume sind verschieden
        (geschlossene Monate gegenüber den letzten 12 Monaten bis heute); TER und Zinsschätzungen
        bleiben als Schätzung gekennzeichnet.
      </p>
    </section>
  );
}
