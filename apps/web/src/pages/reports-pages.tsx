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
import {
  findReport,
  findReportGroup,
  type ReportEntry,
} from '../nav/reports-catalog';
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
import { ReportSourceViews, ProjectResultsReturn } from '../reports/report-source-views';
import { ReportHub } from '../reports/report-hub';
import { rememberReport, type HubGroup } from '../reports/report-hub-model';
import { SpendingReportViews } from '../reports/spending-report-views';
import { BudgetAdherenceReportPage } from '../reports/budget-adherence-report';
import { PlanningAccuracyReportPage } from '../reports/planning-accuracy-report';
import { ContractsReportPage } from '../reports/contracts-report';
import { BankCostsReportPage } from '../reports/bank-costs-report';
import { PersonalInflationReport } from '../reports/personal-inflation-report';
import { YearReport } from '../reports/year-report';
import { CategoryReport } from '../reports/category-report';
import { SavingsReport } from '../reports/savings-report';
import { TotalTableReport } from '../reports/total-table-report';
import { PortfolioDepotsReport } from './portfolio-depots-report';
import { PortfolioAllocationReport } from './portfolio-allocation-report';
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
          <Printer className="icon icon-xs" size={13} strokeWidth={1.75} aria-label="Druckblatt" />
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
      <p className="muted">
        <AppLink className="btn btn-ghost" to="/plan/prognose">Kontoprognose in Plan öffnen</AppLink>
      </p>
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
    monat: 'income', ausgaben: 'income', zukunft: 'wealth', portfolio: 'portfolio', ueberblick: 'reports',
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
  const search = useSearch({ strict: false }) as { reportQuelle?: string };
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
  if (report.id === 'budgettreue') return <ReportSourceViews report={report} meta={meta}
    sources={[{ id: 'budgettreue', name: 'Budgettreue' }, { id: 'planungstreue', name: 'Prognosegenauigkeit' }]}>
    {(source, sourceMeta) => source.id === 'planungstreue'
      ? <PlanningAccuracyReportPage report={source} meta={sourceMeta} />
      : <BudgetAdherenceReportPage report={source} meta={sourceMeta} />}
  </ReportSourceViews>;
  if (report.id === 'planungstreue')
    return <PlanningAccuracyReportPage report={report} meta={meta} />;
  if (report.id === 'abos') return <ReportSourceViews report={report} meta={meta}
    sources={[{ id: 'abos', name: 'Verträge und Abos' }, { id: 'kosten', name: 'Bank- und Zinskosten' }]}>
    {(source, sourceMeta) => source.id === 'kosten'
      ? <BankCostsReportPage report={source} meta={sourceMeta} />
      : <ContractsReportPage report={source} meta={sourceMeta} />}
  </ReportSourceViews>;
  if (report.id === 'kosten') return <BankCostsReportPage report={report} meta={meta} />;
  if (report.id === 'inflation') return <PersonalInflationReport report={report} meta={meta} />;
  if (report.id === 'sparziele') return <GoalsProgressReport report={report} meta={meta} />;
  if (report.id === 'vorschau') return <PaymentsPreviewReport report={report} meta={meta} />;
  if (report.id === 'empfaenger') return <PayeeAnalysisReport report={report} meta={meta} />;
  if (report.id === 'prendite') return <PortfolioPerformanceReport report={report} meta={meta} />;
  if (report.id === 'pdepots') return <PortfolioDepotsReport report={report} meta={meta} />;
  if (report.id === 'pallocation') return <ReportSourceViews report={report} meta={meta}
    sources={[{ id: 'pallocation', name: 'Aufteilung' }, { id: 'peinzahlungen', name: 'Einzahlungen und Wert' }, { id: 'prendite', name: 'Rendite und Kennzahlen' }]}>
    {(source, sourceMeta) => source.id === 'peinzahlungen'
      ? <PortfolioContributionsReport report={source} meta={sourceMeta} />
      : source.id === 'prendite' ? <PortfolioPerformanceReport report={source} meta={sourceMeta} />
      : <PortfolioAllocationReport report={source} meta={sourceMeta} />}
  </ReportSourceViews>;
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
  if (report.id === 'explorer') return <ReportSourceViews report={report} meta={meta}
    sources={[{ id: 'explorer', name: 'Auswertung und Vorlagen' }, { id: 'kategorien', name: 'Kategorieübersicht' }, { id: 'jahresansicht', name: 'Jahresansicht' }, { id: 'gesamttabelle', name: 'Gesamttabelle' }]}>
    {(source, sourceMeta) => source.id === 'kategorien' ? <CategoryReport report={source} meta={sourceMeta} />
      : source.id === 'jahresansicht' ? <YearReport report={source} meta={sourceMeta} />
      : source.id === 'gesamttabelle' ? <TotalTableReport report={source} meta={sourceMeta} />
      : <ExplorerReportPage report={source} meta={sourceMeta} />}
  </ReportSourceViews>;
  if (report.id === 'vergleich') return <CompareReport report={report} meta={meta} />;
  if (report.id === 'jahresansicht') return <YearReport report={report} meta={meta} />;
  if (report.id === 'kategorien') return <CategoryReport report={report} meta={meta} />;
  if (report.id === 'sparquote') return <SavingsReport report={report} meta={meta} />;
  if (report.id === 'einnahmen-ausgaben' && search.reportQuelle === 'projekte') return <>
    <ProjectResultsReturn />
    <ProjectsReport report={findReport('projekte')!} meta={meta} />
  </>;
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
  const search = useSearch({ strict: false }) as {
    trend?: boolean;
    reportQuelle?: string;
    darstellung?: string;
  };
  const trendSource = search.reportQuelle ?? (
    reportId === 'einnahmen-ausgaben' && search.darstellung === 'cashflow' ? 'cashflow'
      : reportId === 'vermoegen-schulden' && search.darstellung === 'verlauf' ? 'vermoegen'
      : reportId
  );
  useEffect(() => { rememberReport(reportId); }, [reportId]);
  return (
    <ReportTrendContext.Provider
      value={
        search.trend === true &&
        ['kategorien', 'sparquote', 'cashflow', 'vermoegen', 'peinzahlungen', 'pdepots'].includes(
          trendSource,
        )
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
