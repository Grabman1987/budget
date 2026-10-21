// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { LoginPage } from './login-page';

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  repair: vi.fn(),
  login: vi.fn(),
  recovery: vi.fn(),
}));
vi.mock('../pwa/receipt-queue-store', () => ({
  prepareReceiptQueueRecovery: mocks.prepare,
  recoverReceiptQueueAfterConfirmedAction: mocks.repair,
}));
vi.mock('./webauthn', async () => ({
  ...(await vi.importActual<typeof import('./webauthn')>('./webauthn')),
  authenticateWithPasskey: mocks.login,
}));
vi.mock('./api', async () => ({
  ...(await vi.importActual<typeof import('./api')>('./api')),
  recoveryLogin: mocks.recovery,
}));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.prepare.mockResolvedValue({});
  mocks.repair.mockResolvedValue(undefined);
  mocks.login.mockResolvedValue(undefined);
  mocks.recovery.mockResolvedValue(undefined);
});
it('captures the opaque ticket before any actual passkey request and consumes only confirmed success', async () => {
  const ticket = Object.freeze({});
  const prepared = deferred<object>(),
    ceremony = deferred<void>();
  const sequence: string[] = [];
  mocks.prepare.mockImplementation(() => {
    sequence.push('prepare');
    return prepared.promise;
  });
  mocks.login.mockImplementation(() => {
    sequence.push('request');
    return ceremony.promise;
  });
  mocks.repair.mockImplementation((action, value) => {
    expect(action).toBe('new-login');
    expect(value).toBe(ticket);
    sequence.push('repair');
  });
  const authenticated = vi.fn(() => {
    sequence.push('authenticated');
  });
  render(<LoginPage onAuthenticated={authenticated} />);
  await userEvent.click(screen.getByRole('button', { name: 'Mit Passkey anmelden' }));
  expect(sequence).toEqual(['prepare']);
  expect(mocks.login).not.toHaveBeenCalled();
  prepared.resolve(ticket);
  await waitFor(() => expect(mocks.login).toHaveBeenCalledOnce());
  expect(mocks.repair).not.toHaveBeenCalled();
  ceremony.resolve();
  await waitFor(() => expect(authenticated).toHaveBeenCalledOnce());
  expect(sequence).toEqual(['prepare', 'request', 'repair', 'authenticated']);
});
it('does not consume a ticket for a failed or cancelled ceremony', async () => {
  mocks.login.mockRejectedValue(Object.assign(new Error('synthetic'), { name: 'NotAllowedError' }));
  const authenticated = vi.fn();
  render(<LoginPage onAuthenticated={authenticated} />);
  await userEvent.click(screen.getByRole('button', { name: 'Mit Passkey anmelden' }));
  expect((await screen.findByRole('alert')).textContent).toContain('abgebrochen');
  expect(mocks.repair).not.toHaveBeenCalled();
  expect(authenticated).not.toHaveBeenCalled();
});
it.each(['prepare', 'repair'] as const)(
  'a failed optional %s never prevents successful authentication',
  async (stage) => {
    mocks[stage].mockRejectedValue(new Error('synthetic private detail must not become UI text'));
    const authenticated = vi.fn();
    render(<LoginPage onAuthenticated={authenticated} />);
    await userEvent.click(screen.getByRole('button', { name: 'Mit Passkey anmelden' }));
    await waitFor(() => expect(authenticated).toHaveBeenCalledOnce());
    expect(mocks.login).toHaveBeenCalledOnce();
    if (stage === 'prepare') expect(mocks.repair).not.toHaveBeenCalled();
  },
);
it('recovery-code requests also prepare before sending and consume the same ticket only after success', async () => {
  const ticket = Object.freeze({});
  const sequence: string[] = [];
  mocks.prepare.mockImplementation(async () => {
    sequence.push('prepare');
    return ticket;
  });
  mocks.recovery.mockImplementation(async () => {
    sequence.push('recovery');
  });
  mocks.repair.mockImplementation(async (action, value) => {
    expect(action).toBe('new-recovery');
    expect(value).toBe(ticket);
    sequence.push('repair');
  });
  render(
    <LoginPage
      onAuthenticated={() => {
        sequence.push('authenticated');
      }}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Wiederherstellungscode verwenden' }));
  await userEvent.type(screen.getByLabelText('Wiederherstellungscode'), '  synthetic-code  ');
  await userEvent.click(screen.getByRole('button', { name: 'Mit Code anmelden' }));
  await waitFor(() => expect(sequence).toEqual(['prepare', 'recovery', 'repair', 'authenticated']));
  expect(mocks.recovery).toHaveBeenCalledWith('synthetic-code');
});

it.each(['prepare', 'ceremony'] as const)(
  'closing a reauthentication view during %s never consumes its ticket or drains the queue',
  async (stage) => {
    const pending = deferred<object | void>();
    if (stage === 'prepare') mocks.prepare.mockReturnValue(pending.promise);
    else mocks.login.mockReturnValue(pending.promise);
    const authenticated = vi.fn();
    const view = render(<LoginPage onAuthenticated={authenticated} />);
    await userEvent.click(screen.getByRole('button', { name: 'Mit Passkey anmelden' }));
    if (stage === 'ceremony') await waitFor(() => expect(mocks.login).toHaveBeenCalledOnce());
    view.unmount();
    pending.resolve(stage === 'prepare' ? {} : undefined);
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.repair).not.toHaveBeenCalled();
    expect(authenticated).not.toHaveBeenCalled();
    if (stage === 'prepare') expect(mocks.login).not.toHaveBeenCalled();
  },
);
