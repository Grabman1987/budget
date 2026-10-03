import { formatDecimal, cents, parseAmount } from '@budget/domain';
import { AmountInput, Button, Field, SectionHead, TextInput } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { request } from '../api/http';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { useRuleWrite } from './use-rule-writes';

interface Settings {
  birthMonth: string;
  pension: { month: string; amountCents: number }[];
}

export function BookInputForm() {
  const query = useQuery({
    queryKey: ['rules', 'inputs'],
    queryFn: () => request<Settings>('GET', '/api/rules/inputs'),
  });
  return (
    <section className="rw-sec" aria-labelledby="book-inputs">
      <SectionHead id="book-inputs" title="Daten für die Buchregeln" />
      <p className="rw-sub">
        Freiwillige private Angaben, nur in deiner Datenbank. Arbeitgeberbeiträge je Monat erfassen,
        auch 0. Einen Jahresbetrag nach den tatsächlichen Monatsbeiträgen aufteilen.
      </p>
      {query.isPending && <LoadingNote what="Regeldaten" />}
      {query.isError && (
        <ErrorNote what="Regeldaten" error={query.error} onRetry={() => void query.refetch()} />
      )}
      {query.data && <Inputs key={JSON.stringify(query.data)} settings={query.data} />}
    </section>
  );
}

function Inputs({ settings }: { settings: Settings }) {
  const [birthMonth, setBirth] = useState(settings.birthMonth);
  const [month, setMonth] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const write = useRuleWrite();
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const parsed = parseAmount(amount);
    if (month && (!parsed.ok || parsed.cents < 0 || parsed.cents > 100_000_000)) {
      setError('Bitte einen Beitrag zwischen 0 und 1.000.000 € eingeben.');
      return;
    }
    setError(undefined);
    setBusy(true);
    await write(
      () =>
        request<Settings & { groupId: string }>('PATCH', '/api/rules/inputs', {
          ...(birthMonth !== settings.birthMonth ? { birthMonth } : {}),
          ...(month && parsed.ok ? { pension: [{ month, amountCents: parsed.cents }] } : {}),
        }),
      () => 'Regeldaten gespeichert.',
    );
    setBusy(false);
  };
  return (
    <form className="kform rw-form" onSubmit={(event) => void submit(event)}>
      <Field
        label="Geburtsmonat und Jahr"
        hint="Für R18; kein Geburtstag erforderlich. Ohne Angabe nicht bewertbar."
      >
        {({ id, describedBy }) => (
          <TextInput
            id={id}
            type="month"
            value={birthMonth}
            aria-describedby={describedBy}
            disabled={busy}
            onChange={(e) => setBirth(e.target.value)}
          />
        )}
      </Field>
      <Field label="Beitragsmonat" hint="Vorhandene Monate können korrigiert werden.">
        {({ id, describedBy }) => (
          <TextInput
            id={id}
            type="month"
            value={month}
            aria-describedby={describedBy}
            disabled={busy}
            onChange={(e) => {
              setMonth(e.target.value);
              const current = settings.pension.find((r) => r.month === e.target.value);
              setAmount(current ? formatDecimal(cents(current.amountCents)) : '');
            }}
          />
        )}
      </Field>
      <AmountInput
        label="Arbeitgeberbeitrag Pensionskasse"
        value={amount}
        onChange={setAmount}
        error={error}
      />
      <Button type="submit" disabled={busy || (birthMonth === settings.birthMonth && !month)}>
        Speichern
      </Button>
      {settings.pension.length > 0 && (
        <table className="kv-table">
          <caption>Gespeicherte Arbeitgeberbeiträge</caption>
          <thead>
            <tr>
              <th>Monat</th>
              <th>Beitrag (€)</th>
            </tr>
          </thead>
          <tbody>
            {settings.pension.map((r) => (
              <tr key={r.month}>
                <td>{r.month}</td>
                <td>{formatDecimal(cents(r.amountCents))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </form>
  );
}
