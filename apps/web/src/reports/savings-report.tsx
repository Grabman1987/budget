import { ReportPeriodControl } from './period-quick-select';
import { useAmountPrivacy, DimensionChain } from '@budget/ui';
import {
  cents,
  monthIncomeOfRole,
  reportPeriodMonths,
  savingsOverview,
  type MoneyAgePoint,
} from '@budget/domain';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useMemo } from 'react';
import { eur } from '../ledger/format';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { ZEITRAUM_VALUES, useZeitraum } from '../wealth/zeitraum';
import { MoneyAgeChart, SavingsChart } from './table-charts';
import { monthShort, percentTenth, percentWhole, periodName } from './table-format';
import { TableReportFrame, useReportTables } from './table-report-frame';
import type { ReportTables } from './table-reports-api';

const PERIOD_OPTIONS = ZEITRAUM_VALUES.map((value) => ({ value, label: value }));

/** 1.7 Sparquote und Geldalter: how much is left, and how old the money is that gets spent. */
export function SavingsReport({ report, meta }: { report: ReportEntry; meta: PageMeta }) {
  useAmountPrivacy();
  const [period, setPeriod] = useZeitraum();
  const query = useReportTables();
  return (
    <TableReportFrame
      report={report}
      meta={meta}
      through="full"
      currentAllowed={period.includes('..')}
      query={query}
      className="savings-report"
      extraFields={[
        {
          label: 'Zeitraum',
          value: (
            <ReportPeriodControl
              label="Zeitraum"
              options={PERIOD_OPTIONS}
              value={period}
              onChange={setPeriod}
              className="seg-period"
            />
          ),
        },
      ]}
    >
      {(data) => <SavingsBody data={data} period={period} />}
    </TableReportFrame>
  );
}

const days = (n: number) => `${n} ${n === 1 ? 'Tag' : 'Tage'}`;

/** Maßkette in days: the dimension chain markup without euros. */
function DaysChain({
  label,
  terms,
}: {
  label: string;
  terms: ReadonlyArray<{ label: string; value: string; op?: '+' | '−' | '='; result?: boolean }>;
}) {
  useAmountPrivacy();
  return (
    <div className="chain-inline" role="group" aria-label={label}>
      {terms.map((term, i) => (
        <span className="ct-pair" key={`${term.label}-${i}`}>
          {term.op && (
            <span className="ct-op" aria-hidden="true">
              {term.op}
            </span>
          )}
          <span className={term.result || term.op === '=' ? 'ct-term is-result' : 'ct-term'}>
            <span className="ct-label tech">{term.label}</span>
            <span className="ct-val">{term.value}</span>
          </span>
        </span>
      ))}
    </div>
  );
}

