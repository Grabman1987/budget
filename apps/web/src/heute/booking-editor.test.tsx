// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useBookingEditor } from './booking-editor';

const http = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../api/http', () => ({ request: http.request }));
vi.mock('../ledger/booking-panel', () => ({
  BookingPanel: ({
    state,
    onClose,
  }: {
    state: { mode: string; booking: { id: string } } | null;
    onClose: () => void;
  }) =>
    state ? (
      <div role="dialog" aria-label={`Bearbeiten ${state.booking.id}`}>
        <button onClick={onClose}>Schließen</button>
      </div>
    ) : null,
}));
afterEach(() => {
  cleanup();
  http.request.mockReset();
});

function Harness() {
  const editor = useBookingEditor();
  return (
    <>
      <button onClick={() => editor.open('synthetic-booking')}>Buchung öffnen</button>
      {editor.panel}
    </>
  );
}

it('loads exactly the tapped booking into the edit dialog and stays on the page after closing', async () => {
  http.request.mockResolvedValue({ booking: { id: 'synthetic-booking' } });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Harness />
    </QueryClientProvider>,
  );
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Buchung öffnen' }));
  expect(await screen.findByRole('dialog', { name: 'Bearbeiten synthetic-booking' })).toBeTruthy();
  expect(http.request).toHaveBeenCalledWith('GET', '/api/bookings/synthetic-booking');
  fireEvent.click(screen.getByRole('button', { name: 'Schließen' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(screen.getByRole('button', { name: 'Buchung öffnen' })).toBeTruthy();
});
