import { WholePictureReport } from '../reports/whole-picture-report';
import { IncomeCashflowReport } from '../reports/income-cashflow-report';
import { PayrollReport } from '../reports/payroll-report';
import { ProjectsReport } from '../reports/projects-report';
import { ReportTrendContext } from '@budget/ui';
import { useSearch } from '@tanstack/react-router';
import { SectionHead } from '@budget/ui';
import { useEffect } from 'react';
import { Printer } from 'lucide-react';
import { BookRuleMetric } from '../rules/book-rule-metric';
import { REPORTS_CATALOG, REPORT_GROUP_PAGES, type PageMeta } from '../nav/pages';
import { findReport, findReportGroup, type ReportEntry } from '../nav/reports-catalog';
import { useParams } from '@tanstack/react-router';
import { AppLink } from '../shell/app-link';
import { AreaHead } from './area-head';
import { PlaceholderPage } from './placeholder-page';
import { GoalsProgressReport } from './goals-progress-report';
import { PaymentsPreviewReport } from './payments-preview-report';
import { ContactReportPage } from '../reports/contact-report';
import { CashflowReportPage } from '../reports/cashflow-report';
import { WealthReportViews } from '../reports/wealth-report-views';
import { WealthHistoryReport } from '../reports/wealth-history-report';
import { PayeeAnalysisReport } from './payee-analysis-report';
import { PortfolioPerformanceReport } from './portfolio-performance-report';
import { PortfolioContributionsReport } from './portfolio-contributions-report';
import { IncomeReport } from '../reports/income-report';
import { FlowReport } from '../reports/flow-report';
import { OnePagerReport } from '../reports/onepager-report';
import { FinanzcheckReport } from '../reports/finanzcheck-report';
import { CompareReport } from '../reports/compare-report';
import { JahresreportPage } from '../reports/jahresreport-page';
import { ExplorerReportPage } from '../reports/explorer-report';
import { ReportHub } from '../reports/report-hub';
import { rememberReport, type HubGroup } from '../reports/report-hub-model';
import { SpendingReportViews } from '../reports/spending-report-views';
import { BudgetReportViews, ContractsReportViews } from '../reports/budget-contract-report-views';
import { PlanningAccuracyReportPage } from '../reports/planning-accuracy-report';
import { BankCostsReportPage } from '../reports/bank-costs-report';
import { PersonalInflationReport } from '../reports/personal-inflation-report';
import { YearReport } from '../reports/year-report';
import { CategoryReport } from '../reports/category-report';
import { SavingsReport } from '../reports/savings-report';
import { TotalTableReport } from '../reports/total-table-report';
import { PortfolioDepotsReport } from './portfolio-depots-report';
import { PortfolioReportViews } from '../reports/portfolio-report-views';
import { PortfolioCostsReport } from './portfolio-costs-report';

const CONTROL_LABEL = { month: 'Monat', year: 'Jahr', period: 'Zeitraum' } as const;

/** Steuerung as in the prototype: "Monat", "Zeitraum" … or "fest", plus a printer for print sheets. */
function Controls({ report }: { report: ReportEntry }) {
  const labels = report.controls.flatMap((c) => (c === 'print' ? [] : [CONTROL_LABEL[c]]));
  return (
    <>
      {labels.length > 0 ? labels.join(', ') : <span className="muted">fest</span>}
      {report.controls.includes('print') && (
        <>
          {' · '}
          <Printer className="icon icon-xs" size={16} strokeWidth={1.75} aria-label="Druckblatt" />
        </>
      )}
    </>
  );
}

/** The canonical hub preserves report bodies and old direct links. */
export function ReportsCatalogPage() {
  return (
    <>
      <AreaHead meta={REPORTS_CATALOG} subtitle="16 Berichte aus einem Hauptbuch" />
      <ReportHub />
    </>
  );
}

/** Existing group URLs remain useful without retaining the old register navigation. */
export function ReportGroupPage({ slug }: { slug: string }) {
  const group = findReportGroup(slug);
  const page = REPORT_GROUP_PAGES.find((p) => p.slug === slug);
  if (!group || !page) return <ReportNotFound />;
  const initial: Record<string, HubGroup> = {
    monat: 'income',
    ausgaben: 'income',
    zukunft: 'wealth',
    portfolio: 'portfolio',
    ueberblick: 'reports',
  };
  return (
    <>
      <AreaHead meta={REPORTS_CATALOG} subtitle="16 Berichte aus einem Hauptbuch" />
      <ReportHub key={slug} initialGroup={initial[slug]} />
    </>
  );
}

