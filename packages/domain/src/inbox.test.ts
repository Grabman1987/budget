import { expect, it } from 'vitest';
import { inboxCause, inboxMatchesPeriod } from './inbox';

it('uses task dates and the inclusive current month without changing entries', () => {
  for (const item of [
    { type: 'booking', date: '2026-09-30' },
    { type: 'savings', date: '2026-09-01' },
    { type: 'stored', createdAt: '2026-09-30T23:59:59Z' },
    { type: 'envelope', month: '2026-09' },
  ]) {
    expect(inboxMatchesPeriod(item, 'current', '2026-10-02')).toBe(false);
    expect(inboxMatchesPeriod(item, 'historical', '2026-10-02')).toBe(true);
    expect(inboxMatchesPeriod(item, 'all', '2026-10-02')).toBe(true);
  }
  expect(inboxMatchesPeriod({ type: 'booking', date: '2026-10-01' }, 'current', '2026-10-02')).toBe(
    true,
  );
  expect(
    inboxMatchesPeriod({ type: 'envelope', month: '2026-10' }, 'historical', '2026-10-02'),
  ).toBe(false);
});

it('groups only data checks sharing source and cause, retaining unrelated legacy details', () => {
  const item = {
    type: 'stored',
    kind: 'import',
    title: 'Prüfung',
    refType: 'read_source',
    refId: 'synthetic-a',
    detail: '{"reason":"mapping_required","key":"one"}',
  };
  const key = inboxCause(item);
  expect(key).toBe(inboxCause({ ...item, detail: '{"reason":"mapping_required","key":"two"}' }));
  expect(key).not.toBe(inboxCause({ ...item, refId: 'synthetic-b' }));
  expect(key).not.toBe(inboxCause({ ...item, detail: '{"reason":"schema"}' }));
  expect(inboxCause({ ...item, kind: 'backup' })).toBeNull();
  expect(inboxCause({ ...item, detail: 'legacy one' })).not.toBe(
    inboxCause({ ...item, detail: 'legacy two' }),
  );
});
