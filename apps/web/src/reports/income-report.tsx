import { ReportBodyDisclosure } from './report-body-disclosure';
import { addMonths, cents } from '@budget/domain';
import { useAmountPrivacy } from '@budget/ui';
import type { ReactNode } from 'react';
import { ReportProjectScopeNote } from './report-project-scope';
import type { ExpectedIncomeLine, IncomeLineStatus } from '@budget/domain';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import { useQuery } from '@tanstack/react-query';
import {
  CircleAlert,
  TriangleAlert,
  CircleCheck,
  CircleDashed,
  Clock,
  PlusCircle,
} from 'lucide-react';
import { eur, eurParts, shortDay } from '../ledger/format';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { incomeReportQuery, type IncomeReportData } from './month-api';
import {
  MonthControl,
  MonthReportFrame,
  monthTitle,
  shortMonth,
  useReportMonth,
} from './month-frame';
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
  { icon: typeof CircleCheck; label: string; tone: '' | 'is-ok' | 'is-bad' }
> = {
  ok: { icon: CircleCheck, label: 'eingegangen', tone: 'is-ok' },
  pending: { icon: Clock, label: 'erwartet', tone: '' },
  diff: { icon: TriangleAlert, label: 'abweichend', tone: '' },
  missing: { icon: CircleAlert, label: 'fehlt', tone: 'is-bad' },
  overdue: { icon: CircleAlert, label: 'überfällig', tone: 'is-bad' },
  unplanned: { icon: PlusCircle, label: 'ungeplant', tone: '' },
  unlinked: { icon: CircleDashed, label: 'nicht zugeordnet', tone: '' },
};

