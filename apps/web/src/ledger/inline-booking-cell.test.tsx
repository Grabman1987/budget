// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { InlineBookingCell } from './inline-booking-cell';
import { StatusCell } from './booking-cells';
import { ApiError } from '../api/http';
import type { ListedBooking } from './types';

const booking = {
  id: 'b',
  payeeName: 'Musterladen',
  date: '2026-10-04',
  amountCents: -1234,
  status: 'confirmed',
} as ListedBooking;
const setup = (field: 'date' | 'amountCents', status = booking.status) => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onOpen = vi.fn();
  render(
    <InlineBookingCell
      booking={{ ...booking, status }}
      field={field}
      onSave={onSave}
      onOpen={onOpen}
    >
      Wert
    </InlineBookingCell>,
  );
  return { onSave, onOpen };
};
describe('inline booking cells', () => {
  it.each(['date', 'amountCents'] as const)('saves %s on Enter and blur', async (field) => {
    const { onSave } = setup(field);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button'));
    const input = screen.getByLabelText(
      field === 'date' ? 'Datum bearbeiten' : 'Betrag bearbeiten',
    );
    fireEvent.change(input, { target: { value: field === 'date' ? '2026-10-05' : '-12,35' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(
      field === 'date' ? { date: '2026-10-05' } : { amountCents: -1235 },
    );
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
    await user.click(screen.getByRole('button'));
    fireEvent.change(
      screen.getByLabelText(field === 'date' ? 'Datum bearbeiten' : 'Betrag bearbeiten'),
      { target: { value: field === 'date' ? '2026-10-06' : '-12,36' } },
    );
    fireEvent.blur(
      screen.getByLabelText(field === 'date' ? 'Datum bearbeiten' : 'Betrag bearbeiten'),
    );
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
  });
  it.each(['date', 'amountCents'] as const)(
    'Escape cancels %s without blur saving',
    async (field) => {
      const { onSave } = setup(field);
      await userEvent.click(screen.getByRole('button'));
      const input = screen.getByLabelText(
        field === 'date' ? 'Datum bearbeiten' : 'Betrag bearbeiten',
      );
      fireEvent.change(input, { target: { value: field === 'date' ? '2026-10-06' : '42' } });
      fireEvent.keyDown(input, { key: 'Escape' });
      fireEvent.blur(input);
      expect(onSave).not.toHaveBeenCalled();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(document.activeElement).toBe(screen.getByRole('button'));
    },
  );
  it.each(['date', 'amountCents'] as const)('invalid %s stays inline', async (field) => {
    const { onSave } = setup(field);
    await userEvent.click(screen.getByRole('button'));
    const input = screen.getByLabelText(
      field === 'date' ? 'Datum bearbeiten' : 'Betrag bearbeiten',
    );
    fireEvent.change(input, { target: { value: field === 'date' ? '' : '0' } });
    fireEvent.blur(input);
    expect(screen.getByRole('alert').textContent).toMatch(/Bitte/);
    expect(onSave).not.toHaveBeenCalled();
  });
  it.each(['date', 'amountCents'] as const)(
    'checked %s delegates to existing dialog unlock',
    async (field) => {
      const { onSave, onOpen } = setup(field, 'reconciled');
      await userEvent.click(screen.getByRole('button'));
      expect(onOpen).toHaveBeenCalledTimes(1);
      expect(onSave).not.toHaveBeenCalled();
      expect(screen.queryByRole('textbox')).toBeNull();
    },
  );
  it('keeps a server validation failure inline for correction', async () => {
    const { onSave } = setup('amountCents');
    onSave.mockRejectedValue(new ApiError(422, 'invalid', 'Aufteilung prüfen.'));
    await userEvent.click(screen.getByRole('button'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '-30' } });
    fireEvent.blur(screen.getByRole('textbox'));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('textbox')).toBeTruthy();
  });
});
describe('status icon control', () => {
  it.each(['pending', 'confirmed'] as const)(
    'exposes and toggles %s with no visible word',
    async (status) => {
      const toggle = vi.fn();
      render(<StatusCell status={status} iconOnly onToggle={toggle} />);
      const button = screen.getByRole('button', {
        name: status === 'pending' ? 'vorgemerkt' : 'bestätigt',
      });
      expect(button.textContent).toBe('');
      expect(button.title).toBe(button.getAttribute('aria-label'));
      await userEvent.click(button);
      expect(toggle).toHaveBeenCalledTimes(1);
    },
  );
  it('checked status remains read-only', () => {
    render(<StatusCell status="reconciled" iconOnly />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('img', { name: 'geprüft' })).toBeTruthy();
  });
});
