import {
  cents,
  formatDecimal,
  loanScenarioInputSchema,
  parseAmount,
  type LoanMeasure,
  type LoanMeasureKind,
} from '@budget/domain';
import {
  Button,
  Field,
  FormDialog,
  Select,
  TextInput,
  useAmountPrivacy,
  useToast,
} from '@budget/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { undoGroup } from '../ledger/api';
import { longDay, monthName, nativeCurrency } from '../ledger/format';
import { errorText } from '../ledger/labels';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { AppLink } from '../shell/app-link';
import {
  deleteRateChange,
  deleteScenario,
  DEBT_STRATEGY_KEY,
  LOAN_PLAN_KEY,
  loanPlanQuery,
  previewLoanScenario,
  saveRateChange,
  saveScenario,
  type LoanPlanView,
} from './loan-planning-api';
import './loan-planning.css';

type Scenario = LoanPlanView['scenarios'][number];
type RateChange = LoanPlanView['rateChanges'][number];
type Outcome = NonNullable<Scenario['outcome']>;

export const ERROR_TEXT = {
  payment_below_interest: 'Die Rate deckt in einem Monat die Zinsen und Gebühren nicht.',
  horizon: 'Nicht innerhalb von 1.200 Monaten getilgt.',
  limit: 'Die Beträge überschreiten die sichere Rechengrenze.',
} as const;
const EVERY: Record<'1' | '3' | '6' | '12', string> = {
  '1': 'monatlich',
  '3': 'vierteljährlich',
  '6': 'halbjährlich',
  '12': 'jährlich',
};

export const rateText = (bp: number) => `${formatDecimal(cents(bp))} %`;
export const monthText = (month: string | null) =>
  month ? `${monthName(month)} ${month.slice(0, 4)}` : 'bereits getilgt';
const earlier = (months: number) =>
  months === 0 ? 'gleich' : months > 0 ? `${months} früher` : `${-months} später`;

/** Audited write with "Rückgängig" (the whole group) and "Wiederholen" afterwards. */
export function useLoanWrite() {
  const qc = useQueryClient();
  const toast = useToast();
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: [...LOAN_PLAN_KEY] }),
      qc.invalidateQueries({ queryKey: [...DEBT_STRATEGY_KEY] }),
    ]);
  return async function write<T extends { groupId: string }>(
    run: () => Promise<T>,
    message: string,
  ): Promise<T | undefined> {
    try {
      const result = await run();
      toast.show({
        message,
        actionLabel: 'Rückgängig',
        onAction: () =>
          void undoGroup(result.groupId).then(
            async (undone) => {
              await refresh();
              toast.show({
                message: 'Rückgängig gemacht.',
                actionLabel: 'Wiederholen',
                onAction: () => void undoGroup(undone.groupId).then(refresh),
              });
            },
            (error: unknown) => toast.show({ message: errorText(error) }),
          ),
      });
      await refresh();
      return result;
    } catch (error) {
      toast.show({ message: errorText(error) });
      return undefined;
    }
  };
}

/** Amount with cents, calculation allowed; masked while amounts are hidden. */
export function MoneyInput({
  label,
  value,
  onChange,
  currency,
  hint,
  required = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  currency: string;
  hint?: string;
  required?: boolean;
}) {
  return (
    <Field label={`${label} (${currency})`} {...(hint ? { hint } : {})}>
      {({ id, describedBy }) => (
        <TextInput
          id={id}
          money
          required={required}
          inputMode="decimal"
          autoComplete="off"
          aria-describedby={describedBy}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const parsed = parseAmount(value);
              if (parsed.ok) {
                e.preventDefault();
                onChange(formatDecimal(parsed.cents));
              }
            }
          }}
        />
      )}
    </Field>
  );
}

export const parseMoney = (text: string, allowZero = false): number | null => {
  const parsed = parseAmount(text);
  return parsed.ok && (allowZero ? parsed.cents >= 0 : parsed.cents > 0) ? parsed.cents : null;
};

// ---- what a measure says ----

