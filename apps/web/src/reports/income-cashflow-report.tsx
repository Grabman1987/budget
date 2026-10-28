import { maskMoneyText, Segmented, useAmountPrivacy } from '@budget/ui';
import type { project } from '@budget/db';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';
import { ErrorNote, LoadingNote } from '../ledger/states';
import type { PageMeta } from '../nav/pages';
import { findReport, type ReportEntry } from '../nav/reports-catalog';
import { AppLink } from '../shell/app-link';
import { PageFrame } from '../pages/placeholder-page';
import { IncomeReport } from './income-report';
import { IncomeExpenseReport } from './income-expense-report';
import { ProjectsReport } from './projects-report';
import { CashflowReportPage } from './cashflow-report';
import './report-views.css';

const INCOME_VIEWS = [
  { value: 'income', label: 'Einnahmen' },
  { value: 'overview', label: 'Einnahmen und Ausgaben' },
  { value: 'cashflow', label: 'Cashflow' },
  { value: 'projekte', label: 'Projekt-Ergebnisse' },
] as const;
const projectsQuery = queryOptions({
  queryKey: [...LEDGER_KEY, 'project-management'],
  retry: false,
  queryFn: () => request<{ projects: (typeof project.$inferSelect)[] }>('GET', '/api/projects'),
});

/** Project results are explicitly global; a selected project is never silently broadened. */
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
    search.darstellung === 'income' ||
    search.darstellung === 'cashflow' ||
    search.darstellung === 'projekte'
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
    <div className="report-income-controls" role="region" aria-label="Ansicht und Projekt">
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
      {view === 'projekte' && (
        <p className="report-project-note">
          Projekt-Ergebnisse und Nebeneinkünfte umfassen alle Projekte mit den Monatsgrenzen des
          bestehenden Projektberichts. Der Projektfilter gilt für die anderen Ansichten.
        </p>
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
        reportControls={controls}
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
  if (view === 'projekte' && projectId)
    return (
      <PageFrame
        meta={meta}
        title={heading.name}
        reportControls={controls}
        reportDataBasis="Projektfilter bleibt ausgewählt"
      >
        <p role="status">
          Ein Projekt ist ausgewählt. Die vollständigen Projekt-Ergebnisse sind eine globale
          Ansicht. Wähle ausdrücklich „Alle Projekte zeigen“, um sie zu öffnen, oder wechsle
          zurück zu einer gefilterten Ansicht.
        </p>
        {status}
      </PageFrame>
    );
  return (
    <>
      {view === 'projekte' ? (
        <ProjectsReport
          report={{ ...findReport('projekte')!, name: heading.name }}
          meta={meta}
          viewControl={controls}
        />
      ) : view === 'income' ? (
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
