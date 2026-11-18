// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BookingPanel } from './booking-panel';
import type { ListedBooking } from './types';

const mode = vi.hoisted(() => ({ redesign: true, phone: true }));
vi.mock('../shell/redesign-flag', () => ({
  get REDESIGN_ENABLED() {
    return mode.redesign;
  },
}));
vi.mock('./capture-form', () => ({
  CaptureForm: ({ initialUnlockReconciled }: { initialUnlockReconciled?: boolean }) => (
    <div className="bkform" data-released={String(Boolean(initialUnlockReconciled))}>
      <div className="bk-body">
        <input aria-label="Kategorie" defaultValue="Synthetische Kategorie" />
      </div>
      <button type="button">Speichern</button>
    </div>
  ),
}));
vi.mock('../assignment/review', () => ({ AssignmentLearnOffer: () => null }));

let viewport: EventTarget & { height: number; offsetTop: number };
let frames: Map<number, FrameRequestCallback>;
const originalShowModal = HTMLDialogElement.prototype.showModal;
const originalClose = HTMLDialogElement.prototype.close;
beforeEach(() => {
  mode.redesign = mode.phone = true;
  viewport = Object.assign(new EventTarget(), { height: 844, offsetTop: 0 });
  vi.stubGlobal('visualViewport', viewport);
  vi.stubGlobal('matchMedia', () => ({
    matches: mode.phone,
    addEventListener() {},
    removeEventListener() {},
  }));
  frames = new Map();
  let nextFrame = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalShowModal) HTMLDialogElement.prototype.showModal = originalShowModal;
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  if (originalClose) HTMLDialogElement.prototype.close = originalClose;
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});

function flushFrame() {
  act(() => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(0));
  });
}

function mount() {
  const view = render(<BookingPanel state={{ mode: 'create' }} onClose={vi.fn()} />);
  const field = screen.getByLabelText('Kategorie');
  const body = field.closest<HTMLElement>('.bk-body')!;
  vi.spyOn(body, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(0, viewport.offsetTop + 48, 390, viewport.height - 120),
  );
  vi.spyOn(field, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(100, viewport.offsetTop + 430.25 - body.scrollTop, 250, 44),
  );
  field.focus();
  flushFrame();
  return { ...view, field, body };
}

it('reveals the focused field inside the resized body above the pinned footer', () => {
  const { field, body } = mount();
  act(() => {
    viewport.height = 450;
    viewport.dispatchEvent(new Event('resize'));
  });
  flushFrame();
  expect(field.getBoundingClientRect().bottom).toBeLessThanOrEqual(378);
  expect(body.scrollTop).toBeGreaterThan(0);
  expect(document.activeElement).toBe(field);
  expect((field as HTMLInputElement).value).toBe('Synthetische Kategorie');

  // A deliberate body scroll is not a keyboard viewport event and must remain possible.
  body.scrollTop = 500;
  act(() => body.dispatchEvent(new Event('scroll', { bubbles: true })));
  flushFrame();
  expect(body.scrollTop).toBe(500);
  act(() => {
    viewport.offsetTop = 80;
    viewport.dispatchEvent(new Event('scroll'));
  });
  flushFrame();
  expect(field.getBoundingClientRect().top).toBeGreaterThanOrEqual(128);
  expect(field.getBoundingClientRect().bottom).toBeLessThanOrEqual(458);
});

it.each(['desktop', 'rollback'] as const)('leaves %s scrolling unchanged', (variant) => {
  mode.phone = variant !== 'desktop';
  mode.redesign = variant !== 'rollback';
  const { body } = mount();
  act(() => {
    viewport.height = 450;
    window.dispatchEvent(new Event('resize'));
  });
  flushFrame();
  expect(body.scrollTop).toBe(0);
});

it('uses compact layout for a keyboard-reduced viewport on a tall phone', () => {
  vi.stubGlobal('innerHeight', 932);
  const { field } = mount();
  act(() => {
    viewport.height = 590;
    viewport.dispatchEvent(new Event('resize'));
  });
  flushFrame();
  expect(field.closest('.bk-focus-scope')?.hasAttribute('data-compact-viewport')).toBe(true);
  act(() => {
    viewport.height = 932;
    viewport.dispatchEvent(new Event('resize'));
  });
  flushFrame();
  expect(field.closest('.bk-focus-scope')?.hasAttribute('data-compact-viewport')).toBe(false);
});

it('does not move the body when focus is outside it and cancels pending work on unmount', () => {
  const { body, unmount } = mount();
  screen.getByRole('button', { name: 'Speichern' }).focus();
  act(() => {
    viewport.height = 450;
    viewport.dispatchEvent(new Event('resize'));
  });
  flushFrame();
  expect(body.scrollTop).toBe(0);
  act(() => viewport.dispatchEvent(new Event('resize')));
  unmount();
  expect(frames.size).toBe(0);
});

const checked = {
  id: 'synthetic-checked',
  status: 'reconciled',
} as ListedBooking;

it('mounts the editor only after confirmation and scopes release to that opening', () => {
  const onClose = vi.fn();
  const view = render(
    <BookingPanel state={{ mode: 'edit', booking: checked }} onClose={onClose} />,
  );
  const question = screen.getByRole('alertdialog', {
    name: 'Geprüfte Buchung wirklich bearbeiten?',
  });
  expect(question.textContent).toContain('geprüften Kontostand');
  expect(screen.queryByLabelText('Kategorie')).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Abbrechen' }));
  fireEvent.click(screen.getByRole('button', { name: 'Bearbeitung freigeben' }));
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(screen.getByLabelText('Kategorie').closest('.bkform')?.getAttribute('data-released')).toBe(
    'true',
  );
  expect(onClose).not.toHaveBeenCalled();

  view.rerender(<BookingPanel state={null} onClose={onClose} />);
  view.rerender(<BookingPanel state={{ mode: 'edit', booking: checked }} onClose={onClose} />);
  expect(screen.getByRole('alertdialog')).toBeTruthy();
  expect(screen.queryByLabelText('Kategorie')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Bearbeitung freigeben' }));
  view.rerender(
    <BookingPanel
      state={{ mode: 'edit', booking: { ...checked, id: 'synthetic-other' } }}
      onClose={onClose}
    />,
  );
  expect(screen.getByRole('alertdialog')).toBeTruthy();
  expect(screen.queryByLabelText('Kategorie')).toBeNull();
});

it.each(['cancel', 'escape'] as const)('closes without mounting an editor on %s', (answer) => {
  const onClose = vi.fn();
  render(<BookingPanel state={{ mode: 'edit', booking: checked }} onClose={onClose} />);
  if (answer === 'cancel') fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
  else fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
  expect(onClose).toHaveBeenCalledOnce();
  expect(screen.queryByLabelText('Kategorie')).toBeNull();
});

it.each(['unprotected', 'rollback'] as const)('opens %s editing without a new gate', (variant) => {
  mode.redesign = variant !== 'rollback';
  render(
    <BookingPanel
      state={{
        mode: 'edit',
        booking: variant === 'rollback' ? checked : { ...checked, status: 'confirmed' },
      }}
      onClose={vi.fn()}
    />,
  );
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(screen.getByLabelText('Kategorie').closest('.bkform')?.getAttribute('data-released')).toBe(
    'false',
  );
});
