import type { FxReference, FxTransferInput, FxTransferPreview } from '@budget/db';
import { maskMoneyText, useAmountPrivacy } from '@budget/ui';
import { longDay, nativeCurrency } from './format';

function Reference({ value }: { value: FxReference | null }) {
  if (!value) return <>EUR-Bewertung nicht verfügbar: datierter Referenzkurs fehlt.</>;
  return <>{value.currency} · {maskMoneyText(String(value.rateMicro / 1_000_000))} EUR je Einheit ·
    {' '}{longDay(value.date)} · {maskMoneyText(value.source)}{value.date !== value.asOf ? ' · letzter Kurs vor dem Bewertungstag' : ''}</>;
}
/** Actual cash, quote comparison and dated value effects stay visibly separate. */
export function FxTransferReadout({ input, preview, accountNames = {}, categoryNames = {} }: {
  input: FxTransferInput;
  preview: Omit<FxTransferPreview, 'revision'>;
  accountNames?: Record<string, string>;
  categoryNames?: Record<string, string>;
}) {
  useAmountPrivacy();
  const value = preview.valuation;
  return <section aria-labelledby="fx-facts-title" className="fx-facts">
    <h2 id="fx-facts-title">Tatsächliche Buchungsangaben</h2>
    <dl className="kv-list">
      <div><dt>Abgang Hauptbetrag</dt><dd>{maskMoneyText(accountNames[input.fromAccountId] ?? 'Abgangskonto')} · {nativeCurrency(-input.fromAmountCents, input.fromCurrency, true)}</dd></div>
      <div><dt>Zugang Hauptbetrag</dt><dd>{maskMoneyText(accountNames[input.toAccountId] ?? 'Zugangskonto')} · {nativeCurrency(input.toAmountCents, input.toCurrency, true)}</dd></div>
      <div><dt>Ausführungstag</dt><dd>{longDay(input.date)}</dd></div>
      <div><dt>Dokumentierter Kurs</dt><dd>{maskMoneyText(`1 ${input.fromCurrency} = ${input.quotedRate} ${input.toCurrency}`)}</dd></div>
      <div><dt>Rechnerischer Zugang laut Kurs</dt><dd>{maskMoneyText(`${preview.theoreticalDestination.replace('.', ',')} ${input.toCurrency}`)} · nicht als Betrag gebucht</dd></div>
      <div><dt>Abweichung tatsächlicher Zugang − Kursrechnung</dt><dd>{maskMoneyText(`${preview.quoteDifferenceDestination.replace('.', ',')} ${input.toCurrency}`)}{preview.quoteMatchesNative ? ' · exakt' : ' · Originalbetrag bleibt unverändert'}</dd></div>
      <div><dt>Nachweis</dt><dd>{maskMoneyText(input.provenance)}</dd></div>
      <div><dt>Budgetkategorie des Hauptbetrags</dt><dd>{input.categoryId ? maskMoneyText(categoryNames[input.categoryId] ?? 'Gespeicherte Hauptbetragskategorie') : 'Tracking-interner Hauptbetrag ohne Budgetkategorie'}</dd></div>
      <div><dt>EUR-Referenz Abgang</dt><dd><Reference value={value.from} /></dd></div>
      <div><dt>EUR-Referenz Zugang</dt><dd><Reference value={value.to} /></dd></div>
      <div><dt>Hauptbeträge zu diesen Referenzen</dt><dd>{nativeCurrency(value.fromEurCents, 'EUR')} → {nativeCurrency(value.toEurCents, 'EUR')}</dd></div>
      <div><dt>Ausführungs-/Werteffekt Zugang − Abgang</dt><dd>{nativeCurrency(value.executionEffectEurCents, 'EUR', true)}</dd></div>
      <div><dt>Getrennte tatsächliche Gebühr</dt><dd>{input.fee ? <>
        {maskMoneyText(accountNames[input.fee.accountId] ?? 'Gebührenkonto')} · {nativeCurrency(-input.fee.amountCents,
          input.fee.accountId === input.fromAccountId ? input.fromCurrency : input.toCurrency, true)} · {longDay(input.fee.date)} · {maskMoneyText(input.fee.provenance)}
        <br />Ausgabenkategorie: {maskMoneyText(categoryNames[input.fee.categoryId] ?? 'Gespeicherte Gebührenkategorie')}
        <br /><Reference value={value.fee} /> · EUR-Kosten {nativeCurrency(value.feeEurCents, 'EUR')}
      </> : 'Ausdrücklich keine getrennte Gebühr'}</dd></div>
    </dl>
    <p>Die Kursrechnung verändert keinen Originalbetrag. Der EUR-Werteffekt ist eine Bewertung der beiden Hauptbeträge, keine zusätzliche Gebühr und keine Einnahmenbuchung. Nur die nachgewiesene getrennte Gebühr belastet das Gebührenkonto zusätzlich.</p>
    <p>EUR folgt dem gespeicherten Referenzkurs am oder vor dem jeweiligen Tag; nur EUR selbst verwendet den Faktor eins. Intern bleiben die Hauptbeträge in einer gemeinsamen Portfolio-Abgrenzung ohne externe Einzahlung oder Entnahme. Der Werteffekt und die echte Gebühr bleiben im Wertverlauf enthalten.</p>
  </section>;
}

export function FxReportingEffect({ asOf, from, to, effect }: {
  asOf: string; from: FxReference | null; to: FxReference | null; effect: number | null;
}) {
  return <section aria-labelledby="fx-reporting-title">
    <h2 id="fx-reporting-title">Werteffekt zum Bewertungstag {longDay(asOf)}</h2>
    <p>{effect === null ? 'EUR-Werteffekt nicht verfügbar. Die Originalbeträge bleiben lesbar.' : nativeCurrency(effect, 'EUR', true)}</p>
    <p><Reference value={from} /><br /><Reference value={to} /></p>
    <p>Diese Auskunft bewertet dieselben Hauptbeträge neu. Sie verändert weder die Buchungen noch den beim Speichern festgehaltenen Nachweis.</p>
  </section>;
}