export function IncomeReport({
  report,
  meta,
  projectId,
  viewControl,
}: {
  report: ReportEntry;
  meta: PageMeta;
  projectId?: string | undefined;
  viewControl?: ReactNode;
}) {
  useAmountPrivacy();
  const { month, shift, current } = useReportMonth();
  const query = useQuery(incomeReportQuery(month, projectId));
  // Preserve the legacy path; project facts fail closed while rereading or after a scoped error.
  const data = projectId
    ? query.isSuccess && !query.isFetching
      ? query.data
      : undefined
    : query.data;
  return (
    <MonthReportFrame
      calculation={
        data && !data.beforeRecords && !query.isFetching && !query.isError
          ? {
              label: 'Berechnung Haushaltseinnahmen',
              terms: [{ label: 'Haushalt · gebucht', value: cents(data.income.earnedCents) }],
              result: {
                label: 'Haushaltseinnahmen · Buchungsdatum',
                value: data.income.earnedCents,
                unit: 'money',
              },
            }
          : undefined
      }
      verdict={
        data && !query.isFetching && !query.isError
          ? {
              reportId: report.id,
              period: data.month,
              partial: data.partial,
              unavailable: data.beforeRecords,
              metric: {
                label: 'Einnahmen',
                value: data.income.earnedCents,
                unit: 'money',
                better: 'higher',
              },
              comparisons: [
                { reference: 'Monatsdurchschnitt', value: data.window.totalAverageCents },
              ],
            }
          : undefined
      }
      report={report}
      meta={meta}
      month={month}
      shift={shift}
      current={current}
      firstMonth={data?.firstMonth}
      asOf={data?.asOf}
      basis={query.isError ? 'nicht verfügbar' : undefined}
      reportControls={viewControl}
    >
      <div className="mrep income-report" data-testid="income-report">
        {data && !query.isFetching && !query.isError && 'project' in data && (
          <ReportProjectScopeNote project={data.project} asOf={data.asOf} view="income" />
        )}
        {(query.isPending || (projectId && query.isFetching)) && <LoadingNote what="Einnahmen" />}
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

function IncomeBody({
  data,
  showExpectations = true,
}: {
  data: IncomeReportData;
  showExpectations?: boolean;
}) {
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
      {showExpectations && REDESIGN_ENABLED && <IncomeExpectations data={data} />}
      <section className="mr-card" aria-labelledby="inc-title">
        <div className="tbd-head">
          <h2 id="inc-title">Einnahmen {title}</h2>
          <span className="tbd-state">
            {expected === null ? null : expected.pendingCount > 0 ? (
              <span className="ink">
                <Clock className="icon icon-sm" size={16} strokeWidth={1.75} aria-hidden="true" />
                {expected.pendingCount} erwartet, {eur(expected.pendingCents, { cents: false })}
              </span>
            ) : expected.missingCount > 0 ? (
              <span className="mr-state-bad">
                <CircleAlert
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
                <CircleCheck
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

      {data.contactWriteOffs.length > 0 && (
        <section className="mr-card" aria-labelledby="inc-contact-title">
          <h2 id="inc-contact-title">Sonstige Einnahmen · Ausgleich Kontakt</h2>
          <p>
            Bereits vorhandenes Geld wird ins Budget übernommen. Kein Haushaltseinkommen und keine
            Kapitalerträge.
          </p>
          {data.contactWriteOffs.map((s) => (
            <p key={s.bookingId}>
              <a href={`/konten/buchungen?buchung=${encodeURIComponent(s.bookingId)}`}>
                {shortDay(s.date)} · {eur(s.amountCents)}
              </a>
            </p>
          ))}
        </section>
      )}

      {showExpectations && !REDESIGN_ENABLED && <IncomeExpectations data={data} />}
      <ReportBodyDisclosure id="income-types" label="Einnahmen nach Art und Monat">
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
      </ReportBodyDisclosure>
      <ReportBodyDisclosure id="income-capital" label="Kapitalerträge und Erstattungen, separat">
        <CapitalSection data={data} />
      </ReportBodyDisclosure>
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

/** Presentation only: unresolved domain statuses stay visible; no receipt is inferred. */
export function IncomeExpectations({
  data,
  controls,
  comparison,
  fallback,
}: {
  data?:
    | Pick<IncomeReportData, 'expected' | 'expectedMaterialised' | 'foreignCurrencyCount'>
    | undefined;
  controls?: ReactNode;
  comparison?: ReactNode;
  fallback?: ReactNode;
}) {
  useAmountPrivacy();
  const expected = data?.expected ?? null;
  const open =
    expected?.lines.filter(
      (line) => !REDESIGN_ENABLED || (line.status !== 'ok' && line.status !== 'unplanned'),
    ) ?? [];
  const received =
    expected?.lines.filter((line) => line.status === 'ok' || line.status === 'unplanned') ?? [];
  return (
    <section className="mr-card" aria-labelledby="inc-exp-title">
      <div className="tbd-head">
        <h2 id="inc-exp-title" tabIndex={REDESIGN_ENABLED ? -1 : undefined}>
          Erwartet gegen eingegangen
        </h2>
        {controls}
      </div>
      {!data ? (
        fallback
      ) : expected === null ? (
        <p className="vnote">
          Erwartete Zahlungen sind keinem Projekt zugeordnet. Für diesen Projektfilter sind
          Erwartungswerte und Fehlend-Status daher nicht verfügbar; tatsächliche Einnahmen bleiben
          sichtbar.
        </p>
      ) : (
        <div data-testid={expected.lines.length ? 'income-expected' : undefined}>
          {open.length > 0 ? (
            <ExpectedIncomeTable lines={open} />
          ) : (
            <p className="vnote">
              {expected.lines.length
                ? 'Keine offenen erwarteten Einnahmen.'
                : 'Für diesen Monat sind keine Einnahmen erwartet.'}
            </p>
          )}
          {REDESIGN_ENABLED && received.length > 0 && (
            <ReportBodyDisclosure
              id="income-received"
              label={`Eingegangene und ungeplante Einnahmen · ${received.length}`}
            >
              <ExpectedIncomeTable lines={received} />
            </ReportBodyDisclosure>
          )}
          {comparison}
          <p className="vnote">
            {data.expectedMaterialised
              ? 'Wiederkehrende Zahlungen ordnet der Nachtlauf automatisch zu; Abweichungen landen unter Prüfen.'
              : 'Die wiederkehrenden Zahlungen stammen aus dem Zahlungsplan und sind für diesen Monat noch nicht zugeordnet; ob sie eingegangen sind, zeigt die Tabelle darunter.'}
            {data.foreignCurrencyCount !== null && data.foreignCurrencyCount > 0
              ? ` ${data.foreignCurrencyCount} wiederkehrende Zahlung${data.foreignCurrencyCount === 1 ? '' : 'en'} in Fremdwährung ${data.foreignCurrencyCount === 1 ? 'ist' : 'sind'} hier nicht enthalten.`
              : ''}
          </p>
        </div>
      )}
    </section>
  );
}

/** Monthly expectations keep their existing income source inside the period report. */
export function IntegratedIncomeExpectations({
  month,
  currentMonth,
  firstMonth,
  projectId,
  setMonth,
}: {
  month: string;
  currentMonth: string;
  firstMonth: string;
  projectId?: string | undefined;
  setMonth: (month: string) => void;
}) {
  const query = useQuery(incomeReportQuery(month, projectId));
  const data = query.isSuccess && (!projectId || !query.isFetching) ? query.data : undefined;
  const previousMonth = addMonths(month, -12);
  const hasPrevious = !projectId && previousMonth >= firstMonth;
  const previous = useQuery({ ...incomeReportQuery(previousMonth), enabled: hasPrevious });
  const controls = (
    <MonthControl
      month={month}
      shift={(by) => setMonth(addMonths(month, by))}
      current={currentMonth}
      firstMonth={firstMonth}
    />
  );
  const comparison = hasPrevious && (
    <ReportBodyDisclosure
      id="income-previous-year"
      label={`Vorjahr · ${shortMonth(previousMonth)}`}
    >
      {previous.isPending ? (
        <LoadingNote what="Erwartete Einnahmen im Vorjahr" />
      ) : previous.isError ? (
        <ErrorNote
          what="Erwartete Einnahmen im Vorjahr"
          error={previous.error}
          onRetry={() => void previous.refetch()}
        />
      ) : previous.data.expected?.lines.length ? (
        <>
          <ExpectedIncomeTable lines={previous.data.expected.lines} />
          {!previous.data.expectedMaterialised && (
            <p className="vnote">
              Die Erwartungen im Vorjahr stammen aus dem Zahlungsplan. Für diesen Monat liegt keine
              Zuordnung vor.
            </p>
          )}
        </>
      ) : (
        <p className="vnote">
          Für diesen Vorjahresmonat sind keine erwarteten oder eingegangenen Einnahmen erfasst.
        </p>
      )}
    </ReportBodyDisclosure>
  );
  const loaded = data && !data.beforeRecords ? data : undefined;
  return (
    <div className="mrep income-report" data-testid="income-expectations-integrated">
      <IncomeExpectations
        data={loaded}
        controls={controls}
        comparison={comparison}
        fallback={
          query.isError ? (
            <ErrorNote
              what="Erwartete Einnahmen"
              error={query.error}
              onRetry={() => void query.refetch()}
            />
          ) : query.isPending || (projectId && query.isFetching) ? (
            <LoadingNote what="Erwartete Einnahmen" />
          ) : (
            <EmptyNote>Für diesen Monat gibt es keine Aufzeichnungen.</EmptyNote>
          )
        }
      />
      {loaded && (
        <ReportBodyDisclosure
          id="income-month-facts"
          label="Einnahmen des gewählten Monats und Verlauf"
        >
          <IncomeBody data={loaded} showExpectations={false} />
        </ReportBodyDisclosure>
      )}
    </div>
  );
}

function ExpectedIncomeTable({ lines }: { lines: ExpectedIncomeLine[] }) {
  useAmountPrivacy();
  return (
    <div
      className="mr-scroll"
      role="region"
      aria-label="Wiederkehrende Zahlungen, bei Bedarf horizontal verschiebbar"
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users must be able to scroll the table.
      tabIndex={0}
    >
      <table className="mr-table is-expected">
        <thead>
          <tr>
            <th className="tech">Zahlung</th>
            <th className="tech n">Erwartet</th>
            <th className="tech n">Eingegangen</th>
            <th className="tech">Status</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
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
                <td className="n">{line.status === 'unplanned' ? '–' : eur(line.expectedCents)}</td>
                <td className="n">{line.receivedCents > 0 ? eur(line.receivedCents) : '–'}</td>
                <td>
                  <span className={`mr-status ${s.tone}`}>
                    <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
                    {s.label}
                    {line.status === 'diff' ? ` ${eur(line.differenceCents, { sign: true })}` : ''}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
