import type {
  BaseStep,
  ComponentDelta,
  DevelopmentCents,
  ExcludedReason,
  MonthComparison,
  MonthValue,
  RealDevelopment,
  SalaryMonth,
  SalaryYear,
  VariablePayYear,
} from '@budget/domain';
import { privateAmount, useAmountPrivacy } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';
import { eur } from '../ledger/format';
import { EmptyNote } from '../ledger/states';
import { ReportTable } from './report-table';
import { shortMonth } from './month-frame';
import { PayrollProjectChart } from './payroll-project-chart';

interface RealComparison {
  base: RealDevelopment | null;
  total: RealDevelopment | null;
}
interface Development {
  base: { levels: MonthValue[]; steps: BaseStep[] };
  months: SalaryMonth[];
  years: SalaryYear[];
  monthComparisons: MonthComparison[];
  variablePay: VariablePayYear[];
  real: {
    official: RealComparison & { available: boolean };
    personal: RealComparison & { reason: keyof typeof personalMissing | null };
  };
}

const components = {
  base: 'Grundgehalt',
  special: 'Sonderzahlungen',
  variable: 'Bonus',
  total: 'Summe',
} satisfies Record<keyof DevelopmentCents, string>;
const componentKeys = Object.keys(components) as (keyof DevelopmentCents)[];
const reasonText: Record<ExcludedReason, string> = {
  gap: 'Gehaltszettel fehlt',
  unmapped: 'Lohnart nicht zugeordnet',
  line_check: 'Lohnzeilen und Brutto stimmen nicht überein',
  gross_unknown: 'Brutto fehlt',
  no_wage_lines: 'Keine ausgelesenen Lohnzeilen',
  partial: 'Teilmonat',
  edge: 'Gehaltsstufe nur in einem Randmonat belegt',
  no_counterpart: 'Vergleichsmonat fehlt',
};
const personalMissing = {
  months: 'Der persönliche Preisindex braucht mindestens 13 abgeschlossene Monate.',
  basket: 'Für den persönlichen Preisindex fehlen Preis- oder Ausgabendaten im Warenkorb.',
  cpi: 'Für den persönlichen Warenkorb fehlen ausreichend Monate der amtlichen Teilindizes.',
};

const percent = new Intl.NumberFormat('de-AT', {
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
});
const indexNumber = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 2 });
const bp = (value: number | null, signed = true) => {
  if (value === null) return '–';
  const number = percent.format(value / 100).replace('-', '−');
  return privateAmount(`${signed ? number : number.replace(/^\+/, '')} %`);
};
const index = (value: number | null) =>
  value === null ? '–' : privateAmount(indexNumber.format(value / 10_000).replace('-', '−'));
const difference = (delta: ComponentDelta) =>
  `${eur(delta.deltaCents, { sign: true })}${delta.deltaBp === null ? '' : ` · ${bp(delta.deltaBp)}`}`;
const reasons = (items: ExcludedReason[]) => items.map((item) => reasonText[item]).join(' · ');

