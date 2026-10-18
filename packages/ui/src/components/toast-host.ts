import { useEffect, useSyncExternalStore } from 'react';

/**
 * Where the toast is rendered. A modal `<dialog>` (side panel, bottom sheet) makes everything
 * outside of itself inert, and the top layer does not change that: a toast next to the dialog
 * could be seen but neither clicked nor focused. Overlays therefore register a host element inside
 * themselves while they are open. A toast stays in the layer it was raised in (see `toast.tsx`):
 * the host stack at the moment it is shown is remembered, so a toast raised on the page is never
 * moved into a dialog that opens afterwards.
 */
let hosts: readonly HTMLElement[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Register a host element; returns the unregister function. Later hosts win (stacked overlays). */
export function registerToastHost(element: HTMLElement): () => void {
  hosts = [...hosts, element];
  emit();
  return () => {
    const index = hosts.lastIndexOf(element);
    if (index >= 0) hosts = hosts.filter((_, i) => i !== index);
    emit();
  };
}

/** The currently registered hosts, outermost first. A new array on every change. */
export function getToastHosts(): readonly HTMLElement[] {
  return hosts;
}

/** Subscribes to the registered hosts, outermost first. */
const NONE: readonly HTMLElement[] = [];

export function useToastHosts(): readonly HTMLElement[] {
  return useSyncExternalStore(subscribe, getToastHosts, () => NONE);
}

/**
 * The host a toast raised with `layers` (the host stack at that moment) belongs in: the innermost
 * of those hosts that is still registered, or null (the page) when none is left.
 */
export function resolveToastHost(
  layers: readonly HTMLElement[],
  registered: readonly HTMLElement[],
): HTMLElement | null {
  for (let i = layers.length - 1; i >= 0; i -= 1) {
    const host = layers[i];
    if (host && registered.includes(host)) return host;
  }
  return null;
}

/** Register `element` as toast host while `active`. */
export function useRegisterToastHost(element: HTMLElement | null, active: boolean): void {
  useEffect(() => {
    if (!element || !active) return undefined;
    return registerToastHost(element);
  }, [element, active]);
}
