import { Segmented } from '@budget/ui';
import { useNavigate, useSearch } from '@tanstack/react-router';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { BudgetAdherenceReportPage } from './budget-adherence-report';
import { PlanningAccuracyReportPage } from './planning-accuracy-report';
import { ContractsReportPage } from './contracts-report';
import { BankCostsReportPage } from './bank-costs-report';
import './report-views.css';

const BUDGET_VIEWS = [
  { value: 'budget', label: 'Plan und Ist' },
  { value: 'planungstreue', label: 'Planungstreue' },
] as const;
const CONTRACT_VIEWS = [
  { value: 'vertraege', label: 'Verträge' },
  { value: 'bankkosten', label: 'Bank- und Zinskosten' },
] as const;

/** Both readers keep their existing month and six-month quality boundaries. */
export function BudgetReportViews({ report, meta }: { report: ReportEntry; meta: PageMeta }) {
  const search = useSearch({ strict: false }) as { darstellung?: string };
  const navigate = useNavigate();
  const view = search.darstellung === 'planungstreue' ? 'planungstreue' : 'budget';
  const control = (
    <Segmented
      className="report-view-switch report-wealth-switch"
      label="Ansicht der Budgettreue"
      options={BUDGET_VIEWS}
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
  return view === 'planungstreue' ? (
    <PlanningAccuracyReportPage report={report} meta={meta} viewControl={control} />
  ) : (
    <BudgetAdherenceReportPage report={report} meta={meta} viewControl={control} />
  );
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
    <Segmented
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
