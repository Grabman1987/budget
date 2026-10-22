import { Button, Field, Select, TextInput, maskMoneyText, useAmountPrivacy } from '@budget/ui';
import type { FxTransferInput, FxTransferPreview } from '@budget/db';
import { parseAmount, todayInVienna } from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { useBlocker } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/http';
import { useBudgetWrite } from '../budget/use-category-writes';
import { KONTEN_BUCHUNGEN_META } from '../nav/pages';
import { PageFrame } from '../pages/placeholder-page';
import { AppLink } from '../shell/app-link';
import { accountsQuery, lookupsQuery } from './queries';
import { ErrorNote, LoadingNote } from './states';
import { postFxTransfer, previewFxTransfer } from './fx-transfer-api';
import { FxTransferReadout } from './fx-transfer-readout';
import './fx-transfer-preparation.css';

interface Facts {
  sourceId: string; destinationId: string; date: string;
  sourceAmount: string; destinationAmount: string; rate: string; provenance: string;
  categoryId: string; confirmed: boolean;
  feeMode: '' | 'none' | 'separate' | 'unsupported'; feeAccountId: string; feeAmount: string;
  feeDate: string; feeProvenance: string; feeCategoryId: string;
}
const EMPTY: Facts = {
  sourceId: '', destinationId: '', date: '', sourceAmount: '', destinationAmount: '', rate: '', provenance: '',
  categoryId: '', confirmed: false, feeMode: '', feeAccountId: '', feeAmount: '', feeDate: '', feeProvenance: '', feeCategoryId: '',
};
const actualDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().startsWith(value) && value <= todayInVienna();
// Raw native facts only: no arithmetic, fractional-cent rounding or blur rewriting.
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

