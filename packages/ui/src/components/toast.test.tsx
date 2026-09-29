// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SidePanel } from './panel';
import { ToastProvider, useToast, type ToastOptions } from './toast';

function Trigger({ options, label = 'go' }: { options: ToastOptions; label?: string }) {
  const { show } = useToast();
  return (
    <button type="button" onClick={() => show(options)}>
      {label}
    </button>
  );
}

const flush = () => act(() => vi.advanceTimersByTimeAsync(0));

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('mounts an empty polite, atomic status region before any toast is shown', () => {
    render(
      <ToastProvider>
        <p>page</p>
      </ToastProvider>,
    );
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.getAttribute('aria-atomic')).toBe('true');
    expect(status.textContent).toBe('');
    expect(status.hasAttribute('inert')).toBe(false);
  });

  it('announces the message in the same status region, which stays mounted', () => {
    render(
      <ToastProvider>
        <Trigger options={{ message: 'Erledigt' }} />
      </ToastProvider>,
    );
    const before = screen.getByRole('status');
    fireEvent.click(screen.getByRole('button', { name: 'go' }));
    const status = screen.getByRole('status');
    expect(status).toBe(before);
    expect(status.textContent).toContain('Erledigt');
    expect(status.hasAttribute('inert')).toBe(false);
    expect(status.className).toContain('is-open');
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(status.className).not.toContain('is-open');
    // The live region itself is never inert; only the visible body is when closed.
    expect(status.hasAttribute('inert')).toBe(false);
    expect(status.querySelector('.toast-body')?.hasAttribute('inert')).toBe(true);
  });

  it('dismisses after the duration', () => {
    render(
      <ToastProvider>
        <Trigger options={{ message: 'Erledigt', duration: 3000 }} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'go' }));
    const status = screen.getByRole('status');
    act(() => {
      vi.advanceTimersByTime(2900);
    });
    expect(status.className).toContain('is-open');
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(status.className).not.toContain('is-open');
  });

  it('pauses the timer while the pointer is over the toast and restarts on leave', () => {
    render(
      <ToastProvider>
        <Trigger options={{ message: 'Erledigt', duration: 3000 }} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'go' }));
    const status = screen.getByRole('status');
    const body = status.querySelector('.toast-body') as HTMLElement;
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    fireEvent.pointerEnter(body);
    act(() => {
      vi.advanceTimersByTime(20000);
    });
    expect(status.className).toContain('is-open');
    fireEvent.pointerLeave(body);
    act(() => {
      vi.advanceTimersByTime(2900);
    });
    expect(status.className).toContain('is-open');
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(status.className).not.toContain('is-open');
  });

  it('pauses while focus is inside and restarts when focus leaves', () => {
    render(
      <>
        <button type="button">outside</button>
        <ToastProvider>
          <Trigger options={{ message: 'Erledigt', actionLabel: 'Rückgängig', duration: 3000 }} />
        </ToastProvider>
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'go' }));
    const status = screen.getByRole('status');
    const undo = screen.getByRole('button', { name: 'Rückgängig' });
    act(() => undo.focus());
    act(() => {
      vi.advanceTimersByTime(20000);
    });
    expect(status.className).toContain('is-open');
    act(() => screen.getByRole('button', { name: 'outside' }).focus());
    act(() => {
      vi.advanceTimersByTime(3100);
    });
    expect(status.className).not.toContain('is-open');
  });

  it('stays paused when the pointer leaves but focus is still inside', () => {
    render(
      <ToastProvider>
        <Trigger options={{ message: 'Erledigt', actionLabel: 'Rückgängig', duration: 3000 }} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'go' }));
    const status = screen.getByRole('status');
    const body = status.querySelector('.toast-body') as HTMLElement;
    fireEvent.pointerEnter(body);
    act(() => screen.getByRole('button', { name: 'Rückgängig' }).focus());
    fireEvent.pointerLeave(body);
    act(() => {
      vi.advanceTimersByTime(20000);
    });
    expect(status.className).toContain('is-open');
  });

  it('runs the action once and dismisses', () => {
    const onAction = vi.fn();
    render(
      <ToastProvider>
        <Trigger options={{ message: 'Erledigt', actionLabel: 'Rückgängig', onAction }} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'go' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status').className).not.toContain('is-open');
  });

  it('Escape on the action button dismisses without running the action', () => {
    const onAction = vi.fn();
    render(
      <ToastProvider>
        <Trigger options={{ message: 'Erledigt', actionLabel: 'Rückgängig', onAction }} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'go' }));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Rückgängig' }), { key: 'Escape' });
    expect(onAction).not.toHaveBeenCalled();
    expect(screen.getByRole('status').className).not.toContain('is-open');
  });

  it('a new toast replaces the current one and restarts the timer', () => {
    function Two() {
      const { show } = useToast();
      return (
        <>
          <button type="button" onClick={() => show({ message: 'Eins', duration: 3000 })}>
            eins
          </button>
          <button type="button" onClick={() => show({ message: 'Zwei', duration: 3000 })}>
            zwei
          </button>
        </>
      );
    }
    render(
      <ToastProvider>
        <Two />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'eins' }));
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    fireEvent.click(screen.getByRole('button', { name: 'zwei' }));
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('Zwei');
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(status.className).toContain('is-open');
  });

  it('renders inside an open modal panel so it stays reachable while the page is inert', async () => {
    // jsdom has no showModal; the panel falls back to the `open` attribute.
    HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
    const onAction = vi.fn();
    function App({ open }: { open: boolean }) {
      return (
        <ToastProvider>
          <Trigger options={{ message: 'Erledigt', actionLabel: 'Rückgängig', onAction }} />
          <SidePanel open={open} onClose={() => {}} title="Details">
            <p>inhalt</p>
          </SidePanel>
        </ToastProvider>
      );
    }
    const { rerender } = render(<App open={false} />);
    expect(document.querySelector('dialog')?.contains(screen.getByRole('status'))).toBe(false);
    rerender(<App open />);
    await flush();
    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.contains(screen.getByRole('status'))).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'go' }));
    expect(dialog.textContent).toContain('Erledigt');
    fireEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));
    expect(onAction).toHaveBeenCalled();
    // Closing the panel moves the region back to the page.
    rerender(<App open={false} />);
    await flush();
    expect(document.querySelector('dialog')?.contains(screen.getByRole('status'))).toBe(false);
  });
});
