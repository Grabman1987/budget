// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { setAmountsHidden } from '@budget/ui';
import { afterEach, expect, it, vi } from 'vitest';
import { ReceiptPdfPreview } from './pdf-preview';

afterEach(() => {
  cleanup();
  setAmountsHidden(false);
  vi.unstubAllGlobals();
});

it('requires explicit opening, aborts on privacy/source/close changes and drops transient passwords', async () => {
  const requests: RequestInit[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, options: RequestInit) => {
      requests.push(options);
      return new Promise<Response>(() => {});
    }),
  );
  const view = render(<ReceiptPdfPreview receiptId="synthetic-first" visible />);
  expect(requests).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'PDF-Vorschau öffnen' }));
  await waitFor(() => expect(requests).toHaveLength(1));
  act(() => setAmountsHidden(true));
  expect(requests[0]!.signal!.aborted).toBe(true);
  expect(screen.queryByLabelText('PDF-Passwort für diese Vorschau')).toBeNull();
  act(() => setAmountsHidden(false));
  expect(requests).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'PDF-Vorschau öffnen' }));
  await waitFor(() => expect(requests).toHaveLength(2));
  view.rerender(<ReceiptPdfPreview receiptId="synthetic-second" visible />);
  expect(requests[1]!.signal!.aborted).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'PDF-Vorschau öffnen' }));
  await waitFor(() => expect(requests).toHaveLength(3));
  fireEvent.click(screen.getByRole('button', { name: 'Vorschau schließen' }));
  expect(requests[2]!.signal!.aborted).toBe(true);
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'PDF-Vorschau öffnen' }));
  fireEvent.click(screen.getByRole('button', { name: 'PDF-Vorschau öffnen' }));
  view.rerender(<ReceiptPdfPreview receiptId="synthetic-second" visible={false} />);
  expect(requests[3]!.signal!.aborted).toBe(true);
});

it('keeps a password only in the open session and displays finite errors without server diagnostics', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json(
      { error: 'pdf_preview_password', message: 'untrusted diagnostic' },
      { status: 422 },
    ),
  );
  vi.stubGlobal('fetch', fetch);
  render(<ReceiptPdfPreview receiptId="synthetic-encrypted" visible />);
  fireEvent.click(screen.getByRole('button', { name: 'PDF-Vorschau öffnen' }));
  await screen.findByRole('alert');
  expect(screen.queryByText('untrusted diagnostic')).toBeNull();
  fireEvent.change(screen.getByLabelText('PDF-Passwort für diese Vorschau'), {
    target: { value: 'synthetic-transient' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Vorschau erneut laden' }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(fetch.mock.calls[1]![1]).toMatchObject({
    cache: 'no-store',
    method: 'POST',
    body: JSON.stringify({ page: 1, preset: 'fit', password: 'synthetic-transient' }),
  });
  fireEvent.click(screen.getByRole('button', { name: 'Vorschau schließen' }));
  fireEvent.click(screen.getByRole('button', { name: 'PDF-Vorschau öffnen' }));
  expect((screen.getByLabelText('PDF-Passwort für diese Vorschau') as HTMLInputElement).value).toBe(
    '',
  );
});
