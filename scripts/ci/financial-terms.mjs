import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Checks the SPEC "Financial terms" table: every named function is exported from its module. */
export function financialTermErrors(root) {
  const spec = readFileSync(resolve(root, 'SPEC.md'), 'utf8');
  const start = spec.indexOf('### Financial terms');
  if (start < 0) return ['SPEC.md: missing section "Financial terms"'];
  const end = spec.indexOf('\n## ', start);
  const rows = spec
    .slice(start, end < 0 ? undefined : end)
    .split('\n')
    .filter((line) => line.startsWith('|') && !/^\|\s*(Term|---)/.test(line))
    .map((line) => line.split('|').map((cell) => cell.trim()));
  const errors = [];
  if (rows.length < 10)
    errors.push(`Financial terms: expected at least 10 terms, found ${rows.length}`);
  for (const cells of rows) {
    const [, term, , fn, mod] = cells;
    const name = /`(\w+)`/.exec(fn ?? '')?.[1];
    const path = /`([^`]+)`/.exec(mod ?? '')?.[1];
    if (!name || !path) {
      errors.push(`Financial terms: "${term}" needs a function and a module`);
    } else if (path === '-') {
      if (!/planned/.test(fn))
        errors.push(`Financial terms: "${term}" has no module but is not marked planned`);
    } else if (!existsSync(resolve(root, path))) {
      errors.push(`Financial terms: "${term}" module not found: ${path}`);
    } else {
      const src = readFileSync(resolve(root, path), 'utf8');
      const exported =
        new RegExp(`export\\s+(async\\s+)?(function|const)\\s+${name}\\b`).test(src) ||
        new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`).test(src);
      if (!exported)
        errors.push(`Financial terms: "${term}" names ${name}, not exported from ${path}`);
    }
  }
  return errors;
}
