import { useAmountPrivacy, ClassSwatch, DetailPanel, type SwatchKind } from '@budget/ui';
import { lastDayOfMonth } from '@budget/domain';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { AlertTriangle, Check } from 'lucide-react';
import { useState } from 'react';
import { ApiError, request } from '../api/http';
import { fetchCategories } from '../budget/api';
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
export const goalsProgressReportQuery = () =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'goals-progress-report'],
    retry: false,
    queryFn: async () => {
      const data = await request<{ month: string; goals: GoalView[] }>('GET', '/api/goals');
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(data.month) || !Array.isArray(data.goals))
        throw new ApiError(503, 'unavailable', 'Monatsstand der Sparziele ist unvollständig.');
      const [categories, accounts] = await Promise.all([
        fetchCategories(),
        fetchAccounts(lastDayOfMonth(data.month)),
      ]);
      if (!Array.isArray(categories.categories) || !Array.isArray(accounts.accounts))
        throw new ApiError(503, 'unavailable', 'Quellenangaben der Sparziele sind unvollständig.');
      return {
        month: data.month,
        rows: goalReportRows(data.goals, categories.categories, accounts.accounts),
      };
    },
  });

export function GoalsProgressReport({ report, meta }: { report: ReportEntry; meta: PageMeta }) {
  useAmountPrivacy();
  const query = useQuery(goalsProgressReportQuery());
  const [selected, setSelected] = useState<string | null>(null);
  // Never combine cached figures with loading or failed source metadata, including background refresh.
  const ready = !query.isFetching && query.isSuccess ? query.data : undefined;
  const row = ready?.rows.find((r) => r.id === selected);
  return (
    <PageFrame
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
        {ready && <ReportBody month={ready.month} rows={ready.rows} onSelect={setSelected} />}
      </div>
      <DetailPanel
        open={Boolean(row)}
        title={row?.name ?? 'Sparziel'}
        onClose={() => setSelected(null)}
      >
        {row && ready && <GoalDetail row={row} month={ready.month} />}
      </DetailPanel>
    </PageFrame>
  );
}
function ReportBody({
  month,
  rows,
  onSelect,
}: {
  month: string;
  rows: GoalReportRow[];
  onSelect: (id: string) => void;
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
          Die Beträge werden je Ziel gezeigt. Eine gemeinsame Finanzierung, die Aufteilung von
          Tagesgeld, Notgroschen-Reichweite und ein linearer Soll-Pfad sind hier noch nicht
          enthalten.
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
                <button
                  id={`goal-name-${row.id}`}
                  type="button"
                  className="goal-report-open"
                  onClick={() => onSelect(row.id)}
                >
                  {row.source?.cls && ['need', 'want', 'future'].includes(row.source.cls) && (
                    <ClassSwatch kind={row.source.cls as SwatchKind} />
                  )}
                  {row.name}
                </button>
              </div>
              <p className="goal-report-meta">
                {row.source ? sourceLabel(row) : 'Quelle ungeklärt'} ·{' '}
                {row.targetDate ? `Zieldatum ${longDay(row.targetDate)}` : 'ohne Zieldatum'}
              </p>
              {row.progress ? (
                <>
                  <GoalBar goal={row.progress} />
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
                      <button
                        type="button"
                        className="goal-report-open"
                        onClick={() => onSelect(row.id)}
                      >
                        {row.name}
                      </button>
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
function GoalBar({ goal }: { goal: GoalView }) {
  useAmountPrivacy();
  const bar = goalBar(goal);
  return (
    <div
      className="goal-report-bar"
      role="img"
      aria-label={`${eur(goal.savedCents)} von ${eur(goal.targetCents)}; Marke ist Zielbetrag`}
    >
      <i style={{ width: `${bar.fill * 100}%` }} />
      <span style={{ left: `${bar.tick * 100}%` }} />
    </div>
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
function GoalDetail({ row, month }: { row: GoalReportRow; month: string }) {
  useAmountPrivacy();
  const g = row.progress;
  return (
    <div className="goal-report-detail">
      <p>
        Monatsstand {shortMonth(month)} · {sourceLabel(row)}
      </p>
      {g ? (
        <>
          <GoalBar goal={g} />
          <GoalStatus goal={g} month={month} />
          <dl>
            {[
              ['Zielbetrag', eur(g.targetCents)],
              ['Gespart', eur(g.savedCents)],
              ['Fehlt', eur(g.remainingCents)],
              [
                'Nötig je Monat',
                g.neededMonthlyCents === null ? 'ohne Zieldatum' : eur(g.neededMonthlyCents),
              ],
              ['Rate zuletzt', eur(g.averageRateCents)],
              [
                'Monate nach Monatsstand',
                g.monthsLeft === null ? 'kein Rest oder ohne Zieldatum' : String(g.monthsLeft),
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
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
