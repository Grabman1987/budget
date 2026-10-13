// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LoadOlder } from './load-older';

afterEach(() => vi.unstubAllGlobals());
it('loads the next page on intersection, pauses while fetching, and disconnects on unmount', () => {
  let intersect!: IntersectionObserverCallback;
  let observers = 0;
  const disconnect = vi.fn();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        observers++;
        intersect = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  const load = vi.fn(async () => undefined);
  const { rerender, unmount } = render(<LoadOlder fetching={false} failed={false} load={load} />);
  expect(intersect).toBeTypeOf('function');
  act(() =>
    intersect(
      [{ isIntersecting: true }] as IntersectionObserverEntry[],
      {} as IntersectionObserver,
    ),
  );
  expect(load).toHaveBeenCalledTimes(1);
  rerender(<LoadOlder fetching failed={false} load={load} />);
  // No new observer is registered while a page is in flight.
  expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true);
  expect(observers).toBe(1);
  expect(load).toHaveBeenCalledTimes(1);
  rerender(<LoadOlder fetching={false} failed load={load} />);
  expect(screen.getByRole('button').hasAttribute('disabled')).toBe(false);
  expect(observers).toBe(1);
  expect(load).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Weitere Buchungen laden' }));
  expect(load).toHaveBeenCalledTimes(2);
  unmount();
  expect(disconnect).toHaveBeenCalled();
});
