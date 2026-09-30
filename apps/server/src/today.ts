/**
 * `BUDGET_TODAY=YYYY-MM-DD` pins "today" of the ledger API and every API after it, so a server can
 * be compared with the prototype's fixed day (the seeded e2e server uses 2026-09-17). It is a test
 * aid: honoured only outside production, and a production server refuses to start when it is set.
 */
export function todayFromEnv(env: NodeJS.ProcessEnv = process.env): (() => string) | undefined {
  const raw = env['BUDGET_TODAY'];
  if (raw === undefined || raw === '') return undefined;
  if (env['NODE_ENV'] === 'production')
    throw new Error('BUDGET_TODAY must not be set in production (it pins the server clock)');
  const day = raw.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  const date = match
    ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
    : null;
  if (!match || !date || date.toISOString().slice(0, 10) !== day)
    throw new Error(`BUDGET_TODAY must be a real calendar day as YYYY-MM-DD, got "${raw}"`);
  return () => day;
}
