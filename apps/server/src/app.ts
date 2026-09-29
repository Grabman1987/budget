import { existsSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';

export interface AppOptions {
  /** Directory of the built web app (Vite `dist`). */
  webDir: string;
}

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

export function createApp({ webDir }: AppOptions): Hono {
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
    }),
  );

  app.get('/health', (c) => c.json({ status: 'ok' }));
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
