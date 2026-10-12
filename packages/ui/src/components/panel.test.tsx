// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { FormDialog } from './panel';
import { ToastProvider } from './toast';

afterEach(() => vi.unstubAllGlobals());
it('only a pointer gesture outside the dialog may request discard', () => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  const guard = vi.fn(() => false);
  render(
    <ToastProvider>
      <FormDialog open={false} title="Buchung erfassen" onClose={vi.fn()} beforeClose={guard}>
        <button type="button">Auswahl</button>
      </FormDialog>
    </ToastProvider>,
  );
  const dialog = screen.getByRole('dialog', { hidden: true });
  vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue({
    left: 100,
    right: 500,
    top: 100,
    bottom: 600,
  } as DOMRect);
  fireEvent.click(dialog, { clientX: 200, clientY: 200 });
  expect(guard).not.toHaveBeenCalled();
  fireEvent.pointerDown(screen.getByText('Auswahl'));
  fireEvent.click(dialog, { clientX: 0, clientY: 0 });
  expect(guard).not.toHaveBeenCalled();
  fireEvent.pointerDown(dialog, { clientX: 0, clientY: 0 });
  fireEvent.click(dialog, { clientX: 0, clientY: 0 });
  expect(guard).toHaveBeenCalledTimes(1);
});
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
