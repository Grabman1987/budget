import { useSearch } from '@tanstack/react-router';
import { AppLink } from '../shell/app-link';
import { useMonth } from '../shell/use-month';
import './expected.css';

/** Both direct links and in-app visits carry the originating list's view and filter. */
export function ExpectedDetailBack({ title }: { title: string }) {
  const [month] = useMonth();
  const { ansicht = 'next', art = 'all' } = useSearch({ strict: false }) as {
    ansicht?: 'next' | 'contracts' | 'all';
    art?: 'all' | 'inflow' | 'outflow';
  };
  const state = { expectedView: ansicht, expectedKind: art };
  return (
    <div className="xp-detail-nav">
      <nav aria-label="Brotkrumen">
        <AppLink to="/plan/erwartet" search={{ monat: month }} state={state}>
          Plan · Erwartet
        </AppLink>
        {' › '}
        <span aria-current="page">{title}</span>
      </nav>
      <AppLink to="/plan/erwartet" search={{ monat: month }} state={state}>
        Zurück zu Erwartet
      </AppLink>
    </div>
  );
}
