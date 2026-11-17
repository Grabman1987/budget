import {
  type StatementCas,
  type StatementFacts,
  type StatementPurchaseCheck,
} from '@budget/domain';
import { Button, useAmountPrivacy } from '@budget/ui';
import { useEffect, useState } from 'react';
import { onApiWrite, request } from '../api/http';
import { nativeCurrency, longDay } from '../ledger/format';
import { errorText } from '../ledger/labels';

type Reply = {
  check: StatementPurchaseCheck;
  omittedBookings: number;
  extractionIncomplete: boolean;
};
export function StatementPurchaseReview({
  intakeId,
  source,
  facts,
  password,
  disabled,
}: {
  intakeId: string;
  source: StatementCas;
  facts: StatementFacts | null;
  password: string;
  disabled: boolean;
}) {
  useAmountPrivacy();
  const [result, setResult] = useState<{ signature: string; reply: Reply } | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => onApiWrite(() => setResult(null)), []);
  const signature = JSON.stringify([source, facts]);
  const reply = result?.signature === signature ? result.reply : null;
  const check = reply?.check;
  const money = (value: number) => nativeCurrency(value, 'EUR');
  const bookingLink = (id: string) =>
    `/konten/buchungen?konto=${encodeURIComponent(source.accountId)}&buchung=${encodeURIComponent(id)}`;
  async function run() {
    if (!facts || busy || disabled) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const reply = await request<Reply>(
        'POST',
        `/api/statement-intake/${encodeURIComponent(intakeId)}/purchase-check`,
        { ...source, facts, ...(password ? { password } : {}) },
      );
      setResult({ signature, reply });
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="statement-purchase-check"
      aria-label="Kartenkäufe abgleichen"
      aria-busy={busy}
    >
      <h3>Kartenkäufe abgleichen</h3>
      <p>
        Vergleicht die aktuellen Angaben mit den gebuchten Kartenkäufen. Der Abgleich erstellt keine
        Buchung und bestätigt keine Zahlung.
      </p>
      <Button variant="ghost" disabled={disabled || busy || !facts} onClick={() => void run()}>
        {busy ? 'Abgleich läuft …' : 'Kartenkäufe jetzt abgleichen'}
      </Button>
      {error && <p role="alert">{error}</p>}
      {result && !reply && <p>Angaben geändert. Bitte erneut abgleichen.</p>}
      {check && reply && (
        <div role="status">
          {!check.period && (
            <p>
              Zeitraum nicht angegeben: Die Zyklussumme kann nicht geprüft werden. Bitte den
              Abrechnungszeitraum ergänzen.
            </p>
          )}
          {check.period && (
            <p>
              {longDay(check.period.from)} – {longDay(check.period.to)} (einschließlich)
            </p>
          )}
          {reply.omittedBookings > 0 ? (
            <p>
              Abgleich unvollständig: {reply.omittedBookings} Buchungen mit Umbuchungsanteilen oder
              anderer Währung sind offen.
            </p>
          ) : check.sumMatches === true ? (
            <p>Summe stimmt</p>
          ) : check.sumMatches === false ? (
            <p>Summe weicht ab: {money(check.differenceCents!)}</p>
          ) : (
            <p>Summenprüfung offen.</p>
          )}
          {check.bookedPurchaseCents !== null && (
            <p>
              Gebuchte Käufe abzüglich Gutschriften: {money(check.bookedPurchaseCents)} ·
              Abrechnungsbetrag:{' '}
              {check.printedTotalCents === null
                ? 'nicht angegeben'
                : money(check.printedTotalCents)}
            </p>
          )}
          {!check.linesAvailable && (
            <p>
              Positionen nicht vollständig lesbar. Ein Einzelabgleich ist offen; eine passende Summe
              allein beweist keine vollständige Zuordnung.
            </p>
          )}
          {check.linesAvailable && <p>{check.matched.length} Positionen eindeutig zugeordnet.</p>}
          <ul>
            {check.statementOnly.map(({ line, ambiguous }) => (
              <li key={line.id}>
                {line.description} · {line.date ? longDay(line.date) : 'Datum offen'} ·{' '}
                {money(line.amountCents)}:{' '}
                {!check.linesAvailable || reply.omittedBookings > 0
                  ? 'Einzelabgleich unvollständig – bitte prüfen.'
                  : ambiguous
                    ? 'Zuordnung mehrdeutig – bitte prüfen.'
                    : 'Keine Buchung gefunden.'}
                {!ambiguous &&
                  check.linesAvailable &&
                  reply.omittedBookings === 0 &&
                  line.amountCents < 0 && (
                    <a
                      className="btn btn-ghost"
                      href={`/erfassen?${new URLSearchParams({ konto: source.accountId, betrag: String(line.amountCents / 100), empfaenger: line.description.slice(0, 200) })}`}
                    >
                      Fehlenden Kauf erfassen
                    </a>
                  )}
                {!ambiguous &&
                  check.linesAvailable &&
                  reply.omittedBookings === 0 &&
                  line.amountCents >= 0 && (
                    <a
                      className="btn btn-ghost"
                      href={`/erfassen?konto=${encodeURIComponent(source.accountId)}`}
                    >
                      Gutschrift erfassen
                    </a>
                  )}
              </li>
            ))}
            {check.amountDifferences.map(({ line, booking, differenceCents }) => (
              <li key={line.id}>
                {line.description}: Betrag weicht ab · {money(differenceCents)}{' '}
                <a className="btn btn-ghost" href={bookingLink(booking.id)}>
                  Buchung öffnen
                </a>
              </li>
            ))}
            {check.bookingOnly.map((booking) => (
              <li key={booking.id}>
                {booking.description} · {longDay(booking.date)} · {money(booking.amountCents)}:{' '}
                {check.linesAvailable
                  ? 'Ohne eindeutige Abrechnungsposition.'
                  : 'Einzelabgleich offen.'}{' '}
                <a className="btn btn-ghost" href={bookingLink(booking.id)}>
                  Buchung öffnen
                </a>
              </li>
            ))}
          </ul>
          {check.matched.length > 0 && (
            <details>
              <summary>Zugeordnete Positionen</summary>
              <ul>
                {check.matched.map(({ line, booking }) => (
                  <li key={line.id}>
                    {line.description} · {money(line.amountCents)}{' '}
                    <a className="btn btn-ghost" href={bookingLink(booking.id)}>
                      Buchung öffnen
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p>
            Nach Änderungen an Buchungen erneut abgleichen. Datum und Kategorie beim Erfassen
            prüfen; es wird keine Ausgleichsbuchung vorgeschlagen.
          </p>
        </div>
      )}
    </section>
  );
}
