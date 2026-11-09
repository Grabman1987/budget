import { useSearch } from '@tanstack/react-router';
import { NetWorthContent } from '../wealth/networth-page';
import { VermoegenStand } from '../wealth/frame';
import { useZeitraum } from '../wealth/zeitraum';
import { AppLink } from '../shell/app-link';
import type { Period } from '@budget/domain';

/** T3's complete original composition, account modes and history stay available from the report. */
export function WealthSourceAnalysis({ fallbackPeriod = 'YTD' }: { fallbackPeriod?: Period }) {
  const search = useSearch({ strict: false }) as { ansicht?: string };
  const [period] = useZeitraum(fallbackPeriod);
  return (
    <details className="wealth-source-analysis" open={search.ansicht === 'analyse' || undefined}>
      <summary>Nettovermögen, Zusammensetzung und tägliche Quellwerte im Detail</summary>
      <nav aria-label="Ansichten von Vermögen" className="registers">
        <AppLink to="/vermoegen" search={{ zeitraum: period }}>
          Übersicht
        </AppLink>
        <AppLink to="/vermoegen/portfolio" search={{ zeitraum: period }}>
          Portfolio
        </AppLink>
      </nav>
      <p className="retained-networth-stand">
        <VermoegenStand />
      </p>
      <NetWorthContent fallbackPeriod={fallbackPeriod} inReport dedupe />
    </details>
  );
}