function SavingsBody({
  data,
  period,
}: {
  data: ReportTables;
  period: (typeof ZEITRAUM_VALUES)[number];
}) {
  useAmountPrivacy();
  const window = useMemo(
    () =>
      data.firstMonth && (data.lastFullMonth || period.includes('..'))
        ? reportPeriodMonths(
            period,
            period.includes('..') ? data.currentMonth : data.lastFullMonth!,
            data.firstMonth,
          )
        : [],
    [data.firstMonth, data.lastFullMonth, data.currentMonth, period],
  );
  const overview = useMemo(
    () =>
      savingsOverview(
        data.months,
        data,
        window,
        period.includes('..') ? data.currentMonth : data.lastFullMonth,
      ),
    [data, window, period],
  );
  const { window: w } = overview;
  const target = data.targets.savingsRateBp;
  const reached = w.rateBp !== null && w.rateBp >= target;
  const capital = window.reduce((total, month) => {
    const m = data.months.find((x) => x.month === month);
    return m ? total + monthIncomeOfRole(m, data, 'capital') : total;
  }, 0);

  const known = overview.moneyAge.filter(
    (p): p is MoneyAgePoint & { days: number } => p.days !== null,
  );
  const first = known[0];
  const now = known[known.length - 1];
  const goal = data.targets.moneyAgeDays;
  const agePoints = overview.moneyAge;

  const chartLabel = `Sparquote je Monat (Balken) und rollierend über 12 Monate (Linie), Ziel ${percentWhole(target)}${
    overview.rollingBp === null ? '' : `, rollierend zuletzt ${percentTenth(overview.rollingBp)}`
  }.`;

  return (
    <>
      <div className="tr-pair">
        <section className="tr-card" aria-labelledby="savings-title">
          <div className="tbd-head">
            <h2 id="savings-title">Sparquote · {periodName(period, window)}</h2>
            <span className="tbd-state">
              <span className={reached ? 'ok' : 'ink'}>
                {reached ? (
                  <CheckCircle2
                    className="icon icon-sm"
                    size={16}
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                ) : (
                  <AlertTriangle
                    className="icon icon-sm"
                    size={16}
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                )}
                Ziel ≥ {percentWhole(target)} (R01)
              </span>
            </span>
          </div>
          <div className="tbd-fig" data-testid="savings-rate">
            {w.rateBp === null ? '–' : percentTenth(w.rateBp)}
          </div>
          <DimensionChain
            label="Maßkette Sparquote"
            terms={[
              { label: 'Einnahmen', value: cents(w.incomeCents) },
              { label: 'Konsum', value: cents(w.consumptionCents), op: '-' },
              { label: 'Gespart', value: cents(w.savedCents), op: '=', result: true },
            ]}
          />
          {w.rateBp === null && (
            <p className="vnote" role="status">
              Im Zeitraum gibt es keine Einnahmen, deshalb keine Sparquote.
            </p>
          )}
          {overview.series.length > 0 && (
            <>
              <SavingsChart points={overview.series} targetBp={target} label={chartLabel} />
              <ul className="chart-legend">
                <li>
                  <i className="lg-sq lg-mkt" aria-hidden="true" />
                  je Monat
                </li>
                <li>
                  <svg aria-hidden="true" viewBox="0 0 32 8">
                    <line x1="0" x2="32" y1="4" y2="4" className="l-actual" />
                  </svg>
                  rollierend 12 Monate
                  {overview.rollingBp === null
                    ? ' · ab 12 Monaten Daten'
                    : ` · jetzt ${percentTenth(overview.rollingBp)}`}
                </li>
                <li>
                  <svg aria-hidden="true" viewBox="0 0 32 8">
                    <line x1="0" x2="32" y1="4" y2="4" className="l-plan" />
                  </svg>
                  Ziel {percentWhole(target)}
                </li>
              </ul>
            </>
          )}
          <p className="vnote" data-testid="capital-note">
            Einnahmen ohne Kapitalerträge (Erstattungen mindern die Ausgaben ihrer Kategorie);
            Konsum = Bedarf plus Wunsch.{' '}
            {capital > 0
              ? `Kapitalerträge im Zeitraum: ${eur(capital, { cents: false })}, nicht in der Sparquote.`
              : 'Im Zeitraum gab es keine Kapitalerträge.'}
          </p>
        </section>

        <section className="tr-card" aria-labelledby="age-title">
          <div className="tbd-head">
            <h2 id="age-title">Geldalter</h2>
            {now && (
              <span className="tbd-state">
                <span className={now.days >= goal ? 'ok' : 'ink'}>
                  {now.days >= goal ? (
                    <CheckCircle2
                      className="icon icon-sm"
                      size={16}
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  ) : (
                    <AlertTriangle
                      className="icon icon-sm"
                      size={16}
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  )}
                  Ziel ≥ {days(goal)} (R03)
                </span>
              </span>
            )}
          </div>
          {first && now ? (
            <>
              <div className="tbd-fig" data-testid="money-age">
                {now.days}
                <span className="cents"> {now.days === 1 ? 'Tag' : 'Tage'}</span>
              </div>
              <DaysChain
                label="Maßkette Geldalter"
                terms={[
                  { label: monthShort(first.month), value: days(first.days) },
                  {
                    label: 'seither',
                    value: days(Math.abs(now.days - first.days)),
                    op: now.days >= first.days ? '+' : '−',
                  },
                  { label: 'heute', value: days(now.days), op: '=', result: true },
                  { label: 'Ziel', value: days(goal), op: '−' },
                  {
                    label: now.days >= goal ? 'darüber' : 'fehlen',
                    value: days(Math.abs(goal - now.days)),
                    op: '=',
                    result: true,
                  },
                ]}
              />
              <MoneyAgeChart
                points={agePoints}
                targetDays={goal}
                label={`Geldalter in Tagen am Monatsende, zuletzt ${days(now.days)}, Ziel ${days(goal)}.`}
              />
            </>
          ) : (
            <p className="vnote" role="status">
              Noch kein Geldalter: Es braucht Einnahmen und danach Ausgaben auf den Budgetkonten.
            </p>
          )}
          <p className="vnote">
            Geldalter = wie viele Tage ein ausgegebener Euro im Schnitt auf dem Konto lag (zuerst
            eingegangenes Geld wird zuerst ausgegeben, Durchschnitt der letzten zehn Ausgaben). Ab{' '}
            {days(goal)} lebt ihr vom Geld des Vormonats. Der letzte Punkt ist der Stand heute.
          </p>
        </section>
      </div>

      <section className="tr-card" aria-labelledby="years-title">
        <div className="tbd-head">
          <h2 id="years-title">Je Jahr</h2>
        </div>
        <div
          className="rscroll"
          role="region"
          aria-label="Jahrestabelle, bei Bedarf horizontal verschiebbar"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users must be able to scroll the complete table.
          tabIndex={0}
        >
          <table className="rtable">
            <caption className="sr-only">Sparquote und Geldalter je Kalenderjahr</caption>
            <thead>
              <tr>
                <th scope="col" className="tech">
                  Jahr
                </th>
                <th scope="col" className="tech n">
                  Einnahmen
                </th>
                <th scope="col" className="tech n">
                  Konsum
                </th>
                <th scope="col" className="tech n">
                  Gespart
                </th>
                <th scope="col" className="tech n">
                  Sparquote
                </th>
                <th scope="col" className="tech n">
                  Ø Geldalter
                </th>
              </tr>
            </thead>
            <tbody>
              {overview.years.map((y) => (
                <tr key={y.year}>
                  <th scope="row">
                    {y.year}
                    {y.months < 12 && <small className="muted"> {y.months} Monate</small>}
                  </th>
                  <td className="n">{eur(y.incomeCents, { cents: false })}</td>
                  <td className="n">{eur(y.consumptionCents, { cents: false })}</td>
                  <td className="n">{eur(y.incomeCents - y.consumptionCents, { cents: false })}</td>
                  <td className="n">
                    <strong>{y.rateBp === null ? '–' : percentTenth(y.rateBp)}</strong>
                  </td>
                  <td className="n">
                    {y.averageMoneyAgeDays === null ? '–' : days(y.averageMoneyAgeDays)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
