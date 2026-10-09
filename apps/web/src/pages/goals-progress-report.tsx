import type { goalsReport } from '@budget/db';
import { chartPoints } from '../charts/tooltip-data';
import { AxisLine, ChartSvg, Line, XTicks, ChartValue } from '@budget/ui';
import { useAmountPrivacy, ClassSwatch, type SwatchKind } from '@budget/ui';
import { lastDayOfMonth } from '@budget/domain';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { AlertTriangle, Check } from 'lucide-react';
import { ApiError, request } from '../api/http';
import { fetchCategories } from '../budget/api';
import { GoalFigures } from '../budget/goals-panel';
import type { GoalView } from '../budget/goals-api';
import { goalBar, goalLine, planSummary, shortMonth } from '../budget/goals-model';
import { fetchAccounts } from '../ledger/api';
import { eur, longDay } from '../ledger/format';
import { LEDGER_KEY } from '../ledger/queries';
import { ErrorNote, LoadingNote } from '../ledger/states';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { AppLink } from '../shell/app-link';
import { goalReportRows, type GoalReportRow } from './goals-progress-model';
import { PageFrame } from './placeholder-page';
import './goals-progress-report.css';

const MONEY_FIELDS = [
  'targetCents',
  'savedCents',
  'remainingCents',
  'averageRateCents',
  'neededMonthlyCents',
] as const;

/** Goal/category writes and undo invalidate GOALS and LEDGER via useBudgetWrite;
 * booking/account writes and undo invalidate LEDGER. The server selects the current month. */
export const goalsProgressReportQuery = (month?: string) =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'goals-progress-report', ...(month ? [month] : [])],
    retry: false,
    queryFn: async () => {
      const data = await request<{ month: string; goals: GoalView[] }>(
        'GET',
        month ? `/api/goals?month=${month}` : '/api/goals',
      );
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(data.month) || !Array.isArray(data.goals))
        throw new ApiError(503, 'unavailable', 'Monatsstand der Sparziele ist unvollständig.');
      const [categories, accounts, report] = await Promise.all([
        fetchCategories(),
        fetchAccounts(lastDayOfMonth(data.month)),
        request<ReturnType<typeof goalsReport>>('GET', '/api/goals/report'),
      ]);
      if (!Array.isArray(categories.categories) || !Array.isArray(accounts.accounts))
        throw new ApiError(503, 'unavailable', 'Quellenangaben der Sparziele sind unvollständig.');
      return {
        month: data.month,
        report,
        goals: data.goals,
        categories,
        accounts: accounts.accounts,
        rows: goalReportRows(data.goals, categories.categories, accounts.accounts),
      };
    },
  });

