import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Button } from '@budget/ui';
import './pwa.css';
import { QueueCapture, QueueList } from './queue-ui';

function subscribeOnline(changed: () => void) {
  window.addEventListener('online', changed);
  window.addEventListener('offline', changed);
  return () => {
    window.removeEventListener('online', changed);
    window.removeEventListener('offline', changed);
  };
}

/** No durable financial cache: offline reloads render only the static shell. */
export function PwaShell({ children }: { children: ReactNode }) {
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [hasConnected, setHasConnected] = useState(() => navigator.onLine);
  const [capture, setCapture] = useState(false);
  useEffect(() => {
    const connected = () => setHasConnected(true);
    window.addEventListener('online', connected);
    return () => window.removeEventListener('online', connected);
  }, []);
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
      {hasConnected ? (
        children
      ) : (
        <main className="pwa-offline" id="main">
          <img src="/icons/budget.svg" width="48" height="48" alt="" />
          <h1>Budget ist offline</h1>
          <p>
            Neue Buchungen bleiben auf diesem Gerät und werden bei Verbindung gesendet. Für aktuelle
            Finanzdaten brauchst du eine Verbindung.
          </p>
          <Button onClick={() => window.location.reload()}>Erneut verbinden</Button>
          <Button onClick={() => setCapture(true)}>Buchung erfassen</Button>
          <QueueList />
        </main>
      )}
      {capture && <QueueCapture onClose={() => setCapture(false)} />}
    </>
  );
}
