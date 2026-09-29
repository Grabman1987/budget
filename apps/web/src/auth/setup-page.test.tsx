// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api';
import type * as webauthn from './webauthn';
import { SetupPage } from './setup-page';

const mocks = vi.hoisted(() => ({ register: vi.fn() }));

vi.mock('./webauthn', async () => ({
  ...(await vi.importActual<typeof webauthn>('./webauthn')),
  registerPasskey: mocks.register,
}));

const CODES = Array.from({ length: 10 }, (_, i) => `CODE-${String(i + 1).padStart(4, '0')}`);

beforeEach(() => mocks.register.mockReset());

async function fillAndSubmit(deviceName?: string) {
  await userEvent.type(screen.getByLabelText('Einrichtungscode'), 'setup-secret');
  if (deviceName) {
    const field = screen.getByLabelText('Gerätename');
    await userEvent.clear(field);
    await userEvent.type(field, deviceName);
  }
  await userEvent.click(screen.getByRole('button', { name: 'Passkey anlegen' }));
}

describe('SetupPage', () => {
  it('renders the token as a password field without autocomplete and a device name default', () => {
    render(<SetupPage onDone={vi.fn()} />);
    const token = screen.getByLabelText('Einrichtungscode') as HTMLInputElement;
    expect(token.type).toBe('password');
    expect(token.autocomplete).toBe('off');
    expect((screen.getByLabelText('Gerätename') as HTMLInputElement).value).not.toBe('');
  });

  it('shows the ten codes once and gates "Weiter zu Budget" behind the checkbox', async () => {
    mocks.register.mockResolvedValue({ passkeyId: 'p1', recoveryCodes: CODES });
    const onDone = vi.fn();
    render(<SetupPage onDone={onDone} />);
    await fillAndSubmit('Küchen-Tablet');
    expect(mocks.register).toHaveBeenCalledWith({
      setupToken: 'setup-secret',
      deviceName: 'Küchen-Tablet',
    });

    const list = await screen.findByRole('list', { name: 'Wiederherstellungscodes' });
    expect(list.querySelectorAll('li')).toHaveLength(10);
    // The form (and with it the token) is gone.
    expect(screen.queryByLabelText('Einrichtungscode')).toBeNull();

    const next = screen.getByRole('button', { name: 'Weiter zu Budget' }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    await userEvent.click(screen.getByLabelText('Ich habe die Codes sicher gespeichert'));
    expect(next.disabled).toBe(false);
    await userEvent.click(next);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('copies the codes to the clipboard', async () => {
    mocks.register.mockResolvedValue({ passkeyId: 'p1', recoveryCodes: CODES });
    render(<SetupPage onDone={vi.fn()} />);
    // Installed after user-event's own clipboard stub, so it is the one the component calls.
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    await userEvent.type(screen.getByLabelText('Einrichtungscode'), 'setup-secret');
    await user.click(screen.getByRole('button', { name: 'Passkey anlegen' }));
    await user.click(await screen.findByRole('button', { name: 'Kopieren' }));
    expect(writeText).toHaveBeenCalledWith(CODES.join('\n'));
    expect((await screen.findByRole('status')).textContent).toBe('Codes kopiert.');
  });

  it('shows an invalid token under the token field', async () => {
    mocks.register.mockRejectedValueOnce(new ApiError(401, 'setup_token_invalid'));
    render(<SetupPage onDone={vi.fn()} />);
    await fillAndSubmit();
    const al = await screen.findByRole('alert');
    expect(al.textContent).toBe('Der Einrichtungscode ist ungültig.');
    const el = screen.getByLabelText('Einrichtungscode');
    expect(el.getAttribute('aria-invalid')).toBe('true');
    expect(mocks.register).toHaveBeenCalledTimes(1);
  });

  it('shows rate limiting and cancelled ceremonies', async () => {
    mocks.register.mockRejectedValueOnce(new ApiError(429, 'rate_limited'));
    render(<SetupPage onDone={vi.fn()} />);
    await fillAndSubmit();
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Zu viele Versuche. Bitte später erneut versuchen.',
    );
  });

  it('asks for a token before contacting the server', async () => {
    render(<SetupPage onDone={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Passkey anlegen' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Bitte den Einrichtungscode eingeben.',
    );
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it('does not store token or codes in web storage', async () => {
    mocks.register.mockResolvedValue({ passkeyId: 'p1', recoveryCodes: CODES });
    render(<SetupPage onDone={vi.fn()} />);
    await fillAndSubmit();
    await screen.findByRole('list', { name: 'Wiederherstellungscodes' });
    await waitFor(() => {
      expect(window.localStorage.length).toBe(0);
      expect(window.sessionStorage.length).toBe(0);
    });
  });
});
