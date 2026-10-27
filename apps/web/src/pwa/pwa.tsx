import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Button } from '@budget/ui';
import { ApiError } from '../api/http';
import { AUTH_STATUS_KEY, queryClient } from '../auth/status-query';
import { router } from '../router';
import './pwa.css';
import { QueueCapture } from './queue-ui';
import { OfflineState } from './offline-state';
import { setOfflineUnavailable, subscribeSnapshotEpoch } from './snapshots';

function subscribeAuthStatus(setHasConnected: (connected: boolean) => void) {
  return queryClient.getQueryCache().subscribe(({ query }) => {
    if (
      query.state.error instanceof ApiError &&
      query.state.error.status === 0 &&
      (query.queryKey[0] !== AUTH_STATUS_KEY[0] || query.state.data === undefined)
    )
      setHasConnected(false);
  });
}

function authStatusUnavailable() {
  const state = queryClient.getQueryState(AUTH_STATUS_KEY);
  return state?.data === undefined && state?.error instanceof ApiError && state.error.status === 0;
}

function subscribeOnline(changed: () => void) {
  window.addEventListener('online', changed);
  window.addEventListener('offline', changed);
  return () => {
    window.removeEventListener('online', changed);
    window.removeEventListener('offline', changed);
  };
}

/** Offline reloads mount only the four approved read snapshots and queued capture. */
export function PwaShell({ children }: { children: ReactNode }) {
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [hasConnected, setHasConnected] = useState(
    () => navigator.onLine && !authStatusUnavailable(),
  );
  const [capture, setCapture] = useState(false);
  const [mounted, setMounted] = useState(hasConnected);
  const [sessionEnded, setSessionEnded] = useState(false);
  const showLive = online && hasConnected && !sessionEnded;
  setOfflineUnavailable(!showLive);
  useEffect(() => {
    setOfflineUnavailable(!showLive);
    return () => setOfflineUnavailable(false);
  }, [showLive]);
  useEffect(() => {
    const connected = () => {
      if (!sessionEnded) {
        setHasConnected(true);
        setMounted(true);
      }
    };
    window.addEventListener('online', connected);
    return () => window.removeEventListener('online', connected);
  }, [sessionEnded]);
  useEffect(() => {
    return subscribeAuthStatus(setHasConnected);
  }, []);
  useEffect(
    () =>
      subscribeSnapshotEpoch(() => {
        queryClient.clear();
        setHasConnected(false);
        setMounted(false);
        setSessionEnded(true);
      }),
    [],
  );
  useEffect(() => {
    const expired = (event: Event) => {
      const fromStatus = event instanceof CustomEvent && event.detail?.fromStatus === true;
      if (fromStatus)
        queryClient.removeQueries({
          predicate: ({ queryKey }) =>
            queryKey.length !== AUTH_STATUS_KEY.length ||
            queryKey[0] !== AUTH_STATUS_KEY[0] ||
            queryKey[1] !== AUTH_STATUS_KEY[1],
        });
      else queryClient.clear();
      // A confirmed signed-out status is also the ordinary entry to the login page.
      if (location.pathname === '/login' || location.pathname === '/setup') {
        setHasConnected(true);
        setMounted(true);
        setSessionEnded(false);
        return;
      }
      setHasConnected(false);
      // A status response may still be resolving the router's public redirect.
      // Keep its provider mounted inside the hidden, inert wrapper until that resolves.
      setMounted(fromStatus);
      setSessionEnded(true);
    };
    window.addEventListener('budget-session-expired', expired);
    return () => window.removeEventListener('budget-session-expired', expired);
  }, []);
  useEffect(() => router.subscribe('onResolved', ({ toLocation }) => {
    if (toLocation.pathname !== '/login' && toLocation.pathname !== '/setup') return;
    setHasConnected(true);
    setMounted(true);
    setSessionEnded(false);
  }), []);
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    let disposed = false;
    let registration: ServiceWorkerRegistration | undefined;
    const check = () => {
      const next = registration?.waiting;
      // A first install also passes through "waiting" for an instant: only an already
      // controlled page (one that has a previous worker) is offered an update.
      if (disposed || !next || !navigator.serviceWorker.controller) return;
      setWaiting(next);
      next.addEventListener('statechange', () => {
        if (next.state === 'activated' || next.state === 'redundant')
          setWaiting((current) => (current === next ? null : current));
      });
    };
    const updateFound = () => registration?.installing?.addEventListener('statechange', check);
    const refresh = () => {
      if (navigator.onLine) void registration?.update().catch(() => undefined);
    };
    void navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((value) => {
        if (disposed) return;
        registration = value;
        check();
        registration.addEventListener('updatefound', updateFound);
        window.addEventListener('online', refresh);
        window.addEventListener('focus', refresh);
      })
      .catch(() => {
        /* Online app and passkeys remain usable when storage is unavailable. */
      });
    return () => {
      disposed = true;
      registration?.removeEventListener('updatefound', updateFound);
      window.removeEventListener('online', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  function applyUpdate() {
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), {
      once: true,
    });
    waiting?.postMessage({ type: 'APPLY_UPDATE' });
  }
  return (
    <>
      {waiting && (
        <section className="pwa-update" aria-label="App aktualisieren">
          <p>Eine neue Version ist bereit. Speichere offene Eingaben vor dem Neuladen.</p>
          <Button onClick={applyUpdate}>Jetzt neu laden</Button>
          <Button variant="ghost" onClick={() => setWaiting(null)}>
            Später
          </Button>
        </section>
      )}
      {!online && hasConnected && (
        <div className="pwa-connection" role="status">
          Offline · Angezeigte Daten können veraltet sein. Neue Buchungen warten auf diesem Gerät.
        </div>
      )}
      {(mounted || showLive) && (
        <div className="pwa-live" hidden={!showLive} inert={!showLive}>
          {children}
        </div>
      )}
      {!showLive && sessionEnded && online ? (
        <main className="pwa-offline" id="main">
          <h1>Sitzung beendet</h1>
          <p>Bitte melde dich erneut an.</p>
          <Button onClick={() => window.location.assign('/login')}>Zur Anmeldung</Button>
        </main>
      ) : !showLive ? (
        <OfflineState onCapture={() => setCapture(true)} />
      ) : null}
      {capture && <QueueCapture onClose={() => setCapture(false)} />}
    </>
  );
}
