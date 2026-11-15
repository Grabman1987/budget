import { Activity, useEffect, useLayoutEffect, useRef } from 'react';
import {
  Outlet,
  useRouter,
  useRouterState,
  type ErrorComponentProps,
} from '@tanstack/react-router';
import { ErrorNote, LoadingNote } from '../ledger/states';

/** A changed address must never leave the previous page's actions available during guards. */
export function NavigationOutlet() {
  const { changing, pathname, sourcePath } = useRouterState({
    select: (state) => ({
      changing: state.isLoading && state.location.href !== state.resolvedLocation?.href,
      pathname: state.location.pathname,
      sourcePath: state.resolvedLocation?.pathname,
    }),
  });
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
      <Activity mode={changing ? 'hidden' : 'visible'}>
        <Outlet />
      </Activity>
    </>
  );
}

export function NavigationPending() {
  return <LoadingNote what="Seitendaten" />;
}

export function NavigationError({ error }: ErrorComponentProps) {
  const router = useRouter();
  return <ErrorNote what="Seitendaten" error={error} onRetry={() => void router.invalidate()} />;
}
