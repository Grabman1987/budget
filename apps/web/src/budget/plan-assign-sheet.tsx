import { AmountInput, Button } from '@budget/ui';
import { cents, formatDecimal } from '@budget/domain';
import { useEffect, useRef, useState } from 'react';
import { eur } from '../ledger/format';
import { assignGhost } from './assign-cell';
import { assignGuard, readAssign, type PlanRow } from './plan-model';

/**
 * Phone-only full-screen "Zuweisen" (#1007): the amount input with calculator of the capture
 * sheet and a decimal keypad. It only collects the value; the caller commits it with the same
 * assign mutation the inline cell uses.
 */
export function PlanAssignSheet({
  row,
  tba,
  onCommit,
  onDetails,
  onClose,
}: {
  row: PlanRow;
  /** "Zu verteilen" of the month, for the non-blocking overdraft hint. */
  tba: number;
  onCommit: (value: number) => void;
  onDetails: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(document.activeElement);
  const [text, setText] = useState(formatDecimal(cents(row.assignedCents)));
  const [invalid, setInvalid] = useState(false);
  // A leading + / − is relative only when typed first into the untouched (selected) or emptied field, as inline.
  const [relative, setRelative] = useState(false);
  const touched = useRef(false);
  const ghost = assignGhost(row);
  const value = readAssign(text, row.assignedCents, relative);
  const hint = value === null ? undefined : assignGuard(value, row.assignedCents, tba).message;

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (!element.open) element.showModal();
    const input = element.querySelector<HTMLInputElement>('.amount-input');
    if (input) {
      input.inputMode = 'decimal';
      input.focus();
      input.select();
    }
    // Mobile keyboards do not resize 100dvh on iOS: keep the action bar above the keyboard.
    const viewport = window.visualViewport;
    const fit = () => {
      element.style.setProperty(
        '--plan-assign-height',
        `${viewport?.height ?? window.innerHeight}px`,
      );
      element.style.setProperty('--plan-assign-top', `${viewport?.offsetTop ?? 0}px`);
    };
    fit();
    viewport?.addEventListener('resize', fit);
    viewport?.addEventListener('scroll', fit);
    const previous = opener.current;
    return () => {
      viewport?.removeEventListener('resize', fit);
      viewport?.removeEventListener('scroll', fit);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  const save = () => {
    if (value === null) return setInvalid(true);
    onCommit(value);
    onClose();
  };
  return (
    <dialog
      ref={dialog}
      className="plan-assign-sheet"
      aria-label={`Zuweisen für ${row.name}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Enter in the amount field assigns */}
      <form
        className="plan-assign-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
        onKeyDown={(event) => {
          // The amount field swallows Enter (it only evaluates); a complete amount also assigns.
          if (
            event.key === 'Enter' &&
            event.target instanceof HTMLInputElement &&
            event.target.classList.contains('amount-input')
          )
            save();
        }}
      >
        <header className="plan-assign-head">
          <h2>Zuweisen</h2>
          <Button variant="ghost" onClick={onClose}>
            Schließen
          </Button>
        </header>
        <p className="plan-assign-name">{row.name}</p>
        <dl className="plan-assign-figures">
          <div>
            <dt>Zugewiesen</dt>
            <dd>{eur(row.assignedCents)}</dd>
          </div>
          <div>
            <dt>Aktivität</dt>
            <dd>{eur(row.activityCents)}</dd>
          </div>
          <div>
            <dt>Verfügbar</dt>
            <dd>{eur(row.availableCents)}</dd>
          </div>
        </dl>
        <AmountInput
          label="Neu zugewiesen"
          showOperators
          value={text}
          onChange={(next) => {
            const signed = /^\s*[+\-−]/.test(next);
            setRelative(signed && (!touched.current || text === '' || relative));
            touched.current = true;
            setText(next);
            setInvalid(false);
          }}
        />
        {invalid && (
          <p className="plan-assign-note is-error" role="alert">
            Dieser Betrag ist nicht möglich.
          </p>
        )}
        {hint && (
          <p className="plan-assign-note" role="status">
            {hint}
          </p>
        )}
        {ghost && (
          <Button
            variant="ghost"
            onClick={() => {
              setText(formatDecimal(cents(ghost.ghostCents)));
              setInvalid(false);
            }}
          >
            Vorschlag ≈ {eur(ghost.ghostCents)} übernehmen
          </Button>
        )}
        <div className="plan-assign-actions">
          <Button variant="ghost" onClick={onDetails}>
            Details
          </Button>
          <Button type="submit">Zuweisen</Button>
        </div>
      </form>
    </dialog>
  );
}
