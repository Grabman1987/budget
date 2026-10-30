import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

// Playwright clears test-results when it starts; the pre-run build manifest must survive that.
export const OUTPUT = 'coverage/v8-pilot';
export const sha256 = (source) => createHash('sha256').update(source).digest('hex');

/** Exact emitted bytes, including adjacent hidden maps; no source-map conversion or percentages. */
export function inspectAssets(directory) {
  const assets = {};
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const file = join(current, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && entry.name.endsWith('.js')) {
        const path = relative(directory, file).split(sep).join('/');
        const bytes = readFileSync(file);
        const map = existsSync(`${file}.map`) ? readFileSync(`${file}.map`) : null;
        assets[`/${path}`] = {
          path,
          sha256: sha256(bytes),
          bytes: bytes.length,
          sourceMap: map ? { path: `${path}.map`, sha256: sha256(map), bytes: map.length } : null,
        };
      }
    }
  };
  visit(directory);
  return Object.fromEntries(Object.entries(assets).sort(([a], [b]) => a.localeCompare(b)));
}

/** Keep V8's nested ranges verbatim; a positive parent must not swallow a zero-count child. */
export function scriptEvidence(entry, assets, origin) {
  let url;
  try {
    url = new URL(entry.url);
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;
  if (!Array.isArray(entry.functions)) throw new Error('Missing V8 function ranges');
  const assetPath = decodeURIComponent(url.pathname);
  const asset = assets[assetPath];
  const observed = typeof entry.source === 'string' ? sha256(entry.source) : null;
  return {
    url: `${url.origin}${url.pathname}`,
    scriptId: entry.scriptId,
    assetPath,
    assetSHA256: asset?.sha256 ?? null,
    observedSourceSHA256: observed,
    source: typeof entry.source === 'string' ? entry.source : null,
    sourceMap: asset && observed === asset.sha256 ? asset.sourceMap : null,
    match: !asset
      ? 'not-in-build'
      : observed === null
        ? 'source-unavailable'
        : observed === asset.sha256
          ? 'matched'
          : 'hash-mismatch',
    functions: entry.functions,
  };
}

/** Observed/imported code is distinct from observed execution; unobserved never means zero. */
export function assetObservations(assets, records) {
  return Object.keys(assets)
    .sort()
    .map((assetPath) => {
      const seen = records.filter((record) => record.assetPath === assetPath);
      const matched = seen.filter((record) => record.match === 'matched');
      return {
        assetPath,
        observation: matched.length
          ? matched.some((record) =>
              record.functions.some((fn) => fn.ranges.some((range) => range.count > 0)),
            )
            ? 'positive-counter-observed'
            : 'observed-no-positive-counter'
          : seen.length
            ? 'unknown-unmatched-source'
            : 'unknown-not-observed',
      };
    });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] !== '--build-metadata')
    throw new Error('Use --build-metadata after the pilot build');
  const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (process.env.GITHUB_SHA && process.env.GITHUB_SHA !== headSha)
    throw new Error('Checkout SHA differs from dispatched SHA');
  const assets = inspectAssets('apps/web/dist');
  if (!Object.keys(assets).length) throw new Error('Pilot build has no JavaScript assets');
  if (!Object.values(assets).some((asset) => asset.sourceMap))
    throw new Error('Pilot build has no hidden source maps');
  const require = createRequire(import.meta.url);
  const metadata = {
    schemaVersion: 1,
    headSha,
    lockSHA256: sha256(readFileSync('package-lock.json')),
    nodeVersion: process.version,
    playwrightVersion: JSON.parse(
      readFileSync(require.resolve('@playwright/test/package.json'), 'utf8'),
    ).version,
    method: 'raw V8 function ranges; hidden maps archived, not remapped; no percentages',
    assets,
  };
  mkdirSync(OUTPUT, { recursive: true });
  writeFileSync(join(OUTPUT, 'build.json'), JSON.stringify(metadata, null, 2));
}
