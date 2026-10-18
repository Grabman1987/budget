import type { InboxEntry } from './api';

type Glyph = { label: string; path: string };

const GLYPHS = {
  booking: {
    label: 'Umsatz ohne Kategorie',
    path: 'M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6',
  },
  bank: {
    label: 'Bankumsatz',
    path: 'M3 10 12 4l9 6 M5 10v8 M9.5 10v8 M14.5 10v8 M19 10v8 M3 20h18',
  },
  savings: { label: 'Sparplan', path: 'M3 17l6-6 4 4 8-8 M15 7h6v6' },
  check: {
    label: 'Datenprüfung',
    path: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7.5v6 M12 16.5v.01',
  },
  value: {
    label: 'Veralteter Wert',
    path: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 2',
  },
  consent: {
    label: 'Einwilligung',
    path: 'M7 3h8l4 4v14H7z M15 3v4h4 M10 14l2 2 3-4',
  },
  repeat: {
    label: 'Wiederkehrende Zahlung',
    path: 'M4 11a8 8 0 0 1 14-4l2 2 M20 4v5h-5 M20 13a8 8 0 0 1-14 4l-2-2 M4 20v-5h5',
  },
  contact: {
    label: 'Kontakt',
    path: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21c0-4 3.5-6 8-6s8 2 8 6',
  },
  reconciliation: {
    label: 'Kontoprüfung',
    path: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M8 12.5l3 3 5-6',
  },
  backup: {
    label: 'Sicherung',
    path: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  },
  payslip: {
    label: 'Gehaltszettel',
    path: 'M7 3h10v18H7z M10 8h4 M10 12h4 M10 16h2',
  },
  task: {
    label: 'Aufgabe',
    path: 'M8 6h12 M8 12h12 M8 18h12 M4 6h.01 M4 12h.01 M4 18h.01',
  },
} satisfies Record<string, Glyph>;

type Entry = Pick<InboxEntry, 'type'> & { kind?: string; refType?: string | null };

/** The kind of work an inbox row stands for; shared by the icon and its accessible name. */
export function inboxTypeLabel(entry: Entry): string {
  return glyphFor(entry).label;
}

function glyphFor(entry: Entry): Glyph {
  if (entry.type === 'booking') return GLYPHS.booking;
  if (entry.type === 'savings') return GLYPHS.savings;
  if (entry.refType === 'bank-sync-candidate') return GLYPHS.bank;
  if (entry.refType === 'payslip-intake') return GLYPHS.payslip;
  switch (entry.kind) {
    case 'import':
      return GLYPHS.check;
    case 'stale_value':
      return GLYPHS.value;
    case 'consent':
      return GLYPHS.consent;
    case 'expected_payment':
      return GLYPHS.repeat;
    case 'receivable':
      return GLYPHS.contact;
    case 'reconciliation':
      return GLYPHS.reconciliation;
    case 'backup':
      return GLYPHS.backup;
    default:
      return GLYPHS.task;
  }
}

/** Type icon of an inbox row (replaces the A–I revision triangles). Colour comes from CSS. */
export function InboxTypeIcon({ entry }: { entry: Entry }) {
  const glyph = glyphFor(entry);
  return (
    <svg
      className="inbox-type"
      viewBox="0 0 24 24"
      role="img"
      aria-label={glyph.label}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={glyph.path} />
    </svg>
  );
}
