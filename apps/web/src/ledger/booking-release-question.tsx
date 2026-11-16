import { Button } from '@budget/ui';
import { useId, type Ref } from 'react';

export const BOOKING_RELEASE_TITLE = 'Geprüfte Buchung wirklich bearbeiten?';

/** Shared by the opening gate and a release requested again inside the editor. */
export function BookingReleaseQuestion({
  questionRef,
  className = 'kdiff bk-discard kdelete-question',
  onCancel,
  onConfirm,
}: {
  questionRef?: Ref<HTMLDivElement>;
  className?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const reasonId = useId();
  return (
    <div
      ref={questionRef}
      className={className}
      role="alertdialog"
      aria-label={BOOKING_RELEASE_TITLE}
      aria-describedby={reasonId}
    >
      <p>
        <strong>{BOOKING_RELEASE_TITLE}</strong>
      </p>
      <p id={reasonId}>
        Diese Buchung ist abgeglichen. Änderungen oder Löschen können den geprüften Kontostand
        verändern. Bei Kontaktanteilen kann auch der Kontaktsaldo betroffen sein. Die Änderung wird
        protokolliert und kann rückgängig gemacht werden.
      </p>
      <Button variant="ghost" onClick={onCancel}>
        Abbrechen
      </Button>
      <Button onClick={onConfirm}>Bearbeitung freigeben</Button>
    </div>
  );
}
