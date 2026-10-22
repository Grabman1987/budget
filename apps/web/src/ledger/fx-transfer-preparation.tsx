import { Button, Field, Select, TextInput, useAmountPrivacy } from '@budget/ui';
import { parseAmount, todayInVienna } from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { KONTEN_BUCHUNGEN_META } from '../nav/pages';
import { PageFrame } from '../pages/placeholder-page';
import { AppLink } from '../shell/app-link';
import { nativeCurrency, longDay } from './format';
import { accountsQuery } from './queries';
import { ErrorNote, LoadingNote } from './states';
import './fx-transfer-preparation.css';

interface Facts {
  sourceId: string; destinationId: string; date: string;
  sourceAmount: string; destinationAmount: string; rate: string; provenance: string;
  feeMode: '' | 'none' | 'separate'; feeAccountId: string; feeAmount: string; feeDate: string; feeProvenance: string;
}
const EMPTY: Facts = {
  sourceId: '', destinationId: '', date: '', sourceAmount: '', destinationAmount: '', rate: '', provenance: '',
  feeMode: '', feeAccountId: '', feeAmount: '', feeDate: '', feeProvenance: '',
};
const actualDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().startsWith(value) && value <= todayInVienna();

// Raw de-AT native facts only: no arithmetic, fractional-cent rounding or blur rewriting.
const nativeAmount = (value: string) => parseAmount(
  /^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(value.trim()) ? value.trim() : '',
);
function NativeAmountField({ label, currency, value, disabled, onChange }: {
  label: string; currency: string | undefined; value: string; disabled: boolean; onChange: (value: string) => void;
}) {
  const hidden = useAmountPrivacy();
  return <Field label={`${label}${currency ? ` · ${currency}` : ' · zuerst Konto wählen'}`}>{({ id }) => <TextInput
    id={id} type={hidden ? 'password' : 'text'} inputMode="decimal" autoComplete="off" maxLength={40}
    disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)}
  />}</Field>;
}

/** Lossless comparison only. No rate is inferred, rounded, stored or used to produce a leg. */
function exactRate(value: string): { numerator: bigint; denominator: bigint } | null {
  const text = value.trim();
  if (text.length > 40 || !/^\d+(?:[.,]\d+)?$/.test(text)) return null;
  const [whole = '', fraction = ''] = text.replace(',', '.').split('.');
  const numerator = BigInt(whole + fraction);
  return numerator > 0n ? { numerator, denominator: 10n ** BigInt(fraction.length) } : null;
}

