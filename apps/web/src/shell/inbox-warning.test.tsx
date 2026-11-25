// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it } from 'vitest';
import { inboxCountQuery, type InboxCountData } from '../inbox/api';
import { useInboxCount } from './inbox';

const mount = (data: InboxCountData) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(inboxCountQuery().queryKey, data);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useInboxCount(), { wrapper }).result.current;
};
const thresholds = { ageDays: 7, count: 10 };

it('stays neutral within both thresholds', () => {
  const inbox = mount({
    asOf: '2026-09-17',
    count: 10,
    oldestOpenDate: '2026-09-10',
    overAgeCount: 0,
    openUncategorizedCents: -50_000,
    thresholds,
  });
  expect(inbox.warning).toBeNull();
  expect(inbox.openUncategorizedCents).toBe(-50_000);
});

it('warns with age and the open sum once an item is older than the threshold', () => {
  const inbox = mount({
    asOf: '2026-09-17',
    count: 9,
    oldestOpenDate: '2026-09-01',
    overAgeCount: 8,
    openUncategorizedCents: -123_456,
    thresholds,
  });
  expect(inbox.warning).toBe('8 Buchungen älter als 7 Tage · −1.234,56 € ohne Kategorie');
  expect(inbox.label).toBe('Prüfen, 9 offen');
});

it('warns when more entries than the count threshold are open', () => {
  const inbox = mount({
    asOf: '2026-09-17',
    count: 11,
    oldestOpenDate: null,
    overAgeCount: 0,
    openUncategorizedCents: 0,
    thresholds,
  });
  expect(inbox.warning).toBe('11 offen, mehr als 10');
});
