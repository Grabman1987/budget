import {
  useAmountPrivacy,
  AmountInput,
  Button,
  FormDialog,
  Field,
  RevisionTable,
  Select,
  TextInput,
  maskMoneyText,
} from '@budget/ui';
import { addMonths, monthOf, parseAmount, todayInVienna } from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useBudgetWrite } from '../budget/use-category-writes';
import { eur, longDay, shortDay } from '../ledger/format';
import { bookingsQuery } from '../ledger/queries';
import { ErrorNote, LoadingNote } from '../ledger/states';
import {
  addVersion,
  createPayment,
  deletePayment,
  expectedQuery,
  linkOccurrence,
  markMissed,
  occurrencesQuery,
  patchPayment,
  skipOccurrence,
  unlinkOccurrence,
  unskipOccurrence,
  versionsQuery,
  type ExpectedPayment,
  type Occurrence,
} from './api';
import { cadenceText, money, needsAction, versionAmount, versionLetter } from './expected-model';
import {
  changedFields,
  draftFromPayment,
  emptyDraft,
  readDraft,
  type DraftErrors,
  type DraftField,
  type PaymentDraft,
} from './payment-draft';
import { PaymentForm } from './payment-form';
import { StatusStamp } from './status-stamp';

export type PaymentPanelState =
  { mode: 'view'; id: string } | { mode: 'create'; draft?: PaymentDraft } | null;

/** Existing bodies and write paths: content is inline on its page, creation is a form dialog. */
export function PaymentPanel({
  state,
  onClose,
}: {
  state: PaymentPanelState;
  onClose: () => void;
}) {
  useAmountPrivacy();
  const payments = useQuery(expectedQuery()).data;
  const payment = state?.mode === 'view' ? payments?.find((p) => p.id === state.id) : undefined;
  if (state?.mode === 'view')
    return payment ? <ViewBody key={payment.id} payment={payment} onDone={onClose} /> : null;
  return (
    <PaymentDialog
      open={state?.mode === 'create'}
      onClose={onClose}
      title="Wiederkehrende Zahlung anlegen"
    >
      {state?.mode === 'create' && <CreateBody key="new" draft={state.draft} onDone={onClose} />}
    </PaymentDialog>
  );
}

function PaymentDialog({
  open,
  title,
  onClose,
  busy = false,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <FormDialog open={open} title={title} onClose={onClose} beforeClose={() => !busy}>
      {open && (
        <>
          <div className="bk-head">
            <h2>{title}</h2>
            <Button variant="ghost" disabled={busy} onClick={onClose}>
              Schließen
            </Button>
          </div>
          <div className="bk-body">{children}</div>
        </>
      )}
    </FormDialog>
  );
}

function CreateBody({
  draft: initial,
  onDone,
}: {
  draft: PaymentDraft | undefined;
  onDone: () => void;
}) {
  useAmountPrivacy();
  const write = useBudgetWrite();
  const [today] = useState(todayInVienna);
  const [draft, setDraft] = useState<PaymentDraft>(initial ?? emptyDraft(today));
  const [errors, setErrors] = useState<DraftErrors>({});
  const [busy, setBusy] = useState(false);
  const set = <K extends DraftField>(key: K, value: PaymentDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const submit = async () => {
    const read = readDraft(draft, true);
    setErrors(read.errors);
    if (!read.fields || !read.version) return;
    setBusy(true);
    const { fields, version } = read;
    const done = await write(
      () => createPayment(fields, version),
      () => `${fields.name}: wiederkehrende Zahlung angelegt`,
    );
    setBusy(false);
    if (done) onDone();
  };

  return (
    <form
      className="kform"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <PaymentForm draft={draft} errors={errors} creating onChange={set} />
      <div className="panel-actions">
        <Button type="submit" disabled={busy}>
          Anlegen
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}

function ViewBody({ payment: p, onDone }: { payment: ExpectedPayment; onDone: () => void }) {
  useAmountPrivacy();
  const write = useBudgetWrite();
  const currency = p.version?.currency ?? 'EUR';
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="kform xp-panel">
      <div>
        <div className="xp-big">
          {p.amountCents === null ? '–' : money(p.amountCents, currency, p.kind === 'inflow')}
        </div>
        <p className="panel-sub">
          {cadenceText(p)}
          {p.nextDueDate && ` · nächste Fälligkeit ${longDay(p.nextDueDate)}`}
        </p>
      </div>
      <VersionsSection payment={p} />
      <OccurrencesSection payment={p} />
      <div className="panel-actions">
        <Button variant="ghost" onClick={() => setEditing(true)}>
          Bearbeiten
        </Button>
        <Button variant="ghost" onClick={() => setDeleting(true)}>
          Löschen
        </Button>
      </div>
      <PaymentDialog open={editing} title="Zahlung bearbeiten" onClose={() => setEditing(false)}>
        {editing && <EditSection payment={p} onDone={() => setEditing(false)} write={write} />}
      </PaymentDialog>
      <PaymentDialog
        open={deleting}
        title="Zahlung löschen"
        busy={busy}
        onClose={() => setDeleting(false)}
      >
        <p>„{p.name}“ als wiederkehrende Zahlung löschen? Bestehende Buchungen bleiben erhalten.</p>
        <div className="panel-actions">
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const done = await write(
                () => deletePayment(p.id),
                () => `${p.name}: wiederkehrende Zahlung gelöscht`,
              );
              setBusy(false);
              if (done) onDone();
            }}
          >
            Löschen bestätigen
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setDeleting(false)}>
            Abbrechen
          </Button>
        </div>
      </PaymentDialog>
    </div>
  );
}

