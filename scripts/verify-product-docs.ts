import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGES } from '../apps/web/src/nav/pages';
import { REPORT_GROUPS } from '../apps/web/src/nav/reports-catalog';
import { RULE_DEFS } from '../packages/domain/src/rules/definitions';
import { RULE_CODES } from '../packages/domain/src/rules/params';

// Documentation inventory validation, not financial acceptance or a live API test.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const folder = resolve(root, 'docs/product');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const files = readdirSync(folder).filter((name) => name.endsWith('.md'));
const docs = new Map(files.map((name) => [name, read(`docs/product/${name}`)]));
const doc = (name: string) => {
  const value = docs.get(name);
  assert.ok(value, `Missing document: ${name}`);
  return value;
};
const matches = (text: string, pattern: RegExp) => [...text.matchAll(pattern)].map((m) => m[1]!);
const equalInventory = (label: string, actual: string[], expected: string[]) => {
  assert.equal(new Set(actual).size, actual.length, `${label}: duplicate IDs`);
  assert.deepEqual([...actual].sort(), [...expected].sort(), `${label}: source/document drift`);
};

for (const [name, text] of docs) {
  for (const [, target] of text.matchAll(/\]\(([^)]+)\)/g)) {
    if (/^[a-z]+:/i.test(target!) || target!.startsWith('#')) continue;
    const path = target!.split('#')[0]!.split('?')[0]!;
    assert.ok(existsSync(resolve(folder, path)), `${name}: broken local link ${target}`);
  }
}

const reports = REPORT_GROUPS.flatMap((group) => group.items);
equalInventory(
  'Reports',
  matches(doc('report-contracts.md'), /^\| REP-([\w-]+) \|/gm),
  reports.map((report) => report.id),
);
const reportDispatch = read('apps/web/src/pages/reports-pages.tsx');
for (const report of reports) {
  assert.ok(
    doc('report-contracts.md').includes(`${report.name}: ${report.question}`),
    `Report name/question drift: ${report.id}`,
  );
  assert.ok(
    doc('sitemap.md').includes('`/reports/' + report.id + '`'),
    `Missing report URL: ${report.id}`,
  );
  assert.ok(
    reportDispatch.includes(`=== '${report.id}'`),
    `Missing report dispatch; recheck documentation status: ${report.id}`,
  );
}
for (const page of PAGES) {
  assert.ok(doc('sitemap.md').includes('`' + page.path + '`'), `Missing navigation: ${page.path}`);
}
const routerPaths = matches(read('apps/web/src/router.tsx'), /path: '([^']+)'/g);
for (const path of routerPaths.filter((value) => !value.startsWith('/dev/'))) {
  assert.ok(doc('sitemap.md').includes('`' + path + '`'), `Missing router path: ${path}`);
}

const featurePattern = /^\| ((?:Y|I)\d+[a-z]?(?:-[A-Z])?) \|/gm;
const legacy = matches(read('docs/FEATURES.md'), featurePattern);
equalInventory('Legacy features', matches(doc('traceability.md'), featurePattern), legacy);
equalInventory('Rules', matches(doc('metric-catalog.md'), /^\| (R\d+) \|/gm), [...RULE_CODES]);
equalInventory(
  'Rule definitions',
  RULE_DEFS.map((rule) => rule.code),
  [...RULE_CODES],
);
for (const rule of RULE_DEFS) {
  assert.ok(
    doc('metric-catalog.md').includes(`| ${rule.code} | ${rule.name} | ${rule.stage} |`),
    `Rule name/stage drift: ${rule.code}`,
  );
}
equalInventory(
  'Original KPIs',
  matches(doc('metric-catalog.md'), /^\| (M\d+) \|/gm),
  Array.from({ length: 27 }, (_, index) => `M${String(index + 1).padStart(2, '0')}`),
);

const families = matches(doc('requirements.md'), /^\| (BUD\d+|ONB\d+) \|/gm);
equalInventory(
  'Requirement family mapping',
  matches(doc('traceability.md'), /^\| (BUD\d+|ONB\d+) \|/gm),
  families,
);
const functional = matches(doc('functional-contracts.md'), /^\| (BUD\d+\.\d+) \|/gm);
assert.ok(functional.length > 0, 'Missing functional subrequirements');
assert.equal(new Set(functional).size, functional.length, 'Duplicate functional IDs');
for (const id of functional)
  assert.ok(families.includes(id.split('.')[0]!), `Unknown family: ${id}`);
const cases = matches(doc('acceptance-plan.md'), /^\| (AC\d+) \|/gm);
assert.equal(new Set(cases).size, cases.length, 'Duplicate acceptance IDs');
for (const [name, text] of docs) {
  for (const id of matches(text, /\b(AC\d+)\b/g)) {
    assert.ok(cases.includes(id), `${name}: unknown acceptance case ${id}`);
  }
}
for (const id of families) assert.ok(doc('screen-contracts.md').includes(id) || id === 'ONB01');
console.log(
  `Product docs verified: ${files.length} files, ${functional.length} functional requirements, ` +
    `${legacy.length} legacy features, ${reports.length} reports, ${RULE_CODES.length} rules, ` +
    `27 KPIs, ${cases.length} acceptance cases; local links and current routes checked.`,
);
