import { PartsList, SectionHead, TitleBlock, Registers, type RegisterItem } from '@budget/ui';
import { areaById } from '../nav/areas';
import { REPORTS_CATALOG, REPORT_GROUP_PAGES, type PageMeta } from '../nav/pages';
import {
  REPORT_GROUPS,
  findReport,
  findReportGroup,
  type ReportEntry,
  type ReportGroup,
} from '../nav/reports-catalog';
import { AppLink } from '../shell/app-link';
import { useSetPageTitle } from '../shell/page-meta';
import { PlaceholderPage } from './placeholder-page';

const CONTROL_LABEL = {
  month: 'Monat',
  year: 'Jahr',
  period: 'Zeitraum',
  print: 'Drucken',
} as const;
const controlsText = (report: ReportEntry) =>
  report.controls.length > 0 ? report.controls.map((c) => CONTROL_LABEL[c]).join(' · ') : '—';

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

const reportLink = (report: ReportEntry) => (
  <AppLink to={`/reports/${report.id}`} className="report-link">
    {report.name}
  </AppLink>
);

const groupSummary = (group: ReportGroup) => ({ question: `${group.items.length} Zeichnungen` });

/** Report catalog as parts list: five assemblies, positions 1.1 … 5.5. */
export function ReportsCatalogPage() {
  return (
    <>
      <TitleBlock
        title={REPORTS_CATALOG.title}
        {...(REPORTS_CATALOG.question ? { subtitle: REPORTS_CATALOG.question } : {})}
        fields={[{ label: 'Gefüllt in', value: 'Paket P6' }]}
        compactOnMobile
      />
      <ReportRegisters current="katalog" />
      <section aria-labelledby="catalog-title" className="catalog">
        <SectionHead id="catalog-title" title="Zeichnungsverzeichnis" aside="30 Reports" />
        <PartsList<ReportEntry>
          caption="Katalog der Reports"
          getRowKey={(r) => r.id}
          groups={REPORT_GROUPS.map((g) => ({
            id: g.slug,
            title: g.name,
            note: `${g.items.length} Zeichnungen`,
            rows: g.items,
          }))}
          columns={[
            { key: 'name', header: 'Report', render: reportLink },
            { key: 'question', header: 'Frage', render: (r) => r.question },
            { key: 'form', header: 'Diagrammform', render: (r) => r.form },
          ]}
        />
      </section>
    </>
  );
}

/** One register of the report catalog: the drawings of a group. */
export function ReportGroupPage({ slug }: { slug: string }) {
  const group = findReportGroup(slug);
  const page = REPORT_GROUP_PAGES.find((p) => p.slug === slug);
  if (!group || !page) return <ReportNotFound />;
  return (
    <>
      <TitleBlock
        title={group.name}
        subtitle={groupSummary(group).question}
        fields={[{ label: 'Gefüllt in', value: 'Paket P6' }]}
        compactOnMobile
      />
      <ReportRegisters current={slug} />
      <section aria-labelledby="group-title" className="catalog">
        <SectionHead id="group-title" title="Zeichnungen" />
        <PartsList<ReportEntry>
          caption={`Reports der Baugruppe ${group.name}`}
          getRowKey={(r) => r.id}
          groups={[{ id: group.slug, title: group.name, rows: group.items }]}
          columns={[
            { key: 'name', header: 'Report', render: reportLink },
            { key: 'question', header: 'Frage', render: (r) => r.question },
            { key: 'controls', header: 'Steuerung', render: controlsText },
          ]}
        />
      </section>
    </>
  );
}

/** A single report: placeholder with position, question and chart form from the catalog. */
export function ReportPage({ reportId }: { reportId: string }) {
  const report = findReport(reportId);
  useSetPageTitle(report?.name);
  if (!report) return <ReportNotFound />;
  const meta: PageMeta = {
    title: report.name,
    area: 'reports',
    register: report.group.slug,
    question: report.question,
    fills: 'P6 Reports und Umstellung',
    spec: `Diagrammform: ${report.form}.`,
  };
  return (
    <PlaceholderPage
      meta={meta}
      extraFields={[
        { label: 'Zeichnung', value: report.pos },
        { label: 'Steuerung', value: controlsText(report) },
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
