import { ReportViewControl } from './report-view-control';
import { useNavigate, useSearch } from '@tanstack/react-router';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { BudgetAdherenceReportPage } from './budget-adherence-report';
import { ContractsReportPage } from './contracts-report';
import { BankCostsReportPage } from './bank-costs-report';
import './report-views.css';

const CONTRACT_VIEWS = [
  { value: 'vertraege', label: 'Verträge' },
  { value: 'bankkosten', label: 'Bank- und Zinskosten' },
] as const;

/** Historical forecast bookmarks now show the retained budget report. */
export function BudgetReportViews({ report, meta }: { report: ReportEntry; meta: PageMeta }) {
  return <BudgetAdherenceReportPage report={report} meta={meta} />;
}

/** As-of contracts and closed-month bank costs retain separate, source-defined periods. */
export function ContractsReportViews({ report, meta }: { report: ReportEntry; meta: PageMeta }) {
  const search = useSearch({ strict: false }) as { darstellung?: string };
  const navigate = useNavigate();
  const view = search.darstellung === 'bankkosten' ? 'bankkosten' : 'vertraege';
  const canonical = {
    ...report,
    name: 'Verträge und Kosten',
    question: 'Welche Verträge binden uns, und was kostet uns das Geld?',
  };
  const control = (
    <ReportViewControl
      className="report-view-switch report-wealth-switch"
      label="Ansicht von Verträgen und Kosten"
      options={CONTRACT_VIEWS}
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
  return view === 'bankkosten' ? (
    <BankCostsReportPage report={canonical} meta={meta} viewControl={control} />
  ) : (
    <ContractsReportPage report={canonical} meta={meta} viewControl={control} />
  );
}
