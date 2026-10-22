#!/usr/bin/env node
'use strict';

// Standalone timing repro. Usage: node webkit-native-frame-repro.cjs /absolute/repository/root
// It uses an already installed Playwright/WebKit and does not persist screenshots or traces.
const { createRequire } = require('node:module');
const { existsSync } = require('node:fs');
const { dirname, isAbsolute, join, resolve } = require('node:path');
const http = require('node:http');
const { performance } = require('node:perf_hooks');

const repo = process.argv[2];
if (!repo || !isAbsolute(repo) || process.argv.length !== 3)
  throw new Error('Pass exactly one absolute repository-root path.');
if (process.platform !== 'linux') throw new Error('This repro requires Linux.');
const fromRepo = createRequire(join(resolve(repo), 'package.json'));
const playwrightPackage = fromRepo('playwright/package.json');
if (playwrightPackage.version !== '1.64.1')
  throw new Error(`Expected Playwright 1.64.1; found ${playwrightPackage.version}.`);
const browserManifest = require(join(dirname(fromRepo.resolve('playwright-core/package.json')), 'browsers.json'));
const browserDescriptor = browserManifest.browsers.find(
  (browser) => browser.name === 'webkit',
);
if (browserDescriptor?.revision !== '2370')
  throw new Error(`Expected WebKit descriptor 2370; found ${browserDescriptor?.revision}.`);
const { webkit, devices } = fromRepo('playwright');
const executable = webkit.executablePath();
if (!executable.includes('webkit-2370') || !existsSync(executable))
  throw new Error('WebKit 2370 executable is not already installed.');

const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0;min-height:100%;}body{min-height:100vh;display:grid;place-items:center}button{width:220px;height:48px}</style></head><body><button type="button">Static target</button></body></html>`;
const sockets = new Set();
const server = http.createServer((request, response) => {
  if (request.url !== '/') {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
  });
  response.end(html);
});
server.on('connection', (socket) => {
  sockets.add(socket);
  socket.on('close', () => sockets.delete(socket));
});

let browser;
let cleanupPromise;
function cleanup() {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
    // Complete the browser close before exiting; exiting on a close timeout can orphan WebKit.
    try {
      if (browser) await browser.close();
    } finally {
      for (const socket of sockets) socket.destroy();
      if (server.listening) await new Promise((done) => server.close(done));
    }
  })();
  return cleanupPromise;
}
// Soft watchdog: completion still awaits browser teardown to avoid orphaning WebKit.
const watchdog = setTimeout(async () => {
  process.exitCode = 124;
  process.stderr.write(JSON.stringify({ error: '45-second watchdog expired' }) + '\n');
  try {
    await cleanup();
  } finally {
    process.exit(124);
  }
}, 45_000);

async function sample(page, requireClock) {
  return page.evaluate(async (mustUseClock) => {
    const original = window.__pwClock?.builtins;
    if (mustUseClock && !original)
      throw new Error('Playwright original clock builtins unavailable after fixed time.');
    const native = original ?? window;
    const clock = original ? 'playwright-original' : 'window-original';
    if (
      typeof native.requestAnimationFrame !== 'function' ||
      typeof native.cancelAnimationFrame !== 'function' ||
      typeof native.setTimeout !== 'function' ||
      typeof native.clearTimeout !== 'function' ||
      typeof native.performance?.now !== 'function'
    )
      throw new Error('Original frame, timer, or performance API unavailable.');
    const target = document.querySelector('button');
    const state = () => {
      const rect = target.getBoundingClientRect();
      return {
        rect: [rect.x, rect.y, rect.width, rect.height],
        scroll: [scrollX, scrollY],
        visibility: document.visibilityState,
        focus: document.hasFocus(),
      };
    };
    const initial = state();
    const started = native.performance.now();
    const raf = { count: 0, maxGapMs: 0 };
    const timer = { count: 0, maxGapMs: 0 };
    let previousFrame = started;
    let previousTimer = started;
    let frameId;
    let timerId;
    let doneId;
    let capId;
    let changeCount = 0;
    let lastState = JSON.stringify(initial);
    const checkState = () => {
      const current = JSON.stringify(state());
      if (current !== lastState) {
        changeCount++;
        lastState = current;
      }
    };
    return await new Promise((resolve) => {
      let settled = false;
      const finish = (reason) => {
        if (settled) return;
        settled = true;
        native.cancelAnimationFrame(frameId);
        native.clearTimeout(timerId);
        native.clearTimeout(doneId);
        native.clearTimeout(capId);
        resolve({
          clock,
          durationMs: native.performance.now() - started,
          stoppedBy: reason,
          raf,
          timer,
          stateChangeCount: changeCount,
          initial,
          final: state(),
          viewport: [innerWidth, innerHeight],
        });
      };
      const frame = () => {
        if (settled) return;
        const now = native.performance.now();
        raf.count++;
        raf.maxGapMs = Math.max(raf.maxGapMs, now - previousFrame);
        previousFrame = now;
        checkState();
        frameId = native.requestAnimationFrame(frame);
      };
      const tick = () => {
        if (settled) return;
        const now = native.performance.now();
        timer.count++;
        timer.maxGapMs = Math.max(timer.maxGapMs, now - previousTimer);
        previousTimer = now;
        checkState();
        timerId = native.setTimeout(tick, 50);
      };
      frameId = native.requestAnimationFrame(frame);
      timerId = native.setTimeout(tick, 50);
      doneId = native.setTimeout(() => finish('2.2-second-sample'), 2200);
      capId = native.setTimeout(() => finish('3-second-cap'), 3000);
    });
  }, requireClock);
}

async function runContext(label, options, url) {
  const context = await browser.newContext(options);
  try {
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    page.setDefaultNavigationTimeout(5000);
    const stages = [
      ['initial-goto', () => page.goto(url)],
      ['fixed-time', () => page.clock.setFixedTime(new Date('2026-10-15T12:00:00+02:00'))],
      ['same-viewport', () => page.setViewportSize(page.viewportSize())],
      ['second-goto', () => page.goto(url)],
      [
        'full-page-screenshot-then-goto',
        async () => {
          await page.screenshot({ fullPage: true, animations: 'disabled' });
          await page.goto(url);
        },
      ],
    ];
    for (const [stage, action] of stages) {
      await action();
      const measured = await sample(page, stage !== 'initial-goto');
      const record = { context: label, stage, ...measured };
      if (stage === 'full-page-screenshot-then-goto') {
        const started = performance.now();
        await page.getByRole('button', { name: 'Static target', exact: true }).click();
        record.normalLocatorClickMs = performance.now() - started;
      }
      process.stdout.write(JSON.stringify(record) + '\n');
    }
    await context.tracing.stop();
  } finally {
    await context.close();
  }
}

(async () => {
  await new Promise((done, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', done);
  });
  const url = `http://127.0.0.1:${server.address().port}/`;
  browser = await webkit.launch();
  await runContext('desktop', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }, url);
  await runContext('iPhone13', devices['iPhone 13'], url);
})()
  .catch((error) => {
    if (process.exitCode !== 124) process.exitCode = 1;
    process.stderr.write(JSON.stringify({ error: String(error?.message ?? error) }) + '\n');
  })
  .finally(async () => {
    try {
      await cleanup();
    } finally {
      clearTimeout(watchdog);
      process.exit(process.exitCode ?? 0);
    }
  });
