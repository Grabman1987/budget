import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ErrorNote, LoadingNote, EmptyNote } from '../ledger/states';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { PageFrame } from '../pages/placeholder-page';
import { monthShort } from './table-format';
import { reportTablesQuery, type ReportTables } from './table-reports-api';
import './table-reports.css';

/** The one read of the monthly facts; reports call it for their title-block controls and pass it on. */
export const useReportTables = (netWorth = false): UseQueryResult<ReportTables> =>
  useQuery(reportTablesQuery(netWorth));

/**
 * Frame of the monthly table reports 1.5 to 1.8: title block with the data basis, loading, error
 * and empty states, and the one read of the monthly facts. `through` says which month the report
 * ends at: the last complete month (all but the Gesamttabelle) or the running one.
 */
export function TableReportFrame({
  report,
  meta,
  through,
  currentAllowed = false,
  query,
  extraFields,
  className,
  children,
}: {
  report: ReportEntry;
  meta: PageMeta;
  through: 'full' | 'current';
  currentAllowed?: boolean;
  query: UseQueryResult<ReportTables>;
  extraFields?: Array<{ label: string; value: ReactNode }> | undefined;
  className: string;
  children: (tables: ReportTables) => ReactNode;
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
  return (
    <PageFrame
      meta={meta}
      title={report.name}
      subtitle={`${report.pos} · ${report.question}`}
      reportDataBasis={basis}
      {...(extraFields ? { extraFields } : {})}
    >
      <div className={`kview table-report ${className}`}>
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
