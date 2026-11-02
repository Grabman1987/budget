import { useLinkProps, useLocation } from '@tanstack/react-router';
import type { AnchorHTMLAttributes } from 'react';

// The typed link hook only accepts literal route paths; nav tables carry plain strings.
const useLooseLinkProps = useLinkProps as unknown as (
  options: Record<string, unknown>,
) => AnchorHTMLAttributes<HTMLAnchorElement>;

import { REDESIGN_ENABLED } from './redesign-flag';

type SearchParams = Record<string, unknown>;

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  /** Any app path; validity of all paths is covered by the e2e route test. */
  to: string;
  /** New search params, or a function that derives them from the current ones (merge). */
  search?: SearchParams | ((previous: SearchParams) => SearchParams) | undefined;
  /** Browser history state of the new entry. */
  state?: Record<string, unknown> | undefined;
  /** In-page destination, e.g. a concrete rule finding. */
  hash?: string | undefined;
};

/** Router link for paths that come from data tables (nav config), where literal types are lost. */
export function AppLink({ to, search, state, ...rest }: Props) {
  const location = useLocation();
  const sourceSearch =
    REDESIGN_ENABLED &&
    to === '/einstellungen/warenkorb' &&
    !location.pathname.startsWith('/einstellungen')
      ? (previous: SearchParams) => ({
          ...(typeof search === 'function' ? search(previous) : search),
          von: location.href,
        })
      : search;
  const controlled = Object.hasOwn(rest, 'aria-current');
  const props = useLooseLinkProps({
    ...rest,
    to,
    activeOptions: { exact: true },
    ...(controlled ? { activeProps: {} } : {}),
    ...(sourceSearch ? { search: sourceSearch } : {}),
    ...(state ? { state } : {}),
  });
  // Explicit nav state also overrides the router's automatic exact-URL active state.
  return (
    <a
      {...props}
      {...(controlled
        ? {
            'aria-current': rest['aria-current'],
            'data-status': rest['aria-current'] ? 'active' : undefined,
          }
        : {})}
    >
      {rest.children}
    </a>
  );
}
