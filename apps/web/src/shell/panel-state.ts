import type { PanelId } from './panels';

/**
 * True while the open panel was opened by an in-app link, which pushed a history entry.
 * Closing then steps back (the panel disappears and no duplicate entry is left); a panel opened
 * directly by URL is closed by replacing the URL.
 */
let openedInApp = false;

export const markPanelOpenedInApp = (): void => {
  openedInApp = true;
};
export const consumePanelOpenedInApp = (): boolean => {
  const value = openedInApp;
  openedInApp = false;
  return value;
};
export const resetPanelOpenedInApp = (): void => {
  openedInApp = false;
};

export type PanelSearch = { panel?: PanelId | undefined };
