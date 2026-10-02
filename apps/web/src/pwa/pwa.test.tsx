// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { PwaShell } from './pwa';

function connection(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
  act(() => window.dispatchEvent(new Event(online ? 'online' : 'offline')));
}
afterEach(() => connection(true));

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
    expect(screen.getByRole('status').textContent).toContain('Speichern braucht eine Verbindung.');
    expect((screen.getByRole('textbox', { name: 'Notiz' }) as HTMLInputElement).value).toBe(
      'Noch offen',
    );
    connection(true);
    expect(screen.queryByRole('status')).toBeNull();
  });
});
