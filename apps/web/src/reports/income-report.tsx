import { useAmountPrivacy } from '@budget/ui';
import type { IncomeLineStatus } from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Clock,
  PlusCircle,
} from 'lucide-react';
import { eur, eurParts, shortDay } from '../ledger/format';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { incomeReportQuery, type IncomeReportData } from './month-api';
import { MonthReportFrame, monthTitle, shortMonth, useReportMonth } from './month-frame';
import { StackedMonthsChart, monthWithYear, type MonthSeries } from './month-charts';

/** Fill class and name per income type (ink steps; hatching is reserved for the classes). */
const FILL: Record<string, string> = {
  'income-salary': 'mr-fill-sal',
  'income-special': 'mr-fill-spe',
  'income-contribution': 'mr-fill-con',
  'income-side': 'mr-fill-sid',
  'income-gift': 'mr-fill-gif',
};
const fillOf = (typeId: string | null) => (typeId ? FILL[typeId] : undefined) ?? 'mr-fill-oth';

const STATUS: Record<
  IncomeLineStatus,
  { icon: typeof CheckCircle2; label: string; tone: '' | 'is-ok' | 'is-bad' }
> = {
  ok: { icon: CheckCircle2, label: 'eingegangen', tone: 'is-ok' },
  pending: { icon: Clock, label: 'erwartet', tone: '' },
  diff: { icon: AlertTriangle, label: 'abweichend', tone: '' },
  missing: { icon: AlertCircle, label: 'fehlt', tone: 'is-bad' },
  overdue: { icon: AlertCircle, label: 'überfällig', tone: 'is-bad' },
  unplanned: { icon: PlusCircle, label: 'ungeplant', tone: '' },
  unlinked: { icon: CircleDashed, label: 'nicht zugeordnet', tone: '' },
};

export function IncomeReport({ report, meta }: { report: ReportEntry; meta: PageMeta }) {
  useAmountPrivacy();
  const { month, shift, current } = useReportMonth();
  const query = useQuery(incomeReportQuery(month));
  const data = query.data;
  return (
    <MonthReportFrame
      report={report}
      meta={meta}
      month={month}
      shift={shift}
      current={current}
      firstMonth={data?.firstMonth}
      asOf={data?.asOf}
      basis={query.isError ? 'nicht verfügbar' : undefined}
    >
      <div className="mrep income-report" data-testid="income-report">
        {query.isPending && <LoadingNote what="Einnahmen" />}
        {query.isError && (
          <ErrorNote what="Einnahmen" error={query.error} onRetry={() => void query.refetch()} />
        )}
        {data?.beforeRecords && (
          <EmptyNote>
            Vor {shortMonth(data.firstMonth)} gibt es keine Aufzeichnungen. Die Einnahmen beginnen
            im {shortMonth(data.firstMonth)}.
          </EmptyNote>
        )}
        {data && !data.beforeRecords && <IncomeBody data={data} />}
      </div>
    </MonthReportFrame>
  );
}

