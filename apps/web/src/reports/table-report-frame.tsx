import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useMemo, type ReactNode } from 'react';
import { ErrorNote, LoadingNote, EmptyNote } from '../ledger/states';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { PageFrame } from '../pages/placeholder-page';
import { useCollapsibleSections } from './month-frame';
import { monthShort } from './table-format';
import { reportTablesQuery, type ReportTables } from './table-reports-api';
import './table-reports.css';
import './table-print.css';
import { tableVerdictFacts } from './verdict-facts';
import { reportPeriodMonths, type Period } from '@budget/domain';
import type { IncomeExpenseReportData } from '@budget/db';

type FrameFacts = ReportTables | IncomeExpenseReportData;
const fullTables = (tables: FrameFacts): tables is ReportTables =>
  'targets' in tables && 'netWorth' in tables;

/** The one read of the monthly facts; reports call it for their title-block controls and pass it on. */
export const useReportTables = (netWorth = false): UseQueryResult<ReportTables> =>
  useQuery(reportTablesQuery(netWorth));

/**
 * Frame of the monthly table reports 1.5 to 1.8: title block with the data basis, loading, error
 * and empty states, and the one read of the monthly facts. `through` says which month the report
 * ends at: the last complete month (all but the Gesamttabelle) or the running one.
 */
export function TableReportFrame<T extends FrameFacts = ReportTables>({
  report,
  meta,
  through,
  currentAllowed = false,
  query,
  extraFields,
  className,
  children,
  verdictEnd,
  verdictPeriod,
}: {
  report: ReportEntry;
  verdictEnd?: string | undefined;
  verdictPeriod?: Period | undefined;
  meta: PageMeta;
  through: 'full' | 'current';
  currentAllowed?: boolean;
  query: UseQueryResult<T>;
  extraFields?: Array<{ label: string; value: ReactNode }> | undefined;
  className: string;
  children: (tables: T) => ReactNode;
}) {
  const tables = query.data;
  const end =
    tables && (through === 'full' && !currentAllowed ? tables.lastFullMonth : tables.currentMonth);
  const basis = query.isError
    ? 'nicht verfügbar'
    : tables?.firstMonth && end
      ? `${monthShort(tables.firstMonth)} bis ${monthShort(end)}`
      : tables
        ? 'keine Monatsdaten'
        : 'wird geladen';
  const usable =
    tables &&
    tables.firstMonth !== null &&
    (through === 'current' || currentAllowed || tables.lastFullMonth !== null);
  const verdictMonth =
    verdictEnd ??
    (verdictPeriod && tables?.firstMonth && end
      ? reportPeriodMonths(verdictPeriod, end, tables.firstMonth).at(-1)
      : (end ?? tables?.currentMonth));
  const sectionsRef = useCollapsibleSections(report.id);
  const verdict = useMemo(
    () =>
      tables && fullTables(tables) && verdictMonth && !query.isFetching && !query.isError
        ? tableVerdictFacts(report.id, tables, verdictMonth)
        : undefined,
    [tables, verdictMonth, query.isFetching, query.isError, report.id],
  );
  return (
    <PageFrame
      verdict={verdict}
      meta={meta}
      title={report.name}
      subtitle={`${report.pos} · ${report.question}`}
      reportDataBasis={basis}
      {...(extraFields ? { extraFields } : {})}
    >
      <div ref={sectionsRef} className={`kview table-report report-table-print ${className}`}>
        {query.isPending && <LoadingNote what="Monatsdaten" />}
        {query.isError && (
          <ErrorNote what="Monatsdaten" error={query.error} onRetry={() => void query.refetch()} />
        )}
        {tables && !usable && (
          <EmptyNote>
            {tables.firstMonth === null
              ? 'Noch keine Monatsdaten: Sobald es ein Budgetkonto mit Buchungen gibt, erscheint dieser Report.'
              : 'Noch kein vollständiger Monat: Der Report beginnt mit dem ersten abgeschlossenen Monat.'}
          </EmptyNote>
        )}
        {tables && usable && children(tables)}
      </div>
    </PageFrame>
  );
}
