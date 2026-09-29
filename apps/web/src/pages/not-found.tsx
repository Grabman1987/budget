import { SectionHead } from '@budget/ui';
import { AppLink } from '../shell/app-link';

/** Unknown URL: kept outside the shell so it works before any data exists. */
export function NotFoundPage() {
  return (
    <main className="sheet not-found">
      <SectionHead title="Seite nicht gefunden" />
      <p>
        Diese Adresse gibt es nicht. <AppLink to="/">Zurück zu Heute</AppLink>
      </p>
    </main>
  );
}
