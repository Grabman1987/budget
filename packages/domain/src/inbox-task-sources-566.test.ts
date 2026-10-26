import { expect, it } from 'vitest';
import { inboxTaskSource } from './inbox';

it('classifies only proven task sources and preserves every unfamiliar source', () => {
  expect(inboxTaskSource({ type: 'savings' })).toBe('plan');
  expect(inboxTaskSource({ type: 'stored', refType: 'savings_plan' })).toBe('plan');
  expect(inboxTaskSource({ type: 'stored', refType: 'payslip-intake' })).toBe('payslips');
  for (const refType of ['security', 'fx', 'account', 'read_source', 'future-source', null])
    expect(inboxTaskSource({ type: 'stored', refType })).toBe('other');
  expect(inboxTaskSource({ type: 'stored' })).toBe('other');
});
