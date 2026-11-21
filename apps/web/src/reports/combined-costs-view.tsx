import { DimensionChain, useAmountPrivacy } from '@budget/ui';
import { cents } from '@budget/domain';
import type { AnnualCostYear } from '@budget/db';
import { ValuationHint } from '../ledger/valuation-hint';
import { eur, longDay } from '../ledger/format';
import { ReportTable } from './report-table';

const percent = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 2 });

function ratioText(ratio: number | null) {
  return ratio === null ? '–' : `${percent.format(ratio / 100)} %`;
}

export function CombinedCostsView({
  selected,
  years,
  selectYear,
}: {
  selected: AnnualCostYear;
  years: readonly AnnualCostYear[];
  selectYear: (year: number) => void;
}) {
  const hidden = useAmountPrivacy();
  const { total, incomplete } = selected;
  const estimated = selected.bankParts.some((row) => row.key === 'modeledInterest');
  const gaps: string[] = [];
  if (incomplete.modeledInterestMissingFxPeriods)
    gaps.push(`${incomplete.modeledInterestMissingFxPeriods} Zinszeiträume ohne EUR-Kurs`);
  if (incomplete.skippedForeignTrades)
    gaps.push(`${incomplete.skippedForeignTrades} Trades ohne Wechselkurs`);
  if (incomplete.skippedForeignBookings)
    gaps.push(`${incomplete.skippedForeignBookings} Buchungen ohne Wechselkurs`);
  return (
    <section className="sr-card sr-wide" aria-labelledby="cc-title">
      <div className="sr-head">
        <h2 id="cc-title">Kosten gesamt · {selected.year}</h2>
        <label>
          Kalenderjahr{' '}
          <select
            value={selected.year}
            onChange={(event) => selectYear(Number(event.target.value))}
          >
            {years.map(({ year, partial }) => (
              <option key={year} value={year}>
                {year}
                {partial ? ' · Teiljahr' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="sr-fig">
        <span>Kosten gesamt: Haushalt, Portfolio und Steuern</span>
        <strong data-testid="cc-total">
          {total ? eur(total.totalCents) : 'nicht ermittelbar'}
        </strong>
      </div>
      <p className="sr-range">
        {longDay(selected.from)} bis {longDay(selected.to)}
        {selected.partial ? ' · Teiljahr' : ''}
      </p>
      <p className="sr-range">
        Portfolio-Kostenquote (Gebühren und TER ohne Steuern):{' '}
        {hidden ? '•••' : ratioText(total?.ratioBp ?? null)} des Portfoliowerts am Periodenende
      </p>
      {gaps.length > 0 && (
        <p className="sr-note" data-testid="cc-incomplete">
          unvollständig: {gaps.join(', ')}.
        </p>
      )}
      <ValuationHint incomplete={selected.valuationNotes} />
      {selected.portfolioUnavailable && (
        <p className="sr-note">Portfolio-Kosten unvollständig: {selected.portfolioUnavailable}.</p>
      )}
      {total && (
        <>
          <DimensionChain
            precision="cent"
            label="Maßkette Kosten gesamt"
            terms={[
              { label: 'Haushalts-Bank- und Zinskosten', value: cents(total.householdCents) },
              { label: 'Portfolio-Gebühren', value: cents(total.portfolioFeeCents), op: '+' },
              { label: 'TER-Anteil', value: cents(total.terCents), op: '+' },
              { label: 'Steuern (einbehalten/erstattet)', value: cents(total.taxCents), op: '+' },
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
                  {selected.year}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">
                  Haushalt: Bank- und Zinskosten{estimated ? ' (teils geschätzt)' : ''}
                </th>
                <td className="n">{eur(total.householdCents)}</td>
              </tr>
              <tr>
                <th scope="row">Portfolio: Handels- und Depotgebühren</th>
                <td className="n">{eur(total.portfolioFeeCents)}</td>
              </tr>
              <tr>
                <th scope="row">Portfolio: TER-Anteil (geschätzt)</th>
                <td className="n">{eur(total.terCents)}</td>
              </tr>
              <tr>
                <th scope="row">Portfolio-Kosten (Basis der Kostenquote)</th>
                <td className="n">{eur(total.portfolioCostCents)}</td>
              </tr>
              <tr>
                <th scope="row">Steuern (einbehalten/erstattet)</th>
                <td className="n">{eur(total.taxCents)}</td>
              </tr>
              <tr>
                <th scope="row">Kosten gesamt</th>
                <td className="n">{eur(total.totalCents)}</td>
              </tr>
            </tbody>
          </ReportTable>
        </>
      )}
      {selected.bankParts.length > 0 && (
        <ReportTable
          caption="Gebühren und Zinsen im Detail"
          regionLabel="Gebühren und Zinsen im Detail"
          className="sr-table"
        >
          <thead>
            <tr>
              <th scope="col">Posten</th>
              <th scope="col" className="n">
                {selected.year}
              </th>
            </tr>
          </thead>
          <tbody>
            {selected.bankParts.map((part) => (
              <tr key={part.key}>
                <th scope="row">{part.name}</th>
                <td className="n">{eur(part.cents)}</td>
              </tr>
            ))}
          </tbody>
        </ReportTable>
      )}
      <ReportTable
        caption="Kosten gesamt je Kalenderjahr"
        regionLabel="Kosten gesamt je Kalenderjahr"
        className="sr-table"
        data-testid="cc-years"
      >
        <thead>
          <tr>
            <th scope="col">Kalenderjahr</th>
            <th scope="col" className="n">
              Kosten gesamt
            </th>
            <th scope="col" className="n">
              Portfolio-Kostenquote
            </th>
          </tr>
        </thead>
        <tbody>
          {years.map(({ year, total, partial, valuationNotes, incomplete }) => (
            <tr key={year}>
              <th scope="row">
                {year}
                {partial ? ' · Teiljahr' : ''}
                {Object.values(incomplete).some((value) => value > 0) && ' · unvollständig'}
              </th>
              <td className="n">{total ? eur(total.totalCents) : 'nicht ermittelbar'}</td>
              <td className="n">
                {hidden ? '•••' : ratioText(total?.ratioBp ?? null)}
                {valuationNotes.length > 0 && ' · Bewertung teils geschätzt'}
              </td>
            </tr>
          ))}
        </tbody>
      </ReportTable>
      <p className="sr-note">
        Handelsgebühren stammen aus den Bankkosten und fließen einmal in die Summe ein. TER und
        gegebenenfalls Kreditzinsen sind Schätzungen.
      </p>
    </section>
  );
}
