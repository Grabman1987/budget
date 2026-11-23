// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BookingPanel } from './booking-panel';
import { readBookingEditProtection } from './api';
import type { ListedBooking } from './types';

const mode = vi.hoisted(() => ({ redesign: true, phone: true }));
vi.mock('./api', () => ({ readBookingEditProtection: vi.fn() }));
vi.mock('../shell/redesign-flag', () => ({
  get REDESIGN_ENABLED() {
    return mode.redesign;
  },
}));
vi.mock('./capture-form', () => ({
  CaptureForm: ({
    initialUnlockReconciled,
    initialUnlockContactLinked,
  }: {
    initialUnlockReconciled?: boolean;
    initialUnlockContactLinked?: boolean;
  }) => (
    <div
      className="bkform"
      data-released={String(Boolean(initialUnlockReconciled))}
      data-linked={String(Boolean(initialUnlockContactLinked))}
    >
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
  vi.mocked(readBookingEditProtection).mockResolvedValue({
    reconciled: true,
    reconciliationDates: ['2026-09-02'],
    settlementDates: [],
    reconciledRepayment: false,
    reviewedOn: [],
  });
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

it('mounts the editor only after confirmation and scopes release to that opening', async () => {
  const onClose = vi.fn();
  const view = render(
    <BookingPanel state={{ mode: 'edit', booking: checked }} onClose={onClose} />,
  );
  const question = await screen.findByRole('alertdialog', {
    name: 'Geprüfte Buchung wirklich bearbeiten?',
  });
  expect(question.textContent).toContain('geprüften Kontostand');
  expect(question.textContent).toContain('am 02.09.2026 abgeglichen');
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
  expect(await screen.findByRole('alertdialog')).toBeTruthy();
  expect(screen.queryByLabelText('Kategorie')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Bearbeitung freigeben' }));
  view.rerender(
    <BookingPanel
      state={{ mode: 'edit', booking: { ...checked, id: 'synthetic-other' } }}
      onClose={onClose}
    />,
  );
  expect(await screen.findByRole('alertdialog')).toBeTruthy();
  expect(screen.queryByLabelText('Kategorie')).toBeNull();
});

it.each(['cancel', 'escape'] as const)(
  'closes without mounting an editor on %s',
  async (answer) => {
    const onClose = vi.fn();
    render(<BookingPanel state={{ mode: 'edit', booking: checked }} onClose={onClose} />);
    const question = await screen.findByRole('alertdialog');
    if (answer === 'cancel') fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    else fireEvent.keyDown(question, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByLabelText('Kategorie')).toBeNull();
  },
);

it('opens a repayment-linked outlay with the contact release only after confirmation', async () => {
  vi.mocked(readBookingEditProtection).mockResolvedValue({
    reconciled: false,
    reconciliationDates: [],
    settlementDates: ['2026-09-02'],
    reconciledRepayment: false,
    reviewedOn: [],
  });
  const booking = {
    ...checked,
    status: 'confirmed',
    splits: [{ contactId: 'synthetic-contact', amountCents: -1001 }],
  } as ListedBooking;
  render(<BookingPanel state={{ mode: 'edit', booking }} onClose={vi.fn()} />);
  const question = await screen.findByRole('alertdialog', {
    name: 'Verknüpfte Auslage wirklich bearbeiten?',
  });
  expect(question.textContent).toContain('02.09.2026');
  expect(screen.queryByLabelText('Kategorie')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Bearbeitung bestätigen' }));
  const form = screen.getByLabelText('Kategorie').closest('.bkform');
  expect(form?.getAttribute('data-linked')).toBe('true');
  expect(form?.getAttribute('data-released')).toBe('false');
});

it('explains an explicit Prüfen acceptance without claiming a bank reconciliation', async () => {
  vi.mocked(readBookingEditProtection).mockResolvedValue({
    reconciled: false,
    reconciliationDates: [],
    settlementDates: [],
    reconciledRepayment: false,
    reviewedOn: ['2026-09-17'],
  });
  render(
    <BookingPanel
      state={{ mode: 'edit', booking: { ...checked, status: 'confirmed' } }}
      onClose={vi.fn()}
    />,
  );
  const question = await screen.findByRole('alertdialog');
  expect(question.textContent).toContain('17.09.2026 in Prüfen bestätigt');
  expect(question.textContent).not.toContain('abgeglichen');
  fireEvent.click(screen.getByRole('button', { name: 'Bearbeitung freigeben' }));
  expect(screen.getByLabelText('Kategorie').closest('.bkform')?.getAttribute('data-released')).toBe(
    'true',
  );
});

it.each(['unprotected', 'rollback'] as const)(
  'opens %s editing without a new gate',
  async (variant) => {
    mode.redesign = variant !== 'rollback';
    vi.mocked(readBookingEditProtection).mockResolvedValue({
      reconciled: false,
      reconciliationDates: [],
      settlementDates: [],
      reconciledRepayment: false,
      reviewedOn: [],
    });
    render(
      <BookingPanel
        state={{
          mode: 'edit',
          booking: variant === 'rollback' ? checked : { ...checked, status: 'confirmed' },
        }}
        onClose={vi.fn()}
      />,
    );
    const field = await screen.findByLabelText('Kategorie');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(field.closest('.bkform')?.getAttribute('data-released')).toBe('false');
  },
);
