// Summarises a V8 .cpuprofile: top functions by self time and by inclusive time (repo code only).
import { readFileSync } from 'node:fs';
const p = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const byId = new Map(p.nodes.map((n) => [n.id, n]));
const self = new Map();
const dt = p.timeDeltas;
p.samples.forEach((id, i) => self.set(id, (self.get(id) ?? 0) + (dt[i] ?? 0)));
const parent = new Map();
for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const key = (n) =>
  `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.replace(/^.*[/](packages|apps)[/]/, '$1/')}:${n.callFrame.lineNumber + 1}`;
const selfBy = new Map(),
  incl = new Map();
for (const [id, t] of self) {
  const n = byId.get(id);
  selfBy.set(key(n), (selfBy.get(key(n)) ?? 0) + t);
  const seen = new Set();
  for (let c = id; c; c = parent.get(c)) {
    const k = key(byId.get(c));
    if (seen.has(k)) continue;
    seen.add(k);
    incl.set(k, (incl.get(k) ?? 0) + t);
  }
}
const top = (m, f) =>
  [...m]
    .filter(([k]) => f(k))
    .sort((a, b) => b[1] - a[1])
    .slice(0, Number(process.argv[3] ?? 25));
console.log('--- self');
for (const [k, t] of top(selfBy, () => true)) console.log((t / 1000).toFixed(0).padStart(7), k);
console.log('--- inclusive (repo)');
for (const [k, t] of top(incl, (k) => /packages\/|apps\//.test(k)))
  console.log((t / 1000).toFixed(0).padStart(7), k);
// Optional: node profile-summary.mjs file N <functionName> prints the callers of that function by self time.
const target = process.argv[4];
if (target) {
  const callers = new Map();
  for (const [id, t] of self) {
    const n = byId.get(id);
    if (n.callFrame.functionName !== target) continue;
    const p2 = byId.get(parent.get(id));
    const k = p2 ? key(p2) : '?';
    callers.set(k, (callers.get(k) ?? 0) + t);
  }
  console.log(`--- callers of ${target} (self time)`);
  for (const [k, t] of [...callers].sort((a, b) => b[1] - a[1]).slice(0, 10))
    console.log((t / 1000).toFixed(0).padStart(7), k);
}
// Optional: node profile-summary.mjs file N callerOf childrenOf  -- inclusive time of the direct children of that function.
const parentFn = process.argv[5];
if (parentFn) {
  const totals = new Map();
  const total = (id) => {
    const n = byId.get(id);
    let t = self.get(id) ?? 0;
    for (const c of n.children ?? []) t += total(c);
    return t;
  };
  for (const n of p.nodes) {
    if (n.callFrame.functionName !== parentFn) continue;
    for (const c of n.children ?? []) {
      const k = key(byId.get(c));
      totals.set(k, (totals.get(k) ?? 0) + total(c));
    }
  }
  console.log(`--- children of ${parentFn} (inclusive)`);
  for (const [k, t] of [...totals].sort((a, b) => b[1] - a[1]).slice(0, 15))
    console.log((t / 1000).toFixed(0).padStart(7), k);
}
