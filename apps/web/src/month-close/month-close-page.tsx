import { useAmountPrivacy, Button, Field, TextInput, TitleBlock } from '@budget/ui';
import { todayInVienna, type CloseWork } from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { budgetQuery, assign } from '../budget/budget-api';
import { EnvelopeBody } from '../budget/envelope-panel';
import { planRows } from '../budget/plan-model';
import { useBudgetWrite } from '../budget/use-category-writes';
import { InboxWorkflow } from '../inbox/inbox-page';
import { fetchAccounts } from '../ledger/api';
import { eur, longDay, nativeCurrency } from '../ledger/format';
import { LEDGER_KEY } from '../ledger/queries';
import { ManualValue } from '../ledger/manual-value';
import { ReconcileFlow } from '../ledger/reconcile-panel';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { monthLabel } from '../nav/month';
import { AppLink } from '../shell/app-link';
import {
  monthCloseQuery,
  saveMonthClose,
  confirmUnchangedCloseAccounts,
  reconcileCloseAccount,
  type MonthCloseView,
} from './api';
import { CloseStepper, CLOSE_STATUS } from './stepper';
import { NextMonthPlan } from './next-month-plan';
import { MonthReview } from './month-review';
import './month-close.css';

const STEP_HELP = [
  {
    why: 'Offene Buchungen und Vorschläge brauchen eine Entscheidung.',
    after:
      'Deine Entscheidungen sind gespeichert; ausdrücklich aufgeschobene Aufgaben bleiben sichtbar.',
  },
  {
    why: 'Der Kontostand im Plan soll zum tatsächlichen Stand am Monatsende passen.',
    after:
      'Geprüfte Buchungen bleiben wie bisher abgeglichen. Der Monatsabschluss setzt keine zusätzliche Sperre.',
  },
  {
    why: 'Überzogene Kategorien zeigen, wo Geld fehlt.',
    after:
      'Verschiebungen sind gespeichert; akzeptierte Überziehungen bleiben mit ihrem Grund nachvollziehbar.',
  },
  {
    why: 'Ein verteilter Plan macht den nächsten Monat überschaubar.',
    after:
      'Die übernommenen Zuweisungen stehen im nächsten Monat und lassen sich gemeinsam rückgängig machen.',
  },
  {
    why: 'Die Ergebnisse zeigen, was geprüft wurde und wie der Monat ausgegangen ist.',
    after:
      'Der Abschluss merkt diesen Stand. Buchungen bleiben nach den bisherigen Regeln bearbeitbar.',
  },
] as const;

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
      {query.isFetching && !query.isPending && <LoadingNote what="Aktueller Abschlussstand" />}
      {query.data && (
        <CloseFlow
          key={month}
          data={query.data}
          fresh={query.isSuccess && !query.isFetching}
          onReload={() => void query.refetch()}
        />
      )}
    </>
  );
}

