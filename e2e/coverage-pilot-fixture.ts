import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Frame, Request } from '@playwright/test';
import { test as base } from './isolated-ledger';
import {
  OUTPUT,
  assetObservations,
  scriptEvidence,
  sha256,
} from '../scripts/dev/coverage-pilot.mjs';

// Analysis-only opt-in. The original isolated server, clock, storage and page fixtures stay in place.
export const test = base.extend({
  page: async ({ page, browser, browserName, baseURL }, use, info) => {
    if (process.env['COVERAGE_PILOT'] !== '1') {
      await use(page);
      return;
    }
    if (browserName !== 'chromium' || !baseURL)
      throw new Error('Pilot requires Chromium and the isolated origin');
    const manifestBytes = readFileSync(join(OUTPUT, 'build.json'));
    const build = JSON.parse(manifestBytes.toString('utf8'));
    const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    if (
      build.headSha !== headSha ||
      build.lockSHA256 !== sha256(readFileSync('package-lock.json'))
    ) {
      throw new Error('Pilot build metadata differs from the tested checkout');
    }
    let documentRequests = 0;
    let frameNavigations = 0;
    let extraPages = 0;
    const request = (event: Request) => {
      if (event.isNavigationRequest() && event.frame() === page.mainFrame()) documentRequests++;
    };
    const navigation = (frame: Frame) => {
      if (frame === page.mainFrame()) frameNavigations++;
    };
    const otherPage = () => {
      extraPages++;
    };
    page.on('request', request);
    page.on('framenavigated', navigation);
    page.context().on('page', otherPage);
    let started = false;
    const blankBeforeCapture = page.url() === 'about:blank';
    let problem: string | null = null;
    let raw: Awaited<ReturnType<typeof page.coverage.stopJSCoverage>> = [];
    try {
      await page.coverage.startJSCoverage({
        resetOnNavigation: false,
        reportAnonymousScripts: false,
      });
      started = true;
      await use(page);
    } finally {
      page.off('request', request);
      page.off('framenavigated', navigation);
      page.context().off('page', otherPage);
      if (!started || page.isClosed()) {
        problem = 'page-coverage-collection-unavailable';
      } else {
        try {
          // Runs before the base page fixture closes the page. Each test/retry starts fresh.
          raw = await page.coverage.stopJSCoverage();
        } catch {
          problem = 'page-coverage-collection-unavailable';
        }
      }
      const records = raw
        .map((entry) => scriptEvidence(entry, build.assets, new URL(baseURL).origin))
        .filter((record) => record !== null);
      if (!records.some((record) => record.match === 'matched'))
        problem ??= 'no-script-matched-build-bytes';
      const directory = join(OUTPUT, info.project.name);
      mkdirSync(directory, { recursive: true });
      const identity = sha256(`${info.testId}:${info.retry}:${info.repeatEachIndex}`).slice(0, 24);
      writeFileSync(
        join(directory, `${identity}.json`),
        JSON.stringify(
          {
            schemaVersion: 1,
            headSha,
            buildManifestSHA256: sha256(manifestBytes),
            playwrightVersion: build.playwrightVersion,
            nodeVersion: process.version,
            browserName,
            browserVersion: browser.version(),
            viewport: page.viewportSize(),
            project: info.project.name,
            spec: relative(process.cwd(), info.file).split(sep).join('/'),
            testId: info.testId,
            title: info.title,
            retry: info.retry,
            repeatEachIndex: info.repeatEachIndex,
            status: info.status,
            coverageOptions: { resetOnNavigation: false, reportAnonymousScripts: false },
            counterBoundary:
              'fresh fixture page, start/stop per test attempt, no cross-test accumulation',
            scope:
              'Only scripts returned by this fixture page; other pages/workers/Node are not covered.',
            quality: {
              collection: problem ?? 'captured',
              completeness: 'unknown; no percentages or source-map conversion',
              navigationContinuity: 'unknown; false does not guarantee counters survive navigation',
              firstNavigation: blankBeforeCapture
                ? 'capture-starts-on-about:blank-before-test-use'
                : 'unknown-page-already-navigated',
              mainDocumentRequests: documentRequests,
              mainFrameNavigationsIncludingSameDocument: frameNavigations,
              extraPagesObserved: extraPages,
              excludedScriptCount: raw.length - records.length,
            },
            observations: assetObservations(build.assets, records),
            scripts: records,
          },
          null,
          2,
        ),
      );
    }
    // Preserve an existing scenario failure; otherwise missing instrumentation must fail visibly.
    if (problem && info.status === 'passed')
      throw new Error(`Pilot capture unavailable: ${problem}`);
  },
});