function BaseSalary({ base, months }: Pick<Development, 'base' | 'months'>) {
  const recent = base.levels.at(-1);
  const levels = new Map(base.levels.map((m) => [m.month, m.cents]));
  return (
    <section className="mr-card mr-wide" data-testid="payroll-base-steps">
      <h2>Grundgehalt · Gehaltsstufen</h2>
      {recent ? (
        <>
          <p className="tbd-fig">
            <strong>{eur(recent.cents)}</strong>{' '}
            <small className="payroll-base-period">brutto · {shortMonth(recent.month)}</small>
          </p>
          <PayrollProjectChart
            table
            focusSalary
            salaryLabel="Monatliches Grundgehalt brutto"
            height={176}
            months={months.map((m) => m.month)}
            values={months.map((m) => levels.get(m.month) ?? null)}
          />
        </>
      ) : (
        <EmptyNote>Für eine belegte Grundgehaltsstufe fehlen vergleichbare Monate.</EmptyNote>
      )}
      {base.steps.length > 0 && (
        <ReportTable caption="Gehaltsstufen brutto" regionLabel="Gehaltsstufen" className="rtable">
          <thead>
            <tr>
              <th>Ab Monat</th>
              <th className="n">Vorher</th>
              <th className="n">Nachher</th>
              <th className="n">Änderung</th>
              <th>Hinweis</th>
            </tr>
          </thead>
          <tbody>
            {base.steps.map((s) => (
              <tr key={s.effectiveMonth}>
                <th scope="row">{shortMonth(s.effectiveMonth)}</th>
                <td className="n">{eur(s.oldCents)}</td>
                <td className="n">{eur(s.newCents)}</td>
                <td className="n">{difference(s)}</td>
                <td>
                  {s.uncertain ? reasonText[s.uncertain] : '–'}
                  {s.retroactiveFrom && <div>Nachzahlung ab {shortMonth(s.retroactiveFrom)}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </ReportTable>
      )}
      <p className="vnote">
        Die Stufen zeigen das monatliche Grundgehalt ohne Nachzahlungen. Lücken unterbrechen die
        Linie.
      </p>
    </section>
  );
}

function YearComparison({ years, months }: Pick<Development, 'years' | 'months'>) {
  const includedYears = new Set(months.filter((m) => m.comparable).map((m) => m.month.slice(0, 4)));
  return (
    <section className="mr-card mr-wide" data-testid="payroll-dev-years">
      <h2>Gehaltsentwicklung je Jahr</h2>
      <ReportTable
        caption="Gehaltsentwicklung je Jahr"
        regionLabel="Gehaltsjahre"
        className="rtable"
      >
        <thead>
          <tr>
            <th>Jahr</th>
            {componentKeys.map((key) => (
              <th className="n" key={key}>
                {components[key]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...years].reverse().map(({ year, development }) => (
            <tr key={year}>
              <th scope="row">
                {year}
                {!development.complete && <small>Unvollständig</small>}
              </th>
              {componentKeys.map((key) => (
                <td key={key} className="n">
                  {includedYears.has(year) ? eur(development.cents[key]) : '–'}
                  {development.change && <small>{difference(development.change[key])}</small>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </ReportTable>
      <p className="vnote">
        Bruttobeträge aus vergleichbaren Monaten. Sonderzahlungen und Bonus zählen im
        Auszahlungsmonat. Die Änderung steht unter dem Betrag, wenn beide Kalenderjahre vollständig
        sind.
      </p>
    </section>
  );
}

function SameMonthComparison({
  monthComparisons,
  months,
}: Pick<Development, 'monthComparisons' | 'months'>) {
  const byMonth = new Map(months.map((month) => [month.month, month]));
  const comparisons = monthComparisons.filter((comparison) =>
    byMonth.has(comparison.previousMonth),
  );
  return (
    <section className="mr-card mr-wide">
      <h2>Gleicher Monat im Vorjahr</h2>
      {comparisons.length === 0 ? (
        <EmptyNote>Zum Vergleich fehlen Gehaltsmonate im Vorjahr.</EmptyNote>
      ) : (
        <ReportTable
          caption="Gleicher Monat im Vorjahr"
          regionLabel="Monatsvergleich"
          className="rtable"
        >
          <thead>
            <tr>
              <th>Monat · Vorjahresmonat</th>
              {componentKeys.map((key) => (
                <th className="n" key={key}>
                  {components[key]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...comparisons].reverse().map(({ month, previousMonth, change, reasons: why }) => {
              const current = byMonth.get(month)!;
              const previous = byMonth.get(previousMonth)!;
              return (
                <tr key={month}>
                  <th scope="row">
                    {shortMonth(month)}
                    <small>{shortMonth(previousMonth)}</small>
                    {current.hasSpecial && <small>Sonderzahlung im aktuellen Monat</small>}
                    {current.hasVariable && <small>Bonus im aktuellen Monat</small>}
                  </th>
                  {change ? (
                    componentKeys.map((key) => (
                      <td className="n" key={key}>
                        {eur(key === 'total' ? current.developmentCents : current.components[key])}
                        <small>
                          {eur(
                            key === 'total' ? previous.developmentCents : previous.components[key],
                          )}
                        </small>
                        <div>{difference(change[key])}</div>
                      </td>
                    ))
                  ) : (
                    <td colSpan={4}>
                      {why.current.length > 0 && (
                        <div>
                          {shortMonth(month)} · {reasons(why.current)}
                        </div>
                      )}
                      {why.previous.length > 0 && (
                        <div>
                          {shortMonth(previousMonth)} · {reasons(why.previous)}
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </ReportTable>
      )}
      {comparisons.length > 0 && (
        <p className="vnote">
          Je Komponente stehen der aktuelle Betrag, der Vorjahresbetrag und die Änderung.
        </p>
      )}
    </section>
  );
}

function VariablePay({ years }: { years: VariablePayYear[] }) {
  return (
    <section className="mr-card mr-wide">
      <h2>Bonus und Abzüge</h2>
      {years.length === 0 ? (
        <EmptyNote>Für den Zeitraum ist kein Bonus zugeordnet.</EmptyNote>
      ) : (
        <ReportTable caption="Bonus und Abzüge" regionLabel="Bonus je Jahr" className="rtable">
          <thead>
            <tr>
              <th>Jahr</th>
              <th className="n">Ausgezahlt · brutto</th>
              <th className="n">Vergleichbar · brutto</th>
              <th className="n">Anteil am Grundgehalt</th>
              <th className="n">Sozialversicherung</th>
              <th className="n">Lohnsteuer</th>
              <th className="n">Netto nach SV und Lohnsteuer</th>
            </tr>
          </thead>
          <tbody>
            {[...years].reverse().map((row) => (
              <tr key={row.year}>
                <th scope="row">
                  {row.year}
                  {!row.complete && <small>Unvollständig</small>}
                </th>
                <td className="n">{eur(row.paidVariableCents)}</td>
                <td className="n">{eur(row.grossCents)}</td>
                <td className="n">{bp(row.shareOfBaseBp, false)}</td>
                {row.attributable ? (
                  <>
                    <td className="n">{eur(row.attributable.svCents)}</td>
                    <td className="n">{eur(row.attributable.taxCents)}</td>
                    <td className="n">{eur(row.attributable.netCents)}</td>
                  </>
                ) : (
                  <td colSpan={3}>
                    {row.grossCents === 0
                      ? 'Kein vergleichbarer Bonusbetrag'
                      : 'Abzüge sind dem Bonus nicht eindeutig zuordenbar.'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </ReportTable>
      )}
    </section>
  );
}

function Uncertainty({
  months,
  monthComparisons,
}: Pick<Development, 'months' | 'monthComparisons'>) {
  const byMonth = new Map(monthComparisons.map(({ month, reasons }) => [month, reasons.current]));
  const rows = months.filter(
    (m) => (byMonth.get(m.month)?.length ?? 0) > 0 || m.unmapped.length > 0,
  );
  if (!rows.length) return null;
  return (
    <section className="mr-card mr-wide">
      <h2>Lücken und unsichere Monate</h2>
      <ReportTable
        caption="Lücken und unsichere Monate"
        regionLabel="Datenlücken"
        className="rtable"
      >
        <thead>
          <tr>
            <th>Monat</th>
            <th>Grund</th>
          </tr>
        </thead>
        <tbody>
          {[...rows].reverse().map((month) => (
            <tr key={month.month}>
              <th scope="row">{shortMonth(month.month)}</th>
              <td>
                {reasons(byMonth.get(month.month) ?? [])}
                {month.unmapped.map((line, i) => (
                  <div key={i}>
                    {[line.code, line.label, eur(line.amountCents)].filter(Boolean).join(' · ')}
                  </div>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </ReportTable>
    </section>
  );
}

function RealSeries({
  data,
  basis,
  benchmark,
}: {
  data: RealDevelopment | null;
  basis: string;
  benchmark: string;
}) {
  const name = `${basis} · ${benchmark}`;
  return (
    <>
      <h3>{basis}</h3>
      {!data ? (
        <EmptyNote>Es fehlt ein gemeinsamer Ausgangsmonat mit Gehalt und Preisindex.</EmptyNote>
      ) : (
        <>
          <p className="vnote">Vergleichsbasis: {shortMonth(data.startMonth)} = 100.</p>
          <ReportTable
            caption={`${name} je Jahr`}
            regionLabel={`${name} je Jahr`}
            className="rtable"
          >
            <thead>
              <tr>
                <th>Jahr</th>
                <th>Letzter Monat</th>
                <th className="n">Monate</th>
                <th className="n">Preisabstand in Euro</th>
                <th className="n">Real zur Basis</th>
              </tr>
            </thead>
            <tbody>
              {[...data.years].reverse().map((year) => (
                <tr key={year.year}>
                  <th scope="row">{year.year}</th>
                  <td>{year.lastMonth ? shortMonth(year.lastMonth) : '–'}</td>
                  <td className="n">{year.months}</td>
                  <td className="n">
                    {year.months > 0 ? eur(year.gapCents, { sign: true }) : '–'}
                  </td>
                  <td className="n">{bp(year.realChangeBp)}</td>
                </tr>
              ))}
            </tbody>
          </ReportTable>
          <details className="payroll-index-details">
            <summary>Indexwerte je Monat</summary>
            <ReportTable
              caption={`${name} je Monat`}
              regionLabel={`${name} je Monat`}
              className="rtable"
            >
              <thead>
                <tr>
                  <th>Monat</th>
                  <th className="n">Nominal</th>
                  <th className="n">Preise</th>
                  <th className="n">Real</th>
                  <th className="n">Preisabstand</th>
                </tr>
              </thead>
              <tbody>
                {[...data.points].reverse().map((point) => (
                  <tr key={point.month}>
                    <th scope="row">{shortMonth(point.month)}</th>
                    {point.realIndexMicro === null ? (
                      <td colSpan={4}>
                        {point.valueCents === null
                          ? 'Kein vergleichbarer Gehaltsbetrag'
                          : 'Preisindex für diesen Monat fehlt'}
                      </td>
                    ) : (
                      <>
                        <td className="n">{index(point.nominalIndexMicro)}</td>
                        <td className="n">{index(point.priceIndexMicro)}</td>
                        <td className="n">{index(point.realIndexMicro)}</td>
                        <td className="n">
                          {point.gapCents === null ? '–' : eur(point.gapCents, { sign: true })}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </ReportTable>
          </details>
        </>
      )}
    </>
  );
}

function RealComparisonCard({
  label,
  data,
  missing,
}: {
  label: string;
  data: RealComparison;
  missing: string | null;
}) {
  return (
    <section className="mr-card mr-wide">
      <h2>{label}</h2>
      {missing ? (
        <EmptyNote>{missing}</EmptyNote>
      ) : (
        <>
          <RealSeries data={data.base} basis="Grundgehalt" benchmark={label} />
          <RealSeries
            data={data.total}
            basis="Grundgehalt, Sonderzahlungen und Bonus"
            benchmark={label}
          />
          <p className="vnote">
            Der Preisabstand vergleicht den Monatsbetrag mit dem um die Preisentwicklung erhöhten
            oder gesenkten Ausgangsbetrag. Im Jahr werden nur Monate mit beiden Werten summiert. Die
            reale Änderung gilt bis zum letzten angegebenen Monat.
          </p>
        </>
      )}
    </section>
  );
}

export function PayrollDevelopment({ month }: { month: string }) {
  useAmountPrivacy();
  const query = useQuery({
    queryKey: [...LEDGER_KEY, 'payroll-development', month],
    retry: false,
    queryFn: () => request<Development>('GET', `/api/payslips/development?throughMonth=${month}`),
  });
  if (query.isError)
    return <EmptyNote>Die Gehaltsentwicklung konnte nicht geladen werden.</EmptyNote>;
  const data = query.data;
  if (!data) return null;
  if (!data.months.length) return <EmptyNote>Für die Entwicklung fehlen Gehaltszettel.</EmptyNote>;
  return (
    <>
      <BaseSalary base={data.base} months={data.months} />
      <YearComparison years={data.years} months={data.months} />
      <SameMonthComparison monthComparisons={data.monthComparisons} months={data.months} />
      <VariablePay years={data.variablePay} />
      <Uncertainty months={data.months} monthComparisons={data.monthComparisons} />
      <RealComparisonCard
        label="Kaufkraft · Verbraucherpreisindex"
        data={data.real.official}
        missing={
          data.real.official.available
            ? null
            : 'Es ist noch kein Verbraucherpreisindex gespeichert.'
        }
      />
      <RealComparisonCard
        label="Kaufkraft · Persönlicher Preisindex"
        data={data.real.personal}
        missing={data.real.personal.reason ? personalMissing[data.real.personal.reason] : null}
      />
    </>
  );
}
