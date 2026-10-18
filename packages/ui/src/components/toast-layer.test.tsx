// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast } from './toast';
import { registerToastHost } from './toast-host';

function Trigger({ label, message }: { label: string; message: string }) {
  const { show } = useToast();
  return (
    <button type="button" onClick={() => show({ message, duration: 60000 })}>
      {label}
    </button>
  );
}

function makeHost(): HTMLElement {
  const host = document.createElement('div');
  document.body.append(host);
  return host;
}

const openToast = () => document.querySelector('.toast.is-open') as HTMLElement | null;

describe('toast layers', () => {
  const cleanups: Array<() => void> = [];
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanups.splice(0).forEach((fn) => fn());
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  const register = (host: HTMLElement) => {
    let off = () => {};
    act(() => {
      off = registerToastHost(host);
    });
    cleanups.push(off);
    return () => act(off);
  };

  function setup() {
    render(
      <ToastProvider>
        <Trigger label="go" message="Erledigt" />
      </ToastProvider>,
    );
  }

  it('a toast raised on the page stays out of a host registered afterwards', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'go' }));
    const host = makeHost();
    register(host);
    expect(openToast()).not.toBeNull();
    expect(host.contains(openToast())).toBe(false);
    expect(openToast()?.textContent).toContain('Erledigt');
  });

  it('a toast raised after a host registered renders inside it', () => {
    setup();
    const host = makeHost();
    register(host);
    fireEvent.click(screen.getByRole('button', { name: 'go' }));
    expect(host.contains(openToast())).toBe(true);
  });

  it('falls back to the page when its host unregisters', () => {
    setup();
    const host = makeHost();
    const unregister = register(host);
    fireEvent.click(screen.getByRole('button', { name: 'go' }));
    expect(host.contains(openToast())).toBe(true);
    unregister();
    expect(openToast()).not.toBeNull();
    expect(host.contains(openToast())).toBe(false);
  });

  it('falls back to the nearest remaining host, and is not taken over by a later host', () => {
    setup();
    const outer = makeHost();
    const inner = makeHost();
    register(outer);
    const unregisterInner = register(inner);
    fireEvent.click(screen.getByRole('button', { name: 'go' }));
    expect(inner.contains(openToast())).toBe(true);
    unregisterInner();
    expect(outer.contains(openToast())).toBe(true);
    // A new overlay at the same depth does not pick up the toast of the one that closed.
    const next = makeHost();
    register(next);
    expect(outer.contains(openToast())).toBe(true);
    expect(next.contains(openToast())).toBe(false);
  });

  it('keeps one live region, in the innermost host while no toast is open', () => {
    setup();
    const host = makeHost();
    register(host);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(host.contains(screen.getByRole('status'))).toBe(true);
  });
});
