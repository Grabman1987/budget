import { maskMoneyText, Segmented, useAmountPrivacy } from '@budget/ui';
import type { project } from '@budget/db';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';
import { ErrorNote, LoadingNote } from '../ledger/states';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { AppLink } from '../shell/app-link';
import { PageFrame } from '../pages/placeholder-page';
import { IncomeReport } from './income-report';
import { IncomeExpenseReport } from './income-expense-report';
import { CashflowReportPage } from './cashflow-report';
import './report-views.css';

const INCOME_VIEWS = [
  { value: 'income', label: 'Einnahmen' },
  { value: 'overview', label: 'Einnahmen und Ausgaben' },
  { value: 'cashflow', label: 'Cashflow' },
] as const;
const projectsQuery = queryOptions({
  queryKey: [...LEDGER_KEY, 'project-management'],
  retry: false,
  queryFn: () => request<{ projects: (typeof project.$inferSelect)[] }>('GET', '/api/projects'),
});

/** The filter scopes existing readers; it never substitutes the separate full project results. */
export function IncomeCashflowReport({
  report,
  meta,
  sources = false,
}: {
  report: ReportEntry;
  meta: PageMeta;
  sources?: boolean;
}) {
  useAmountPrivacy();
  const search = useSearch({ strict: false }) as {
    darstellung?: unknown;
    projekt?: string;
    projektUngueltig?: boolean;
  };
  const navigate = useNavigate();
  const projects = useQuery({ ...projectsQuery, enabled: !sources });
  const view =
    search.darstellung === 'income' || search.darstellung === 'cashflow'
      ? search.darstellung
      : 'overview';
  const projectId = search.projekt;
  const projectInvalid = search.projektUngueltig === true;
  const current = projects.isSuccess && !projects.isFetching ? projects.data.projects : undefined;
  const unknown = Boolean(projectId && !current?.some((item) => item.id === projectId));
  const change = (patch: Record<string, unknown>) =>
    void navigate({
      to: '.',
      search: ((previous: Record<string, unknown>) => ({ ...previous, ...patch })) as never,
    });
  const heading = { ...report, name: 'Einnahmen und Cashflow' };
  const controls = (
    <div className="report-income-controls">
      <Segmented
        className="report-view-switch"
        label="Ansicht von Einnahmen und Cashflow"
        options={INCOME_VIEWS}
        value={view}
        onChange={(value) => change({ darstellung: value })}
      />
      <label className="report-project-select">
        <span>Projekt</span>
        <select
          aria-label="Projektfilter"
          value={projectInvalid ? '__invalid__' : (projectId ?? '')}
          disabled={!current}
          onChange={(event) =>
            change({
              projekt: event.target.value || undefined,
              projektUngueltig: undefined,
              zelle: undefined,
              spalte: undefined,
            })
          }
        >
          <option value="">Alle Projekte</option>
          {projectInvalid && (
            <option value="__invalid__" disabled>
              Ungültiger Projektfilter
            </option>
          )}
          {unknown && (
            <option value={projectId}>
              {projects.isFetching
                ? 'Ausgewähltes Projekt wird geladen'
                : 'Ausgewähltes Projekt nicht verfügbar'}
            </option>
          )}
          {current?.map((item) => (
            <option key={item.id} value={item.id}>
              {maskMoneyText(item.name)}
              {item.archivedAt ? ' · archiviert' : ''}
            </option>
          ))}
        </select>
      </label>
      {(projectId || projectInvalid) && (
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() =>
            change({
              projekt: undefined,
              projektUngueltig: undefined,
              zelle: undefined,
              spalte: undefined,
            })
          }
        >
          Alle Projekte zeigen
        </button>
      )}
    </div>
  );
  const status = (
    <div className="report-project-status">
      {projects.isFetching && <LoadingNote what="Projekte" />}
      {projects.isError && (
        <ErrorNote what="Projekte" error={projects.error} onRetry={() => void projects.refetch()} />
      )}
      <AppLink className="report-project-results-link" to="/reports/projekte">
        Vollständige Projekt-Ergebnisse und Nebeneinkünfte
      </AppLink>
    </div>
  );
  if (projectInvalid)
    return (
      <PageFrame
        meta={meta}
        title={heading.name}
        reportDataBasis="Projektfilter ungültig"
        extraFields={[{ label: 'Ansicht und Projekt', value: controls }]}
      >
        <p role="alert">
          Der Projektfilter ist ungültig. Wähle ein gültiges Projekt oder ausdrücklich „Alle
          Projekte zeigen“.
        </p>
        {status}
      </PageFrame>
    );
  if (sources)
    return <IncomeExpenseReport report={heading} meta={meta} sources projectId={projectId} />;
  return (
    <>
      {view === 'income' ? (
        <IncomeReport report={heading} meta={meta} projectId={projectId} viewControl={controls} />
      ) : view === 'cashflow' ? (
        <CashflowReportPage
          report={heading}
          meta={meta}
          projectId={projectId}
          viewControl={controls}
        />
      ) : (
        <IncomeExpenseReport
          report={heading}
          meta={meta}
          projectId={projectId}
          viewControl={controls}
        />
      )}
      {status}
    </>
  );
}