/** Explicit manual facts → dated preview → one idempotent atomic action. */
export function FxTransferPreparationPage() {
  const hidden = useAmountPrivacy();
  const accounts = useQuery(accountsQuery()), lookups = useQuery(lookupsQuery());
  const [facts, setFacts] = useState<Facts>(EMPTY);
  const [reviewed, setReviewed] = useState(false);
  const [preview, setPreview] = useState<{ input: FxTransferInput; result: FxTransferPreview }>();
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [delivery, setDelivery] = useState<{ key: string; input: FxTransferInput; revision: string }>();
  const [saved, setSaved] = useState<string>();
  const generation = useRef(0), saving = useRef(false);
  const write = useBudgetWrite();
  const dirty = !saved && JSON.stringify(facts) !== JSON.stringify(EMPTY);
  const blocker = useBlocker({ shouldBlockFn: () => busy || Boolean(delivery) || dirty,
    withResolver: true, enableBeforeUnload: () => busy || Boolean(delivery) || dirty });
  useEffect(() => {
    if (blocker.status !== 'blocked') return;
    if (busy || delivery) blocker.reset();
    else if (window.confirm('Ungespeicherte FX-Angaben verwerfen?')) blocker.proceed();
    else blocker.reset();
  }, [blocker, busy, delivery]);
  useEffect(() => {
    generation.current++;
    setPreview(undefined);
  }, [accounts.dataUpdatedAt, lookups.dataUpdatedAt]);
  const change = <K extends keyof Facts>(key: K, value: Facts[K]) => {
    generation.current++;
    setFacts((previous) => ({ ...previous, [key]: value,
      ...(key === 'sourceId' || key === 'destinationId' ? {
        ...(key === 'sourceId' ? { sourceAmount: '' } : { destinationAmount: '' }),
        rate: '', provenance: '', categoryId: '', confirmed: false,
        feeAccountId: '', feeAmount: '', feeCategoryId: '', feeProvenance: '',
      } : {}),
      ...(key === 'feeAccountId' ? { feeAmount: '', feeProvenance: '' } : {}),
    }));
    setPreview(undefined); setError(undefined); setReviewed(false);
  };
  const available = (accounts.data?.accounts ?? []).filter((row) => !row.closedAt &&
    ['checking', 'savings', 'cash'].includes(row.type) && ['EUR', 'USD'].includes(row.currency));
  const source = available.find((row) => row.id === facts.sourceId);
  const destination = available.find((row) => row.id === facts.destinationId);
  const feeAccounts = available.filter((row) => row.id === facts.sourceId || row.id === facts.destinationId);
  const feeAccount = feeAccounts.find((row) => row.id === facts.feeAccountId);
  const categories = (lookups.data?.categories ?? []).filter((row) => !['income', 'advance', 'card_payment'].includes(row.kind));
  const categoryOptions = categories.map((row) => <option key={row.id} value={row.id}>{maskMoneyText(row.name)}</option>);
  const from = nativeAmount(facts.sourceAmount), to = nativeAmount(facts.destinationAmount), fee = nativeAmount(facts.feeAmount);
  const boundary = source && destination && source.onBudget !== destination.onBudget;
  const problems: string[] = [];
  if (!source || !destination || source.id === destination.id || source.currency === destination.currency)
    problems.push('Wähle zwei unterschiedliche offene EUR-/USD-Geldkonten mit verschiedenen Währungen.');
  if (!actualDay(facts.date)) problems.push('Gib den tatsächlichen Ausführungstag ein, spätestens heute.');
  if (!from.ok || from.cents <= 0 || !to.ok || to.cents <= 0)
    problems.push('Gib beide positiven Hauptbeträge ohne Gebühren in ihrer Originalwährung ein.');
  if (!/^\d+(?:[.,]\d+)?$/.test(facts.rate.trim())) problems.push('Gib den dokumentierten positiven Kurs ausdrücklich an.');
  if (!facts.provenance.trim()) problems.push('Gib den Nachweis für Hauptbeträge und Kurs an.');
  if (!facts.confirmed) problems.push('Bestätige die tatsächlichen Hauptbeträge ohne eingebettete Gebühren.');
  if (boundary && !facts.categoryId) problems.push('Wähle die Budgetkategorie für den Hauptbetrag.');
  if (facts.feeMode === '' || facts.feeMode === 'unsupported')
    problems.push('Keine oder getrennt bezahlte Gebühr ausdrücklich wählen. Eingebettete oder unklare Belastungen müssen manuell geklärt werden.');
  if (facts.feeMode === 'separate' && (!feeAccount || !fee.ok || fee.cents <= 0 || !actualDay(facts.feeDate) ||
    !facts.feeProvenance.trim() || !facts.feeCategoryId || facts.feeCategoryId === facts.categoryId))
    problems.push('Die getrennte Gebühr benötigt Konto, positiven Originalbetrag, tatsächlichen Tag, eigenen Nachweis und eine eigene Ausgabenkategorie.');
  const choicesFresh = Boolean(accounts.data && lookups.data && !accounts.isFetching && !lookups.isFetching && !accounts.isError && !lookups.isError);
  const frozen = busy || Boolean(delivery) || Boolean(saved);
  const prepare = async () => {
    setReviewed(true); setError(undefined);
    if (problems.length || !choicesFresh || saving.current || !source || !destination || !from.ok || !to.ok) return;
    const input: FxTransferInput = { fromAccountId: source.id, toAccountId: destination.id,
      fromCurrency: source.currency as 'EUR' | 'USD', toCurrency: destination.currency as 'EUR' | 'USD',
      date: facts.date, fromAmountCents: from.cents, toAmountCents: to.cents,
      quotedRate: facts.rate.trim(), orientation: 'destination/source', provenance: facts.provenance.trim(),
      principalAmountsConfirmed: true, feeTreatment: facts.feeMode === 'separate' ? 'separate' : 'none',
      ...(boundary ? { categoryId: facts.categoryId } : {}),
      ...(facts.feeMode === 'separate' && fee.ok ? { fee: { accountId: facts.feeAccountId, amountCents: fee.cents,
        date: facts.feeDate, categoryId: facts.feeCategoryId, provenance: facts.feeProvenance.trim() } } : {}),
    };
    const current = generation.current;
    saving.current = true; setBusy(true); setPreview(undefined);
    try {
      const result = await previewFxTransfer(input);
      if (current === generation.current) setPreview({ input, result });
    } catch (failure) { if (current === generation.current) setError(failure); }
    finally { saving.current = false; setBusy(false); }
  };
  const save = async () => {
    if (saving.current || saved || (!delivery && (!preview || !choicesFresh))) return;
    const attempt = delivery ?? { key: crypto.randomUUID(), input: preview!.input, revision: preview!.result.revision };
    setDelivery(attempt); setBusy(true); saving.current = true; setError(undefined);
    let failure: unknown;
    const result = await write(() => postFxTransfer(attempt.input, attempt.revision, attempt.key).catch((caught: unknown) => {
      failure = caught; throw caught;
    }), () => 'FX-Übertrag als eine Aktion gespeichert.');
    if (result) { setSaved(result.fromBookingId); setDelivery(undefined); }
    else {
      setError(failure ?? new Error('Der Speicherstand ist unklar. Mit demselben Sendeschlüssel erneut versuchen.'));
      if (failure instanceof ApiError && failure.status > 0 && failure.status < 500) {
        setDelivery(undefined); setPreview(undefined);
      }
    }
    saving.current = false; setBusy(false);
  };
  const options = available.map((row) => <option key={row.id} value={row.id}>{maskMoneyText(row.name)} · {row.currency}</option>);
  const names = Object.fromEntries((accounts.data?.accounts ?? []).map((row) => [row.id, row.name]));
  const categoryNames = Object.fromEntries((lookups.data?.categories ?? []).map((row) => [row.id, row.name]));
  return <PageFrame meta={KONTEN_BUCHUNGEN_META} title="Fremdwährungsübertrag" subtitle="Tatsächliche EUR-/USD-Hauptbeträge und getrennte Gebühren" detail>
    <div className="kview fx-preparation">
      <AppLink className="btn btn-ghost" to="/konten/buchungen">Zurück zu Buchungen</AppLink>
      <p>Beide Originalbeträge werden unverändert gebucht. Ein dokumentierter Kurs erklärt die Ausführung; ein EUR-Referenzkurs ersetzt keinen fehlenden Originalbetrag oder Kurs.</p>
      <p>Eingebettete Gebühren, unklare Abzüge, andere Währungen und andere Nachkommastellen bleiben zur manuellen Klärung. Es gibt hier keine automatische Bankzuordnung.</p>
      {accounts.isPending && <LoadingNote what="Konten" />}
      {lookups.isPending && <LoadingNote what="Kategorien" />}
      {accounts.isError && <ErrorNote what="Konten" error={accounts.error} onRetry={() => void accounts.refetch()} />}
      {lookups.isError && <ErrorNote what="Kategorien" error={lookups.error} onRetry={() => void lookups.refetch()} />}
      <form onSubmit={(event) => { event.preventDefault(); void prepare(); }}>
        <fieldset disabled={!choicesFresh || frozen}>
          <legend>Hauptbeträge</legend>
          <p>Originalbeträge mit Dezimalkomma und höchstens zwei Nachkommastellen. Beträge werden weder berechnet noch gerundet.</p>
          <div className="fx-preparation-grid">
            <Field label="Abgangskonto">{({ id }) => <Select id={id} value={facts.sourceId} onChange={(event) => change('sourceId', event.target.value)}><option value="">Konto wählen</option>{options}</Select>}</Field>
            <Field label="Zugangskonto">{({ id }) => <Select id={id} value={facts.destinationId} onChange={(event) => change('destinationId', event.target.value)}><option value="">Konto wählen</option>{options}</Select>}</Field>
            <NativeAmountField label="Abgang Hauptbetrag" currency={source?.currency} disabled={!source} value={facts.sourceAmount} onChange={(value) => change('sourceAmount', value)} />
            <NativeAmountField label="Zugang Hauptbetrag" currency={destination?.currency} disabled={!destination} value={facts.destinationAmount} onChange={(value) => change('destinationAmount', value)} />
          </div>
          <Field label="Tatsächlicher Ausführungstag">{({ id }) => <TextInput id={id} type="date" max={todayInVienna()} value={facts.date} onChange={(event) => change('date', event.target.value)} />}</Field>
          <Field label={source && destination ? `Dokumentierter Kurs · 1 ${source.currency} in ${destination.currency}` : 'Dokumentierter Kurs · Zielwährung je Einheit Quellwährung'}>{({ id }) => <TextInput id={id} type={hidden ? 'password' : 'text'} inputMode="decimal" maxLength={40} value={facts.rate} onChange={(event) => change('rate', event.target.value)} />}</Field>
          <Field label="Nachweis für Hauptbeträge und Kurs">{({ id }) => <TextInput id={id} type={hidden ? 'password' : 'text'} maxLength={500} value={facts.provenance} onChange={(event) => change('provenance', event.target.value)} />}</Field>
          {boundary && <Field label="Budgetkategorie des Hauptbetrags">{({ id }) => <Select id={id} value={facts.categoryId} onChange={(event) => change('categoryId', event.target.value)}><option value="">Kategorie wählen</option>{categoryOptions}</Select>}</Field>}
          <label><input type="checkbox" checked={facts.confirmed} onChange={(event) => change('confirmed', event.target.checked)} /> Beide Hauptbeträge sind tatsächlich ausgeführt und enthalten keine eingebettete Gebühr. Eine dokumentierte Kursabweichung verändert keinen Originalbetrag.</label>
        </fieldset>
        <fieldset disabled={!choicesFresh || frozen}>
          <legend>Getrennt bezahlte Gebühr</legend>
          <Field label="Gebühr laut Nachweis">{({ id }) => <Select id={id} value={facts.feeMode} onChange={(event) => change('feeMode', event.target.value as Facts['feeMode'])}>
            <option value="">Bitte ausdrücklich wählen</option><option value="none">Keine getrennte Gebühr</option><option value="separate">Getrennte tatsächliche Belastung</option><option value="unsupported">Eingebettete oder unklare Belastung · manuell klären</option>
          </Select>}</Field>
          {facts.feeMode === 'separate' && <>
            <Field label="Mit der Gebühr belastetes Konto">{({ id }) => <Select id={id} value={facts.feeAccountId} onChange={(event) => change('feeAccountId', event.target.value)}><option value="">Konto wählen</option>{feeAccounts.map((row) => <option key={row.id} value={row.id}>{maskMoneyText(row.name)} · {row.currency}</option>)}</Select>}</Field>
            <NativeAmountField label="Tatsächlich getrennt bezahlte Gebühr" currency={feeAccount?.currency} disabled={!feeAccount} value={facts.feeAmount} onChange={(value) => change('feeAmount', value)} />
            <Field label="Tatsächlicher Gebührentag">{({ id }) => <TextInput id={id} type="date" max={todayInVienna()} value={facts.feeDate} onChange={(event) => change('feeDate', event.target.value)} />}</Field>
            <Field label="Eigene Ausgabenkategorie der Gebühr">{({ id }) => <Select id={id} value={facts.feeCategoryId} onChange={(event) => change('feeCategoryId', event.target.value)}><option value="">Kategorie wählen</option>{categoryOptions.filter((option) => option.key !== facts.categoryId)}</Select>}</Field>}
            <Field label="Nachweis der getrennten Belastung">{({ id }) => <TextInput id={id} type={hidden ? 'password' : 'text'} maxLength={500} value={facts.feeProvenance} onChange={(event) => change('feeProvenance', event.target.value)} />}</Field>
          </>}
        </fieldset>
        <Button type="submit" disabled={!choicesFresh || frozen}>{busy ? 'Angaben werden verarbeitet …' : 'Angaben und EUR-Werteffekt prüfen'}</Button>
      </form>
      {reviewed && problems.length > 0 && <div role="alert"><p>Diese Angaben fehlen oder müssen korrigiert werden:</p><ul>{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul></div>}
      {error !== undefined && <ErrorNote what={delivery ? 'Speicherstand unklar' : 'FX-Übertrag'} error={error}
        onRetry={() => { if (delivery) void save(); else void prepare(); }} />}
      {preview && <>
        <FxTransferReadout input={preview.input} preview={preview.result} accountNames={names} categoryNames={categoryNames} />
        <p>Barbuchungen sind bestätigt. Bankseiten und Bankgebühren bleiben bis zur ausdrücklichen Bestätigung vorgemerkt. Hauptbeträge und Gebühr bleiben gemeinsam löschbar und als gesamte Aktion rückgängig zu machen.</p>
      </>}
      {!saved && (preview || delivery) && <Button disabled={busy || (!delivery && !choicesFresh)} onClick={() => void save()}>
        {busy ? 'Wird gespeichert …' : delivery ? 'Speicherstand mit demselben Sendeschlüssel klären' : 'Beide Hauptbeträge und tatsächliche Gebühr speichern'}
      </Button>}
      {delivery && !busy && <p role="alert">Der Ausgang des Speicherns ist noch unklar. Angaben und Sendeschlüssel bleiben gesperrt; erneut versuchen, damit kein zweiter Übertrag entsteht.</p>}
      {saved && <section role="status"><p>Als eine Aktion gespeichert. Rückgängig und Wiederholen stehen in der Bestätigung bereit.</p>
        <AppLink className="btn" to={`/konten/fx-uebertrag/${encodeURIComponent(saved)}`}>Gespeicherte FX-Angaben öffnen</AppLink>
        <Button variant="ghost" onClick={() => { setSaved(undefined); setFacts(EMPTY); setPreview(undefined); setReviewed(false); setError(undefined); }}>Weiteren Übertrag erfassen</Button>
      </section>}
    </div>
  </PageFrame>;
}
