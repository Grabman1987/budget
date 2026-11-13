// @vitest-environment jsdom
import { ToastProvider } from '@budget/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PayslipUpload } from './payslip-intake';

afterEach(cleanup);
const mount = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <PayslipUpload />
      </ToastProvider>
    </QueryClientProvider>,
  );

it('offers a primary "PDF auswählen" button that still names the payslip', () => {
  mount();
  const button = screen.getByRole('button', { name: 'Gehaltszettel: PDF auswählen' });
  expect(button.textContent).toBe('PDF auswählen');
  expect(button.className).toContain('btn-primary');
});

it('opens the picker from a click anywhere in the dashed area, once', () => {
  mount();
  const input = screen.getByLabelText('Gehaltszettel-PDF auswählen') as HTMLInputElement;
  const open = vi.fn();
  input.addEventListener('click', open);
  fireEvent.click(screen.getByText(/PDF hier ablegen/));
  expect(open).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Gehaltszettel: PDF auswählen' }));
  expect(open).toHaveBeenCalledTimes(2);
});

it('states the order of actions and puts the password above the picker', () => {
  mount();
  const hint = screen.getByText(
    'Passwort zuerst eingeben, dann PDF auswählen – der Upload startet sofort.',
  );
  const password = screen.getByText('PDF-Passwort eingeben (optional)');
  expect(password.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
