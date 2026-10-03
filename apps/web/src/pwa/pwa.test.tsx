// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PwaShell } from './pwa';

function connection(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
  act(() => window.dispatchEvent(new Event(online ? 'online' : 'offline')));
}
afterEach(() => {
  connection(true);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe('static offline shell', () => {
  it('does not mount financial routes on an offline start', () => {
    connection(false);
    render(
      <PwaShell>
        <p>Financial page</p>
      </PwaShell>,
    );
    expect(screen.getByRole('heading', { name: 'Budget ist offline' })).toBeTruthy();
    expect(screen.queryByText('Financial page')).toBeNull();
    connection(true);
    expect(screen.getByText('Financial page')).toBeTruthy();
  });
  it('keeps unsaved fields mounted when an online session loses connectivity', async () => {
    connection(true);
    render(
      <PwaShell>
        <input aria-label="Notiz" />
      </PwaShell>,
    );
    await userEvent.type(screen.getByRole('textbox', { name: 'Notiz' }), 'Noch offen');
    connection(false);
    expect(screen.getByRole('status').textContent).toContain(
      'Neue Buchungen warten auf diesem Gerät.',
    );
    expect((screen.getByRole('textbox', { name: 'Notiz' }) as HTMLInputElement).value).toBe(
      'Noch offen',
    );
    connection(true);
    expect(screen.queryByRole('status')).toBeNull();
  });
  it('offers a waiting update without applying it until the user opts in', async () => {
    vi.stubEnv('PROD', true);
    const postMessage = vi.fn();
    const controllerListener = vi.fn();
    const register = vi.fn().mockResolvedValue({
      waiting: { postMessage, addEventListener: vi.fn() },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register, addEventListener: controllerListener, controller: {} },
    });
    render(
      <PwaShell>
        <input aria-label="Notiz" defaultValue="Noch offen" />
      </PwaShell>,
    );
    const update = await screen.findByRole('button', { name: 'Jetzt neu laden' });
    expect(postMessage).not.toHaveBeenCalled();
    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/', updateViaCache: 'none' });
    expect((screen.getByRole('textbox', { name: 'Notiz' }) as HTMLInputElement).value).toBe(
      'Noch offen',
    );
    await userEvent.click(update);
    expect(postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'APPLY_UPDATE' });
    expect(controllerListener).toHaveBeenCalledWith('controllerchange', expect.any(Function), {
      once: true,
    });
  });
  it('does not offer an update while a first install is still becoming active', async () => {
    vi.stubEnv('PROD', true);
    const register = vi.fn().mockResolvedValue({
      waiting: { postMessage: vi.fn(), addEventListener: vi.fn() },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register, addEventListener: vi.fn(), controller: null },
    });
    render(
      <PwaShell>
        <p>Seite</p>
      </PwaShell>,
    );
    await screen.findByText('Seite');
    await act(async () => {
      await register.mock.results[0]?.value;
    });
    expect(screen.queryByRole('button', { name: 'Jetzt neu laden' })).toBeNull();
  });
});