/** Report dispatch: connected bodies where implemented, otherwise a placeholder from the catalog. */
export function ReportPage({ reportId, detail = false }: { reportId: string; detail?: boolean }) {
  if (reportId === 'kontakte') return <ContactReportPage />;
  const report = findReport(reportId);
  if (!report) return <ReportNotFound />;
  const meta: PageMeta = {
    title: report.name,
    area: 'reports',
    register: report.group.slug,
    fills: 'P6 Reports und Umstellung',
    spec: `Diagrammform: ${report.form}.`,
  };
  if (report.id === 'cashflow') return <CashflowReportPage report={report} meta={meta} />;
  if (report.id === 'vermoegen') return <WealthHistoryReport report={report} meta={meta} />;
  if (report.id === 'vermoegen-schulden') return <WealthReportViews report={report} meta={meta} />;
  if (report.id === 'ausgaben') return <SpendingReportViews report={report} meta={meta} />;
  if (report.id === 'budgettreue') return <BudgetReportViews report={report} meta={meta} />;
  if (report.id === 'planungstreue')
    return <PlanningAccuracyReportPage report={report} meta={meta} />;
  if (report.id === 'abos') return <ContractsReportViews report={report} meta={meta} />;
  if (report.id === 'kosten') return <BankCostsReportPage report={report} meta={meta} />;
  if (report.id === 'inflation') return <PersonalInflationReport report={report} meta={meta} />;
  if (report.id === 'sparziele') return <GoalsProgressReport report={report} meta={meta} />;
  if (report.id === 'vorschau') return <PaymentsPreviewReport report={report} meta={meta} />;
  if (report.id === 'empfaenger') return <PayeeAnalysisReport report={report} meta={meta} />;
  if (report.id === 'prendite') return <PortfolioPerformanceReport report={report} meta={meta} />;
  if (report.id === 'pdepots') return <PortfolioDepotsReport report={report} meta={meta} />;
  if (report.id === 'pallocation') return <PortfolioReportViews report={report} meta={meta} />;
  if (report.id === 'psteuern') return <PortfolioCostsReport report={report} meta={meta} />;
  if (report.id === 'peinzahlungen')
    return <PortfolioContributionsReport report={report} meta={meta} />;
  if (report.id === 'gehalt') return <PayrollReport report={report} meta={meta} history={detail} />;
  if (report.id === 'projekte') return <ProjectsReport report={report} meta={meta} />;
  if (report.id === 'einnahmen') return <IncomeReport report={report} meta={meta} />;
  if (report.id === 'geldfluss') return <FlowReport report={report} meta={meta} />;
  if (report.id === 'gesamtuebersicht') return <WholePictureReport report={report} meta={meta} />;
  if (report.id === 'onepager') return <OnePagerReport report={report} meta={meta} />;
  if (report.id === 'finanzcheck') return <FinanzcheckReport report={report} meta={meta} />;
  if (report.id === 'jahresreport') return <JahresreportPage report={report} meta={meta} />;
  if (report.id === 'explorer') return <ExplorerReportPage report={report} meta={meta} />;
  if (report.id === 'vergleich') return <CompareReport report={report} meta={meta} />;
  if (report.id === 'jahresansicht') return <YearReport report={report} meta={meta} />;
  if (report.id === 'kategorien') return <CategoryReport report={report} meta={meta} />;
  if (report.id === 'sparquote') return <SavingsReport report={report} meta={meta} />;
  if (report.id === 'einnahmen-ausgaben')
    return <IncomeCashflowReport report={report} meta={meta} sources={detail} />;
  if (report.id === 'gesamttabelle') return <TotalTableReport report={report} meta={meta} />;
  return (
    <PlaceholderPage
      meta={meta}
      title={report.name}
      extraFields={[
        { label: 'Zeichnung', value: report.pos },
        { label: 'Steuerung', value: <Controls report={report} /> },
        ...(report.id === 'gehalt'
          ? [{ label: 'Einkommenszuwachs', value: <BookRuleMetric code="R19" /> }]
          : []),
      ]}
    />
  );
}

export function ReportNotFound() {
  return (
    <section className="placeholder">
      <SectionHead title="Report nicht gefunden" />
      <p>
        Diese Zeichnung gibt es nicht. <AppLink to="/reports">Zum Katalog</AppLink>
      </p>
    </section>
  );
}

/** Route components: read the URL parameter here so the router file stays free of page code. */
export function ReportGroupRoute() {
  const { slug } = useParams({ strict: false }) as { slug: string };
  return <ReportGroupPage slug={slug} />;
}

export function ReportRoute() {
  const { reportId } = useParams({ strict: false }) as { reportId: string };
  const search = useSearch({ strict: false }) as { trend?: boolean; darstellung?: string };
  useEffect(() => {
    rememberReport(reportId);
  }, [reportId]);
  return (
    <ReportTrendContext.Provider
      value={
        search.trend === true &&
        (['kategorien', 'sparquote', 'cashflow', 'vermoegen', 'peinzahlungen', 'pdepots'].includes(
          reportId,
        ) ||
          (reportId === 'einnahmen-ausgaben' && search.darstellung === 'cashflow') ||
          (reportId === 'vermoegen-schulden' && search.darstellung === 'verlauf') ||
          (reportId === 'pallocation' && search.darstellung === 'einzahlungen'))
      }
    >
      <ReportPage reportId={reportId} />
    </ReportTrendContext.Provider>
  );
}

export function PayrollHistoryRoute() {
  return <ReportPage reportId="gehalt" detail />;
}
export function IncomeExpenseSourcesRoute() {
  return <ReportPage reportId="einnahmen-ausgaben" detail />;
}
