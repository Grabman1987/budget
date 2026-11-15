import { Activity, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import {
  ErrorComponent,
  useMatch,
  useRouter,
  useRouterState,
  type ErrorComponentProps,
} from '@tanstack/react-router';
import { ErrorNote, LoadingNote } from '../ledger/states';
import {
  filterFromSearch,
  validateBookingsSearch,
  type BookingsSearch,
} from '../ledger/bookings-search';

/** Only register pages suspend their actions while the address changes during guards. */
export function RegisterNavigationBoundary({ children }: { children: ReactNode }) {
  const rendered = useMatch({
    strict: false,
    select: (match) => ({
      pathname: match.pathname,
      filterKey: JSON.stringify(filterFromSearch(match.search as BookingsSearch)),
    }),
  });
  const { loading, pathname, filterKey, sourcePath } = useRouterState({
    select: (state) => ({
      loading: state.isLoading,
      pathname: state.location.pathname,
      filterKey: JSON.stringify(filterFromSearch(validateBookingsSearch(state.location.search))),
      sourcePath: state.resolvedLocation?.pathname,
    }),
  });
  // Target matches render before isLoading clears. Keep them visible for scroll restoration.
  const changing =
    loading &&
    (rendered.pathname !== pathname ||
      (pathname === '/konten/buchungen' && rendered.filterKey !== filterKey));
  const focus = useRef<{ element: HTMLElement; pathname: string | undefined } | null>(null);
  useLayoutEffect(() => {
    if (changing) {
      focus.current =
        document.activeElement instanceof HTMLElement
          ? { element: document.activeElement, pathname: sourcePath }
          : null;
    }
  }, [changing, sourcePath]);
  useEffect(() => {
    if (changing) return;
    // Page effects may focus their heading when the Activity becomes visible again.
    if (focus.current?.pathname === pathname && focus.current.element.isConnected)
      focus.current.element.focus({ preventScroll: true });
    focus.current = null;
  }, [changing, pathname]);
  return (
    <>
      {changing && <NavigationPending />}
      <Activity mode={changing ? 'hidden' : 'visible'}>{children}</Activity>
    </>
  );
}

export function NavigationPending() {
  return <LoadingNote what="Seitendaten" />;
}

export function NavigationError(props: ErrorComponentProps) {
  const router = useRouter();
  const fromRegister = useRouterState({
    select: (state) => state.resolvedLocation?.pathname.startsWith('/konten/') ?? false,
  });
  return fromRegister ? (
    <ErrorNote what="Seitendaten" error={props.error} onRetry={() => void router.invalidate()} />
  ) : (
    <ErrorComponent {...props} />
  );
}
