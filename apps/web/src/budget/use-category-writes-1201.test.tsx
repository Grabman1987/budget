// @vitest-environment jsdom
import { ToastProvider } from '@budget/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it, vi } from 'vitest';
import { useBudgetWrite } from './use-category-writes';

// #1201: a write resolves (and so closes its dialog) without waiting for the follow-up reads.
it('resolves before the refreshing reads finish and keeps errors on the dialog path', async () => {
  const client = new QueryClient();
  const reads = vi
    .spyOn(client, 'invalidateQueries')
    .mockImplementation(() => new Promise(() => {}));
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
  const { result } = renderHook(() => useBudgetWrite(), { wrapper });
  const done = await result.current(
    async () => ({ groupId: 'g1' }),
    () => 'ok',
  );
  expect(done).toEqual({ groupId: 'g1' });
  expect(reads).toHaveBeenCalled();
  const failed = await result.current(
    async () => {
      throw new Error('refused');
    },
    () => 'never',
  );
  expect(failed).toBeUndefined();
});
