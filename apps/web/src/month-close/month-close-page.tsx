import { useAmountPrivacy, AmountInput, Button, Field, TextInput, TitleBlock } from '@budget/ui';
import { formatDecimal, cents, parseAmount, todayInVienna, type CloseWork } from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { useState } from 'react';
import { request } from '../api/http';
import { budgetQuery } from '../budget/budget-api';
import { EnvelopeBody } from '../budget/envelope-panel';
import { planRows } from '../budget/plan-model';
import { useBudgetWrite } from '../budget/use-category-writes';
import { InboxWorkflow } from '../inbox/inbox-page';
import { fetchAccounts } from '../ledger/api';
import { eur, longDay, nativeCurrency } from '../ledger/format';
import { LEDGER_KEY } from '../ledger/queries';
import { ReconcileFlow } from '../ledger/reconcile-panel';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { monthLabel } from '../nav/month';
import { AppLink } from '../shell/app-link';
import { monthCloseQuery, saveMonthClose, type MonthCloseView } from './api';
import { CloseStepper, CLOSE_STATUS } from './stepper';
import './month-close.css';

export function MonthClosePage() {
  const { month } = useParams({ strict: false }) as { month: string };
  const query = useQuery(monthCloseQuery(month));
  useAmountPrivacy();
  return (
    <>
      <TitleBlock
        title={`Monatsabschluss · ${monthLabel(month)}`}
        titleOnMobile
        fields={[{ label: 'Stichtag', value: query.data ? longDay(query.data.end) : '…' }]}
      />
      <nav className="close-breadcrumb" aria-label="Brotkrumen">
        <AppLink to="/plan/monat" search={{ monat: month }}>
          Plan › {monthLabel(month)}
        </AppLink>
        {' › '}
        <span aria-current="page">Monatsabschluss</span>
      </nav>
      {query.isPending && <LoadingNote what="Monatsabschluss" />}
      {query.isError && (
        <ErrorNote
          what="Monatsabschluss"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.data && <CloseFlow key={month} data={query.data} />}
    </>
  );
}

function CloseFlow({ data }: { data: MonthCloseView }) {
  const write = useBudgetWrite();
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [deferring, setDeferring] = useState<CloseWork[] | null>(null);
  const step = data.state.currentStep;
  const status = data.steps[step - 1]!;
  const budget = useQuery({ ...budgetQuery(data.month), enabled: step === 3 });
  const accounts = useQuery({
    queryKey: [...LEDGER_KEY, 'close-accounts', data.asOf],
    queryFn: () => fetchAccounts(data.asOf),
    enabled: step === 2,
  });
  const rows = budget.data ? planRows(budget.data) : [];
  const open = data.work.filter(
    (w) =>
      w.step === step &&
      !data.state.decisions.some(
        (d) => d.step === w.step && d.id === w.id && d.fingerprint === w.fingerprint,
      ),
  );
  const select = async (currentStep: number) => {
    if (busy) return;
    setBusy(true);
    if (
      await write(
        () => saveMonthClose(data.month, { currentStep }),
        () => 'Fortschritt gespeichert.',
      )
    ) {
      setSelected(null);
      setDeferring(null);
      requestAnimationFrame(() => document.getElementById('close-step-title')?.focus());
    }
    setBusy(false);
  };
  return (
    <div className="month-close">
      <p>Zuerst den Monat prüfen, dann den nächsten planen. Dein Fortschritt bleibt gespeichert.</p>
      <CloseStepper steps={data.steps} current={step} onSelect={(s) => void select(s)} />
      <section aria-labelledby="close-step-title" className="close-body">
        <h2 id="close-step-title" tabIndex={-1}>
          {step}. {status.title}
        </h2>
        <p role="status">
          {CLOSE_STATUS[status.status]}
          {status.openCount > 0 ? ` · ${status.openCount} offen` : ''}
        </p>
        {status.reasons.map((reason) => (
          <p key={reason}>Grund: {reason}</p>
        ))}
        {step === 1 && (
          <>
            <p>
              Ordne die offenen Buchungen zu und prüfe die Vorschläge. Du bestätigst jede Änderung
              selbst.
            </p>
            <AppLink to="/reports/gesamttabelle" search={{ monat: data.month }}>
              {data.inbox.length} offene Aufgaben im Monat
            </AppLink>
            <InboxWorkflow entryIds={data.inbox.map((e) => e.id)} />
          </>
        )}
        {step === 2 && (
          <>
            <p>
              Vergleiche die Kontostände zum {longDay(data.end)}. Manuelle Anlagen erhalten einen
              aktuellen Wert.
            </p>
            {data.end > todayInVienna() && (
              <p>Der Monatsletzte steht noch bevor. Du kannst vorbereiten und später fortsetzen.</p>
            )}
            {accounts.isPending && <LoadingNote what="Konten" />}
            {accounts.isError && (
              <ErrorNote
                what="Konten"
                error={accounts.error}
                onRetry={() => void accounts.refetch()}
              />
            )}
            {data.accounts.map((a) => {
              const work = data.work.find((w) => w.step === 2 && w.id === a.id);
              const decision =
                work &&
                data.state.decisions.find(
                  (d) => d.step === 2 && d.id === a.id && d.fingerprint === work.fingerprint,
                );
              const account = accounts.data?.accounts.find((r) => r.id === a.id);
              return (
                <div className="close-row" key={a.id}>
                  <h3>{a.name}</h3>
                  <AppLink to="/reports/vermoegen-schulden" search={{ monat: data.month }}>
                    {nativeCurrency(a.manual ? a.valueCents : a.balanceCents, a.currency)}
                  </AppLink>
                  <p>
                    {a.manual
                      ? `Wert zuletzt: ${a.lastValuedOn ? longDay(a.lastValuedOn) : 'noch nicht erfasst'}`
                      : `Zuletzt geprüft: ${a.lastReconciledOn ? longDay(a.lastReconciledOn) : 'noch nie'}`}
                  </p>
                  <p>
                    {a.done
                      ? 'erledigt'
                      : decision
                        ? `übersprungen mit Grund: ${decision.reason}`
                        : 'offen'}
                  </p>
                  {!a.done && (
                    <div className="close-actions">
                      <Button
                        variant="ghost"
                        disabled={(!a.manual && !account) || busy}
                        onClick={() => setSelected(selected === a.id ? null : a.id)}
                      >
                        {selected === a.id
                          ? 'Einklappen'
                          : a.manual
                            ? 'Wert aktualisieren'
                            : 'Kontostand prüfen'}
                      </Button>
                      {work && !decision && (
                        <Button
                          variant="ghost"
                          disabled={busy}
                          onClick={() => setDeferring([work])}
                        >
                          Nicht nötig · Grund angeben
                        </Button>
                      )}
                    </div>
                  )}
                  {selected === a.id &&
                    (a.manual ? (
                      <ManualValue
                        accountId={a.id}
                        end={data.end}
                        valueCents={a.valueCents}
                        currency={a.currency}
                        onDone={() => setSelected(null)}
                      />
                    ) : (
                      account && (
                        <ReconcileFlow
                          key={a.id}
                          account={account}
                          initialDate={data.end}
                          onDone={() => setSelected(null)}
                        />
                      )
                    ))}
                </div>
              );
            })}
            {data.accounts.length === 0 && <p>Keine offenen Konten zu prüfen.</p>}
          </>
        )}
        {step === 3 && (
          <>
            <p>
              Decke überzogene Kategorien mit verfügbarem Geld. Die Quellvorschläge zeigen das
              größte freie Guthaben zuerst.
            </p>
            {budget.isPending && <LoadingNote what="Plan" />}
            {budget.isError && (
              <ErrorNote what="Plan" error={budget.error} onRetry={() => void budget.refetch()} />
            )}
            {rows
              .filter((r) => r.overspentCents > 0)
              .map((r) => (
                <div className="close-row" key={r.id}>
                  <h3>{r.name}</h3>
                  <AppLink to="/reports/kategorien" search={{ monat: data.month, kategorie: r.id }}>
                    {eur(-r.overspentCents)} überzogen
                  </AppLink>
                  <div className="close-actions">
                    <Button
                      variant="ghost"
                      onClick={() => setSelected(selected === r.id ? null : r.id)}
                    >
                      {selected === r.id ? 'Einklappen' : 'Geld verschieben'}
                    </Button>
                  </div>
                  {selected === r.id && budget.data && (
                    <EnvelopeBody
                      key={`${data.month}:${r.id}`}
                      month={data.month}
                      row={r}
                      rows={rows}
                      tba={budget.data.summary.toBeAssignedCents}
                      onDone={() => setSelected(null)}
                    />
                  )}
                </div>
              ))}
            {budget.data && data.overspent.length === 0 && <p>Keine Kategorie ist überzogen.</p>}
          </>
        )}
        {step > 3 && <p>Dieser Schritt folgt. Der Monatsabschluss ist noch nicht vollständig.</p>}
        {step === 1 && open.length > 0 && (
          <Button variant="ghost" disabled={busy} onClick={() => setDeferring(open)}>
            Rest ausdrücklich aufschieben
          </Button>
        )}
        {step === 3 && open.length > 0 && (
          <Button variant="ghost" disabled={busy} onClick={() => setDeferring(open)}>
            Übertrag akzeptieren · Grund angeben
          </Button>
        )}
        {deferring && (
          <DeferForm
            key={deferring.map((w) => w.id).join(':')}
            month={data.month}
            work={deferring}
            onDone={() => setDeferring(null)}
          />
        )}
      </section>
      <div className="close-footer">
        <AppLink to="/plan/monat" search={{ monat: data.month }} className="btn btn-ghost">
          Verlassen
        </AppLink>
        {step < 5 && (
          <Button disabled={busy || status.status === 'open'} onClick={() => void select(step + 1)}>
            Weiter
          </Button>
        )}
      </div>
    </div>
  );
}

function DeferForm({
  month,
  work,
  onDone,
}: {
  month: string;
  work: CloseWork[];
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const write = useBudgetWrite();
  return (
    <form
      className="kform close-exception"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        void write(
          () => saveMonthClose(month, { decisions: work.map((w) => ({ ...w, reason })) }),
          () => 'Ausnahme mit Grund gespeichert.',
        ).then((result) => {
          setBusy(false);
          if (result) onDone();
        });
      }}
    >
      <Field label="Grund">
        {({ id }) => (
          <TextInput
            id={id}
            value={reason}
            maxLength={500}
            required
            onChange={(e) => setReason(e.target.value)}
          />
        )}
      </Field>
      <p>
        {work.length} offene Einträge bleiben unverändert. Neue oder geänderte Arbeit wird wieder
        offen angezeigt.
      </p>
      <div className="close-actions">
        <Button type="submit" disabled={busy || reason.trim().length === 0}>
          Grund speichern
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onDone}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}

