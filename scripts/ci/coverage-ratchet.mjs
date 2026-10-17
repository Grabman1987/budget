// Fails if line coverage drops by more than 0.1 points: node coverage-ratchet.mjs <base.json> <head.json>
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const MAX_DROP = 0.1;
export const linesPct = (summary) => summary.total.lines.pct;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [base, head] = process.argv
    .slice(2)
    .map((p) => linesPct(JSON.parse(readFileSync(p, 'utf8'))));
  console.log(`Line coverage: base ${base}% -> head ${head}%`);
  if (base - head > MAX_DROP) {
    console.log(`error: line coverage dropped by more than ${MAX_DROP} points`);
    process.exit(1);
  }
}
