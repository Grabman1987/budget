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

export interface PanelDef {
  title: string;
  /** Package that fills the panel with real content. */
  fills: string;
  body: string;
}

export const PANELS: Record<PanelId, PanelDef> = {
  anlageklasse: { title: 'Anlageklasse', fills: '', body: '' },
  anlagegruppe: { title: 'Gruppe', fills: '', body: '' },
  sollquoten: { title: 'Sollquoten', fills: '', body: '' },
  'anlageklasse-archivieren': { title: 'Sollversion und Archivieren', fills: '', body: '' },
  instrument: { title: 'Instrument', fills: '', body: '' },
  posteingang: {
    title: 'Posteingang',
    fills: 'P3 und P4',
    body: 'Offene Entscheidungen erscheinen hier, gruppiert nach Typ.',
  },
  buchung: {
    title: 'Buchung',
    fills: 'P2',
    body: 'Der Buchungsdialog mit Betragsfeld, Empfänger und Kategorie folgt in P2.',
  },
};
