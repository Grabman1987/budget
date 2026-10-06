import { useAmountPrivacy, maskMoneyText } from '@budget/ui';
import { cents, formatDecimal } from '@budget/domain';
import { useRef, useState, type KeyboardEvent } from 'react';
import { eur } from '../ledger/format';
import { monthLabel } from '../nav/month';
import { assignGuard, readAssign, type PlanRow } from './plan-model';

/**
 * Inline "Zugewiesen" of one envelope in one month: the amount as a button, the field while
 * editing (arithmetic allowed, a leading + or − typed first is relative) and the refusal of the
 * assignment guard with the highest amount that is still allowed. `tba` is that month's
 * "Zu verteilen"; `monthKey` keeps the element ids unique when several months are shown.
 */
export function AssignCell({
  row: r,
  tba,
  editing,
  monthKey,
  onEdit,
  onCommit,
}: {
  row: PlanRow;
  tba: number;
  editing: boolean;
  monthKey: string;
  onEdit: (on: boolean) => void;
  onCommit: (value: number) => void;
}) {
  const hidden = useAmountPrivacy();
  const ghost =
    r.assignedCents === 0 && (r.quickAssign?.ghostCents ?? 0) > 0 ? r.quickAssign : null;
  const source = ghost
    ? ghost.ghostSource === 'target'
      ? 'Ziel · noch zu finanzieren (Übertrag berücksichtigt)'
      : `Median der Ausgaben · ${ghost.historyMonths.map(monthLabel).join(', ')} · leere Monate zählen als 0`
    : undefined;
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState(false);
  /** Why the guard refused the typed amount, with the highest amount that is still allowed. */
  const [refused, setRefused] = useState<{ message: string; maxCents: number } | null>(null);
  // A leading + / − is relative only when typed first into an emptied or fully selected field.
  const [relative, setRelative] = useState(false);
  const replacing = useRef(false);
  // Enter or Escape ends the edit; the blur of the field going away must not commit (again).
  const settled = useRef(false);
  const noteId = `refused-${monthKey}-${r.id}`;
  const commit = () => {
    if (settled.current) return;
    const v = readAssign(text, r.assignedCents, relative);
    if (v === null) return setInvalid(true);
    const guard = assignGuard(v, r.assignedCents, tba);
    if (!guard.ok) {
      setInvalid(true);
      return setRefused({ message: guard.message, maxCents: guard.maxCents });
    }
    settled.current = true;
    onCommit(v);
  };
  const noteSelection = (el: HTMLInputElement) => {
    replacing.current =
      el.value === '' || (el.selectionStart === 0 && el.selectionEnd === el.value.length);
  };
  const keys = (e: KeyboardEvent<HTMLInputElement>) => {
    noteSelection(e.currentTarget);
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      settled.current = true;
      onEdit(false);
    }
  };
  return (
    <>
      {editing ? (
        <input
          className="assign-input"
          type={hidden ? 'password' : 'text'}
          inputMode="decimal"
          autoComplete="off"
          // eslint-disable-next-line jsx-a11y/no-autofocus -- the field replaces the button just clicked
          autoFocus
          value={text}
          aria-invalid={invalid}
          aria-describedby={refused ? noteId : undefined}
          aria-label={`Zugewiesen für ${r.name}. Rechnen erlaubt, +50 addiert.`}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            const next = e.target.value;
            const signed = /^\s*[+\-−]/.test(next);
            setRelative(signed && (replacing.current || relative));
            replacing.current = false;
            setText(next);
            setInvalid(false);
            setRefused(null);
          }}
          onKeyDown={keys}
          onSelect={(e) => noteSelection(e.currentTarget)}
          onBlur={commit}
        />
      ) : (
        <button
          type="button"
          className={ghost ? 'assign-btn is-ghost' : 'assign-btn'}
          title={source}
          aria-describedby={ghost ? `${noteId}-source` : undefined}
          aria-label={`Zugewiesen ${eur(r.assignedCents)} für ${r.name} ändern`}
          onClick={() => {
            setText(formatDecimal(cents(r.assignedCents)));
            setRelative(false);
            setRefused(null);
            settled.current = false;
            onEdit(true);
          }}
        >
          {ghost ? `≈ ${eur(ghost.ghostCents)}` : eur(r.assignedCents)}
        </button>
      )}
      {ghost && (
        <span className="sr-only" id={`${noteId}-source`}>
          Vorschlag ≈ {eur(ghost.ghostCents)} · {source}
        </span>
      )}
      {editing && refused && (
        <span className="assign-note" id={noteId} role="alert">
          {maskMoneyText(refused.message)}
          {refused.maxCents > r.assignedCents && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setText(formatDecimal(cents(refused.maxCents)));
                setRelative(false);
                setInvalid(false);
                setRefused(null);
              }}
            >
              {eur(refused.maxCents)} einsetzen
            </button>
          )}
        </span>
      )}
    </>
  );
}
