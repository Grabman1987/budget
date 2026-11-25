import { useLocation } from '@tanstack/react-router';
import { validateInboxSearch } from '../inbox/navigation';
import { BackButton } from '../shell/back-button';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';

/** Reuse S3's internal-return validation and keep this additive affordance Heute-scoped. */
export function heuteReturn(value: unknown): string | undefined {
  const safe = validateInboxSearch({ von: value }).von;
  if (!safe) return undefined;
  const url = new URL(safe, 'https://budget.invalid');
  return url.origin === 'https://budget.invalid' &&
    (url.pathname === '/' ||
      /^\/heute\/details\/(free|budget|liquid|invested|receivable|debt|pace|forecast|tasks|due|bookings|wealth|month|metrics|pinned)$/.test(
        url.pathname,
      ))
    ? url.pathname + url.search + url.hash
    : undefined;
}

/** Source bodies stay owned by their area; only their explicit return is added to the shell. */
export function HeuteSourceReturn() {
  const location = useLocation();
  if (
    !REDESIGN_ENABLED ||
    // The inbox renders its own back button for the same target.
    location.pathname === '/konten/pruefen' ||
    !/^\/(konten\/[^/]+|plan\/(monat(?:\/envelope\/[^/]+)?|erwartet(?:\/[^/]+)?|prognose)|vermoegen\/(freiheit|portfolio\/allokation))$/.test(
      location.pathname,
    )
  )
    return null;
  const source = heuteReturn(
    new URL(location.href, 'https://budget.invalid').searchParams.get('von'),
  );
  if (!source || !source.startsWith('/heute/details/')) return null;
  const url = new URL(source, 'https://budget.invalid');
  return (
    <div className="page-back-row">
      <BackButton
        to={url.pathname}
        search={Object.fromEntries(url.searchParams)}
        hash={url.hash.slice(1)}
        label="Zurück zur Heute-Herleitung"
      />
    </div>
  );
}
