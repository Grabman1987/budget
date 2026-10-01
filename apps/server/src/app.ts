import { existsSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { writesHeld, type Db } from '@budget/db';
import type { MarketSources } from '@budget/market';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import type { Auth } from './auth/routes';
import { createLedgerApi } from './api';
import { debugSummary } from './debug-summary';
import type { ImportJobs } from './imports/jobs';
import { IMPORT_BODY_LIMIT, IMPORT_UPLOAD_LIMIT } from './imports/routes';

/** What the app needs from the passkey login: the CSRF check, its routes and the session guard. */
export type AuthGate = Pick<Auth, 'originGuard' | 'routes' | 'requireSession' | 'requireStepUp'>;

interface BaseOptions {
  /** Directory of the built web app (Vite `dist`). */
  webDir: string;
  /** Database for the read-only debug endpoint; omit to keep the endpoint off. */
  database?: Db | undefined;
}

/**
 * The ledger (accounts, bookings, payees) is mounted below `/api` behind the session guard, so it
 * only comes together with `auth`: a ledger without auth is a type error and throws at start.
 */
export type AppOptions = BaseOptions &
  (
    | {
        /** Passkey login: session guard and /api/auth. */
        auth: AuthGate;
        ledger?:
          | {
              db: Db;
              today?: () => string;
              market?: MarketSources | undefined;
              jobs?: ImportJobs | undefined;
            }
          | undefined;
      }
    | { auth?: undefined; ledger?: undefined }
  );

/**
 * Strict CSP (SPEC §9): `script-src 'self'` and no inline scripts. Styles are also same-origin only,
 * so the web app must not use inline `style` attributes or `<style>` blocks.
 */
export const CONTENT_SECURITY_POLICY = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'"],
  imgSrc: ["'self'", 'data:'],
  fontSrc: ["'self'"],
  connectSrc: ["'self'"],
  manifestSrc: ["'self'"],
  workerSrc: ["'self'"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  frameAncestors: ["'none'"],
};

const ONE_YEAR = 60 * 60 * 24 * 365;
/** Largest accepted API request body. Passkey responses and bookings are a few KB. */
export const API_BODY_LIMIT = 64 * 1024;

/** Browser features the app never uses are switched off for it and anything it might embed. */
export const PERMISSIONS_POLICY = {
  camera: false,
  microphone: false,
  geolocation: false,
  payment: false,
  usb: false,
};

export function createApp({ webDir, database, auth, ledger }: AppOptions): Hono {
  if (ledger && !auth)
    throw new Error('The ledger API needs auth: mount it only behind the session guard');
  const app = new Hono();
  const root = resolve(webDir);
  // serveStatic resolves `root` against the current working directory.
  const staticRoot = relative(process.cwd(), root) || '.';

  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: CONTENT_SECURITY_POLICY,
      strictTransportSecurity: `max-age=${ONE_YEAR}; includeSubDomains`,
      xFrameOptions: 'DENY',
      referrerPolicy: 'no-referrer',
      crossOriginOpenerPolicy: 'same-origin',
      crossOriginResourcePolicy: 'same-origin',
      permissionsPolicy: PERMISSIONS_POLICY,
    }),
  );

  // Before anything reads or logs a request: bodies over 64 KB are refused unread (B3). The YNAB
  // upload takes up to 20 MB, the other import calls (mapping documents) up to 2 MB.
  const limit = (maxSize: number, label: string) =>
    bodyLimit({ maxSize, onError: (c) => c.text(`Request body too large (limit ${label}).`, 413) });
  const apiLimit = limit(API_BODY_LIMIT, '64 KB');
  const uploadLimit = limit(IMPORT_UPLOAD_LIMIT, '20 MB');
  const importLimit = limit(IMPORT_BODY_LIMIT, '2 MB');
  app.use('/api/*', (c, next) => {
    if (c.req.path === '/api/imports/ynab') return uploadLimit(c, next);
    if (c.req.path.startsWith('/api/imports/')) return importLimit(c, next);
    return apiLimit(c, next);
  });

  app.get('/health', (c) => c.json({ status: 'ok' }));

  // While an import task writes in its worker thread, it is the only writer (SQLite has one):
  // every other write is refused, reads go on (`holdWrites` in @budget/db).
  if (ledger)
    app.use('/api/*', async (c, next) => {
      if (c.req.method === 'GET' || c.req.method === 'HEAD' || !writesHeld(ledger.db))
        return next();
      return c.json(
        { error: 'import_running', message: 'An import task is running; try again in a moment' },
        409,
      );
    });

  if (auth) {
    // CSRF origin check for every state-changing API call, then the auth endpoints themselves,
    // then the session guard for everything else under /api (order matters).
    app.use('/api/*', auth.originGuard);
    app.route('/api/auth', auth.routes);
    app.use('/api/*', auth.requireSession);
  }

  if (ledger && auth) app.route('/api', createLedgerApi({ ...ledger, stepUp: auth.requireStepUp }));

  // Read-only seed check. Only mounted when a database is passed in (BUDGET_DEBUG_API=1), never
  // on by default; auth (P1e) has to sit in front of it before it may run anywhere public.
  if (database) {
    app.get('/api/debug/summary', (c) => c.json(debugSummary(database, c.req.query('asOf'))));
  }
  app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404));

  // Hashed build output is immutable; everything else must revalidate.
  app.use('/assets/*', async (c, next) => {
    await next();
    if (c.res.status === 200) c.header('Cache-Control', 'public, max-age=31536000, immutable');
  });
  app.use('*', serveStatic({ root: staticRoot }));

  // SPA fallback: client-side routes (TanStack Router) are served by index.html.
  const indexHtml = resolve(root, 'index.html');
  app.get('*', async (c, next) => {
    if (!existsSync(indexHtml)) return c.text('Web app not built. Run `npm run build`.', 503);
    c.header('Cache-Control', 'no-cache');
    return serveStatic({ root: staticRoot, path: 'index.html' })(c, next);
  });

  return app;
}