export function measureText(m: LoanMeasure, currency: string): string {
  const money = (v: number) => nativeCurrency(v, currency);
  switch (m.kind) {
    case 'one_off':
      return `Einmalig ${money(m.amountCents)} im ${monthText(m.month)}`;
    case 'recurring':
      return `${money(m.amountCents)} ${EVERY[String(m.everyMonths) as keyof typeof EVERY]} ab ${monthText(m.fromMonth)}${
        m.toMonth ? ` bis ${monthText(m.toMonth)}` : ' bis zur Tilgung'
      }`;
    case 'rate_change':
      return `Zins ${rateText(m.rateBp)} ab ${monthText(m.fromMonth)}`;
    case 'installment':
      return `Rate ${money(m.installmentCents)} ab ${monthText(m.fromMonth)}`;
  }
}

// ---- the section on Schulden ----

export function LoanPlanning({ loanId, asOf }: { loanId: string; asOf: string }) {
  useAmountPrivacy();
  const query = useQuery(loanPlanQuery(loanId, asOf));
  const write = useLoanWrite();
  const [dialog, setDialog] = useState<
    { type: 'rate'; change?: RateChange } | { type: 'scenario'; scenario?: Scenario } | null
  >(null);
  const plan = query.data;
  return (
    <>
      {query.isPending && (
        <section className="debt-full">
          <LoadingNote what="Zinsänderungen und Szenarien" />
        </section>
      )}
      {query.isError && (
        <section className="debt-full">
          <ErrorNote
            what="Zinsänderungen und Szenarien"
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        </section>
      )}
      {plan && (
        <>
          <section className="debt-full loan-conditions" aria-labelledby="loan-rates-title">
            <div className="head">
              <h2 id="loan-rates-title">Variable Konditionen</h2>
              <span className="aside">{plan.name}</span>
            </div>
            <p className="vnote">
              {plan.terms.rateBp === null
                ? 'Für diesen Kredit ist kein Zins hinterlegt. '
                : `Zins laut Konditionen ${rateText(plan.terms.rateBp)}${
                    plan.terms.interestKind === 'fixed'
                      ? ' (fix)'
                      : plan.terms.interestKind === 'variable'
                        ? ' (variabel)'
                        : ' (Zinsart unbekannt)'
                  } bis zur ersten Änderung. `}
              Eine Zinsänderung gilt ab ihrem Monat für den Tilgungsplan und alle Szenarien.{' '}
              <AppLink to="/einstellungen/konten">Konditionen pflegen</AppLink>
            </p>
            {plan.rateChanges.length > 0 ? (
              <table className="vtable loan-table loan-rate-table">
                <caption className="sr-only">Gespeicherte Zinsänderungen</caption>
                <thead>
                  <tr>
                    <th scope="col" className="tech">
                      Gültig ab
                    </th>
                    <th scope="col" className="tech num">
                      Zins p. a.
                    </th>
                    <th scope="col" className="tech">
                      <span className="sr-only">Aktionen</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {plan.rateChanges.map((c) => (
                    <tr key={c.id}>
                      <th scope="row">{longDay(c.validFrom)}</th>
                      <td className="num" data-label="Zins p. a.">
                        {rateText(c.rateBp)}
                      </td>
                      <td className="loan-actions-cell">
                        <div className="loan-actions">
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Zinsänderung ab ${longDay(c.validFrom)} ändern`}
                            onClick={() => setDialog({ type: 'rate', change: c })}
                          >
                            Ändern
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Zinsänderung ab ${longDay(c.validFrom)} löschen`}
                            onClick={() =>
                              void write(
                                () => deleteRateChange(loanId, c.id),
                                'Zinsänderung gelöscht.',
                              )
                            }
                          >
                            Löschen
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="vnote">Noch keine Zinsänderung erfasst.</p>
            )}
            <div className="loan-buttons">
              <Button variant="ghost" onClick={() => setDialog({ type: 'rate' })}>
                Zinsänderung erfassen
              </Button>
            </div>
          </section>

          <section className="debt-full loan-scenarios" aria-labelledby="loan-scen-title">
            <div className="head">
              <h2 id="loan-scen-title">Szenarien</h2>
              <span className="aside">
                {plan.name} · {plan.currency}
              </span>
            </div>
            <ScenarioTable
              plan={plan}
              onEdit={(scenario) => setDialog({ type: 'scenario', scenario })}
              onDelete={(s) =>
                void write(() => deleteScenario(loanId, s.id), `Szenario „${s.name}“ gelöscht.`)
              }
            />
            <div className="loan-buttons">
              <Button
                variant="ghost"
                disabled={plan.missing.length > 0 || plan.balanceCents === 0}
                onClick={() => setDialog({ type: 'scenario' })}
              >
                Szenario anlegen
              </Button>
            </div>
            <p className="vnote">
              Monatsmodell wie oben: Zinsen = Jahreszins ÷ 12, je Monat auf Cent gerundet, danach
              Gebühr und Zahlung; Startwert ist der erfasste Kontosaldo zum {longDay(plan.asOf)},
              erste Zahlung im {monthText(plan.startMonth)}. Zinsänderungen eines Szenarios ersetzen
              eine gespeicherte Änderung desselben Monats; spätere gespeicherte Änderungen gelten
              weiter. Keine Vorfälligkeitskosten, keine Buchung, keine Zahlung.
            </p>
          </section>
        </>
      )}
      {dialog?.type === 'rate' && plan && (
        <RateChangeDialog
          loanId={loanId}
          plan={plan}
          {...(dialog.change ? { change: dialog.change } : {})}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'scenario' && plan && (
        <ScenarioDialog
          loanId={loanId}
          plan={plan}
          asOf={asOf}
          {...(dialog.scenario ? { scenario: dialog.scenario } : {})}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}

function OutcomeCells({ outcome, plan }: { outcome: Outcome | null; plan: LoanPlanView }) {
  const money = (v: number) => nativeCurrency(v, plan.currency);
  if (!outcome)
    return (
      <td colSpan={5} className="loan-error">
        Nicht berechenbar.
      </td>
    );
  if (outcome.status === 'error')
    return (
      <td colSpan={5} className="loan-error">
        {ERROR_TEXT[outcome.code]}
      </td>
    );
  const s = outcome.scenario;
  return (
    <>
      <td data-label="Schuldenfrei">{monthText(s.payoffMonth)}</td>
      <td className="num" data-label="Laufzeit">
        {s.months} Monate
      </td>
      <td className="num" data-label="Zinsen gesamt">
        {money(s.totalInterestCents)}
      </td>
      <td className="num" data-label="Zinsersparnis">
        {money(outcome.interestSavedCents)}
      </td>
      <td className="num" data-label="Früher frei">
        {earlier(outcome.monthsEarlier)}
      </td>
    </>
  );
}

function ScenarioTable({
  plan,
  onEdit,
  onDelete,
}: {
  plan: LoanPlanView;
  onEdit: (s: Scenario) => void;
  onDelete: (s: Scenario) => void;
}) {
  useAmountPrivacy();
  if (plan.balanceCents === 0) return <p className="vnote">Dieser Kredit hat keine Restschuld.</p>;
  if (plan.missing.length > 0)
    return (
      <p className="vnote" data-testid="loan-missing">
        Für Szenarien fehlen hinterlegte Konditionen:{' '}
        {plan.missing
          .map((m) => (m === 'rate' ? 'Zinssatz' : m === 'fee' ? 'Gebühr' : 'Monatsrate'))
          .join(' und ')}
        . <AppLink to="/einstellungen/konten">Konditionen pflegen</AppLink>
      </p>
    );
  const base = plan.baseline;
  if (!base || base.status === 'error')
    return (
      <p className="vnote" role="status">
        {base ? ERROR_TEXT[base.code] : 'Nicht berechenbar.'} Bitte Rate und Zins in den Konditionen
        prüfen.
      </p>
    );
  const money = (v: number) => nativeCurrency(v, plan.currency);
  return (
    <table className="vtable loan-table loan-scenario-table" data-testid="loan-scenarios">
      <caption className="sr-only">Szenarien im Vergleich zur Basis</caption>
      <thead>
        <tr>
          {[
            'Szenario',
            'Schuldenfrei',
            'Laufzeit',
            'Zinsen gesamt',
            'Zinsersparnis',
            'Früher frei',
          ].map((h, i) => (
            <th scope="col" className={i > 1 ? 'tech num' : 'tech'} key={h}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr data-testid="loan-baseline">
          <th scope="row">
            Basis
            <small>
              Rate {money(plan.terms.installmentCents ?? 0)}
              {plan.rateChanges.length > 0 ? ' · gespeicherte Zinsänderungen' : ''}
            </small>
          </th>
          <td data-label="Schuldenfrei">{monthText(base.summary.payoffMonth)}</td>
          <td className="num" data-label="Laufzeit">
            {base.summary.months} Monate
          </td>
          <td className="num" data-label="Zinsen gesamt">
            {money(base.summary.totalInterestCents)}
          </td>
          <td className="num" data-label="Zinsersparnis">
            —
          </td>
          <td className="num" data-label="Früher frei">
            —
          </td>
        </tr>
        {plan.scenarios.map((s) => (
          <tr key={s.id} data-testid="loan-scenario-row">
            <th scope="row">
              <span className="loan-name">{s.name}</span>
              <ul className="loan-measures">
                {s.measures.map((m, i) => (
                  <li key={i}>{measureText(m, plan.currency)}</li>
                ))}
              </ul>
              {s.expired > 0 && (
                <small>
                  {s.expired === 1
                    ? 'Eine Sondertilgung liegt vor dem Modellstart und zählt nicht mehr.'
                    : `${s.expired} Sondertilgungen liegen vor dem Modellstart und zählen nicht mehr.`}
                </small>
              )}
              <span className="loan-actions">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Szenario ${s.name} bearbeiten`}
                  onClick={() => onEdit(s)}
                >
                  Bearbeiten
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Szenario ${s.name} löschen`}
                  onClick={() => onDelete(s)}
                >
                  Löschen
                </Button>
              </span>
            </th>
            <OutcomeCells outcome={s.outcome} plan={plan} />
          </tr>
        ))}
        {plan.scenarios.length === 0 && (
          <tr>
            <td colSpan={6} className="loan-empty">
              Noch kein Szenario. Lege eines an, um Sondertilgung, einen anderen Zins oder eine
              höhere Rate mit der Basis zu vergleichen.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

// ---- dialogs ----

function RateChangeDialog({
  loanId,
  plan,
  change,
  onClose,
}: {
  loanId: string;
  plan: LoanPlanView;
  change?: RateChange;
  onClose: () => void;
}) {
  const write = useLoanWrite();
  const [from, setFrom] = useState(change?.validFrom ?? '');
  const [rate, setRate] = useState(change ? formatDecimal(cents(change.rateBp)) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    const parsed = parseMoney(rate, true);
    if (!from || parsed === null || parsed > 100_000) {
      setError('Bitte Datum und einen Zinssatz zwischen 0 und 1.000 % angeben.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await write(
        () => saveRateChange(loanId, change?.id ?? null, { validFrom: from, rateBp: parsed }),
        'Zinsänderung gespeichert.',
      );
      if (result) onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <FormDialog
      open
      onClose={onClose}
      title={change ? 'Zinsänderung ändern' : 'Zinsänderung erfassen'}
    >
      <form
        className="loan-editor"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="loan-editor-head">
          <h3>{change ? 'Zinsänderung ändern' : 'Zinsänderung erfassen'}</h3>
          <Button variant="ghost" onClick={onClose}>
            Schließen
          </Button>
        </div>
        <div className="loan-editor-body">
          <fieldset disabled={busy}>
            <Field label="Gültig ab">
              {({ id }) => (
                <TextInput
                  id={id}
                  type="date"
                  required
                  min="1900-01-01"
                  max="9899-12-31"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              )}
            </Field>
            <Field
              label="Nominaler Jahreszins (%)"
              hint={`Bisher ${plan.terms.rateBp === null ? 'kein Zins hinterlegt' : rateText(plan.terms.rateBp)} laut Konditionen. Ein Tag mitten im Monat gilt für den ganzen Monat.`}
            >
              {({ id, describedBy }) => (
                <TextInput
                  id={id}
                  required
                  inputMode="decimal"
                  autoComplete="off"
                  aria-describedby={describedBy}
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                />
              )}
            </Field>
          </fieldset>
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
        </div>
        <div className="loan-editor-foot">
          <Button disabled={busy} type="submit">
            Speichern
          </Button>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Abbrechen
          </Button>
        </div>
      </form>
    </FormDialog>
  );
}

interface MeasureDraft {
  key: number;
  kind: LoanMeasureKind;
  month: string;
  toMonth: string;
  every: '1' | '3' | '6' | '12';
  amount: string;
  rate: string;
}
const KIND_LABEL: Record<LoanMeasureKind, string> = {
  one_off: 'Einmalige Sondertilgung',
  recurring: 'Regelmäßige Sondertilgung',
  rate_change: 'Zinsänderung',
  installment: 'Höhere Rate',
};
let draftKey = 0;
const blankDraft = (kind: LoanMeasureKind, month: string): MeasureDraft => ({
  key: ++draftKey,
  kind,
  month,
  toMonth: '',
  every: '1',
  amount: '',
  rate: '',
});
function fromMeasure(m: LoanMeasure): MeasureDraft {
  const d = blankDraft(m.kind, m.kind === 'one_off' ? m.month : m.fromMonth);
  switch (m.kind) {
    case 'one_off':
      return { ...d, amount: formatDecimal(cents(m.amountCents)) };
    case 'recurring':
      return {
        ...d,
        toMonth: m.toMonth ?? '',
        every: String(m.everyMonths) as MeasureDraft['every'],
        amount: formatDecimal(cents(m.amountCents)),
      };
    case 'rate_change':
      return { ...d, rate: formatDecimal(cents(m.rateBp)) };
    case 'installment':
      return { ...d, amount: formatDecimal(cents(m.installmentCents)) };
  }
}
function toMeasure(d: MeasureDraft): LoanMeasure | null {
  if (!d.month) return null;
  if (d.kind === 'rate_change') {
    const rateBp = parseMoney(d.rate, true);
    return rateBp === null ? null : { kind: 'rate_change', fromMonth: d.month, rateBp };
  }
  const amountCents = parseMoney(d.amount);
  if (amountCents === null) return null;
  if (d.kind === 'one_off') return { kind: 'one_off', month: d.month, amountCents };
  if (d.kind === 'installment')
    return { kind: 'installment', fromMonth: d.month, installmentCents: amountCents };
  return {
    kind: 'recurring',
    fromMonth: d.month,
    toMonth: d.toMonth || null,
    everyMonths: Number(d.every) as 1 | 3 | 6 | 12,
    amountCents,
  };
}

function ScenarioDialog({
  loanId,
  plan,
  asOf,
  scenario,
  onClose,
}: {
  loanId: string;
  plan: LoanPlanView;
  asOf: string;
  scenario?: Scenario;
  onClose: () => void;
}) {
  const write = useLoanWrite();
  const start = plan.startMonth;
  const [name, setName] = useState(scenario?.name ?? '');
  const [drafts, setDrafts] = useState<MeasureDraft[]>(
    scenario ? scenario.measures.map(fromMeasure) : [blankDraft('recurring', start)],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<NonNullable<LoanPlanView['draft']> | null>(null);
  const patch = (key: number, change: Partial<MeasureDraft>) => {
    setDrafts((all) => all.map((d) => (d.key === key ? { ...d, ...change } : d)));
    setPreview(null);
  };
  const build = () => {
    const measures: LoanMeasure[] = [];
    for (const d of drafts) {
      const m = toMeasure(d);
      if (!m) {
        setError('Bitte bei jeder Maßnahme Monat und Betrag bzw. Zins angeben.');
        return null;
      }
      measures.push(m);
    }
    const parsed = loanScenarioInputSchema.safeParse({ name, measures });
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message?.endsWith('.')
          ? parsed.error.issues[0].message
          : 'Bitte Namen, Maßnahmen und Monate prüfen. Pro Monat höchstens eine Zins- oder Ratenänderung.',
      );
      return null;
    }
    setError('');
    return parsed.data;
  };
  const run = async (action: 'preview' | 'save') => {
    const input = build();
    if (!input) return;
    setBusy(true);
    try {
      if (action === 'preview') {
        const view = await previewLoanScenario(loanId, asOf, input.measures);
        setPreview(view.draft ?? null);
      } else {
        const result = await write(
          () => saveScenario(loanId, scenario?.id ?? null, input),
          'Szenario gespeichert.',
        );
        if (result) onClose();
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const draftOutcome = preview?.outcome ?? null;
  return (
    <FormDialog
      open
      onClose={onClose}
      title={scenario ? 'Szenario bearbeiten' : 'Szenario anlegen'}
    >
      <form
        className="loan-editor"
        onSubmit={(e) => {
          e.preventDefault();
          void run('save');
        }}
      >
        <div className="loan-editor-head">
          <h3>{scenario ? 'Szenario bearbeiten' : 'Szenario anlegen'}</h3>
          <Button variant="ghost" onClick={onClose}>
            Schließen
          </Button>
        </div>
        <div className="loan-editor-body">
          <fieldset disabled={busy}>
            <Field label="Name des Szenarios">
              {({ id }) => (
                <TextInput
                  id={id}
                  required
                  maxLength={80}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setPreview(null);
                  }}
                />
              )}
            </Field>
            {drafts.map((d, i) => (
              <fieldset className="loan-measure" key={d.key}>
                <legend>
                  {i + 1}. {KIND_LABEL[d.kind]}
                </legend>
                <div className="loan-grid">
                  <Field label="Art">
                    {({ id }) => (
                      <Select
                        id={id}
                        value={d.kind}
                        onChange={(e) => patch(d.key, { kind: e.target.value as LoanMeasureKind })}
                      >
                        {(Object.keys(KIND_LABEL) as LoanMeasureKind[]).map((k) => (
                          <option key={k} value={k}>
                            {KIND_LABEL[k]}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <Field label={d.kind === 'one_off' ? 'Monat' : 'Ab Monat'}>
                    {({ id }) => (
                      <TextInput
                        id={id}
                        type="month"
                        required
                        min={d.kind === 'one_off' || d.kind === 'recurring' ? start : '1900-01'}
                        max="9899-12"
                        value={d.month}
                        onChange={(e) => patch(d.key, { month: e.target.value })}
                      />
                    )}
                  </Field>
                  {d.kind === 'recurring' && (
                    <>
                      <Field label="Rhythmus">
                        {({ id }) => (
                          <Select
                            id={id}
                            value={d.every}
                            onChange={(e) =>
                              patch(d.key, { every: e.target.value as MeasureDraft['every'] })
                            }
                          >
                            {Object.entries(EVERY).map(([k, label]) => (
                              <option key={k} value={k}>
                                {label}
                              </option>
                            ))}
                          </Select>
                        )}
                      </Field>
                      <Field label="Bis Monat" hint="Leer: bis zur Tilgung.">
                        {({ id, describedBy }) => (
                          <TextInput
                            id={id}
                            type="month"
                            aria-describedby={describedBy}
                            min={d.month || start}
                            max="9899-12"
                            value={d.toMonth}
                            onChange={(e) => patch(d.key, { toMonth: e.target.value })}
                          />
                        )}
                      </Field>
                    </>
                  )}
                  {d.kind === 'rate_change' ? (
                    <Field label="Nominaler Jahreszins (%)">
                      {({ id }) => (
                        <TextInput
                          id={id}
                          required
                          inputMode="decimal"
                          autoComplete="off"
                          value={d.rate}
                          onChange={(e) => patch(d.key, { rate: e.target.value })}
                        />
                      )}
                    </Field>
                  ) : (
                    <MoneyInput
                      label={
                        d.kind === 'installment'
                          ? 'Neue Monatsrate'
                          : d.kind === 'one_off'
                            ? 'Betrag'
                            : 'Betrag je Zahlung'
                      }
                      currency={plan.currency}
                      value={d.amount}
                      onChange={(amount) => patch(d.key, { amount })}
                    />
                  )}
                </div>
                {drafts.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDrafts((all) => all.filter((x) => x.key !== d.key));
                      setPreview(null);
                    }}
                  >
                    Maßnahme {i + 1} entfernen
                  </Button>
                )}
              </fieldset>
            ))}
            <div className="loan-buttons">
              <Button
                variant="ghost"
                disabled={drafts.length >= 12}
                onClick={() => {
                  setDrafts((all) => [...all, blankDraft('one_off', start)]);
                  setPreview(null);
                }}
              >
                Maßnahme hinzufügen
              </Button>
            </div>
          </fieldset>
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          {preview && (
            <div role="status" className="loan-preview" data-testid="loan-preview">
              {draftOutcome === null ? (
                <p>Nicht berechenbar.</p>
              ) : draftOutcome.status === 'error' ? (
                <p>{ERROR_TEXT[draftOutcome.code]}</p>
              ) : (
                <p>
                  Schuldenfrei im {monthText(draftOutcome.scenario.payoffMonth)} (
                  {earlier(draftOutcome.monthsEarlier)} als die Basis), Zinsen{' '}
                  {nativeCurrency(draftOutcome.scenario.totalInterestCents, plan.currency)},
                  Zinsersparnis {nativeCurrency(draftOutcome.interestSavedCents, plan.currency)}.
                </p>
              )}
              {preview.expired > 0 && (
                <p>Eine Sondertilgung liegt vor dem Modellstart und zählt nicht.</p>
              )}
            </div>
          )}
        </div>
        <div className="loan-editor-foot">
          <Button variant="ghost" disabled={busy} onClick={() => void run('preview')}>
            Vorschau
          </Button>
          <Button disabled={busy} type="submit">
            Szenario speichern
          </Button>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Abbrechen
          </Button>
        </div>
      </form>
    </FormDialog>
  );
}
