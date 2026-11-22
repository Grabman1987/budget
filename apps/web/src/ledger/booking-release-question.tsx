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
  reconciled = !linkedDates,
  relatedReconciliation = false,
  reconciliationDates = [],
  reconciledRepayment = false,
  reviewedOn = [],
}: {
  questionRef?: Ref<HTMLDivElement>;
  className?: string;
  onCancel: () => void;
  onConfirm: () => void;
  /** Set when the booking is an Auslage that repayments of these dates are allocated to. */
  linkedDates?: string[];
  reconciled?: boolean;
  relatedReconciliation?: boolean;
  reconciliationDates?: string[];
  reconciledRepayment?: boolean;
  reviewedOn?: string[];
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
        {reconciled && (
          <>
            {relatedReconciliation ? 'Eine verbundene Umbuchungsseite ist' : 'Diese Buchung ist'}
            {reconciliationDates.length > 0
              ? ` am ${reconciliationDates.map(germanDate).join(', ')}`
              : ''}{' '}
            abgeglichen. Änderungen oder Löschen können den geprüften Kontostand verändern. Bei
            Kontaktanteilen kann auch der Kontaktsaldo betroffen sein.{' '}
          </>
        )}
        {reviewedOn.length > 0 && (
          <>
            Diese Buchung wurde am {reviewedOn.map(germanDate).join(', ')} in Prüfen bestätigt.
            Änderungen oder Löschen können den gebuchten Kontostand verändern.{' '}
          </>
        )}
        {linkedDates && (
          <>
            Diese Auslage ist mit einer Rückzahlung vom {linkedDates.map(germanDate).join(', ')}{' '}
            verknüpft. Passt der neue Betrag noch, bleibt die Zuordnung bestehen. Sonst führt der
            Kontakt den Rest als Guthaben, nichts geht verloren und nichts wird doppelt
            gezählt.{' '}
          </>
        )}
        {reconciledRepayment &&
          'Eine verknüpfte Rückzahlung ist abgeglichen. Ihr gebuchter Betrag bleibt erhalten. '}
        Die Änderung wird protokolliert und kann mit einem Klick rückgängig gemacht werden.
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
