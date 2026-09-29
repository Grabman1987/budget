import { Link } from '@tanstack/react-router';
import type { AnchorHTMLAttributes, ComponentType } from 'react';

// The typed `Link` only accepts literal route paths; nav data tables carry plain strings.
const LooseLink = Link as unknown as ComponentType<Record<string, unknown>>;

type SearchParams = Record<string, unknown>;

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  /** Any app path; validity of all paths is covered by the e2e route test. */
  to: string;
  /** New search params, or a function that derives them from the current ones (merge). */
  search?: SearchParams | ((previous: SearchParams) => SearchParams) | undefined;
  /** Browser history state of the new entry. */
  state?: Record<string, unknown> | undefined;
};

/** Router link for paths that come from data tables (nav config), where literal types are lost. */
export function AppLink({ to, search, state, ...rest }: Props) {
  // Exact matching: aria-current follows the nav config (area, register), never a path prefix.
  return (
    <LooseLink
      {...rest}
      to={to}
      activeOptions={{ exact: true }}
      {...(search ? { search } : {})}
      {...(state ? { state } : {})}
    />
  );
}