function CloseFlow({
  data,
  fresh,
  onReload,
}: {
  data: MonthCloseView;
  fresh: boolean;
  onReload: () => void;
}) {
  const write = useBudgetWrite();
  const [busy, setBusy] = useState(false);
  const bulkSubmitting = useRef(false);
  const [bulkFailed, setBulkFailed] = useState(false);
  const [dirtyPlan, setDirtyPlan] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [deferring, setDeferring] = useState<CloseWork[] | null>(null);
  // Explicit inspection stays put while a child editor or Plan draft is active.
  const [chosenStep, setChosenStep] = useState<number | null>(null);
  const step = chosenStep ?? data.navigation.currentStep;
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
  const unchanged = data.unchangedConfirmation;
  const groupedIds = new Set(
    unchanged && unchanged.accounts.length <= 500 ? unchanged.accounts.map((row) => row.id) : [],
  );
  const confirmUnchanged = async () => {
    if (
      bulkSubmitting.current ||
      busy ||
      !fresh ||
      selected !== null ||
      bulkFailed ||
      !unchanged?.accounts.length ||
      unchanged.accounts.length > 500
    )
      return;
    // Capture exactly the displayed cohort and its source revision, never a later refreshed set.
    const captured = {
      accountIds: unchanged.accounts.map((row) => row.id),
      asOf: unchanged.asOf,
      revision: unchanged.revision,
    };
    bulkSubmitting.current = true;
    setBusy(true);
    try {
      const result = await write(
        () => confirmUnchangedCloseAccounts(data.month, captured),
        (saved) => `${saved.reconciliations.length} unveränderte Kontostände gemeinsam bestätigt.`,
      );
      if (!result) setBulkFailed(true);
    } finally {
      bulkSubmitting.current = false;
      setBusy(false);
    }
  };
  const select = async (currentStep: number) => {
    if (busy || dirtyPlan || !fresh) return;
    setBusy(true);
    if (
      await write(
        () => saveMonthClose(data.month, { currentStep }),
        () => 'Fortschritt gespeichert.',
      )
    ) {
      setChosenStep(currentStep);
      setSelected(null);
      setDeferring(null);
      requestAnimationFrame(() => document.getElementById('close-step-title')?.focus());
    }
    setBusy(false);
  };
  return (
    <div className="month-close">
      <p>Zuerst den Monat prüfen, dann den nächsten planen. Dein Fortschritt bleibt gespeichert.</p>
      <CloseStepper
        steps={data.steps}
        current={step}
        progress={data.navigation}
        disabled={busy || dirtyPlan || !fresh}
        onSelect={(s) => void select(s)}
      />
      <section aria-labelledby="close-step-title" className="close-body">
        <h2 id="close-step-title" tabIndex={-1}>
          {step}. {status.title}
        </h2>
        <p role="status">
          {step < 5 && !status.hasTasks ? (
            <>
              <Check size={16} strokeWidth={1.75} aria-hidden="true" /> nichts offen
            </>
          ) : (
            CLOSE_STATUS[status.status]
          )}
          {status.openCount > 0 ? ` · ${status.openCount} offen` : ''}
        </p>
        {status.reasons.map((reason) => (
          <p key={reason}>Grund: {reason}</p>
        ))}
        <dl className="close-step-help">
          <div>
            <dt>Warum</dt>
            <dd>{STEP_HELP[step - 1]!.why}</dd>
          </div>
          <div>
            <dt>Danach</dt>
            <dd>{STEP_HELP[step - 1]!.after}</dd>
          </div>
        </dl>
        {step === 1 && (
          <>
            <p>
              Ordne die offenen Buchungen zu und prüfe die Vorschläge. Du bestätigst jede Änderung
              selbst.
            </p>
            <AppLink to="/reports/gesamttabelle" search={{ monat: data.month }}>
              {data.inbox.length} offene Aufgaben im Monat
            </AppLink>
            <div
              role="group"
              aria-label="Aufgaben im Monat prüfen"
              onFocusCapture={() => setChosenStep(1)}
              onPointerDownCapture={() => setChosenStep(1)}
            >
              <InboxWorkflow entryIds={data.inbox.map((e) => e.id)} />
            </div>
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
            {unchanged && unchanged.accounts.length > 0 && (
              <div
                className="close-row close-unchanged"
                aria-labelledby="close-unchanged-title"
                aria-busy={busy}
              >
                <h3 id="close-unchanged-title">Gemeinsam bestätigen</h3>
                <p>
                  Diese {unchanged.accounts.length} Konten haben seit der letzten persönlichen
                  Prüfung keine nachgewiesene Bewegung oder spätere Änderung. Bestätigt wird der
                  unveränderte frühere Saldo zum {longDay(unchanged.asOf)}. Es wurde kein neuer
                  Bankstand abgerufen.
                </p>
                <ul>
                  {unchanged.accounts.map((row) => (
                    <li key={row.id}>
                      <AppLink
                        to="/konten/buchungen"
                        search={{ konto: row.id, bis: unchanged.asOf }}
                      >
                        {row.name}
                      </AppLink>
                      {' · '}
                      {nativeCurrency(row.statementBalanceCents, row.currency)}
                      {' · '}zuletzt persönlich geprüft am {longDay(row.priorDate)}
                    </li>
                  ))}
                </ul>
                <p>
                  Je Konto wird eine echte Kontoprüfung gespeichert. Ein Rückgängig nimmt die ganze
                  Gruppe zurück. Es entsteht kein Ausgleich und keine zusätzliche Monatssperre.
                </p>
                <div className="close-actions">
                  <Button
                    disabled={
                      busy ||
                      !fresh ||
                      selected !== null ||
                      bulkFailed ||
                      unchanged.accounts.length > 500
                    }
                    onClick={() => void confirmUnchanged()}
                  >
                    Gemeinsam bestätigen
                  </Button>
                  {bulkFailed && (
                    <Button
                      variant="ghost"
                      disabled={busy || !fresh}
                      onClick={() => {
                        setBulkFailed(false);
                        onReload();
                      }}
                    >
                      Abschluss neu laden
                    </Button>
                  )}
                </div>
                {bulkFailed && (
                  <p role="alert">
                    Die Sammelbestätigung ist fehlgeschlagen. Es wurde keine Teilgruppe bestätigt.
                    Lade den aktuellen Abschlussstand, bevor du erneut bestätigst.
                  </p>
                )}
                {selected !== null && <p>Schließe zuerst die offene Einzelprüfung.</p>}
                {unchanged.accounts.length > 500 && (
                  <p>Mehr als 500 Konten: bitte die Konten einzeln prüfen.</p>
                )}
              </div>
            )}
            {data.accounts
              .filter((a) => !groupedIds.has(a.id) || selected === a.id)
              .map((a) => {
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
                          onClick={() => {
                            setChosenStep(step);
                            setSelected(selected === a.id ? null : a.id);
                          }}
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
                            onClick={() => {
                              setChosenStep(step);
                              setDeferring([work]);
                            }}
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
                          openingDate={a.openingDate}
                          lastReconciledOn={a.lastReconciledOn}
                          valueCents={a.valueCents}
                          currency={a.currency}
                          onDone={() => setSelected(null)}
                        />
                      ) : (
                        account && (
                          <ReconcileFlow
                            key={a.id}
                            account={account}
                            initialDate={data.asOf}
                            monthClose={{
                              asOf: data.asOf,
                              confirm: (input) =>
                                reconcileCloseAccount(data.month, a.id, {
                                  ...input,
                                  sourceRevision: data.sourceRevision,
                                }),
                              onBusy: setBusy,
                              onReload: () => {
                                setSelected(null);
                                onReload();
                              },
                            }}
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
                      onClick={() => {
                        setChosenStep(step);
                        setSelected(selected === r.id ? null : r.id);
                      }}
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
        {step === 4 && (
          <NextMonthPlan
            data={data.nextPlan}
            onDirtyChange={(dirty) => {
              if (dirty) setChosenStep(4);
              setDirtyPlan(dirty);
            }}
            onApply={async (items) => {
              setBusy(true);
              const result = await write(
                () => assign(data.nextPlan.month, items, data.month),
                () => 'Plan übernommen. Alle Zuweisungen gemeinsam rückgängig machen.',
              );
              setBusy(false);
              return Boolean(result);
            }}
          />
        )}
        {step === 4 && dirtyPlan && (
          <p>Übernimm oder verwirf den Entwurf vor dem nächsten Schritt.</p>
        )}
        {step === 5 && <MonthReview data={data} fresh={fresh} onReload={onReload} />}
        {step === 1 && open.length > 0 && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setChosenStep(step);
              setDeferring(open);
            }}
          >
            Rest ausdrücklich aufschieben
          </Button>
        )}
        {step === 3 && open.length > 0 && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setChosenStep(step);
              setDeferring(open);
            }}
          >
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
      {step < 5 && (
        <div className="close-footer">
          <AppLink to="/plan/monat" search={{ monat: data.month }} className="btn btn-ghost">
            Verlassen
          </AppLink>
          {step < 5 && (
            <Button
              disabled={busy || dirtyPlan || !fresh || status.status === 'open'}
              onClick={() => void select(data.navigation.nextByStep[step] ?? 5)}
            >
              Weiter
            </Button>
          )}
        </div>
      )}
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
