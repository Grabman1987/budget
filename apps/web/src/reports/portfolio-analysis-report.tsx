import { Button, Registers } from '@budget/ui';
import { useLocation, useSearch } from '@tanstack/react-router';
import { Printer } from 'lucide-react';
import type { ReactNode } from 'react';
import type { PageMeta } from '../nav/pages';
import { findReport } from '../nav/reports-catalog';
import { PortfolioAllocationReport } from '../pages/portfolio-allocation-report';
import { PortfolioContributionsReport } from '../pages/portfolio-contributions-report';
import { PortfolioPerformanceReport } from '../pages/portfolio-performance-report';
import { AppLink } from '../shell/app-link';
import './table-print.css';
import './portfolio-analysis-report.css';

const VIEWS = [
  { id: 'prendite', label: 'Rendite & Risiko', href: '/reports/pallocation' },
  { id: 'pallocation', label: 'Verteilung über Zeit', href: '/reports/pallocation' },
  { id: 'peinzahlungen', label: 'Einzahlungen und Wert', href: '/reports/pallocation' },
];

/** The three original readers share one report address and retain their financial source data. */
export function PortfolioAnalysisReport({ meta }: { meta: PageMeta }) {
  const search = useSearch({ strict: false }) as { reportQuelle?: string };
  const location = useLocation();
  const selected = VIEWS.find((view) => view.id === search.reportQuelle)?.id ?? 'prendite';
  const source = findReport(selected)!;
  const navigation: ReactNode = (
    <div className="portfolio-analysis-navigation">
      <Registers
        label="Portfolio-Auswertung"
        items={VIEWS}
        current={selected}
        renderLink={(item, props) => (
          <AppLink
            to={item.href!}
            hash={location.hash}
            search={(previous) => ({ ...previous, reportQuelle: item.id })}
            {...props}
          >
            {item.label}
          </AppLink>
        )}
      />
      <Button
        variant="ghost"
        size="sm"
        className="portfolio-analysis-print"
        onClick={() => window.print()}
      >
        <Printer size={15} strokeWidth={1.75} aria-hidden="true" />
        Register drucken
      </Button>
    </div>
  );
  return (
    <div className="portfolio-analysis-report report-table-print">
      {selected === 'pallocation' ? (
        <PortfolioAllocationReport
          report={source}
          meta={meta}
          title="Portfolio-Auswertung"
          navigation={navigation}
        />
      ) : selected === 'peinzahlungen' ? (
        <PortfolioContributionsReport
          report={source}
          meta={meta}
          title="Portfolio-Auswertung"
          navigation={navigation}
        />
      ) : (
        <PortfolioPerformanceReport
          report={source}
          meta={meta}
          title="Portfolio-Auswertung"
          navigation={navigation}
        />
      )}
    </div>
  );
}
