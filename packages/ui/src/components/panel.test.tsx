// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { FormDialog } from './panel';
import { ToastProvider } from './toast';

afterEach(() => vi.unstubAllGlobals());
it('a nested dialog closes itself without dismissing its parent', () => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  const parentClose = vi.fn();
  const childClose = vi.fn();
  render(
    <ToastProvider>
      <FormDialog open={false} title="Kontostand prüfen" onClose={parentClose}>
        <FormDialog open={false} title="Buchung erfassen" onClose={childClose}>
          <p>Entwurf</p>
        </FormDialog>
      </FormDialog>
    </ToastProvider>,
  );
  const dialogs = screen.getAllByRole('dialog', { hidden: true });
  fireEvent(dialogs[1]!, new Event('close', { bubbles: false }));
  expect(childClose).toHaveBeenCalledTimes(1);
  expect(parentClose).not.toHaveBeenCalled();
});
