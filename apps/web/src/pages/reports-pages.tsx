import { WholePictureReport } from '../reports/whole-picture-report';
import { IncomeExpenseReport } from '../reports/income-expense-report';
import { PayrollReport } from '../reports/payroll-report';
import { ProjectsReport } from '../reports/projects-report';
import { ReportTrendContext } from '@budget/ui';
import { useSearch } from '@tanstack/react-router';
import { Registers, SectionHead, type RegisterItem } from '@budget/ui';
import { ChevronRight, Printer } from 'lucide-react';
import { BookRuleMetric } from '../rules/book-rule-metric';
import { areaById } from '../nav/areas';
import { REPORTS_CATALOG, REPORT_GROUP_PAGES, type PageMeta } from '../nav/pages';
import {
  REPORTS,
  REPORT_GROUPS,
  findReport,
  findReportGroup,
  type ReportEntry,
} from '../nav/reports-catalog';
import { useNavigate, useParams } from '@tanstack/react-router';
import { AppLink } from '../shell/app-link';
import { AreaHead } from './area-head';
import { PlaceholderPage } from './placeholder-page';
import { GoalsProgressReport } from './goals-progress-report';
import { PaymentsPreviewReport } from './payments-preview-report';
import { ContactReportPage } from '../reports/contact-report';
import { CashflowReportPage } from '../reports/cashflow-report';
import { LiquidityReportPage } from '../reports/liquidity-report';
import { AssetsDebtsReport } from '../reports/assets-debts-report';
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
import { SpendingAnalysisReport } from '../reports/spending-analysis-report';
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

function ReportRegisters({ current }: { current: string }) {
  const items: RegisterItem[] = areaById('reports').registers.map((r) => ({
    id: r.id,
    label: r.label,
    href: r.to,
  }));
  return (
    <Registers
      label="Register von Reports"
      items={items}
      current={current}
      renderLink={(item, props) => (
        <AppLink to={item.href ?? '/reports'} {...props}>
          {item.label}
        </AppLink>
      )}
    />
  );
}

/**
 * Report catalog (Zeichnungsverzeichnis) as in the prototype: one table, a quiet heading row per
 * assembly, positions 1.1 … 5.5. The name is the link; the whole row is a larger click target.
 * On the phone the rows stack (position, name, question, chart form).
 */
function ReportCatalogTable({
  groups,
  caption,
}: {
  groups: ReadonlyArray<(typeof REPORT_GROUPS)[number]>;
  caption: string;
}) {
  const navigate = useNavigate();
  return (
    <section className="rcat-wrap" aria-label={caption}>
      <table className="rcat">
        <thead>
          <tr>
            <th className="tech col-pos">Pos</th>
            <th className="tech">Report</th>
            <th className="tech">Frage</th>
            <th className="tech">Diagrammform</th>
            <th className="tech">Steuerung</th>
            <th>
              <span className="sr-only">Öffnen</span>
            </th>
          </tr>
        </thead>
        {groups.map((group) => (
          <tbody key={group.slug}>
            <tr className="rcat-grp">
              <td className="col-pos">{group.no}</td>
              <td colSpan={5}>
                <strong>{group.name}</strong>
                <span className="rcat-count">{group.items.length} Reports</span>
              </td>
            </tr>
            {group.items.map((report) => (
              <tr
                key={report.id}
                className="rcat-row"
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest('a')) return;
                  void navigate({ to: `/reports/${report.id}` });
                }}
              >
                <td className="col-pos">{report.pos}</td>
                <td className="rcat-name">
                  <AppLink to={`/reports/${report.id}`}>{report.name}</AppLink>
                </td>
                <td className="rcat-q">{report.question}</td>
                <td className="rcat-form tech">{report.form}</td>
                <td className="rcat-ctl">
                  <Controls report={report} />
                </td>
                <td className="rcat-go" aria-hidden="true">
                  <ChevronRight size={16} strokeWidth={1.75} />
                </td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </section>
  );
}

/** Report catalog: all five assemblies. */
export function ReportsCatalogPage() {
  return (
    <>
      <AreaHead
        meta={REPORTS_CATALOG}
        subtitle={`${REPORTS.length} Zeichnungen aus einem Hauptbuch`}
      />
      <ReportRegisters current="katalog" />
      <ReportCatalogTable groups={REPORT_GROUPS} caption="Katalog der Reports" />
    </>
  );
}

/** One register of the report catalog: the drawings of one assembly. */
export function ReportGroupPage({ slug }: { slug: string }) {
  const group = findReportGroup(slug);
  const page = REPORT_GROUP_PAGES.find((p) => p.slug === slug);
  if (!group || !page) return <ReportNotFound />;
  return (
    <>
      <AreaHead meta={REPORTS_CATALOG} subtitle={group.name} />
      <ReportRegisters current={slug} />
      <ReportCatalogTable groups={[group]} caption={`Reports der Baugruppe ${group.name}`} />
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
  if (report.id === 'liquiditaet') return <LiquidityReportPage report={report} meta={meta} />;
  if (report.id === 'cashflow') return <CashflowReportPage report={report} meta={meta} />;
  if (report.id === 'vermoegen') return <WealthHistoryReport report={report} meta={meta} />;
  if (report.id === 'vermoegen-schulden') return <AssetsDebtsReport report={report} meta={meta} />;
  if (report.id === 'ausgaben') return <SpendingAnalysisReport report={report} meta={meta} />;
  if (report.id === 'budgettreue') return <BudgetAdherenceReportPage report={report} meta={meta} />;
  if (report.id === 'planungstreue')
    return <PlanningAccuracyReportPage report={report} meta={meta} />;
  if (report.id === 'abos') return <ContractsReportPage report={report} meta={meta} />;
  if (report.id === 'kosten') return <BankCostsReportPage report={report} meta={meta} />;
  if (report.id === 'inflation') return <PersonalInflationReport report={report} meta={meta} />;
  if (report.id === 'sparziele') return <GoalsProgressReport report={report} meta={meta} />;
  if (report.id === 'vorschau') return <PaymentsPreviewReport report={report} meta={meta} />;
  if (report.id === 'empfaenger') return <PayeeAnalysisReport report={report} meta={meta} />;
  if (report.id === 'prendite') return <PortfolioPerformanceReport report={report} meta={meta} />;
  if (report.id === 'pdepots') return <PortfolioDepotsReport report={report} meta={meta} />;
  if (report.id === 'pallocation') return <PortfolioAllocationReport report={report} meta={meta} />;
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
    return <IncomeExpenseReport report={report} meta={meta} sources={detail} />;
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
  const search = useSearch({ strict: false }) as { trend?: boolean };
  return (
    <ReportTrendContext.Provider
      value={
        search.trend === true &&
        ['kategorien', 'sparquote', 'cashflow', 'vermoegen', 'peinzahlungen', 'pdepots'].includes(
          reportId,
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