// ---------- Versionen ----------

function VersionsSection({ payment: p }: { payment: ExpectedPayment }) {
  useAmountPrivacy();
  const write = useBudgetWrite();
  const versions = useQuery(versionsQuery(p.id));
  const [today] = useState(todayInVienna);
  const [month, setMonth] = useState(addMonths(monthOf(today), 1));
  const [amount, setAmount] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const currency = p.version?.currency ?? 'EUR';
  const [editing, setEditing] = useState(false);
  const close = () => {
    setEditing(false);
    setMonth(addMonths(monthOf(today), 1));
    setAmount('');
    setAmountMax('');
    setNote('');
    setError(undefined);
  };

  const rows = (versions.data ?? []).map((v, i, all) => ({
    v,
    letter: versionLetter(i),
    last: i === all.length - 1,
  }));
  const newest = [...rows].reverse();
  const inForce = p.version?.id;

  const submit = async () => {
    const parsed = parseAmount(amount);
    const max = amountMax.trim() === '' ? null : parseAmount(amountMax);
    if (!parsed.ok || parsed.cents <= 0) return setError('Bitte einen Betrag über 0 eintragen.');
    if (max !== null && (!max.ok || max.cents < parsed.cents))
      return setError('Das Maximum muss ein Betrag über dem Betrag sein.');
    if (!/^\d{4}-\d{2}$/.test(month)) return setError('Bitte einen Monat wählen.');
    setError(undefined);
    setBusy(true);
    const done = await write(
      () =>
        addVersion(p.id, {
          validFrom: `${month}-01`,
          amountCents: parsed.cents,
          amountMaxCents: max?.ok ? max.cents : null,
          currency,
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      () => `${p.name}: neue Version ab ${shortDay(`${month}-01`)}${month.slice(0, 4)}`,
    );
    setBusy(false);
    if (done) close();
  };

  return (
    <section aria-labelledby="xp-versions">
      <h3 id="xp-versions" className="panel-h">
        Versionen
      </h3>
      {versions.isPending && <LoadingNote what="Versionen" />}
      {versions.isError && (
        <ErrorNote
          what="Versionen"
          error={versions.error}
          onRetry={() => void versions.refetch()}
        />
      )}
      {versions.data && (
        <RevisionTable
          caption={`Versionen von ${p.name}, neueste zuerst`}
          headers={{ revision: 'Ver.', change: 'Gilt ab', action: 'Aktion' }}
          rows={newest.map(({ v, letter }) => ({
            id: v.id,
            letter,
            title: `${longDay(v.validFrom)} · ${versionAmount(v)}`,
            detail: [
              v.id === inForce ? 'gilt jetzt' : v.validFrom > today ? 'kommt noch' : '',
              v.note ?? '',
            ]
              .filter(Boolean)
              .join(' · '),
          }))}
          empty="Noch keine Version."
        />
      )}
      <Button variant="ghost" onClick={() => setEditing(true)}>
        Neue Version
      </Button>
      <PaymentDialog open={editing} title="Neue Version" onClose={close} busy={busy}>
        {editing && (
          <form
            className="xp-newversion"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <h4 className="xp-sub">Neue Version ab …</h4>
            <p className="field-hint">
              Ein Preis ändert sich: die alte Version bleibt, frühere Zahlungen auch.
            </p>
            <Field label="Ab Monat">
              {({ id }) => (
                <TextInput
                  id={id}
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                />
              )}
            </Field>
            <AmountInput
              label="Neuer Betrag"
              value={amount}
              onChange={setAmount}
              sign={p.kind === 'inflow' ? '+' : '−'}
            />
            <AmountInput label="bis (optional)" value={amountMax} onChange={setAmountMax} />
            <Field label="Notiz (optional)">
              {({ id }) => (
                <TextInput id={id} value={note} onChange={(e) => setNote(e.target.value)} />
              )}
            </Field>
            {error && (
              <p className="field-error" role="alert">
                {maskMoneyText(error)}
              </p>
            )}
            <div className="panel-actions">
              <Button type="submit" variant="ghost" disabled={busy}>
                Version speichern
              </Button>
              <Button variant="ghost" disabled={busy} onClick={close}>
                Abbrechen
              </Button>
            </div>
          </form>
        )}
      </PaymentDialog>
    </section>
  );
}

// ---------- Zahlungen der letzten und nächsten 12 Monate ----------

function OccurrencesSection({ payment: p }: { payment: ExpectedPayment }) {
  useAmountPrivacy();
  const [today] = useState(todayInVienna);
  const from = `${addMonths(monthOf(today), -12)}-01`;
  const to = `${addMonths(monthOf(today), 12)}-28`;
  const all = useQuery(occurrencesQuery(from, to, true));
  const rows = (all.data ?? []).filter((o) => o.paymentId === p.id);
  const [linking, setLinking] = useState<string | null>(null);
  const write = useBudgetWrite();
  const name = p.name;

  return (
    <section aria-labelledby="xp-occ">
      <h3 id="xp-occ" className="panel-h">
        Zahlungen · letzte und nächste 12 Monate
      </h3>
      {all.isPending && <LoadingNote what="Zahlungen" />}
      {all.isError && (
        <ErrorNote what="Zahlungen" error={all.error} onRetry={() => void all.refetch()} />
      )}
      {all.data && rows.length === 0 && (
        <p className="rev-empty">Keine Fälligkeiten im Zeitraum.</p>
      )}
      {rows.length > 0 && (
        <p className="field-hint">
          Streichen nimmt nur diese Fälligkeit aus der Planung, die Regel bleibt. Ausgefallen meldet
          eine Zahlung, die nicht eingegangen ist.
        </p>
      )}
      {rows.length > 0 && (
        <ul className="xp-occ" aria-label={`Fälligkeiten von ${name}`}>
          {rows.map((o) => (
            <li key={o.occurrenceId} className={needsAction(o, today) ? 'is-alert' : undefined}>
              <span className="xp-occ-date">{longDay(o.dueDate)}</span>
              <span className="xp-occ-amt">
                {money(o.amountCents, o.currency, o.kind === 'inflow')}
              </span>
              <StatusStamp status={o.status} alert={needsAction(o, today)} />
              <span className="xp-occ-book">
                {o.bookingId !== null && o.bookedAmountCents !== null
                  ? `Buchung ${eur(o.bookedAmountCents, { sign: true })}`
                  : ''}
              </span>
              <span className="xp-occ-act">
                {o.bookingId !== null ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void write(
                        () => unlinkOccurrence(o.occurrenceId),
                        () => `${name}: Verknüpfung vom ${longDay(o.dueDate)} gelöst`,
                      )
                    }
                  >
                    Lösen
                  </Button>
                ) : o.status === 'skipped' ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void write(
                        () => unskipOccurrence(o.occurrenceId),
                        () => `${name}: ${longDay(o.dueDate)} wiederhergestellt`,
                      )
                    }
                  >
                    Wiederherstellen
                  </Button>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setLinking(linking === o.occurrenceId ? null : o.occurrenceId)}
                    >
                      Verknüpfen
                    </Button>
                    {o.dueDate >= today && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          void write(
                            () => skipOccurrence(o.paymentId, o.dueDate),
                            () => `${name}: ${longDay(o.dueDate)} gestrichen`,
                          )
                        }
                      >
                        Streichen
                      </Button>
                    )}
                    {o.status !== 'missed' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          void write(
                            () => markMissed(o.occurrenceId),
                            () => `${name}: ${longDay(o.dueDate)} als ausgefallen markiert`,
                          )
                        }
                      >
                        Ausgefallen
                      </Button>
                    )}
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <PaymentDialog
        open={linking !== null}
        title="Buchung verknüpfen"
        onClose={() => setLinking(null)}
      >
        {rows.find((o) => o.occurrenceId === linking) && (
          <LinkPicker
            occurrence={rows.find((o) => o.occurrenceId === linking)!}
            accountId={p.accountId}
            onDone={() => setLinking(null)}
          />
        )}
      </PaymentDialog>
    </section>
  );
}