function ManualValue({
  accountId,
  end,
  valueCents,
  currency,
  onDone,
}: {
  accountId: string;
  end: string;
  valueCents: number;
  currency: string;
  onDone: () => void;
}) {
  const [date, setDate] = useState(end);
  const [text, setText] = useState(formatDecimal(cents(valueCents)));
  const [busy, setBusy] = useState(false);
  const write = useBudgetWrite();
  const amount = parseAmount(text);
  return (
    <form
      className="kform"
      onSubmit={(event) => {
        event.preventDefault();
        if (!amount.ok || amount.cents < 0) return;
        setBusy(true);
        void write(
          () =>
            request<{ groupId: string }>(
              'PUT',
              `/api/accounts/${encodeURIComponent(accountId)}/valuation`,
              { date, valueCents: amount.cents },
            ),
          () => 'Wert aktualisiert.',
        ).then((result) => {
          setBusy(false);
          if (result) onDone();
        });
      }}
    >
      <Field label="Stichtag">
        {({ id }) => (
          <TextInput
            id={id}
            type="date"
            value={date}
            max={todayInVienna()}
            required
            onChange={(e) => setDate(e.target.value)}
          />
        )}
      </Field>
      <AmountInput
        label={`Wert in ${currency}`}
        currency={currency}
        value={text}
        onChange={setText}
      />
      <p>Erfasst den Wert der Anlage. Es wird keine Buchung angelegt.</p>
      <Button
        type="submit"
        disabled={
          busy || text.trim() === '' || !amount.ok || amount.cents < 0 || date > todayInVienna()
        }
      >
        Wert speichern
      </Button>
    </form>
  );
}