export function GoalsProgressReport({ report, meta }: { report: ReportEntry; meta: PageMeta }) {
  useAmountPrivacy();
  const query = useQuery(goalsProgressReportQuery());
  // Never combine cached figures with loading or failed source metadata, including background refresh.
  const ready = !query.isFetching && query.isSuccess ? query.data : undefined;
  return (
    <PageFrame
      verdict={
        ready
          ? {
              reportId: report.id,
              period: ready.month,
              metric: { label: 'Erfasste Sparziele', value: ready.rows.length, unit: 'count' },
            }
          : undefined
      }
      meta={meta}
      title={report.name}
      subtitle={`${report.pos} · ${report.question}`}
      reportDataBasis="Gespeicherte Sparziele · Monatsstand"
      reportStand={{
        label: 'Stichtag',
        value: ready
          ? `${longDay(lastDayOfMonth(ready.month))} · Monatsende`
          : !query.isFetching && query.isError
            ? 'nicht verfügbar'
            : 'wird geladen',
      }}
      extraFields={[
        {
          label: 'Monatsstand',
          value: ready
            ? shortMonth(ready.month)
            : query.isError
              ? 'nicht verfügbar'
              : 'wird geladen',
        },
      ]}
    >
      <div className="kview vview goals-progress-report">
        {(query.isPending || query.isFetching) && <LoadingNote what="Sparziele und Quellen" />}
        {!query.isFetching && query.isError && (
          <ErrorNote
            what="Sparziele und Quellen"
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        )}
        {ready && <ReportBody month={ready.month} rows={ready.rows} report={ready.report} />}
      </div>
    </PageFrame>
  );
}
function ReportBody({
  month,
  rows,
  report,
}: {
  report: ReturnType<typeof goalsReport>;
  month: string;
  rows: GoalReportRow[];
}) {
  useAmountPrivacy();
  const known = rows.flatMap((r) => (r.progress ? [r.progress] : []));
  const unknown = rows.length - known.length;
  return (
    <>
      <section aria-labelledby="goals-report-title">
        <div className="goals-report-head">
          <h2 id="goals-report-title">Sparziele · {shortMonth(month)}</h2>
          <span data-testid="goal-report-summary">
            {known.length
              ? `${planSummary(known)} · geprüfte Ziele`
              : 'Keine eindeutig belegten Zielstände'}
            {unknown > 0 && ` · ${unknown} ungeklärt`}
          </span>
        </div>
        <p className="vnote">
          Monatsstand aus den gespeicherten Sparzielen. Gespart entspricht dem verfügbaren Envelope
          oder dem Geldsaldo des verknüpften Kontos am Monatsende. Die Monatsrate folgt den letzten
          drei Monaten.
        </p>
        <p className="vnote">
          Notgroschen bis heute:{' '}
          {report.reserveComplete
            ? `${eur(report.reserveCents)} · ${report.coverage.tenthsOfMonth === null ? 'Reichweite ohne Bedarfshistorie nicht berechenbar' : `${new Intl.NumberFormat('de-AT').format(report.coverage.tenthsOfMonth / 10)} Monate Bedarf`}`
            : 'Reichweite wegen Fremdwährung nicht verfügbar'}
          . Ø Bedarf {eur(report.coverage.averageNeedCents)} aus {report.coverage.months} vollen
          Monaten, dieselbe Rechnung wie R02.
        </p>
        <h3>Tagesgeld-Zuordnung · bis heute</h3>
        <ul>
          {report.cash.map((a) => (
            <li key={a.id}>
              {a.name} · {eur(a.balanceCents)} ·{' '}
              {a.ambiguous
                ? 'Mehrere Ziele: Mittelzuordnung ungeklärt'
                : (a.goal ?? 'Kein Kontoziel zugeordnet')}
            </li>
          ))}
        </ul>
        <p className="vnote">
          Kategorieziele sind Budget-Envelopes und keinem bestimmten Tagesgeldkonto zugeordnet.
          Geteilte Quellen bleiben ungeklärt, bis eigene Mittel pro Ziel gespeichert werden.
        </p>
        {rows.length === 0 && (
          <p role="status">
            Noch keine gespeicherten Sparziele.{' '}
            <AppLink to="/plan/sparziele">Sparziele im Plan öffnen</AppLink>
          </p>
        )}
        <div className="goals-report-list">
          {rows.map((row, i) => (
            <article
              className="goals-report-item"
              key={row.id}
              aria-labelledby={`goal-name-${row.id}`}
            >
              <div className="goal-report-heading">
                <span className="tech">{i + 1}</span>
                <AppLink
                  id={`goal-name-${row.id}`}
                  className="goal-report-open"
                  to={`/plan/sparziele/${row.id}`}
                  search={{ monat: month, quelle: 'report' }}
                  state={{ planPanelDetailOpenedInApp: true }}
                >
                  {row.source?.cls && ['need', 'want', 'future'].includes(row.source.cls) && (
                    <ClassSwatch kind={row.source.cls as SwatchKind} />
                  )}
                  {row.name}
                </AppLink>
              </div>
              <p className="goal-report-meta">
                {row.source ? sourceLabel(row) : 'Quelle ungeklärt'} ·{' '}
                {row.targetDate ? `Zieldatum ${longDay(row.targetDate)}` : 'ohne Zieldatum'}
              </p>
              {row.progress ? (
                <>
                  <GoalBar goal={row.progress} month={month} />
                  <GoalHistory
                    points={report.history.find((h) => h.id === row.id)?.points ?? []}
                    name={row.name}
                  />
                  <div className="goal-report-figures">
                    <span>
                      <strong>{eur(row.progress.savedCents)}</strong> von{' '}
                      {eur(row.progress.targetCents)}
                    </span>
                    <GoalStatus goal={row.progress} month={month} />
                    <span>
                      {eur(row.progress.averageRateCents)} je Monat · nötig{' '}
                      {row.progress.neededMonthlyCents === null
                        ? 'ohne Zieldatum'
                        : eur(row.progress.neededMonthlyCents)}
                    </span>
                  </div>
                </>
              ) : (
                <p className="goal-report-unknown">
                  <AlertTriangle size={16} aria-hidden="true" />
                  Fortschritt nicht verfügbar. {row.reason}
                </p>
              )}
            </article>
          ))}
        </div>
        {known.length > 0 && (
          <p className="vnote">
            Senkrechte Marke = Zielbetrag. Prognosen folgen der bisherigen Rate und sind keine
            zugesagte Sparrate oder eigene Mittelzuordnung.
          </p>
        )}
      </section>
      {rows.length > 0 && (
        <section aria-labelledby="goals-source-table">
          <h2 id="goals-source-table">Zielstände und Quellen</h2>
          <p className="vnote" id="goals-table-scroll">
            Dieselben Monatswerte wie in den Zielbalken. Die Tabelle lässt sich seitlich scrollen.
          </p>
          <div
            className="goals-report-scroll"
            role="region"
            aria-label="Zielstände, seitlich scrollbar"
            aria-describedby="goals-table-scroll"
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users must reach and scroll all source columns.
            tabIndex={0}
          >
            <table className="goals-report-table">
              <caption className="sr-only">
                Gespeicherte Sparziele und ihre verfügbaren EUR-Monatswerte
              </caption>
              <thead>
                <tr>
                  {[
                    'Sparziel',
                    'Quelle',
                    'Ziel',
                    'Gespart',
                    'Fehlt',
                    'Rate zuletzt',
                    'Nötig je Monat',
                    'Prognose / Status',
                  ].map((h) => (
                    <th scope="col" key={h}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <th scope="row">
                      <AppLink
                        className="goal-report-open"
                        to={`/plan/sparziele/${row.id}`}
                        search={{ monat: month, quelle: 'report' }}
                        state={{ planPanelDetailOpenedInApp: true }}
                      >
                        {row.name}
                      </AppLink>
                    </th>
                    <td>{sourceLabel(row)}</td>
                    {MONEY_FIELDS.map((key) => (
                      <td key={key}>
                        {row.progress
                          ? row.progress[key] === null
                            ? 'ohne Zieldatum'
                            : eur(row.progress[key]!)
                          : 'nicht verfügbar'}
                      </td>
                    ))}
                    <td>
                      {row.progress ? (
                        <>
                          <Forecast goal={row.progress} />
                          <GoalStatus goal={row.progress} month={month} />
                        </>
                      ) : (
                        'Status ungeklärt'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <p>
        <AppLink to="/plan/sparziele">Sparziele im Plan öffnen</AppLink>
      </p>
    </>
  );
}
function sourceLabel(row: GoalReportRow) {
  return row.source
    ? `${row.source.kind === 'account' ? 'Geldsaldo Konto' : 'Verfügbar Kategorie'}: ${row.source.name}`
    : 'Quelle ungeklärt';
}
function GoalBar({ goal, month }: { goal: GoalView; month: string }) {
  useAmountPrivacy();
  const bar = goalBar(goal);
  return (
    <ChartValue
      label="Sparziel"
      date={month}
      series={[
        { name: 'Gespart', value: eur(goal.savedCents), color: 'var(--line)' },
        { name: 'Ziel', value: eur(goal.targetCents), color: 'var(--line-2)' },
      ]}
    >
      <div
        className="goal-report-bar"
        role="img"
        aria-label={`${eur(goal.savedCents)} von ${eur(goal.targetCents)}; Marke ist Zielbetrag`}
      >
        <i style={{ width: `${bar.fill * 100}%` }} />
        <span style={{ left: `${bar.tick * 100}%` }} />
      </div>
    </ChartValue>
  );
}
function GoalStatus({ goal, month }: { goal: GoalView; month: string }) {
  useAmountPrivacy();
  const line = goalLine(goal, month);
  const Icon = line.tone === 'warn' ? AlertTriangle : Check;
  return (
    <span className="goal-report-status">
      <Icon size={16} aria-hidden="true" />
      {line.text}
    </span>
  );
}
function Forecast({ goal }: { goal: GoalView }) {
  useAmountPrivacy();
  return (
    <span>
      {goal.status === 'reached'
        ? 'erreicht'
        : goal.forecastMonth
          ? shortMonth(goal.forecastMonth)
          : 'kein Termin aus aktueller Rate'}
    </span>
  );
}
export function GoalDetail({ row, month }: { row: GoalReportRow; month: string }) {
  useAmountPrivacy();
  const g = row.progress;
  return (
    <div className="goal-report-detail">
      <p>
        Monatsstand {shortMonth(month)} · {sourceLabel(row)}
      </p>
      {g ? (
        <>
          <GoalBar goal={g} month={month} />
          <GoalFigures
            goal={g}
            month={month}
            category={row.source?.kind === 'category' ? row.source : undefined}
          />
          <p>
            Prognose: <Forecast goal={g} />
          </p>
          <p className="vnote">
            {row.source?.kind === 'account'
              ? 'Gespart ist der Geldsaldo am Monatsende. Die Rate ist der mittlere Geldsaldozuwachs der letzten drei Monate; Wertpapierbestände sind keine Quelle dieses Zielstands.'
              : 'Gespart ist Verfügbar am Monatsende. Die Rate ist die mittlere Zuweisung der letzten drei Monate.'}
          </p>
          {row.source && (
            <AppLink
              to="/konten/buchungen"
              search={{
                ...(row.source.kind === 'account'
                  ? { konto: row.source.id }
                  : { kategorie: row.source.id }),
                bis: lastDayOfMonth(month),
              }}
            >
              Buchungen der Quelle öffnen
            </AppLink>
          )}
          {row.source?.kind === 'category' && (
            <p>
              <AppLink to="/plan/monat" search={{ monat: month }}>
                Zuweisungen im Plan öffnen
              </AppLink>
            </p>
          )}
        </>
      ) : (
        <p role="status">Fortschritt und Status nicht verfügbar. {row.reason}</p>
      )}
      {row.note && <p>{row.note}</p>}
      <p>
        <AppLink to="/plan/sparziele" search={{ monat: month }}>
          Sparziel im Plan ansehen
        </AppLink>
      </p>
    </div>
  );
}

export function GoalHistory({
  points,
  name,
}: {
  points: ReturnType<typeof goalsReport>['history'][number]['points'];
  name: string;
}) {
  if (!points.length) return null;
  const max = Math.max(1, ...points.flatMap((p) => [p.actualCents ?? 0, p.sollCents ?? 0]));
  const x = (i: number) => 54 + (i / Math.max(1, points.length - 1)) * 650;
  const y = (v: number) => 170 - (v / max) * 150;
  return (
    <>
      <ChartSvg
        width={760}
        height={220}
        label={`${name}: Ist und linearer Soll-Pfad`}
        testId="goal-soll-chart"
        points={chartPoints(
          points.map((p) => p.month),
          x,
          [
            { name: 'Gespart', values: points.map((p) => p.actualCents) },
            {
              name: 'Linearer Soll-Pfad',
              color: 'var(--line-2)',
              values: points.map((p) => p.sollCents),
            },
          ],
        )}
      >
        <AxisLine x1={54} x2={704} y={170} />
        <Line
          kind="plan"
          points={points.flatMap((p, i) =>
            p.sollCents === null ? [] : [[x(i), y(p.sollCents)] as const],
          )}
        />
        <Line
          kind="actual"
          points={points.flatMap((p, i) =>
            p.actualCents === null ? [] : [[x(i), y(p.actualCents)] as const],
          )}
        />
        <XTicks
          y={202}
          ticks={points.flatMap((p, i) =>
            i === 0 || i === points.length - 1 ? [{ x: x(i), label: shortMonth(p.month) }] : [],
          )}
        />
      </ChartSvg>
      <p className="vnote">
        Durchgezogen: gespeicherter Quellenstand. Gestrichelt: linear von 0 im Anlagemonat zum
        Zielbetrag am Zieldatum; vorhandenes Startguthaben kann darüber liegen. Ohne Zieldatum gibt
        es keine Soll-Linie.
      </p>
    </>
  );
}
