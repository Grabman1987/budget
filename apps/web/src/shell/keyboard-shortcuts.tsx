import { WideDialog } from '@budget/ui';
import { CAPTURE_SHORTCUT_HINT, FLAG_KEY, FLAG_LABEL } from '../ledger/labels';
import { BOOKING_FLAGS } from '../ledger/types';

/** Lists existing keyboard flows; flag keys and capture copy share their original sources. */
export function KeyboardShortcuts({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <WideDialog open={open} onClose={onClose} title="Tastenkürzel">
      <p>Strg gilt unter macOS als ⌘.</p>
      <dl className="shortcut-list">
        <dt>Strg K / ⌘K</dt>
        <dd>Globale Suche öffnen</dd>
        <dt>N</dt>
        <dd>Neue Buchung</dd>
        <dt>Strg Umschalt H</dt>
        <dd>Datenschutz-Modus umschalten</dd>
        <dt>?</dt>
        <dd>Tastenkürzel anzeigen (außerhalb von Eingabefeldern)</dd>
        <dt>↑ / ↓ · Enter · Esc</dt>
        <dd>Suche und Auswahllisten: auswählen, öffnen, schließen</dd>
        <dt>← / →</dt>
        <dd>Heute / Plan: Monat wechseln, wenn kein Eingabefeld oder Dialog aktiv ist</dd>
        <dt>Alt Umschalt ← / →</dt>
        <dd>Vorherigen / nächsten Report öffnen</dd>
        <dt>Buchung erfassen</dt>
        <dd>{CAPTURE_SHORTCUT_HINT}</dd>
        <dt>Markierungen (geöffnete Auswahl)</dt>
        <dd>
          {BOOKING_FLAGS.map((flag) => `${FLAG_KEY[flag]} ${FLAG_LABEL[flag]}`).join(' · ')} · 0 /
          Entf / Rücktaste: keine
        </dd>
        <dt>Tab / Umschalt Tab</dt>
        <dd>Nächstes / vorheriges Bedienelement</dd>
        <dt>Diagramme: ← / → · Pos1 / Ende</dt>
        <dd>Datenpunkte lesen · Esc schließt die Erklärung</dd>
        <dt>Konten / Kategorien sortieren: ↑ / ↓</dt>
        <dd>Konto, Kategorie oder Gruppe über den fokussierten Griff verschieben</dd>
      </dl>
    </WideDialog>
  );
}
