import type { SpendingPeriod } from '@budget/domain';
import { useNavigate, useSearch } from '@tanstack/react-router';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { PayeeAnalysisReport } from '../pages/payee-analysis-report';
import { SpendingAnalysisReport } from './spending-analysis-report';
import './report-views.css';
import { ReportViewControl } from './report-view-control';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import { CategoryReport } from './category-report';

const SPENDING_VIEWS = [
  { value: 'gruppen', label: 'Gruppen und Kategorien' },
  { value: 'kategorien', label: 'Kategorien und Verlauf' },
  { value: 'empfaenger', label: 'Empfänger' },
] as const;

/** One active report body, using the existing readers and their unchanged financial figures. */
export function SpendingReportViews({ report, meta }: { report: ReportEntry; meta: PageMeta }) {
  const search = useSearch({ strict: false }) as {
    darstellung?: 'gruppen' | 'kategorien' | 'empfaenger';
    empfaenger?: string;
    vergleich?: 'vorperiode' | 'vorjahr' | 'eigen';
    vergleichVon?: string;
    vergleichBis?: string;
  };
  const navigate = useNavigate();
  const view =
    search.darstellung === 'empfaenger'
      ? 'empfaenger'
      : REDESIGN_ENABLED && search.darstellung === 'kategorien'
        ? 'kategorien'
        : 'gruppen';
  const update = (patch: Record<string, unknown>, replace = false) =>
    void navigate({
      to: '.',
      search: ((previous: Record<string, unknown>) => ({ ...previous, ...patch })) as never,
      replace,
    });
  const changePeriod = (period: SpendingPeriod) =>
    update({ zeitraum: period, empfaenger: undefined }, true);
  // In the redesign the views are indented sub-reports of the report menu (#1150).
  const control = REDESIGN_ENABLED ? undefined : (
    <ReportViewControl
      className="report-view-switch"
      label="Ansicht der Ausgabenanalyse"
      options={SPENDING_VIEWS.filter((option) => option.value !== 'kategorien')}
      value={view}
      onChange={(value) => update({ darstellung: value })}
    />
  );
  return view === 'empfaenger' ? (
    <PayeeAnalysisReport
      report={report}
      meta={meta}
      viewControl={control}
      selection={{
        id: search.empfaenger ?? null,
        onChange: (id) => update({ empfaenger: id ?? undefined }),
        onPeriodChange: changePeriod,
      }}
    />
  ) : view === 'kategorien' ? (
    <CategoryReport
      report={report}
      meta={meta}
      viewControl={control}
      defaultPeriod="1J"
      sortByChange
    />
  ) : (
    <SpendingAnalysisReport
      report={report}
      meta={meta}
      viewControl={control}
      onPeriodChange={changePeriod}
      comparison={REDESIGN_ENABLED ? (search.vergleich ?? 'vorperiode') : 'vorperiode'}
      {...(search.vergleich === 'eigen' && search.vergleichVon && search.vergleichBis
        ? { comparisonWindow: { von: search.vergleichVon, bis: search.vergleichBis } }
        : {})}
      onComparisonChange={(value, range) =>
        update(
          {
            vergleich: value === 'vorperiode' ? undefined : value,
            vergleichVon: range?.von,
            vergleichBis: range?.bis,
          },
          true,
        )
      }
    />
  );
}