function IncomeBody({ data }: { data: IncomeReportData }) {
  useAmountPrivacy();
  const { income, expected, window } = data;
  const parts = eurParts(income.earnedCents);
  const title = monthTitle(data.month, data.partial, data.asOf);
  const series: MonthSeries[] = window.rows.map((row) => ({
    key: row.typeId ?? 'none',
    name: row.name,
    fillClass: fillOf(row.typeId),
    perMonth: row.perMonth,
  }));
  const first = window.months[0] ?? data.month;
  const chartLabel = `Einnahmen nach Art, ${window.months.length} Monate bis ${monthWithYear(
    data.month,
  )}: ${eur(income.earnedCents)} im gewählten Monat.`;
  return (
    <>
      <section className="mr-card" aria-labelledby="inc-title">
        <div className="tbd-head">
          <h2 id="inc-title">Einnahmen {title}</h2>
          <span className="tbd-state">
            {expected.pendingCount > 0 ? (
              <span className="ink">
                <Clock className="icon icon-sm" size={16} strokeWidth={1.75} aria-hidden="true" />
                {expected.pendingCount} erwartet, {eur(expected.pendingCents, { cents: false })}
              </span>
            ) : expected.missingCount > 0 ? (
              <span className="mr-state-bad">
                <AlertCircle
                  className="icon icon-sm"
                  size={16}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                {expected.missingCount}{' '}
                {expected.missingCount === 1 ? 'Zahlung fehlt' : 'Zahlungen fehlen'}
              </span>
            ) : expected.unlinkedCount > 0 ? (
              <span className="ink">
                <CircleDashed
                  className="icon icon-sm"
                  size={16}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                {expected.unlinkedCount} noch nicht zugeordnet
              </span>
            ) : expected.lines.length > 0 ? (
              <span className="ok">
                <CheckCircle2
                  className="icon icon-sm"
                  size={16}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                alles Erwartete eingegangen
              </span>
            ) : null}
          </span>
        </div>
        <div className="tbd-fig" data-testid="income-total">
          {parts.whole}
          <span className="cents">,{parts.fraction} €</span>
        </div>
        <p className="mr-sub">Haushaltseinkommen ohne Kapitalerträge und Erstattungen.</p>
        {series.length > 0 ? (
          <>
            <StackedMonthsChart
              months={window.months}
              series={series}
              label={chartLabel}
              testId="income-chart"
            />
            <div className="legend" aria-hidden="true">
              {series.map((s) => (
                <span key={s.key}>
                  <i className={`mr-sw ${s.fillClass}`} />
                  {s.name}
                </span>
              ))}
            </div>
          </>
        ) : (
          <p className="vnote">In den letzten Monaten gibt es keine Einnahmen.</p>
        )}
      </section>

      <section className="mr-card" aria-labelledby="inc-exp-title">
        <div className="tbd-head">
          <h2 id="inc-exp-title">Erwartet gegen eingegangen</h2>
        </div>
        {expected.lines.length > 0 ? (
          <div
            className="mr-scroll"
            role="region"
            aria-label="Wiederkehrende Zahlungen, bei Bedarf horizontal verschiebbar"
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users must be able to scroll the table.
            tabIndex={0}
          >
            <table className="mr-table is-expected" data-testid="income-expected">
              <thead>
                <tr>
                  <th className="tech">Zahlung</th>
                  <th className="tech n">Erwartet</th>
                  <th className="tech n">Eingegangen</th>
                  <th className="tech">Status</th>
                </tr>
              </thead>
              <tbody>
                {expected.lines.map((line) => {
                  const s = STATUS[line.status];
                  const Icon = s.icon;
                  return (
                    <tr key={line.key} data-status={line.status}>
                      <td>
                        <strong>{line.name}</strong>
                        <small>
                          {line.sub}
                          {line.dueDate ? ` · ${shortDay(line.dueDate)}` : ''}
                        </small>
                      </td>
                      <td className="n">
                        {line.status === 'unplanned' ? '–' : eur(line.expectedCents)}
                      </td>
                      <td className="n">
                        {line.receivedCents > 0 ? eur(line.receivedCents) : '–'}
                      </td>
                      <td>
                        <span className={`mr-status ${s.tone}`}>
                          <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
                          {s.label}
                          {line.status === 'diff'
                            ? ` ${eur(line.differenceCents, { sign: true })}`
                            : ''}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="vnote">Für diesen Monat sind keine Einnahmen erwartet.</p>
        )}
        <p className="vnote">
          {data.expectedMaterialised
            ? 'Wiederkehrende Zahlungen ordnet der Nachtlauf automatisch zu; Abweichungen landen im Posteingang.'
            : 'Die wiederkehrenden Zahlungen stammen aus dem Zahlungsplan und sind für diesen Monat noch nicht zugeordnet; ob sie eingegangen sind, zeigt die Tabelle darunter.'}
          {data.foreignCurrencyCount > 0
            ? ` ${data.foreignCurrencyCount} wiederkehrende Zahlung${data.foreignCurrencyCount === 1 ? '' : 'en'} in Fremdwährung ${data.foreignCurrencyCount === 1 ? 'ist' : 'sind'} hier nicht enthalten.`
            : ''}
        </p>
      </section>

      <section className="mr-card mr-wide" aria-labelledby="inc-type-title">
        <div className="tbd-head">
          <h2 id="inc-type-title">
            Nach Art, {shortMonth(first)} bis {shortMonth(data.month)}
          </h2>
        </div>
        {window.rows.length > 0 ? (
          <div
            className="mr-scroll"
            role="region"
            aria-label="Einnahmen nach Art, bei Bedarf horizontal verschiebbar"
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users must be able to scroll the table.
            tabIndex={0}
          >
            <table className="mr-table is-types" data-testid="income-types">
              <thead>
                <tr>
                  <th className="tech">Art</th>
                  <th className="tech n">{shortMonth(data.month)}</th>
                  <th className="tech n">Ø Monat</th>
                  <th className="tech n">Summe {window.months.length} M</th>
                  <th className="tech n">Anteil</th>
                </tr>
              </thead>
              <tbody>
                {window.rows.map((row) => (
                  <tr key={row.typeId ?? 'none'}>
                    <td>
                      <i className={`mr-sw ${fillOf(row.typeId)}`} aria-hidden="true" />
                      {row.name}
                    </td>
                    <td className="n">{eur(row.monthCents)}</td>
                    <td className="n">{eur(row.averageCents)}</td>
                    <td className="n">
                      <strong>{eur(row.sumCents, { cents: false })}</strong>
                    </td>
                    <td className="n">{row.sharePercent} %</td>
                  </tr>
                ))}
                <tr className="is-total">
                  <td>Summe</td>
                  <td className="n">{eur(window.totalMonthCents)}</td>
                  <td className="n">{eur(window.totalAverageCents)}</td>
                  <td className="n">{eur(window.totalCents, { cents: false })}</td>
                  <td className="n">{window.totalCents > 0 ? '100 %' : '–'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <p className="vnote">Keine Einnahmen im Zeitraum.</p>
        )}
      </section>

      <CapitalSection data={data} />
    </>
  );
}

function CapitalSection({ data }: { data: IncomeReportData }) {
  useAmountPrivacy();
  const { window, income } = data;
  const cap = window.capital;
  return (
    <section
      className="mr-card mr-wide"
      aria-labelledby="inc-cap-title"
      data-testid="income-capital"
    >
      <div className="tbd-head">
        <h2 id="inc-cap-title">Kapitalerträge, kein Einkommen</h2>
        <span className="tbd-state">Zinsen und Ausschüttungen</span>
      </div>
      <div className="mr-cap-fig" data-testid="income-capital-total">
        {eur(income.capitalCents)}
      </div>
      {cap.sumCents > 0 ? (
        <>
          <StackedMonthsChart
            months={window.months}
            series={[
              {
                key: 'kap',
                name: 'Kapitalerträge',
                fillClass: 'mr-fill-kap',
                perMonth: cap.perMonth,
              },
            ]}
            label={`Kapitalerträge, ${window.months.length} Monate: ${eur(cap.sumCents)} insgesamt.`}
            testId="income-capital-chart"
            height={150}
          />
          <p className="vnote">
            {window.months.length} Monate: {eur(cap.sumCents)}, im Schnitt {eur(cap.averageCents)}{' '}
            je Monat.
          </p>
        </>
      ) : (
        <p className="vnote">In diesem Zeitraum sind keine Kapitalerträge gebucht.</p>
      )}
      <p className="vnote">
        Zinsen und Ausschüttungen zählen nicht zum Haushaltseinkommen: sie stehen weder in der
        Sparquote noch im Vergleich von Einnahmen und Ausgaben, im Geldfluss sind sie eigens
        ausgewiesen.
        {income.refundCents > 0
          ? ` Erstattungen ohne Kategorie (${eur(income.refundCents)}) sind ebenfalls keine Einnahme.`
          : ''}
      </p>
    </section>
  );
}
