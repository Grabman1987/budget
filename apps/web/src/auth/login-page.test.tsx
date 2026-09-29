// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api';
import type * as webauthn from './webauthn';
import type * as api from './api';
import { LoginPage } from './login-page';

const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), recovery: vi.fn() }));

vi.mock('./webauthn', async () => ({
  ...(await vi.importActual<typeof webauthn>('./webauthn')),
  authenticateWithPasskey: mocks.authenticate,
}));
vi.mock('./api', async () => ({
  ...(await vi.importActual<typeof api>('./api')),
  recoveryLogin: mocks.recovery,
}));

beforeEach(() => {
  mocks.authenticate.mockReset();
  mocks.recovery.mockReset();
});

describe('LoginPage', () => {
  it('has a title, no account field and signs in with the passkey', async () => {
    mocks.authenticate.mockResolvedValue(undefined);
    const onAuthenticated = vi.fn();
    render(<LoginPage onAuthenticated={onAuthenticated} />);
    expect(screen.getByRole('heading', { name: 'Anmelden' })).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Mit Passkey anmelden' }));
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledTimes(1));
  });

  it('shows a cancelled ceremony as German text and stays usable', async () => {
    mocks.authenticate.mockRejectedValue(
      Object.assign(new Error('x'), { name: 'NotAllowedError' }),
    );
    const onAuthenticated = vi.fn();
    render(<LoginPage onAuthenticated={onAuthenticated} />);
    await userEvent.click(screen.getByRole('button', { name: 'Mit Passkey anmelden' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Vorgang abgebrochen oder Zeit abgelaufen.',
    );
    expect(onAuthenticated).not.toHaveBeenCalled();
    expect(
      (screen.getByRole('button', { name: 'Mit Passkey anmelden' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('shows the rate limit message', async () => {
    mocks.authenticate.mockRejectedValue(new ApiError(429, 'rate_limited'));
    render(<LoginPage onAuthenticated={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Mit Passkey anmelden' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Zu viele Versuche. Bitte später erneut versuchen.',
    );
  });

  it('reveals the recovery code field and submits the trimmed code', async () => {
    mocks.recovery.mockResolvedValue({ ok: true });
    const onAuthenticated = vi.fn();
    render(<LoginPage onAuthenticated={onAuthenticated} />);
    expect(screen.queryByLabelText('Wiederherstellungscode')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Wiederherstellungscode verwenden' }));
    await userEvent.type(screen.getByLabelText('Wiederherstellungscode'), '  abcd-1234 ');
    await userEvent.click(screen.getByRole('button', { name: 'Mit Code anmelden' }));
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledTimes(1));
    expect(mocks.recovery).toHaveBeenCalledWith('abcd-1234');
  });

  it('reports an invalid recovery code under the field', async () => {
    mocks.recovery.mockRejectedValue(new ApiError(401, 'login_failed'));
    render(<LoginPage onAuthenticated={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Wiederherstellungscode verwenden' }));
    await userEvent.type(screen.getByLabelText('Wiederherstellungscode'), 'nope');
    await userEvent.click(screen.getByRole('button', { name: 'Mit Code anmelden' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/ungültig oder wurde bereits/);
  });
});
