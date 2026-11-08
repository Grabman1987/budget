// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { FormDialog, MobileSheetContext } from './panel';
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

it('routes a downward sheet swipe through the discard guard exactly once', () => {
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }));
  const guard = vi.fn(() => false);
  const close = vi.fn();
  render(
    <MobileSheetContext.Provider value>
      <ToastProvider>
        <FormDialog open={false} title="Entwurf" onClose={close} beforeClose={guard}>
          <p>Ungespeicherter Entwurf</p>
        </FormDialog>
      </ToastProvider>
    </MobileSheetContext.Provider>,
  );
  const grip = screen.getByRole('button', { name: 'Blatt schließen', hidden: true });
  grip.setPointerCapture = vi.fn();
  const pointer = (type: string, x: number, y: number) => {
    fireEvent(
      grip,
      Object.assign(new Event(type, { bubbles: true }), {
        pointerId: 1,
        isPrimary: true,
        button: 0,
        clientX: x,
        clientY: y,
      }),
    );
  };
  for (const [x, y] of [
    [100, 120],
    [200, 120],
    [100, 20],
  ]) {
    pointer('pointerdown', 100, 100);
    pointer('pointerup', x!, y!);
    fireEvent.click(grip, { detail: 1 });
  }
  expect(guard).not.toHaveBeenCalled();
  pointer('pointerdown', 100, 100);
  pointer('pointercancel', 100, 200);
  pointer('pointerup', 100, 200);
  fireEvent.click(grip, { detail: 1 });
  expect(guard).not.toHaveBeenCalled();
  pointer('pointerdown', 100, 100);
  pointer('pointerup', 104, 190);
  fireEvent.click(grip, { detail: 1 });
  expect(guard).toHaveBeenCalledTimes(1);
  expect(close).not.toHaveBeenCalled();
  guard.mockReturnValue(true);
  pointer('pointerdown', 100, 100);
  pointer('pointerup', 100, 180);
  fireEvent.click(grip, { detail: 1 });
  expect(guard).toHaveBeenCalledTimes(2);
  expect(close).toHaveBeenCalledTimes(1);
  fireEvent.click(grip, { detail: 0 });
  expect(close).toHaveBeenCalledTimes(2);
});

it.each([false, true])(
  'keeps desktop and rollback dialogs without swipe controls (phone %s)',
  (phone) => {
    vi.stubGlobal('matchMedia', () => ({
      matches: phone,
      addEventListener() {},
      removeEventListener() {},
    }));
    render(
      <ToastProvider>
        <FormDialog open={false} title="Dialog" onClose={vi.fn()}>
          <p>Inhalt</p>
        </FormDialog>
      </ToastProvider>,
    );
    expect(screen.queryByRole('button', { name: 'Blatt schließen', hidden: true })).toBeNull();
  },
);
