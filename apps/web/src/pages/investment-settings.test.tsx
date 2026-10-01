// @vitest-environment jsdom
import { ToastProvider } from '@budget/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InvestmentSettingsPanel } from './investment-settings';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function panel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <InvestmentSettingsPanel />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('investment method settings', () => {
  it('loads the saved method and saves a switch only on submission', async () => {
    let stored = 'average';
    const patches: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_path: string, init: RequestInit) => {
        if (init.method === 'PATCH') {
          const body = JSON.parse(String(init.body)) as { costMethod: string };
          patches.push(body);
          stored = body.costMethod;
        }
        return new Response(JSON.stringify({ costMethod: stored }), { status: 200 });
      }),
    );
    panel();
    const select = await screen.findByLabelText('Einstandskostenmethode');
    await userEvent.selectOptions(select, 'fifo');
    expect(patches).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await screen.findByText('Einstandskostenmethode gespeichert.');
    expect(patches).toEqual([{ costMethod: 'fifo' }]);
    expect(stored).toBe('fifo');
    expect((select as HTMLSelectElement).value).toBe('fifo');
  });

  it('retains the selection and reports a failed save without claiming it was stored', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (_path: string, init: RequestInit) =>
          new Response(
            JSON.stringify(
              init.method === 'GET' ? { costMethod: 'average' } : { error: 'network' },
            ),
            { status: init.method === 'GET' ? 200 : 503 },
          ),
      ),
    );
    panel();
    const select = await screen.findByLabelText('Einstandskostenmethode');
    await userEvent.selectOptions(select, 'fifo');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect((await screen.findByRole('alert')).textContent).toContain('nicht gespeichert');
    expect((select as HTMLSelectElement).value).toBe('fifo');
    expect(screen.queryByText('Einstandskostenmethode gespeichert.')).toBeNull();
  });
});