/** Nonwriting preparation of explicit facts. Posting stays in the existing same-currency path. */
export function FxTransferPreparationPage() {
  useAmountPrivacy();
  const accounts = useQuery(accountsQuery());
  const [facts, setFacts] = useState<Facts>(EMPTY);
  const [reviewed, setReviewed] = useState(false);
  const change = <K extends keyof Facts>(key: K, value: Facts[K]) => {
    setFacts((previous) => ({
      ...previous, [key]: value,
      ...(key === 'sourceId' || key === 'destinationId' ? {
        ...(key === 'sourceId' ? { sourceAmount: '' } : { destinationAmount: '' }),
        rate: '', provenance: '', feeAccountId: '', feeAmount: '', feeProvenance: '',
      } : {}),
      ...(key === 'feeAccountId' ? { feeAmount: '', feeProvenance: '' } : {}),
    }));
    setReviewed(false);
  };
  // Preparation is deliberately limited to cash accounts with the application's existing
  // two-decimal native unit. No zero/three-decimal currency adapter is invented here.
  const available = (accounts.data?.accounts ?? []).filter((row) => !row.closedAt &&
    ['checking', 'savings', 'cash'].includes(row.type) && ['EUR', 'USD'].includes(row.currency));
  const source = available.find((row) => row.id === facts.sourceId);
  const destination = available.find((row) => row.id === facts.destinationId);
  const feeAccounts = available.filter((row) => row.id === facts.sourceId || row.id === facts.destinationId);
  const feeAccount = feeAccounts.find((row) => row.id === facts.feeAccountId);
  const from = nativeAmount(facts.sourceAmount), to = nativeAmount(facts.destinationAmount), fee = nativeAmount(facts.feeAmount);
  const rate = exactRate(facts.rate);
  const problems: string[] = [];
  if (!source || !destination || source.id === destination.id || source.currency === destination.currency)
    problems.push('Wähle zwei unterschiedliche offene EUR-/USD-Konten mit verschiedenen Währungen.');
  if (!actualDay(facts.date)) problems.push('Gib den tatsächlichen Ausführungstag ein, spätestens heute.');
  if (!from.ok || from.cents <= 0 || !to.ok || to.cents <= 0)
    problems.push('Gib beide positiven Hauptbeträge ohne Gebühren in ihrer Originalwährung ein.');
  if (!rate) problems.push('Gib den positiven vereinbarten Kurs ausdrücklich als Dezimalzahl ein.');
  if (!facts.provenance.trim()) problems.push('Gib den Nachweis für Hauptbeträge und vereinbarten Kurs an.');
  if (facts.feeMode === '') problems.push('Gib ausdrücklich an, ob eine getrennt bezahlte Gebühr angefallen ist.');
  if (facts.feeMode === 'separate' && (!feeAccount || !fee.ok || fee.cents <= 0 || !actualDay(facts.feeDate) || !facts.feeProvenance.trim()))
    problems.push('Für eine getrennte Gebühr sind belastetes Konto, positiver Originalbetrag, tatsächlicher Tag und Nachweis erforderlich.');
  const exact = from.ok && to.ok && rate
    ? BigInt(to.cents) * rate.denominator === BigInt(from.cents) * rate.numerator : null;
  const options = available.map((row) => <option key={row.id} value={row.id}>{row.name} · {row.currency}</option>);
  return <PageFrame meta={KONTEN_BUCHUNGEN_META} title="Fremdwährungsübertrag vorbereiten" subtitle="Angaben prüfen · noch keine Buchung" detail>
    <div className="kview fx-preparation">
      <AppLink className="btn btn-ghost" to="/konten/buchungen">Zurück zu Buchungen</AppLink>
      <p>Hier kannst du die tatsächlichen Angaben eines EUR-/USD-Übertrags zusammenstellen. Diese Vorbereitung erstellt keine Buchung und wird beim Verlassen nicht gespeichert.</p>
      <p>Eingebettete Gebühren, ein unbekannter Spread und andere Währungen bleiben zur manuellen Klärung. Ein Referenzkurs ersetzt keinen fehlenden vereinbarten Kurs.</p>
      {accounts.isPending && <LoadingNote what="Konten" />}
      {accounts.isError && <ErrorNote what="Konten" error={accounts.error} onRetry={() => void accounts.refetch()} />}
      <form onSubmit={(event) => { event.preventDefault(); setReviewed(true); }}>
        <fieldset disabled={!accounts.data || accounts.isFetching || accounts.isError}>
          <legend>Hauptbeträge</legend>
          <p>Originalbeträge mit Dezimalkomma und höchstens zwei Nachkommastellen eingeben. Beträge werden weder berechnet noch gerundet.</p>
          <div className="fx-preparation-grid">
            <Field label="Abgangskonto">{({ id }) => <Select id={id} value={facts.sourceId} onChange={(event) => change('sourceId', event.target.value)}><option value="">Konto wählen</option>{options}</Select>}</Field>
            <Field label="Zugangskonto">{({ id }) => <Select id={id} value={facts.destinationId} onChange={(event) => change('destinationId', event.target.value)}><option value="">Konto wählen</option>{options}</Select>}</Field>
            <NativeAmountField label="Abgang Hauptbetrag" currency={source?.currency} disabled={!source} value={facts.sourceAmount} onChange={(value) => change('sourceAmount', value)} />
            <NativeAmountField label="Zugang Hauptbetrag" currency={destination?.currency} disabled={!destination} value={facts.destinationAmount} onChange={(value) => change('destinationAmount', value)} />
          </div>
          <Field label="Tatsächlicher Ausführungstag">{({ id }) => <TextInput id={id} type="date" max={todayInVienna()} value={facts.date} onChange={(event) => change('date', event.target.value)} />}</Field>
          <Field label={source && destination ? `Vereinbarter Kurs · 1 ${source.currency} in ${destination.currency}` : 'Vereinbarter Kurs · Zielwährung je Einheit Quellwährung'}>{({ id }) => <TextInput id={id} inputMode="decimal" maxLength={40} value={facts.rate} onChange={(event) => change('rate', event.target.value)} />}</Field>
          <Field label="Nachweis für Hauptbeträge und Kurs">{({ id }) => <TextInput id={id} maxLength={500} value={facts.provenance} onChange={(event) => change('provenance', event.target.value)} placeholder="Referenz der Ausführungsbestätigung" />}</Field>
        </fieldset>
        <fieldset disabled={!accounts.data || accounts.isFetching || accounts.isError}>
          <legend>Getrennt bezahlte Gebühr</legend>
          <Field label="Gebühr laut Nachweis">{({ id }) => <Select id={id} value={facts.feeMode} onChange={(event) => change('feeMode', event.target.value as Facts['feeMode'])}>
            <option value="">Bitte ausdrücklich wählen</option><option value="none">Keine getrennte Gebühr</option><option value="separate">Getrennte tatsächliche Belastung</option>
          </Select>}</Field>
          {facts.feeMode === 'separate' && <>
            <Field label="Mit der Gebühr belastetes Konto">{({ id }) => <Select id={id} value={facts.feeAccountId} onChange={(event) => change('feeAccountId', event.target.value)}><option value="">Konto wählen</option>{feeAccounts.map((row) => <option key={row.id} value={row.id}>{row.name} · {row.currency}</option>)}</Select>}</Field>
            <NativeAmountField label="Tatsächlich getrennt bezahlte Gebühr" currency={feeAccount?.currency} disabled={!feeAccount} value={facts.feeAmount} onChange={(value) => change('feeAmount', value)} />
            <Field label="Tatsächlicher Gebührentag">{({ id }) => <TextInput id={id} type="date" max={todayInVienna()} value={facts.feeDate} onChange={(event) => change('feeDate', event.target.value)} />}</Field>
            <Field label="Nachweis der getrennten Belastung">{({ id }) => <TextInput id={id} maxLength={500} value={facts.feeProvenance} onChange={(event) => change('feeProvenance', event.target.value)} />}</Field>
          </>}
        </fieldset>
        <Button type="submit" disabled={!accounts.data || accounts.isFetching || accounts.isError}>Angaben prüfen</Button>
      </form>
      {reviewed && problems.length > 0 && <div role="alert"><p>Diese Angaben fehlen oder müssen korrigiert werden:</p><ul>{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul></div>}
      {reviewed && problems.length === 0 && source && destination && from.ok && to.ok && <section aria-labelledby="fx-review-title" aria-live="polite">
        <h2 id="fx-review-title">Zusammengestellte Angaben</h2>
        <dl className="kv-list">
          <div><dt>Abgang Hauptbetrag</dt><dd>{source.name} · {nativeCurrency(-from.cents, source.currency, true)}</dd></div>
          <div><dt>Zugang Hauptbetrag</dt><dd>{destination.name} · {nativeCurrency(to.cents, destination.currency, true)}</dd></div>
          <div><dt>Ausführungstag</dt><dd>{longDay(facts.date)}</dd></div>
          <div><dt>Vereinbarter Kurs</dt><dd>1 {source.currency} = {facts.rate} {destination.currency}</dd></div>
          <div><dt>Nachweis</dt><dd>{facts.provenance}</dd></div>
          <div><dt>Getrennte Gebühr</dt><dd>{facts.feeMode === 'none' ? 'Ausdrücklich keine getrennte Gebühr angegeben' : feeAccount && fee.ok ? <>{feeAccount.name} · {nativeCurrency(-fee.cents, feeAccount.currency, true)} · {longDay(facts.feeDate)} · {facts.feeProvenance}</> : 'Nicht vollständig'}</dd></div>
        </dl>
        <p>{exact ? 'Der eingegebene Kurs entspricht exakt dem Verhältnis der beiden Hauptbeträge.' : 'Der eingegebene Kurs entspricht nicht exakt dem Verhältnis der Hauptbeträge. Rundung, Gebühren oder Spread müssen geklärt werden; es wird kein Betrag angepasst.'}</p>
        <p>Die EUR-Bewertung und eine mögliche Abweichung zum datierten Referenzkurs sind hier nicht geprüft. Auch vollständige Angaben geben diesen Übertrag noch nicht zur Buchung frei.</p>
        <p role="status">Keine Buchung erstellt. Die Buchungsregeln für Fremdwährungsüberträge müssen vor dem Speichern festgelegt werden.</p>
      </section>}
    </div>
  </PageFrame>;
}
