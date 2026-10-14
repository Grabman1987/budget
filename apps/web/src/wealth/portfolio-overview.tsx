import { ChartSvg, Line, useAmountPrivacy } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { portfolioPerformanceQuery } from './portfolio-api';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { longDay } from '../ledger/format';
import { ZeitraumSwitch } from './frame';
import { useZeitraum } from './zeitraum';
import { AppLink } from '../shell/app-link';

const percent = (rate: number) =>
  `${rate < 0 ? '−' : '+'}${new Intl.NumberFormat('de-AT', { maximumFractionDigits: 1 }).format(Math.abs(rate) * 100)} %`;

/** Read the same time-weighted history as Reports; only chart geometry lives here. */
export function PortfolioOverview() {
  useAmountPrivacy();
  const [period] = useZeitraum();
  const query = useQuery(portfolioPerformanceQuery(period));
  const performance = query.data?.portfolio.performance;
  const index = query.data?.portfolio.performanceHistory?.index ?? [];
  const complete = index.length > 1 && index.every((p) => p.portfolio !== null);
  const low = Math.min(...index.map((p) => p.portfolio ?? 100));
  const high = Math.max(...index.map((p) => p.portfolio ?? 100));
  const x = (i: number) => 16 + (i / Math.max(1, index.length - 1)) * 688;
  const y = (value: number) => 150 - ((value - low) / (high - low || 1)) * 120;
  return (
    <section className="portfolio-overview" aria-label="Portfolioentwicklung">
      <div className="head">
        <h2>Verlauf</h2>
        <ZeitraumSwitch />
      </div>
      {query.isPending && <LoadingNote what="Portfolioentwicklung" />}
      {query.isError && (
        <ErrorNote
          what="Portfolioentwicklung"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      )}
      {performance && (
        <details className="wealth-details">
          <summary data-testid="portfolio-return">
            Rendite p. a.{' '}
            {Number.isFinite(performance.ttwrorAnnualised) && performance.days > 0
              ? percent(performance.ttwrorAnnualised)
              : '—'}{' '}
            (zeitgewichtet) <Info size={18} strokeWidth={1.75} aria-hidden="true" />
          </summary>
          <p className="vnote">
            Tägliche Renditen ohne den Einfluss von Ein- und Auszahlungen, auf ein Jahr umgerechnet.{' '}
            {longDay(performance.from)} bis {longDay(performance.to)}. Kurze Zeiträume können stark
            schwanken. Die Linie startet bei 100 und zeigt dieselbe zeitgewichtete Entwicklung wie
            die Reports.
          </p>
        </details>
      )}
      {complete ? (
        <ChartSvg
          width={720}
          height={180}
          label="Portfolioentwicklung, zeitgewichtet, Startwert 100"
          testId="portfolio-overview-chart"
          points={index.map((p, i) => ({
            x: x(i),
            date: p.date,
            series: [
              {
                name: 'Entwicklung (Start = 100)',
                value: new Intl.NumberFormat('de-AT', { maximumFractionDigits: 2 }).format(
                  p.portfolio!,
                ),
                color: 'var(--line)',
              },
            ],
          }))}
        >
          <Line kind="actual" points={index.map((p, i) => [x(i), y(p.portfolio!)])} />
          <text x={16} y={174} className="chart-label">
            {index[0]?.date}
          </text>
          <text x={704} y={174} textAnchor="end" className="chart-label">
            {index.at(-1)?.date}
          </text>
        </ChartSvg>
      ) : (
        query.isSuccess && (
          <p className="vnote">Noch keine vollständige Renditehistorie für diesen Zeitraum.</p>
        )
      )}
      <AppLink className="vlook" to="/reports/gruppe/portfolio">
        Reportkatalog Portfolio öffnen
      </AppLink>
    </section>
  );
}
