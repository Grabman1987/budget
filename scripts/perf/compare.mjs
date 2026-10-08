// node scripts/perf/compare.mjs before.json after.json  -- timings side by side, and every response hash must match.
import { readFileSync } from 'node:fs';
const [a, b] = process.argv.slice(2).map((f) => JSON.parse(readFileSync(f, 'utf8')));
const after = new Map(b.map((r) => [r.r, r]));
let bad = 0;
for (const x of a) {
  const y = after.get(x.r);
  if (!y) continue;
  const same = x.hash === y.hash && x.status === y.status;
  if (!same) bad++;
  console.log(
    `${same ? 'same' : 'DIFF'} min ${String(x.min).padStart(5)} -> ${String(y.min).padStart(5)} ms (p50 ${String(x.p50).padStart(5)} -> ${String(y.p50).padStart(5)})  q ${String(x.q).padStart(4)} -> ${String(y.q).padStart(4)}  ${x.r}`,
  );
}
if (bad) {
  console.error(`${bad} responses differ`);
  process.exit(1);
}
