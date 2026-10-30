import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { test } from 'node:test';
import { assetObservations, inspectAssets, scriptEvidence } from './coverage-pilot.mjs';

const abcSHA = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const assets = {
  '/assets/app.js': {
    path: 'assets/app.js',
    sha256: abcSHA,
    bytes: 3,
    sourceMap: { path: 'assets/app.js.map', sha256: abcSHA, bytes: 3 },
  },
  '/assets/unloaded.js': { path: 'assets/unloaded.js', sha256: abcSHA, bytes: 3, sourceMap: null },
};
const functions = [
  {
    functionName: 'synthetic',
    isBlockCoverage: true,
    ranges: [
      { startOffset: 0, endOffset: 3, count: 1 },
      { startOffset: 1, endOffset: 2, count: 0 },
    ],
  },
];

test('indexes exact emitted JavaScript and its hidden map without needing a sourceMappingURL', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'budget-v8-pilot-'));
  assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep + 'budget-v8-pilot-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, 'assets'));
  writeFileSync(join(directory, 'assets/app.js'), 'abc');
  writeFileSync(join(directory, 'assets/app.js.map'), '{"version":3,"sources":["app.ts"]}');
  const result = inspectAssets(directory);
  assert.equal(result['/assets/app.js'].sha256, abcSHA);
  assert.equal(result['/assets/app.js'].bytes, 3);
  assert.equal(result['/assets/app.js'].sourceMap.path, 'assets/app.js.map');
  assert.match(result['/assets/app.js'].sourceMap.sha256, /^[a-f0-9]{64}$/);
});

test('keeps nested zero ranges intact and ties observed script bytes to the emitted asset SHA', () => {
  const record = scriptEvidence(
    {
      url: 'http://localhost:4310/assets/app.js?synthetic=1',
      scriptId: '7',
      source: 'abc',
      functions,
    },
    assets,
    'http://localhost:4310',
  );
  assert.equal(record.match, 'matched');
  assert.equal(record.url, 'http://localhost:4310/assets/app.js');
  assert.equal(record.observedSourceSHA256, abcSHA);
  assert.equal(record.source, 'abc');
  assert.deepEqual(record.functions, functions);
  assert.equal(record.functions[0].ranges[1].count, 0);
});

test('does not pretend a mismatched or unavailable source maps to the current build', () => {
  const mismatched = scriptEvidence(
    { url: 'http://localhost:4310/assets/app.js', source: 'changed', functions },
    assets,
    'http://localhost:4310',
  );
  assert.equal(mismatched.match, 'hash-mismatch');
  assert.equal(mismatched.sourceMap, null);
  assert.equal(assetObservations(assets, [mismatched])[0].observation, 'unknown-unmatched-source');
  assert.equal(
    scriptEvidence(
      { url: 'http://localhost:4310/assets/app.js', functions },
      assets,
      'http://localhost:4310',
    ).match,
    'source-unavailable',
  );
});

test('excludes anonymous or other-origin tooling scripts from application raw artifacts', () => {
  for (const url of [
    '',
    '__playwright_evaluation_script__',
    'https://other.invalid/assets/app.js',
  ]) {
    assert.equal(
      scriptEvidence({ url, source: 'abc', functions }, assets, 'http://localhost:4310'),
      null,
    );
  }
});

test('separates an observed positive counter from an unobserved asset instead of inventing zero coverage', () => {
  const record = scriptEvidence(
    { url: 'http://localhost:4310/assets/app.js', source: 'abc', functions },
    assets,
    'http://localhost:4310',
  );
  assert.deepEqual(assetObservations(assets, [record]), [
    { assetPath: '/assets/app.js', observation: 'positive-counter-observed' },
    { assetPath: '/assets/unloaded.js', observation: 'unknown-not-observed' },
  ]);
});
