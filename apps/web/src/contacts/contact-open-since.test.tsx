// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ContactOpenSince } from './contact-open-since';

const http = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../api/http', () => ({ request: http.request }));

const data = {
  outlays: [
    {
      splitId: 'o1',
      bookingId: 'b1',
      date: '2026-09-01',
      remainingCents: 2501,
      memo: 'Einkauf',
      payeeName: 'Laden',
      categoryId: 'essen',
      categoryName: 'Essen',
    },
  ],
  contributions: [
    {
      occurrenceId: 'c1',
      name: 'Mietanteil',
      dueDate: '2026-10-03',
      amountCents: 80000,
      selectable: true,
    },
  ],
  credits: [{ receiptSplitId: 'k1', remainingCents: 500, usable: true }],
};
function mount() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ContactOpenSince contactId="k1" asOf="2026-10-05" />
    </QueryClientProvider>,
  );
}
beforeEach(() => http.request.mockReset());
afterEach(cleanup);

it('copies the open items since the last settlement as plain German text', async () => {
  http.request.mockResolvedValue(data);
  const user = userEvent.setup();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  mount();
  await user.click(await screen.findByRole('button', { name: 'Offene Posten kopieren' }));
  await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
  expect(writeText.mock.calls[0]![0]).toContain('Gesamt offen: 820,01 €');
  expect(writeText.mock.calls[0]![0]).toContain('Abzüglich Guthaben: -5,00 €');
  expect(screen.queryByText('Offen seit letztem Ausgleich')).toBeNull();
  expect(screen.queryByTestId('open-since-total')).toBeNull();
});

it('renders nothing when nothing is open or the answer has another shape', async () => {
  http.request.mockResolvedValue({ outlays: [], contributions: [], credits: [] });
  mount();
  await waitFor(() => expect(http.request).toHaveBeenCalled());
  expect(screen.queryByRole('button', { name: 'Offene Posten kopieren' })).toBeNull();
});
