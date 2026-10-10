import { longDay } from './format';
import type { AccountRow } from './types';

/** Stored owner check and technical source observation; neither implies freshness of the other. */
export function AccountFreshness({
  lastReconciledOn,
  bankBalance,
}: {
  lastReconciledOn: AccountRow['lastReconciledOn'];
  bankBalance:
    Pick<NonNullable<AccountRow['bankBalance']>, 'date' | 'fetchedAt'> | null | undefined;
}) {
  return (
    <div className="fig" role="group" aria-label="Datenstand">
      <small>Kontostand geprüft</small>
      <strong className="muted">
        {lastReconciledOn ? longDay(lastReconciledOn) : 'Unbekannt'}
      </strong>
      <p className="kmeta">Manuelle Prüfung durch den Besitzer</p>
      {!bankBalance ? (
        <p className="kmeta">
          Bank-Sync: {bankBalance === null ? 'Nicht eingerichtet' : 'Unbekannt'}
        </p>
      ) : (
        <>
          <p className="kmeta">
            Technischer Abruf:{' '}
            {bankBalance.fetchedAt
              ? new Date(bankBalance.fetchedAt).toLocaleString('de-AT', {
                  timeZone: 'Europe/Vienna',
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : 'Unbekannt'}
          </p>
          <p className="kmeta">
            Bankstand vom: {bankBalance.date ? longDay(bankBalance.date) : 'Unbekannt'}
          </p>
        </>
      )}
    </div>
  );
}
