import type { ReactNode } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { findReport, type ReportEntry } from '../nav/reports-catalog';
import type { PageMeta } from '../nav/pages';
import { AppLink } from '../shell/app-link';
import './report-views.css';

/** Retain full original detail/CSV bodies where content consolidation is a later package. */
export function ReportSourceViews({ report, meta, sources, children }: {
  report: ReportEntry;
  meta: PageMeta;
  sources: ReadonlyArray<{ id: string; name: string }>;
  children: (source: ReportEntry, meta: PageMeta) => ReactNode;
}) {
  const search = useSearch({ strict: false }) as { reportQuelle?: string };
  const navigate = useNavigate();
  const selected = sources.find((source) => source.id === search.reportQuelle) ?? sources[0]!;
  const source = findReport(selected.id)!;
  return <>
    <label className="report-source-select">
      <span>Ansicht von {report.name}</span>
      <select value={selected.id} onChange={(event) => {
        const value = event.target.value;
        void navigate({
          to: '.',
          search: ((previous: Record<string, unknown>) => ({
            ...previous, reportQuelle: value === sources[0]?.id ? undefined : value,
          })) as never,
        });
      }}>
        {sources.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
      </select>
    </label>
    {children(source, meta)}
  </>;
}

export function ProjectResultsReturn() {
  return <p className="report-source-return">
    <AppLink to="/reports/einnahmen-ausgaben" search={(previous) => ({
      ...previous, reportQuelle: undefined,
    })}>Einnahmen und Cashflow mit Projektfilter öffnen</AppLink>
  </p>;
}
