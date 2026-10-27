import { Segmented } from '@budget/ui';
import { isReportPeriod } from '@budget/domain';
import { useNavigate, useSearch } from '@tanstack/react-router';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { DEFAULT_ZEITRAUM } from '../wealth/zeitraum';
import { AssetsDebtsReport } from './assets-debts-report';
import { WealthHistoryReport } from './wealth-history-report';
import { WholePictureReport } from './whole-picture-report';
import './report-views.css';

const WEALTH_VIEWS = [
  { value: 'bilanz', label: 'Vermögen und Schulden' },
  { value: 'verlauf', label: 'Vermögensverlauf' },
  { value: 'gesamt', label: 'Gesamtübersicht' },
] as const;
type WealthView = (typeof WEALTH_VIEWS)[number]['value'];

/** Reuse the complete original readers, valuation states and monetary bodies, one at a time. */
export function WealthReportViews({ report, meta }: { report: ReportEntry; meta: PageMeta }) {
  const search = useSearch({ strict: false }) as { darstellung?: unknown; zeitraum?: unknown };
  const navigate = useNavigate();
  const view: WealthView =
    search.darstellung === 'verlauf' || search.darstellung === 'gesamt'
      ? search.darstellung
      : 'bilanz';
  const changeView = (next: WealthView) => {
    if (next === view) return;
    // Materialize the active reader's existing fallback only at a real switch, never on mount.
    const period = isReportPeriod(search.zeitraum)
      ? search.zeitraum
      : view === 'verlauf'
        ? DEFAULT_ZEITRAUM
        : view === 'gesamt'
          ? '1J'
          : 'Alles';
    void navigate({
      to: '.',
      search: ((previous: Record<string, unknown>) => ({
        ...previous,
        darstellung: next,
        zeitraum: period,
      })) as never,
    });
  };
  const control = (
    <div className="report-view-controls">
      <span className="report-view-controls-label">Ansicht</span>
      <Segmented
        className="report-view-switch report-wealth-switch"
        label="Ansicht von Vermögen und Schulden"
        options={WEALTH_VIEWS}
        value={view}
        onChange={changeView}
      />
    </div>
  );
  if (view === 'verlauf')
    return <WealthHistoryReport report={report} meta={meta} viewControl={control} />;
  if (view === 'gesamt')
    return <WholePictureReport report={report} meta={meta} viewControl={control} />;
  return <AssetsDebtsReport report={report} meta={meta} viewControl={control} />;
}
