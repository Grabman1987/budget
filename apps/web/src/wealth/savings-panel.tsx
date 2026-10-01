import type { SecurityRecord } from '@budget/db';
import { cents, formatDecimal, nextExecutionAfter, parseAmount } from '@budget/domain';
import { Button, DetailPanel, Field, Select, TextInput } from '@budget/ui';
import { useBlocker } from '@tanstack/react-router';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError } from '../api/http';
import { useBudgetWrite } from '../budget/use-category-writes';
import { longDay, nativeCurrency } from '../ledger/format';
import { errorText } from '../ledger/labels';
import type { AccountRow } from '../ledger/types';
import { AppLink } from '../shell/app-link';
import { changePlan, createPlan, endPlan, type SavingsPlanRecord } from './savings-api';
import { BANK_NOTE } from './savings-model';

export function SavingsPanel({
  id,
  plans,
  accounts,
  securities,
  today,
  onClose,
}: {
  id: string;
  plans: SavingsPlanRecord[];
  accounts: AccountRow[];
  securities: SecurityRecord[];
  today: string;
  onClose: () => void;
}) {
  const plan = plans.find((p) => p.id === id);
  const creating = id === 'neu';
  const editable = creating || plan?.validTo === null;
  const [original] = useState(() => ({
    securityId: plan?.securityId ?? '',
    accountId: plan?.accountId ?? '',
    sourceAccountId: plan?.sourceAccountId ?? '',
    amount: plan ? formatDecimal(cents(plan.amountCents)) : '',
    day: String(plan?.dayOfMonth ?? 5),
    date: creating ? today : '',
    note: plan?.note ?? '',
    endDate: plan && plan.validFrom > today ? plan.validFrom : today,
  }));
  const [draft, setDraft] = useState(original);
  const [ending, setEnding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [navigation, setNavigation] = useState(false);
  const [error, setError] = useState('');
  const changed = ending || JSON.stringify(draft) !== JSON.stringify(original);
  const dirty = useRef(false);
  const saving = useRef(false);
  const blockedDuringSave = useRef(false);
  const write = useBudgetWrite();
  const blocker = useBlocker({
    shouldBlockFn: () => {
      if (saving.current) blockedDuringSave.current = true;
      return dirty.current || saving.current;
    },
    withResolver: true,
    enableBeforeUnload: () => dirty.current || saving.current,
  });
  const { status, reset } = blocker;
  useEffect(() => {
    if (status !== 'blocked') return;
    if (blockedDuringSave.current || saving.current) {
      blockedDuringSave.current = false;
      setAsking(false);
      reset();
      return;
    }
    setNavigation(true);
    setAsking(true);
  }, [status, reset, busy]);
  const close = () => {
    dirty.current = false;
    setAsking(false);
    onClose();
  };
  const update = (key: keyof typeof draft, value: string) => {
    const next = { ...draft, [key]: value };
    dirty.current = ending || JSON.stringify(next) !== JSON.stringify(original);
    setDraft(next);
    setError('');
  };
  const currency = accounts.find((a) => a.id === draft.accountId)?.currency;
  const history = plan
    ? plans
        .filter((p) => p.securityId === plan.securityId && p.accountId === plan.accountId)
        .sort((a, b) => b.validFrom.localeCompare(a.validFrom))
    : [];
  const effective =
    draft.date ||
    nextExecutionAfter(
      Number.isInteger(Number(draft.day)) && Number(draft.day) >= 1 && Number(draft.day) <= 31
        ? Number(draft.day)
        : 5,
      today,
    );
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving.current || !editable) return;
    const amount = parseAmount(draft.amount);
    const day = Number(draft.day);
    if (
      !ending &&
      (!amount.ok ||
        amount.cents <= 0 ||
        !Number.isInteger(day) ||
        day < 1 ||
        day > 31 ||
        !draft.securityId ||
        !draft.accountId)
    ) {
      setError('Instrument, Anlagekonto, positive Rate und Ausführungstag von 1 bis 31 angeben.');
      return;
    }
    if (ending && plan && draft.endDate < plan.validFrom) {
      setError('Das Ende darf nicht vor dem Beginn dieser Version liegen.');
      return;
    }
    saving.current = true;
    setBusy(true);
    setError('');
    const result = await write(
      async () => {
        try {
          if (ending && plan) return await endPlan(plan.id, draft.endDate);
          if (!amount.ok) throw new Error('Ungültiger Betrag');
          const values = {
            amountCents: amount.cents,
            dayOfMonth: day,
            sourceAccountId: draft.sourceAccountId || null,
            note: draft.note.trim() || null,
          };
          return creating
            ? await createPlan({
                ...values,
                securityId: draft.securityId,
                accountId: draft.accountId,
                validFrom: draft.date,
              })
            : await changePlan(id, { ...values, from: effective });
        } catch (cause) {
          setError(
            cause instanceof ApiError && cause.status === 409
              ? 'Sparplan konnte nicht geändert werden. Ein offener Plan besteht bereits oder der Stand hat sich geändert. Bitte neu laden.'
              : cause instanceof ApiError && cause.status === 404
                ? 'Sparplan oder zugehöriges Konto/Instrument ist nicht mehr verfügbar. Bitte neu laden.'
                : cause instanceof ApiError && cause.status === 400
                  ? 'Angaben konnten nicht gespeichert werden. Bitte Rate, Tag, Datum und Konten prüfen.'
                  : errorText(cause),
          );
          throw cause;
        }
      },
      (saved) =>
        `${ending ? `Sparplan endet einschließlich ${longDay(saved.plan.validTo!)}` : `Sparplan ab ${longDay(saved.plan.validFrom)} gespeichert`}. Bank bitte selbst ändern.`,
    );
    saving.current = false;
    setBusy(false);
    if (result) close();
  };
  return (
    <DetailPanel
      open
      title={creating ? 'Sparplan anlegen' : 'Sparplan bearbeiten'}
      onClose={close}
      beforeClose={() => {
        if (saving.current || blocker.status === 'blocked') return false;
        if (!dirty.current) return true;
        setNavigation(false);
        setAsking(true);
        return false;
      }}
    >
      {!creating && !plan ? (
        <p role="alert">
          Dieser Sparplan ist nicht verfügbar. Bitte den Verlauf in der Liste öffnen.
        </p>
      ) : (
        <>
          <p className="vnote">{BANK_NOTE}</p>
          {plan && (
            <p>
              {securities.find((s) => s.id === plan.securityId)?.name ??
                'Nicht verfügbares Instrument'}{' '}
              ·{' '}
              <AppLink to={`/konten/${plan.accountId}`}>
                {accounts.find((a) => a.id === plan.accountId)?.name ?? 'Anlagekonto öffnen'}
              </AppLink>
              <br />
              Diese Version: {longDay(plan.validFrom)} bis{' '}
              {plan.validTo ? longDay(plan.validTo) : 'offen'}.
            </p>
          )}
          {editable && (
            <form className="kform" onSubmit={(event) => void submit(event)}>
              <fieldset className="instrument-fields" disabled={busy}>
                {creating && (
                  <>
                    <Field label="Instrument">
                      {({ id }) => (
                        <Select
                          id={id}
                          required
                          value={draft.securityId}
                          onChange={(e) => update('securityId', e.target.value)}
                        >
                          <option value="">Bitte wählen</option>
                          {securities.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>
                    <Field label="Anlagekonto">
                      {({ id }) => (
                        <Select
                          id={id}
                          required
                          value={draft.accountId}
                          onChange={(e) => {
                            update('accountId', e.target.value);
                            if (draft.sourceAccountId === e.target.value)
                              setDraft((d) => ({ ...d, sourceAccountId: '' }));
                          }}
                        >
                          <option value="">Bitte wählen</option>
                          {accounts
                            .filter((a) => a.role === 'investment' && !a.closedAt)
                            .map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name} · {a.currency}
                              </option>
                            ))}
                        </Select>
                      )}
                    </Field>
                  </>
                )}
                {!ending ? (
                  <>
                    <Field
                      label={`Monatliche Rate${currency ? ` (${currency})` : ''}`}
                      hint="Positive Rate. Keine Umrechnung oder Bankorder."
                    >
                      {({ id, describedBy }) => (
                        <TextInput
                          id={id}
                          required
                          inputMode="decimal"
                          value={draft.amount}
                          aria-describedby={describedBy}
                          onChange={(e) => update('amount', e.target.value)}
                        />
                      )}
                    </Field>
                    <Field label="Ausführungstag" hint="In kurzen Monaten gilt der letzte Tag.">
                      {({ id, describedBy }) => (
                        <TextInput
                          id={id}
                          type="number"
                          required
                          min={1}
                          max={31}
                          value={draft.day}
                          aria-describedby={describedBy}
                          onChange={(e) => update('day', e.target.value)}
                        />
                      )}
                    </Field>
                    <Field
                      label="Quellkonto"
                      hint="Informativ. Geldbewegungen werden erst bei tatsächlicher Ausführung gebucht."
                    >
                      {({ id, describedBy }) => (
                        <Select
                          id={id}
                          value={draft.sourceAccountId}
                          aria-describedby={describedBy}
                          onChange={(e) => update('sourceAccountId', e.target.value)}
                        >
                          <option value="">Nicht hinterlegt</option>
                          {accounts
                            .filter(
                              (a) =>
                                a.id !== draft.accountId &&
                                (!a.closedAt || a.id === draft.sourceAccountId),
                            )
                            .map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name} · {a.currency}
                                {a.closedAt ? ' · geschlossen' : ''}
                              </option>
                            ))}
                        </Select>
                      )}
                    </Field>
                    <Field
                      label={creating ? 'Beginn' : 'Änderung ab'}
                      hint={
                        creating
                          ? undefined
                          : `Leer: nächste Ausführung nach heute, ${longDay(effective)}. Datum bis zum Versionsbeginn korrigiert diese Version; spätere Änderungen erhalten den Verlauf.`
                      }
                    >
                      {({ id, describedBy }) => (
                        <TextInput
                          id={id}
                          type="date"
                          required={creating}
                          value={draft.date}
                          aria-describedby={describedBy}
                          onChange={(e) => update('date', e.target.value)}
                        />
                      )}
                    </Field>
                    <Field label="Notiz">
                      {({ id }) => (
                        <TextInput
                          id={id}
                          value={draft.note}
                          maxLength={500}
                          onChange={(e) => update('note', e.target.value)}
                        />
                      )}
                    </Field>
                  </>
                ) : (
                  <Field
                    label="Ende einschließlich"
                    hint="Diese Version bleibt bis zu diesem Tag gültig. Frühere Versionen werden nicht reaktiviert."
                  >
                    {({ id, describedBy }) => (
                      <TextInput
                        id={id}
                        type="date"
                        required
                        min={plan!.validFrom}
                        value={draft.endDate}
                        aria-describedby={describedBy}
                        onChange={(e) => update('endDate', e.target.value)}
                      />
                    )}
                  </Field>
                )}
                {error && (
                  <p className="field-error" role="alert">
                    {error}
                  </p>
                )}
                <div className="savings-actions">
                  <Button type="submit" disabled={busy || (!creating && !changed)}>
                    {busy
                      ? 'Wird gespeichert …'
                      : ending
                        ? 'Ende speichern'
                        : creating
                          ? 'Sparplan anlegen'
                          : 'Änderung speichern'}
                  </Button>
                  {plan && (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setEnding(!ending);
                        dirty.current =
                          !ending || JSON.stringify(draft) !== JSON.stringify(original);
                        setError('');
                      }}
                    >
                      {ending ? 'Rate bearbeiten' : 'Sparplan beenden'}
                    </Button>
                  )}
                </div>
              </fieldset>
            </form>
          )}
          {history.length > 0 && (
            <section className="savings-history" aria-label="Versionsverlauf">
              <h3>Verlauf</h3>
              <ol>
                {history.map((row) => (
                  <li key={row.id}>
                    <strong>
                      {currency
                        ? nativeCurrency(row.amountCents, currency)
                        : 'Währung nicht verfügbar'}{' '}
                      · am {row.dayOfMonth}.
                    </strong>
                    <br />
                    {longDay(row.validFrom)} bis {row.validTo ? longDay(row.validTo) : 'offen'}
                    {row.sourceAccountId && (
                      <>
                        <br />
                        Quelle:{' '}
                        <AppLink to={`/konten/${row.sourceAccountId}`}>
                          {accounts.find((a) => a.id === row.sourceAccountId)?.name ??
                            'Quellkonto öffnen'}
                        </AppLink>
                      </>
                    )}
                    {row.note && <p>{row.note}</p>}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}
      {asking && (
        <div className="instrument-discard">
          <p>Ungespeicherte Angaben verwerfen?</p>
          <Button
            variant="ghost"
            onClick={() => {
              setAsking(false);
              if (navigation && blocker.status === 'blocked') blocker.reset();
            }}
          >
            Weiter bearbeiten
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              dirty.current = false;
              setAsking(false);
              if (navigation && blocker.status === 'blocked') blocker.proceed();
              else close();
            }}
          >
            Verwerfen
          </Button>
        </div>
      )}
    </DetailPanel>
  );
}
