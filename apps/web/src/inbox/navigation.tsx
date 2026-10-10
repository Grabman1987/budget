import { useLocation, useRouter } from '@tanstack/react-router';
import type { AnchorHTMLAttributes } from 'react';
import type { InboxPeriod } from '@budget/domain';
import { AppLink } from '../shell/app-link';

export function validateInboxSearch(search: Record<string, unknown>) {
  const value = search['von'];
  const von =
    typeof value === 'string' &&
    value.length <= 1500 &&
    /^\/(?!\/)/.test(value) &&
    !value.includes('\\') &&
    !Array.from(value).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
      ? value
      : undefined;
  const source = search['bankSource'];
  return {
    bankSource:
      typeof source === 'string' &&
      /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(source)
        ? source
        : undefined,
    // `all` is the default and stays out of the URL.
    aufgaben: (search['aufgaben'] === 'current' || search['aufgaben'] === 'historical'
      ? search['aufgaben']
      : undefined) as Exclude<InboxPeriod, 'all'> | undefined,
    gruppe:
      typeof search['gruppe'] === 'string' && search['gruppe'].length <= 100
        ? search['gruppe']
        : undefined,
    von,
  };
}
export type InboxSearch = ReturnType<typeof validateInboxSearch>;

export function InboxHeaderLink(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const location = useLocation();
  return (
    <AppLink
      {...props}
      to="/konten/posteingang"
      search={location.pathname.startsWith('/konten/posteingang') ? {} : { von: location.href }}
      state={{ inboxOpenedInApp: true }}
    />
  );
}

export function InboxBack({ to, label }: { to: string; label: string }) {
  const router = useRouter();
  const inApp = useLocation({ select: (location) => location.state.inboxOpenedInApp });
  const url = new URL(to, 'https://budget.invalid');
  return (
    <AppLink
      className="btn btn-ghost inbox-back"
      to={url.pathname}
      search={Object.fromEntries(url.searchParams)}
      onClick={(event) => {
        if (
          inApp &&
          event.button === 0 &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.shiftKey &&
          !event.altKey
        ) {
          event.preventDefault();
          router.history.back();
        }
      }}
    >
      {label}
    </AppLink>
  );
}
