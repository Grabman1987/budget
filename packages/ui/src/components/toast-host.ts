import { useEffect, useSyncExternalStore } from 'react';

/**
 * Where the toast is rendered. A modal `<dialog>` (side panel, bottom sheet) makes everything
 * outside of itself inert, and the top layer does not change that: a toast next to the dialog
 * could be seen but neither clicked nor focused. Overlays therefore register a host element inside
 * themselves while they are open, and the toast is portalled into the innermost one.
 */
const hosts: HTMLElement[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Register a host element; returns the unregister function. Later hosts win (stacked overlays). */
export function registerToastHost(element: HTMLElement): () => void {
  hosts.push(element);
  emit();
  return () => {
    const index = hosts.lastIndexOf(element);
    if (index >= 0) hosts.splice(index, 1);
    emit();
  };
}

/** The element the toast should render into, or null for the page itself. */
export function useToastHost(): HTMLElement | null {
  return useSyncExternalStore(
    subscribe,
    () => hosts[hosts.length - 1] ?? null,
    () => null,
  );
}

/** Register `element` as toast host while `active`. */
export function useRegisterToastHost(element: HTMLElement | null, active: boolean): void {
  useEffect(() => {
    if (!element || !active) return undefined;
    return registerToastHost(element);
  }, [element, active]);
}
