import { expect, it } from 'vitest';
import type { InboxEntry } from './api';
import { planBulk } from './bank-bulk-actions';
import type { PreparedBankSuggestion } from './bank-candidate';

const candidate = (id: string) =>
  ({ type: 'stored', id, refType: 'bank-sync-candidate', refId: id }) as unknown as InboxEntry;
const booked = (id: string) =>
  ({ type: 'booking', id: 'booking:' + id, bookingId: id }) as unknown as InboxEntry;
const merge = (bookingId: string): PreparedBankSuggestion => ({
  action: 'merge',
  bookingId,
  candidateRevision: 'a'.repeat(64),
  label: 'Zusammenführen',
});
const rule: PreparedBankSuggestion = {
  action: 'rule',
  ruleId: 'r1',
  revision: 'b'.repeat(64),
  label: 'Regel',
};

it('never sends booked rows for "nicht übernehmen" and counts them as kept', () => {
  const plan = planBulk('dismiss', [candidate('c1'), booked('b1'), candidate('c2')], () => rule);
  expect(plan.rows).toEqual([
    { type: 'candidate', id: 'c1' },
    { type: 'candidate', id: 'c2' },
  ]);
  expect(plan).toMatchObject({ changed: 2, skipped: 1, keptBookings: 1 });
});

it('keeps only the first row per merge target and skips the others in the preview', () => {
  const prepared: Record<string, PreparedBankSuggestion | undefined> = {
    'booking:b1': merge('own-1'),
    c1: merge('own-1'),
    c2: rule,
    c3: undefined,
  };
  const plan = planBulk(
    'confirm',
    [booked('b1'), candidate('c1'), candidate('c2'), candidate('c3')],
    (id) => prepared[id],
  );
  expect(plan.rows.map((row) => [row.id, row.suggestion?.action])).toEqual([
    ['b1', 'merge'],
    ['c1', undefined],
    ['c2', 'rule'],
    ['c3', undefined],
  ]);
  expect(plan).toMatchObject({ changed: 2, skipped: 2, sharedTargets: 1 });
  expect(JSON.stringify(plan.rows)).not.toContain('label');
});
