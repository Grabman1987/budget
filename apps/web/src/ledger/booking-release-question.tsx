import { Button } from '@budget/ui';
import { useId, type Ref } from 'react';

export const BOOKING_RELEASE_TITLE = 'Geprüfte Buchung wirklich bearbeiten?';
export const LINKED_RELEASE_TITLE = 'Verknüpfte Auslage wirklich bearbeiten?';

const germanDate = (iso: string) => iso.split('-').reverse().join('.');

/** Shared by the opening gate and a release requested again inside the editor. */
export function BookingReleaseQuestion({
  questionRef,
  className = 'kdiff bk-discard kdelete-question',
  onCancel,
  onConfirm,
  linkedDates,
}: {
  questionRef?: Ref<HTMLDivElement>;
  className?: string;
  onCancel: () => void;
  onConfirm: () => void;
  /** Set when the booking is an Auslage that repayments of these dates are allocated to. */
  linkedDates?: string[];
}) {
  const reasonId = useId();
  const title = linkedDates ? LINKED_RELEASE_TITLE : BOOKING_RELEASE_TITLE;
  return (
    <div
      ref={questionRef}
      className={className}
      role="alertdialog"
      aria-label={title}
      aria-describedby={reasonId}
    >
      <p>
        <strong>{title}</strong>
      </p>
      <p id={reasonId}>
        {linkedDates ? (
          <>
            Diese Auslage ist mit einer Rückzahlung vom {linkedDates.map(germanDate).join(', ')}{' '}
            verknüpft. Passt der neue Betrag noch, bleibt die Zuordnung bestehen. Sonst führt der
            Kontakt den Rest als Guthaben, nichts geht verloren und nichts wird doppelt gezählt. Die
            Änderung wird protokolliert und kann mit einem Klick rückgängig gemacht werden.
          </>
        ) : (
          <>
            Diese Buchung ist abgeglichen. Änderungen oder Löschen können den geprüften Kontostand
            verändern. Bei Kontaktanteilen kann auch der Kontaktsaldo betroffen sein. Die Änderung
            wird protokolliert und kann rückgängig gemacht werden.
          </>
        )}
      </p>
      <Button variant="ghost" onClick={onCancel}>
        Abbrechen
      </Button>
      <Button onClick={onConfirm}>
        {linkedDates ? 'Bearbeitung bestätigen' : 'Bearbeitung freigeben'}
      </Button>
    </div>
  );
}
