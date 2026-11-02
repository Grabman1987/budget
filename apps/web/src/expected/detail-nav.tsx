import { useSearch } from '@tanstack/react-router';
import { AppLink } from '../shell/app-link';
import { useMonth } from '../shell/use-month';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import './expected.css';

/** Both direct links and in-app visits carry the originating list's view and filter. */
export function ExpectedDetailBack() {
  const [month] = useMonth();
  const {
    ansicht = 'next',
    art = 'all',
    tage = 35,
  } = useSearch({ strict: false }) as {
    ansicht?: 'next' | 'contracts' | 'all' | 'kalender';
    art?: 'all' | 'inflow' | 'outflow';
    tage?: 35 | 90;
  };
  const state = { expectedView: ansicht, expectedKind: art };
  return (
    <div className="xp-detail-nav">
      <nav aria-label="Brotkrumen">
        <AppLink
          to="/plan/erwartet"
          search={{ monat: month, ...(REDESIGN_ENABLED ? { ansicht, art, tage } : {}) }}
          state={state}
        >
          Zurück zu Erwartet
        </AppLink>
      </nav>
    </div>
  );
}
