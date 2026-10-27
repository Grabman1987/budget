import { Segmented } from '@budget/ui';
import type { SpendingPeriod } from '@budget/domain';
import { useNavigate, useSearch } from '@tanstack/react-router';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { PayeeAnalysisReport } from '../pages/payee-analysis-report';
import { SpendingAnalysisReport } from './spending-analysis-report';
import './report-views.css';

const SPENDING_VIEWS = [
  { value: 'gruppen', label: 'Gruppen und Kategorien' },
  { value: 'empfaenger', label: 'Empfänger' },
] as const;

/** One active report body, using the existing readers and their unchanged financial figures. */
export function SpendingReportViews({ report, meta }: { report: ReportEntry; meta: PageMeta }) {
  const search = useSearch({ strict: false }) as {
    darstellung?: 'gruppen' | 'empfaenger';
    empfaenger?: string;
  };
  const navigate = useNavigate();
  const view = search.darstellung === 'empfaenger' ? 'empfaenger' : 'gruppen';
  const update = (patch: Record<string, unknown>, replace = false) =>
    void navigate({
      to: '.',
      search: ((previous: Record<string, unknown>) => ({ ...previous, ...patch })) as never,
      replace,
    });
  const changePeriod = (period: SpendingPeriod) =>
    update({ zeitraum: period, empfaenger: undefined }, true);
  const control = <Segmented
    className="report-view-switch"
    label="Ansicht der Ausgabenanalyse"
    options={SPENDING_VIEWS}
    value={view}
    onChange={(value) => update({ darstellung: value })}
  />;
  return view === 'empfaenger' ? (
    <PayeeAnalysisReport report={report} meta={meta} viewControl={control}
      selection={{
        id: search.empfaenger ?? null,
        onChange: (id) => update({ empfaenger: id ?? undefined }),
        onPeriodChange: changePeriod,
      }}
    />
  ) : <SpendingAnalysisReport report={report} meta={meta} viewControl={control} onPeriodChange={changePeriod} />;
}