/** Pick one booking near the due date to link to the occurrence. */
function LinkPicker({
  occurrence: o,
  accountId,
  onDone,
}: {
  occurrence: Occurrence;
  accountId: string | null;
  onDone: () => void;
}) {
  useAmountPrivacy();
  const write = useBudgetWrite();
  const [choice, setChoice] = useState('');
  const day = (n: number) => {
    const d = new Date(`${o.dueDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const bookings = useQuery(
    bookingsQuery(
      {
        ...(accountId ? { accountId } : {}),
        from: day(-21),
        to: day(21),
        sort: 'date',
        direction: 'asc',
      },
      undefined,
      100,
    ),
  );
  const items = (bookings.data?.items ?? []).filter((b) =>
    o.kind === 'inflow' ? b.amountCents > 0 : b.amountCents < 0,
  );
  return (
    <div className="xp-link">
      {bookings.isPending && <LoadingNote what="Buchungen" />}
      {bookings.isError && (
        <ErrorNote
          what="Buchungen"
          error={bookings.error}
          onRetry={() => void bookings.refetch()}
        />
      )}
      {bookings.data && items.length === 0 && (
        <p className="field-hint">Keine passende Buchung rund um den {longDay(o.dueDate)}.</p>
      )}
      {items.length > 0 && (
        <Field label="Buchung">
          {({ id }) => (
            <Select id={id} value={choice} onChange={(e) => setChoice(e.target.value)}>
              <option value="">Buchung wählen</option>
              {items.map((b) => (
                <option key={b.id} value={b.id}>
                  {`${longDay(b.date)} · ${b.payeeName ?? b.memo ?? b.accountName} · ${eur(b.amountCents)}`}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      <div className="panel-actions">
        <Button
          size="sm"
          disabled={!choice}
          onClick={async () => {
            const done = await write(
              () => linkOccurrence(o.occurrenceId, choice),
              () => `${o.name}: Buchung mit dem ${longDay(o.dueDate)} verknüpft`,
            );
            if (done) onDone();
          }}
        >
          Verknüpfen
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Abbrechen
        </Button>
      </div>
    </div>
  );
}

// ---------- Felder ----------

function EditSection({
  payment: p,
  onDone,
  write,
}: {
  payment: ExpectedPayment;
  onDone: () => void;
  write: ReturnType<typeof useBudgetWrite>;
}) {
  useAmountPrivacy();
  const [draft, setDraft] = useState<PaymentDraft>(() => draftFromPayment(p));
  const [errors, setErrors] = useState<DraftErrors>({});
  const [busy, setBusy] = useState(false);
  const set = <K extends DraftField>(key: K, value: PaymentDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const save = async () => {
    const read = readDraft(draft, false);
    setErrors(read.errors);
    if (!read.fields) return;
    const patch = changedFields(p, read.fields);
    if (Object.keys(patch).length === 0) return;
    setBusy(true);
    const done = await write(
      () => patchPayment(p.id, patch),
      () => `${read.fields?.name ?? p.name}: gespeichert`,
    );
    setBusy(false);
    if (done) onDone();
  };

  return (
    <section aria-labelledby="xp-fields">
      <h3 id="xp-fields" className="panel-h">
        Angaben
      </h3>
      <form
        className="kform"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <PaymentForm draft={draft} errors={errors} creating={false} onChange={set} />
        <div className="panel-actions">
          <Button type="submit" disabled={busy}>
            Speichern
          </Button>
          <Button variant="ghost" disabled={busy} onClick={onDone}>
            Abbrechen
          </Button>
        </div>
      </form>
    </section>
  );
}
