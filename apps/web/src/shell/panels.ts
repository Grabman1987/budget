/** Panels that can be opened through the `?panel=` search param. */
export const PANEL_IDS = [
  'posteingang',
  'buchung',
  'anlageklasse',
  'anlagegruppe',
  'sollquoten',
  'anlageklasse-archivieren',
  'instrument',
] as const;
export type PanelId = (typeof PANEL_IDS)[number];

export const isPanelId = (value: unknown): value is PanelId =>
  typeof value === 'string' && (PANEL_IDS as readonly string[]).includes(value);
