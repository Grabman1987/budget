import type { PanelId } from './panels';

export type PanelSearch = { panel?: PanelId | undefined };

/**
 * A panel opened by an in-app link pushes a history entry that carries `panelOpenedInApp` in the
 * browser's history state. Closing then steps back (the panel disappears and no duplicate entry is
 * left). A panel opened by URL (deep link, reload of a fresh tab) has no such flag and is closed by
 * replacing the URL. The flag lives in history state, not in a module variable, so it survives
 * reloads and belongs to exactly one entry.
 */
declare module '@tanstack/history' {
  interface HistoryState {
    panelOpenedInApp?: boolean;
  }
}
