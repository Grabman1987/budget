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

it('lists open outlays and due contributions and copies a plain German text', async () => {
  http.request.mockResolvedValue(data);
  const user = userEvent.setup();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  mount();
  await screen.findByText('Offen seit letztem Ausgleich');
  expect(screen.getByText(/01\.09\.2026 · Laden - Einkauf: 25,01\s€/)).toBeTruthy();
  expect(screen.getByTestId('open-since-total').textContent).toMatch(/insgesamt 820,01\s€/);
  await user.click(screen.getByRole('button', { name: 'Text kopieren' }));
  await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
  expect(writeText.mock.calls[0]![0]).toContain('Gesamt offen: 820,01 €');
  expect(writeText.mock.calls[0]![0]).toContain('Abzüglich Guthaben: -5,00 €');
});

it('renders nothing when nothing is open or the answer has another shape', async () => {
  http.request.mockResolvedValue({ outlays: [], contributions: [], credits: [] });
  mount();
  await waitFor(() => expect(http.request).toHaveBeenCalled());
  expect(screen.queryByText('Offen seit letztem Ausgleich')).toBeNull();
});
