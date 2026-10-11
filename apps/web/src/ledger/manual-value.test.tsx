// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@budget/ui';
import { afterEach, expect, it, vi } from 'vitest';
import { ManualValue } from './manual-value';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it.each([
  ['invalid', '', 'Bitte einen gültigen Stichtag eingeben.'],
  ['invalid', '31.02.2026', 'Bitte einen gültigen Stichtag eingeben.'],
  ['future', '12.10.2026', 'Stichtag liegt in der Zukunft.'],
  ['opening', '31.08.2026', 'Stichtag liegt vor der Kontoeröffnung.'],
  ['locked', '11.10.2026', 'Der Stichtag ist bereits festgeschrieben.'],
  ['products', '11.10.2026', 'Dieses Konto wird über seine Produkte bewertet.'],
])(
  'explains %s dates and guards submission even without native validation',
  async (kind, date, reason) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-11T12:00:00+02:00'));
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const client = new QueryClient();
    const view = render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <ManualValue
            accountId="synthetic"
            end="2026-10-31"
            valueCents={100}
            currency="EUR"
            openingDate="2026-09-01"
            lastReconciledOn={kind === 'locked' ? '2026-10-11' : null}
            blockedReason={
              kind === 'products' ? 'Dieses Konto wird über seine Produkte bewertet.' : undefined
            }
            onDone={() => {}}
          />
        </ToastProvider>
      </QueryClientProvider>,
    );
    try {
      const user = userEvent.setup();
      const input = screen.getByLabelText('Stichtag');
      await user.clear(input);
      if (date) await user.type(input, date);
      expect(screen.getByText(reason)).toBeTruthy();
      const save = screen.getByRole('button', { name: 'Wert speichern' });
      expect(save.hasAttribute('disabled')).toBe(true);
      fireEvent.submit(save.closest('form')!);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      view.unmount();
      client.clear();
    }
  },
);
