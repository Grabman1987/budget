import { Segmented } from '@budget/ui';
import { useNavigate, useSearch } from '@tanstack/react-router';
import type { PageMeta } from '../nav/pages';
import { findReport, type ReportEntry } from '../nav/reports-catalog';
import { PortfolioAllocationReport } from '../pages/portfolio-allocation-report';
import { PortfolioContributionsReport } from '../pages/portfolio-contributions-report';
import { PortfolioPerformanceReport } from '../pages/portfolio-performance-report';
import './report-views.css';

const VIEWS = [
  { value: 'rendite', label: 'Rendite & Risiko' },
  { value: 'verteilung', label: 'Verteilung über Zeit' },
  { value: 'einzahlungen', label: 'Einzahlungen und Wert' },
] as const;

/** Navigation only: each reader retains its source universe, period, quality and verdict. */
export function PortfolioReportViews({ report, meta }: { report: ReportEntry; meta: PageMeta }) {
  const search = useSearch({ strict: false }) as { darstellung?: string };
  const navigate = useNavigate();
  const view =
    search.darstellung === 'rendite' || search.darstellung === 'einzahlungen'
      ? search.darstellung
      : 'verteilung';
  const source = findReport(
    view === 'rendite' ? 'prendite' : view === 'einzahlungen' ? 'peinzahlungen' : 'pallocation',
  )!;
  const heading = { ...source, name: report.name };
  const control = (
    <Segmented
      className="report-view-switch report-wealth-switch"
      label="Ansicht der Portfolio-Auswertung"
      options={VIEWS}
      value={view}
      onChange={(value) =>
        void navigate({
          to: '.',
          search: ((previous: Record<string, unknown>) => ({
            ...previous,
            darstellung: value,
          })) as never,
        })
      }
    />
  );
  return view === 'rendite' ? (
    <PortfolioPerformanceReport report={heading} meta={meta} viewControl={control} />
  ) : view === 'einzahlungen' ? (
    <PortfolioContributionsReport report={heading} meta={meta} viewControl={control} />
  ) : (
    <PortfolioAllocationReport report={heading} meta={meta} viewControl={control} />
  );
}
